import crypto from 'node:crypto';

export interface AppliedMigrationRow {
  version: string;
  checksum: string;
}

export interface MigrationDiskFile {
  version: string;
  checksum: string;
}

export function sortSqlFiles(fileNames: readonly string[]): string[] {
  return fileNames
    .filter((fileName) => fileName.toLowerCase().endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, 'en'));
}

export function normalizeSqlForChecksum(sql: string): string {
  // ASSUMPTION: akhir baris dinormalisasi ke LF sebelum hashing agar Windows (CRLF) dan Linux/CI (LF) menghasilkan checksum identik
  return sql.replace(/\r\n/g, '\n');
}

export function computeSqlChecksum(sql: string): string {
  const normalized = normalizeSqlForChecksum(sql);
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Memastikan seluruh migrasi yang sudah tercatat di `schema_migrations` masih ada
 * di disk dan isi/checksum-nya tidak berubah. Mengembalikan daftar versi yang belum dijalankan.
 */
export function verifyAppliedMigrations(
  appliedRows: readonly AppliedMigrationRow[],
  diskFiles: readonly MigrationDiskFile[]
): MigrationDiskFile[] {
  const diskByVersion = new Map<string, MigrationDiskFile>();
  for (const file of diskFiles) {
    diskByVersion.set(file.version, file);
  }

  const appliedVersions = new Set<string>();
  for (const applied of appliedRows) {
    appliedVersions.add(applied.version);
    const onDisk = diskByVersion.get(applied.version);
    if (!onDisk) {
      throw new Error(
        `File migrasi "${applied.version}" sudah tercatat di schema_migrations tetapi tidak ditemukan di backend/db/migrations/.`
      );
    }
    if (onDisk.checksum !== applied.checksum) {
      throw new Error(
        `Checksum migrasi "${applied.version}" berubah (DB: ${applied.checksum}, disk: ${onDisk.checksum}). ` +
          'Jangan mengedit file migrasi yang sudah terpasang; buat file migrasi baru (mis. 002_xxx.sql).'
      );
    }
  }

  return diskFiles.filter((file) => !appliedVersions.has(file.version));
}

export function assertSeedAllowed(nodeEnv: string, argv: readonly string[]): void {
  const isProduction = nodeEnv.trim().toLowerCase() === 'production';
  const hasForce = argv.includes('--force');

  if (isProduction && !hasForce) {
    throw new Error(
      'db:seed ditolak saat NODE_ENV=production untuk mencegah data placeholder masuk ke database produksi. ' +
        'Jika benar-benar disengaja, jalankan ulang dengan flag --force.'
    );
  }
}
