import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ObjectStoragePort } from '@depawn/api/src/domain/ports/object-storage.port';

export interface ObjectStorageTestSubject {
  readonly storage: ObjectStoragePort;
  close(): Promise<void>;
}

/* One suite, every implementation, mirroring the custody and settlement
   contracts: a photograph put through the bucket adapter has to come back the
   same bytes the filesystem adapter would have returned, or moving a
   deployment to Supabase silently changes what a receipt shows
   (docs/06-testing.md layer 3). */
export function describeObjectStoragePortContract(
  name: string,
  createSubject: () => Promise<ObjectStorageTestSubject>,
): void {
  describe(`ObjectStoragePort contract: ${name}`, () => {
    let subject: ObjectStorageTestSubject;

    beforeAll(async () => {
      subject = await createSubject();
    });

    afterAll(async () => {
      await subject.close();
    });

    it('returns the bytes an earlier put stored under the key', async () => {
      const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

      await subject.storage.put('receipts/round-trip.png', bytes);

      expect(await subject.storage.get('receipts/round-trip.png')).toEqual(bytes);
    });

    it('returns null for a key nothing was ever stored under', async () => {
      expect(await subject.storage.get('receipts/never-written.png')).toBeNull();
    });

    it('replaces what an earlier put stored under the same key', async () => {
      const first = Uint8Array.from([1, 1, 1]);
      const second = Uint8Array.from([2, 2, 2, 2]);

      await subject.storage.put('receipts/replaced.png', first);
      await subject.storage.put('receipts/replaced.png', second);

      expect(await subject.storage.get('receipts/replaced.png')).toEqual(second);
    });

    /* Photographs are several megabytes and the api caps an upload at eight, so
       the adapter has to carry a body far past anything a header would hold. */
    it('carries a payload larger than a single small chunk', async () => {
      const large = new Uint8Array(1_048_576);
      large.fill(7);

      await subject.storage.put('receipts/large.png', large);

      /* Byte length and content are asserted separately: a deep equal over a
         million elements costs more than the rest of the suite together. */
      const stored = await subject.storage.get('receipts/large.png');
      expect(stored?.byteLength).toBe(large.byteLength);
      expect(stored?.every((byte) => byte === 7)).toBe(true);
    });
  });
}
