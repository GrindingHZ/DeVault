import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { describeObjectStoragePortContract } from '@depawn/test-support';
import { FilesystemObjectStorageAdapter } from './filesystem-object-storage.adapter';
import { SupabaseObjectStorageAdapter } from './supabase-object-storage.adapter';

const settings = {
  url: 'https://project.supabase.co',
  serviceRoleKey: 'service-role-key',
  bucket: 'evidence',
};

/* Stands in for the bucket rather than for the adapter: it answers the same
   REST shape Supabase Storage answers, so the suite still exercises the url the
   adapter builds, the credential it sends and the status codes it reads. A
   mocked adapter would prove none of those. */
function createFakeBucket(): { fetch: typeof fetch; authorisationHeaders: string[] } {
  const objects = new Map<string, Uint8Array>();
  const authorisationHeaders: string[] = [];
  const prefix = `${settings.url}/storage/v1/object/${settings.bucket}/`;

  const fake: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    authorisationHeaders.push(headers.get('authorization') ?? '');

    if (!url.startsWith(prefix)) {
      return new Response('unexpected url', { status: 500 });
    }
    const key = url
      .slice(prefix.length)
      .split('/')
      .map((segment) => decodeURIComponent(segment))
      .join('/');

    if (init?.method === 'POST' || init?.method === 'PUT') {
      objects.set(key, new Uint8Array(await new Response(init.body).arrayBuffer()));
      return new Response('{}', { status: 200 });
    }
    const stored = objects.get(key);
    if (stored === undefined) {
      return new Response('{"error":"not_found"}', { status: 404 });
    }
    return new Response(stored, { status: 200 });
  };

  return { fetch: fake, authorisationHeaders };
}

describeObjectStoragePortContract('filesystem', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'devault-storage-'));
  process.env.STORAGE_DIRECTORY = directory;
  return {
    storage: new FilesystemObjectStorageAdapter(),
    close: async () => {
      delete process.env.STORAGE_DIRECTORY;
      await rm(directory, { recursive: true, force: true });
    },
  };
});

describeObjectStoragePortContract('supabase', async () => ({
  storage: new SupabaseObjectStorageAdapter(settings, createFakeBucket().fetch),
  close: async () => {},
}));

describe('SupabaseObjectStorageAdapter', () => {
  it('sends the service role key, which is the only thing the bucket accepts', async () => {
    const bucket = createFakeBucket();
    const storage = new SupabaseObjectStorageAdapter(settings, bucket.fetch);

    await storage.put('receipts/authorised.png', Uint8Array.from([1]));

    expect(bucket.authorisationHeaders).toEqual([`Bearer ${settings.serviceRoleKey}`]);
  });

  /* A key that walks out of the bucket would read another account's evidence,
     the same escape the filesystem adapter refuses. */
  it('refuses a key that climbs out of the bucket', async () => {
    const storage = new SupabaseObjectStorageAdapter(settings, createFakeBucket().fetch);

    await expect(storage.put('../secrets/key.png', Uint8Array.from([1]))).rejects.toThrow(
      /escapes the bucket/,
    );
  });

  it('raises a failure the bucket reports rather than reading it as a miss', async () => {
    const failing: typeof fetch = async () => new Response('boom', { status: 500 });
    const storage = new SupabaseObjectStorageAdapter(settings, failing);

    await expect(storage.get('receipts/broken.png')).rejects.toThrow(/500/);
  });
});
