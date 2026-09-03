import type { Configuration } from '../../config/configuration';
import type { ObjectStoragePort } from '../../domain/ports/object-storage.port';
import { FilesystemObjectStorageAdapter } from './filesystem-object-storage.adapter';
import { SupabaseObjectStorageAdapter } from './supabase-object-storage.adapter';
import type { SupabaseStorageSettings } from './supabase-object-storage.adapter';

export class SupabaseStorageConfigurationMissing extends Error {
  constructor(readonly variable: string) {
    super(`${variable} must be set when the supabase storage driver is on`);
    this.name = 'SupabaseStorageConfigurationMissing';
  }
}

function required(variable: string): string {
  const value = process.env[variable];
  if (value === undefined || value === '') {
    throw new SupabaseStorageConfigurationMissing(variable);
  }
  return value;
}

/* Read only when the bucket driver is on, so a developer's process never has
   to carry credentials it does not use. */
export function readSupabaseStorageSettings(): SupabaseStorageSettings {
  return {
    // The dashboard shows the project url with a trailing slash, and every
    // object path is joined onto it.
    url: required('SUPABASE_URL').replace(/\/+$/, ''),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    bucket: process.env.SUPABASE_STORAGE_BUCKET ?? 'evidence',
  };
}

export function createObjectStorage(configuration: Configuration): ObjectStoragePort {
  if (configuration.storageDriver === 'supabase') {
    return new SupabaseObjectStorageAdapter(readSupabaseStorageSettings());
  }
  return new FilesystemObjectStorageAdapter();
}
