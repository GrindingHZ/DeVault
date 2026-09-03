import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import type { ObjectStoragePort } from '../../domain/ports/object-storage.port';
import { loadConfiguration } from '../../config/configuration';

@Injectable()
export class FilesystemObjectStorageAdapter implements ObjectStoragePort {
  private readonly rootDirectory = loadConfiguration().storageDirectory;

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const filePath = this.resolve(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, bytes);
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      /* readFile hands back a Buffer, which serialises as {"type":"Buffer"}
         where the bucket adapter's Uint8Array serialises as bytes. Narrowing it
         here is what lets one adapter stand in for the other. */
      return new Uint8Array(await readFile(this.resolve(key)));
    } catch (error) {
      if (isFileMissing(error)) {
        return null;
      }
      throw error;
    }
  }

  private resolve(key: string): string {
    const resolved = path.resolve(this.rootDirectory, key);
    // A key like ../../etc must never escape the storage root.
    if (!resolved.startsWith(path.resolve(this.rootDirectory))) {
      throw new Error('Object key escapes the storage root');
    }
    return resolved;
  }
}

function isFileMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
