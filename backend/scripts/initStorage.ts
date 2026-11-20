import { BUCKET_SPECS } from '../src/config/constants.js';
import { getSupabaseStorageClient } from '../src/services/storageService.js';

async function main(): Promise<void> {
  try {
    const supabase = getSupabaseStorageClient();
    const { data: existingBuckets, error: listError } = await supabase.storage.listBuckets();

    if (listError) {
      throw new Error(`Gagal membaca daftar bucket: ${listError.message}`);
    }

    const existingNames = new Set((existingBuckets || []).map((bucket) => bucket.name));

    for (const spec of BUCKET_SPECS) {
      const options = {
        public: spec.public,
        fileSizeLimit: spec.fileSizeLimit,
        allowedMimeTypes: spec.allowedMimeTypes,
      };

      if (existingNames.has(spec.name)) {
        const { error: updateError } = await supabase.storage.updateBucket(spec.name, options);
        if (updateError) {
          throw new Error(`Gagal memperbarui bucket "${spec.name}": ${updateError.message}`);
        }
        console.log(
          `[storage:init] Bucket "${spec.name}" diperbarui (akses: ${spec.public ? 'publik' : 'privat'}).`
        );
      } else {
        const { error: createError } = await supabase.storage.createBucket(spec.name, options);
        if (createError) {
          throw new Error(`Gagal membuat bucket "${spec.name}": ${createError.message}`);
        }
        console.log(
          `[storage:init] Bucket "${spec.name}" dibuat (akses: ${spec.public ? 'publik' : 'privat'}).`
        );
      }
    }

    console.log('[storage:init] Seluruh bucket Supabase Storage siap digunakan.');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[storage:init] Gagal:', message);
    process.exitCode = 1;
  }
}

void main();
