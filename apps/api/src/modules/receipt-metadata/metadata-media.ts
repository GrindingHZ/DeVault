import { createHash } from 'node:crypto';

/* Item photographs travel as data urls and rest as raw bytes in the object
   store; the receipt carries only a hash of them. These pure helpers convert
   between the two shapes and compute the commitment. */

export interface DecodedImage {
  readonly mime: string;
  readonly bytes: Buffer;
}

export function parseImageDataUrl(dataUrl: string): DecodedImage | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl);
  const mime = match?.[1];
  const base64 = match?.[2];
  if (mime === undefined || base64 === undefined) {
    return null;
  }
  return { mime, bytes: Buffer.from(base64, 'base64') };
}

export function toImageDataUrl(mime: string, bytes: Buffer): string {
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

/* The commitment the receipt carries on chain: a hash over the name and the
   image bytes in order, so any later change to the stored metadata is provable
   against what the chain recorded at the moment of issue. */
export function computeIntakeHash(name: string, images: readonly Buffer[]): string {
  const hash = createHash('sha256');
  hash.update(name, 'utf8');
  for (const image of images) {
    hash.update(image);
  }
  return `sha256:${hash.digest('hex')}`;
}
