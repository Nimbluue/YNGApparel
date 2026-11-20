import { USER_ROLE, type UserRole } from '@yng/shared';
import bcrypt from 'bcrypt';
import { closePool, query } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { validateSeedAdminInput } from '../src/utils/seedAdminHelpers.js';

const BCRYPT_COST = 12;

interface SeedUserRow {
  id: number;
  user_uuid: string;
  full_name: string;
  email: string;
  role: UserRole;
}

async function warnIfPlaceholderAdminsExist(): Promise<void> {
  const placeholderAdmins = await query<Pick<SeedUserRow, 'id' | 'email'>>(
    `SELECT id, email
     FROM users
     WHERE role = $1
       AND (
         lower(email) LIKE '%@anda.com'
         OR lower(email) LIKE '%@example.com'
         OR lower(email) LIKE '%@example.org'
         OR lower(email) LIKE '%@example.net'
       )`,
    [USER_ROLE.ADMIN]
  );

  if (placeholderAdmins.rows.length > 0) {
    const emails = placeholderAdmins.rows.map((row) => row.email).join(', ');
    console.warn(
      `[seed:admin] PERINGATAN: Masih terdapat akun ADMIN beremail placeholder di database: ${emails}. Segera nonaktifkan atau ganti dengan akun admin asli.`
    );
  }
}

async function main(): Promise<void> {
  try {
    const { name, email, password } = validateSeedAdminInput({
      name: env.adminName,
      email: env.adminEmail,
      password: env.adminPassword,
    });

    const existing = await query<SeedUserRow>(
      `SELECT id, user_uuid, full_name, email, role
       FROM users
       WHERE lower(email) = $1
       LIMIT 1`,
      [email]
    );

    if (existing.rows.length > 0) {
      const current = existing.rows[0];
      if (current.role !== USER_ROLE.ADMIN) {
        throw new Error(
          `Email "${current.email}" sudah terdaftar sebagai role ${current.role}. Gunakan email lain untuk akun ADMIN.`
        );
      }

      console.log(
        `[seed:admin] Akun ADMIN "${current.email}" sudah terdaftar (id=${current.id}, uuid=${current.user_uuid}). Melewati tanpa menimpa password.`
      );
      await warnIfPlaceholderAdminsExist();
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    const inserted = await query<Pick<SeedUserRow, 'id' | 'user_uuid' | 'email'>>(
      `INSERT INTO users (role, full_name, email, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_uuid, email`,
      [USER_ROLE.ADMIN, name, email, passwordHash]
    );

    const created = inserted.rows[0];
    console.log(
      `[seed:admin] Akun ADMIN pertama berhasil dibuat: ${created.email} (id=${created.id}, uuid=${created.user_uuid}).`
    );

    await warnIfPlaceholderAdminsExist();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[seed:admin] Gagal:', message);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

void main();
