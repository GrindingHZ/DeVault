import { Inject, Injectable } from '@nestjs/common';
import { OBJECT_STORAGE_PORT } from '../../domain/ports/object-storage.port';
import type { ObjectStoragePort } from '../../domain/ports/object-storage.port';
import { ID_GENERATOR } from '../../domain/shared/id-generator';
import type { IdGenerator } from '../../domain/shared/id-generator';
import { computeIntakeHash, parseImageDataUrl, toImageDataUrl } from './metadata-media';

interface StoredImage {
  readonly slot: string;
  readonly mime: string;
}

interface StoredMetadata {
  readonly name: string;
  readonly intakeHash: string;
  readonly main: StoredImage;
  readonly secondary: readonly StoredImage[];
}

export interface ReceiptMetadata {
  readonly name: string;
  readonly mainImage: string;
  readonly secondaryImages: readonly string[];
}

export class ReceiptImageInvalid extends Error {
  constructor() {
    super('An item photograph was not a valid image');
    this.name = 'ReceiptImageInvalid';
  }
}

/* The name and photographs a member sees behind a receipt. The receipt on chain
   carries only the receipt_key and the intake_hash; the rich data lives here,
   images as raw bytes and a small json manifest beside them, all under the
   receipt's own key so one receipt can never read or overwrite another's. */
@Injectable()
export class ReceiptMetadataStore {
  constructor(
    @Inject(OBJECT_STORAGE_PORT) private readonly storage: ObjectStoragePort,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async create(input: {
    readonly name: string;
    readonly mainImage: string;
    readonly secondaryImages: readonly string[];
  }): Promise<{ receiptKey: string; intakeHash: string }> {
    const receiptKey = `receipt-${this.idGenerator.generate()}`;
    const main = parseImageDataUrl(input.mainImage);
    if (main === null) {
      throw new ReceiptImageInvalid();
    }
    const secondary: StoredImage[] = [];
    const hashInputs: Buffer[] = [main.bytes];
    await this.storage.put(this.slotKey(receiptKey, 'main'), main.bytes);
    for (const [index, image] of input.secondaryImages.entries()) {
      const decoded = parseImageDataUrl(image);
      if (decoded === null) {
        throw new ReceiptImageInvalid();
      }
      const slot = `secondary-${index}`;
      await this.storage.put(this.slotKey(receiptKey, slot), decoded.bytes);
      secondary.push({ slot, mime: decoded.mime });
      hashInputs.push(decoded.bytes);
    }
    const intakeHash = computeIntakeHash(input.name, hashInputs);
    const manifest: StoredMetadata = {
      name: input.name,
      intakeHash,
      main: { slot: 'main', mime: main.mime },
      secondary,
    };
    await this.storage.put(this.metaKey(receiptKey), Buffer.from(JSON.stringify(manifest), 'utf8'));
    return { receiptKey, intakeHash };
  }

  /* The main photograph as raw bytes, for serving straight to an img tag at
     the receipt-photo url the restored ui asks for. */
  async readMainImage(receiptKey: string): Promise<{ mime: string; bytes: Buffer } | null> {
    const manifestBytes = await this.storage.get(this.metaKey(receiptKey));
    if (manifestBytes === null) {
      return null;
    }
    const manifest = JSON.parse(Buffer.from(manifestBytes).toString('utf8')) as StoredMetadata;
    const bytes = await this.storage.get(this.slotKey(receiptKey, manifest.main.slot));
    if (bytes === null) {
      return null;
    }
    return { mime: manifest.main.mime, bytes: Buffer.from(bytes) };
  }

  async read(receiptKey: string): Promise<ReceiptMetadata | null> {
    const manifestBytes = await this.storage.get(this.metaKey(receiptKey));
    if (manifestBytes === null) {
      return null;
    }
    const manifest = JSON.parse(Buffer.from(manifestBytes).toString('utf8')) as StoredMetadata;
    const mainBytes = await this.storage.get(this.slotKey(receiptKey, manifest.main.slot));
    if (mainBytes === null) {
      return null;
    }
    const secondaryImages: string[] = [];
    for (const image of manifest.secondary) {
      const bytes = await this.storage.get(this.slotKey(receiptKey, image.slot));
      if (bytes !== null) {
        secondaryImages.push(toImageDataUrl(image.mime, Buffer.from(bytes)));
      }
    }
    return {
      name: manifest.name,
      mainImage: toImageDataUrl(manifest.main.mime, Buffer.from(mainBytes)),
      secondaryImages,
    };
  }

  private slotKey(receiptKey: string, slot: string): string {
    return `receipts/${this.leafOf(receiptKey)}/${slot}`;
  }

  private metaKey(receiptKey: string): string {
    return `receipts/${this.leafOf(receiptKey)}/meta.json`;
  }

  /* The read takes the key from a url path, so it is kept to a safe leaf that
     cannot walk out of the receipts directory. */
  private leafOf(receiptKey: string): string {
    return receiptKey.replace(/[^A-Za-z0-9_-]/g, '');
  }
}
