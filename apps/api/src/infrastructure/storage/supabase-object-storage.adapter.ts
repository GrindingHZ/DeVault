import type { ObjectStoragePort } from '../../domain/ports/object-storage.port';

export interface SupabaseStorageSettings {
  readonly url: string;
  readonly serviceRoleKey: string;
  readonly bucket: string;
}

/* The bucket over its REST interface rather than through @supabase/supabase-js:
   the port is two methods, the js client would be a dependency carried for two
   calls, and fetch is injectable so the contract suite can run without a
   network. */
export class SupabaseObjectStorageAdapter implements ObjectStoragePort {
  constructor(
    private readonly settings: SupabaseStorageSettings,
    private readonly fetchImplementation: typeof fetch = globalThis.fetch,
  ) {}

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const response = await this.fetchImplementation(this.resolve(key), {
      method: 'POST',
      headers: {
        ...this.credentials(),
        'content-type': 'application/octet-stream',
        // Without this the bucket answers 409 the second time a key is written.
        'x-upsert': 'true',
      },
      body: bytes,
    });
    if (!response.ok) {
      throw new Error(`Supabase storage refused the upload with ${response.status}`);
    }
  }

  async get(key: string): Promise<Uint8Array | null> {
    const response = await this.fetchImplementation(this.resolve(key), {
      method: 'GET',
      headers: this.credentials(),
    });
    /* A missing object is answered 404 by the storage api and 400 by the
       gateway in front of older projects. Neither is a failure worth raising:
       the caller asked whether the evidence is there. */
    if (response.status === 404 || response.status === 400) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Supabase storage refused the download with ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  private credentials(): Record<string, string> {
    return { authorization: `Bearer ${this.settings.serviceRoleKey}` };
  }

  private resolve(key: string): string {
    const segments = key.split('/');
    // A key like ../../secrets must never address an object outside the bucket.
    if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
      throw new Error('Object key escapes the bucket');
    }
    const encoded = segments.map((segment) => encodeURIComponent(segment)).join('/');
    return `${this.settings.url}/storage/v1/object/${this.settings.bucket}/${encoded}`;
  }
}
