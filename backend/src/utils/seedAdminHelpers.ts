import { z } from 'zod';
import { ADMIN_PASSWORD_MIN_LENGTH, PASSWORD_MAX_BYTES } from '../config/constants.js';

const PLACEHOLDER_EMAIL_DOMAINS = ['@anda.com', '@example.com', '@example.org', '@example.net'];
const PLACEHOLDER_NAMES = new Set(['nama anda']);
// ASSUMPTION: menolak nilai contoh password bawaan .env.example agar tidak dipakai sebagai kredensial admin
const PLACEHOLDER_PASSWORDS = new Set(['ganti_password_admin_yang_kuat']);

export function isPlaceholderAdminEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return PLACEHOLDER_EMAIL_DOMAINS.some((domain) => normalized.endsWith(domain));
}

export const seedAdminInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'ADMIN_NAME wajib diisi (minimal 2 karakter).')
    .max(150, 'ADMIN_NAME maksimal 150 karakter.')
    .refine(
      (val) => !PLACEHOLDER_NAMES.has(val.toLowerCase()),
      'ADMIN_NAME tidak boleh memakai placeholder ("Nama Anda"). Ganti dengan nama asli di backend/.env.'
    ),
  email: z
    .string()
    .trim()
    .min(1, 'ADMIN_EMAIL wajib diisi di backend/.env.')
    .max(150, 'ADMIN_EMAIL maksimal 150 karakter.')
    .email('Format ADMIN_EMAIL tidak valid.')
    .transform((val) => val.toLowerCase())
    .refine(
      (val) => !isPlaceholderAdminEmail(val),
      'ADMIN_EMAIL tidak boleh memakai domain placeholder (@anda.com / @example.com). Ganti dengan email admin asli di backend/.env.'
    ),
  password: z
    .string()
    .min(
      ADMIN_PASSWORD_MIN_LENGTH,
      `ADMIN_PASSWORD minimal harus ${ADMIN_PASSWORD_MIN_LENGTH} karakter.`
    )
    .refine(
      (val) => Buffer.byteLength(val, 'utf8') <= PASSWORD_MAX_BYTES,
      `ADMIN_PASSWORD maksimal ${PASSWORD_MAX_BYTES} byte (batas implementasi bcrypt).`
    )
    .refine(
      (val) => !PLACEHOLDER_PASSWORDS.has(val),
      'ADMIN_PASSWORD tidak boleh memakai nilai contoh placeholder. Ganti dengan password kuat di backend/.env.'
    ),
});

export type SeedAdminInput = z.infer<typeof seedAdminInputSchema>;

export function validateSeedAdminInput(raw: {
  name: string;
  email: string;
  password: string;
}): SeedAdminInput {
  const parsed = seedAdminInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Konfigurasi ADMIN_* tidak valid.');
  }
  return parsed.data;
}
