import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { StorageBucketName } from '../config/constants.js';
import { assertStorageEnv, env } from '../config/env.js';

let supabaseClient: SupabaseClient | null = null;

export interface StorageUploadOptions {
  contentType?: string;
  upsert?: boolean;
  cacheControl?: string;
}

export interface StorageListOptions {
  limit?: number;
  offset?: number;
  sortBy?: { column: string; order: 'asc' | 'desc' };
}

export interface StorageSignedUrlOptions {
  download?: string | boolean;
}

interface StorageErrorLike {
  message: string;
}

class StorageServiceError extends Error {
  status: number;
  override cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'StorageServiceError';
    this.status = 502;
    this.cause = cause;
  }
}

export function getSupabaseStorageClient(): SupabaseClient {
  assertStorageEnv();

  if (env.storageDriver !== 'supabase') {
    throw new Error(`Driver storage "${env.storageDriver}" tidak didukung oleh adapter Supabase.`);
  }

  if (!supabaseClient) {
    supabaseClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return supabaseClient;
}

function getBucketClient(bucket: StorageBucketName) {
  return getSupabaseStorageClient().storage.from(bucket);
}

function formatStorageError(
  action: string,
  bucket: StorageBucketName,
  error: StorageErrorLike
): StorageServiceError {
  return new StorageServiceError(
    `Gagal ${action} objek di bucket "${bucket}": ${error.message}`,
    error
  );
}

export async function upload(
  bucket: StorageBucketName,
  filePath: string,
  buffer: Buffer,
  options: StorageUploadOptions = {}
): Promise<{ id: string; path: string; fullPath: string }> {
  if (env.storageDriver !== 'supabase') {
    throw new Error(`STORAGE_DRIVER "${env.storageDriver}" belum diimplementasikan.`);
  }

  const {
    contentType = 'application/octet-stream',
    upsert = false,
    cacheControl = '3600',
  } = options;

  const { data, error } = await getBucketClient(bucket).upload(filePath, buffer, {
    contentType,
    upsert,
    cacheControl,
  });

  if (error) {
    throw formatStorageError('mengunggah', bucket, error);
  }

  return data;
}

export async function download(bucket: StorageBucketName, filePath: string): Promise<Buffer> {
  if (env.storageDriver !== 'supabase') {
    throw new Error(`STORAGE_DRIVER "${env.storageDriver}" belum diimplementasikan.`);
  }

  const { data, error } = await getBucketClient(bucket).download(filePath);

  if (error) {
    throw formatStorageError('mengunduh', bucket, error);
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function move(
  bucket: StorageBucketName,
  fromPath: string,
  toPath: string
): Promise<{ message: string }> {
  if (env.storageDriver !== 'supabase') {
    throw new Error(`STORAGE_DRIVER "${env.storageDriver}" belum diimplementasikan.`);
  }

  const { data, error } = await getBucketClient(bucket).move(fromPath, toPath);

  if (error) {
    throw formatStorageError('memindahkan', bucket, error);
  }

  return data;
}

export async function remove(
  bucket: StorageBucketName,
  paths: string | readonly string[]
): Promise<unknown[]> {
  if (env.storageDriver !== 'supabase') {
    throw new Error(`STORAGE_DRIVER "${env.storageDriver}" belum diimplementasikan.`);
  }

  const targetPaths = (Array.isArray(paths) ? paths : [paths]).filter(Boolean);
  if (targetPaths.length === 0) {
    return [];
  }

  const { data, error } = await getBucketClient(bucket).remove(targetPaths);

  if (error) {
    throw formatStorageError('menghapus', bucket, error);
  }

  return data || [];
}

export async function list(
  bucket: StorageBucketName,
  prefix = '',
  options: StorageListOptions = {}
): Promise<unknown[]> {
  if (env.storageDriver !== 'supabase') {
    throw new Error(`STORAGE_DRIVER "${env.storageDriver}" belum diimplementasikan.`);
  }

  const { data, error } = await getBucketClient(bucket).list(prefix, {
    limit: options.limit ?? 100,
    offset: options.offset ?? 0,
    sortBy: options.sortBy ?? { column: 'created_at', order: 'asc' },
  });

  if (error) {
    throw formatStorageError('membaca daftar', bucket, error);
  }

  return data || [];
}

export function getPublicUrl(bucket: StorageBucketName, filePath: string | null): string | null {
  if (!filePath) return null;

  if (env.storageDriver !== 'supabase') {
    throw new Error(`STORAGE_DRIVER "${env.storageDriver}" belum diimplementasikan.`);
  }

  const { data } = getBucketClient(bucket).getPublicUrl(filePath);
  return data?.publicUrl || null;
}

export async function getSignedUrl(
  bucket: StorageBucketName,
  filePath: string | null,
  expiresIn = 3600,
  options: StorageSignedUrlOptions = {}
): Promise<string | null> {
  if (!filePath) return null;

  if (env.storageDriver !== 'supabase') {
    throw new Error(`STORAGE_DRIVER "${env.storageDriver}" belum diimplementasikan.`);
  }

  const signOptions: StorageSignedUrlOptions = {};
  if (options.download !== undefined) {
    signOptions.download = options.download;
  }

  const { data, error } = await getBucketClient(bucket).createSignedUrl(
    filePath,
    expiresIn,
    Object.keys(signOptions).length > 0 ? signOptions : undefined
  );

  if (error) {
    throw formatStorageError('membuat signed URL', bucket, error);
  }

  return data?.signedUrl || null;
}

export const storageService = {
  upload,
  download,
  move,
  remove,
  list,
  getPublicUrl,
  getSignedUrl,
  getSupabaseStorageClient,
};

export default storageService;
