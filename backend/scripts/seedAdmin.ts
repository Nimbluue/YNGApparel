import type { AdminUserDto } from '@yng/shared';
import bcrypt from 'bcrypt';
import { closePool, query } from '../src/config/database.js';
import { env } from '../src/config/env.js';

const BCRYPT_COST = 12;

async function main(): Promise<void> {
  try {
    const name = env.adminName;
    const email = env.adminEmail.toLowerCase();
    const password = env.adminPassword;
    const resetPassword = process.argv.includes('--reset-password');

    if (!name || !email || !password) {
      throw new Error(
        'Variabel environment ADMIN_NAME, ADMIN_EMAIL, dan ADMIN_PASSWORD wajib diisi di backend/.env.'
      );
    }

    if (password.length < 8) {
      throw new Error('ADMIN_PASSWORD minimal harus 8 karakter.');
    }

    const existing = await query<AdminUserDto>(
      `SELECT id, name, email, is_active
       FROM admin_users
       WHERE lower(email) = $1
       LIMIT 1`,
      [email]
    );

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    if (existing.rows.length > 0) {
      const currentAdmin = existing.rows[0];
      if (!resetPassword) {
        console.log(
          `[seed:admin] Admin "${currentAdmin.email}" sudah terdaftar (id=${currentAdmin.id}). Gunakan --reset-password jika ingin memperbarui password.`
        );
        return;
      }

      await query(
        `UPDATE admin_users
         SET name = $1, password_hash = $2, is_active = TRUE
         WHERE id = $3`,
        [name, passwordHash, currentAdmin.id]
      );
      console.log(
        `[seed:admin] Password dan profil admin "${currentAdmin.email}" berhasil diperbarui.`
      );
      return;
    }

    const inserted = await query<Pick<AdminUserDto, 'id' | 'name' | 'email'>>(
      `INSERT INTO admin_users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email`,
      [name, email, passwordHash]
    );

    const created = inserted.rows[0];
    console.log(`[seed:admin] Admin pertama berhasil dibuat: ${created.email} (id=${created.id}).`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[seed:admin] Gagal:', message);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

void main();
