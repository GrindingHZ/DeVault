import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfiguration } from '../../config/configuration';
import { createObjectStorage, readSupabaseStorageSettings } from './create-object-storage';
import { FilesystemObjectStorageAdapter } from './filesystem-object-storage.adapter';
import { SupabaseObjectStorageAdapter } from './supabase-object-storage.adapter';

const variables = [
  'STORAGE_DRIVER',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_STORAGE_BUCKET',
] as const;
const saved: Partial<Record<(typeof variables)[number], string | undefined>> = {};

describe('createObjectStorage', () => {
  beforeEach(() => {
    for (const variable of variables) {
      saved[variable] = process.env[variable];
      delete process.env[variable];
    }
  });

  afterEach(() => {
    for (const variable of variables) {
      const value = saved[variable];
      if (value === undefined) {
        delete process.env[variable];
      } else {
        process.env[variable] = value;
      }
    }
  });

  it('builds the filesystem adapter when no bucket is configured', () => {
    expect(createObjectStorage(loadConfiguration())).toBeInstanceOf(FilesystemObjectStorageAdapter);
  });

  it('builds the bucket adapter when the storage driver names it', () => {
    process.env.STORAGE_DRIVER = 'supabase';
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

    expect(createObjectStorage(loadConfiguration())).toBeInstanceOf(SupabaseObjectStorageAdapter);
  });
});

describe('readSupabaseStorageSettings', () => {
  beforeEach(() => {
    for (const variable of variables) {
      saved[variable] = process.env[variable];
      delete process.env[variable];
    }
  });

  afterEach(() => {
    for (const variable of variables) {
      const value = saved[variable];
      if (value === undefined) {
        delete process.env[variable];
      } else {
        process.env[variable] = value;
      }
    }
  });

  /* Failing at boot rather than on the first photograph: a deployment that
     names the bucket driver without its credentials is a mistake worth finding
     before anyone uploads evidence, the same way the chain drivers refuse to
     start without an operator key. */
  it('refuses to start without the url the bucket needs', () => {
    expect(() => readSupabaseStorageSettings()).toThrow(/SUPABASE_URL/);
  });

  it('names the missing key when only the url is set', () => {
    process.env.SUPABASE_URL = 'https://project.supabase.co';

    expect(() => readSupabaseStorageSettings()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('drops a trailing slash, which would otherwise double the path separator', () => {
    process.env.SUPABASE_URL = 'https://project.supabase.co/';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

    expect(readSupabaseStorageSettings().url).toBe('https://project.supabase.co');
  });

  it('stores evidence in a bucket named for it unless told otherwise', () => {
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

    expect(readSupabaseStorageSettings().bucket).toBe('evidence');
  });

  it('takes the bucket name from the environment when one is given', () => {
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    process.env.SUPABASE_STORAGE_BUCKET = 'devault-demo';

    expect(readSupabaseStorageSettings().bucket).toBe('devault-demo');
  });
});
