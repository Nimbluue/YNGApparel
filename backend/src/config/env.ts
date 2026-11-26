import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function findBackendRoot(startDir = __dirname): string {
  let current = path.resolve(startDir);
  while (true) {
    const pkgPath = path.join(current, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name?: unknown };
        if (parsed.name === 'yng-apparel-backend') {
          return current;
        }
      } catch {
        // Lanjut ke direktori induk bila package.json tidak terbaca
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  // ASSUMPTION: fallback ke dua tingkat di atas config/ bila package.json tidak ditemukan
  return path.resolve(__dirname, '../..');
}

export const BACKEND_ROOT = findBackendRoot();
const backendEnvPath = path.join(BACKEND_ROOT, '.env');

if (process.env.SKIP_DOTENV !== 'true' && fs.existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath });
}

export function parseOrigins(rawOrigins: string | undefined): string[] {
  const parsed = String(rawOrigins || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  const unique = Array.from(new Set(parsed));
  return unique.length > 0 ? unique : ['http://localhost:5173'];
}

const CLOUDFLARE_QUICK_TUNNEL_HOST_REGEX =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.trycloudflare\.com$/i;

function isPrivateLanIpv4(hostname: string): boolean {
  const parts = hostname.split('.');
  if (parts.length !== 4) return false;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return false;
    const value = Number(part);
    if (!Number.isInteger(value) || value < 0 || value > 255) return false;
    octets.push(value);
  }
  return (octets[0] === 192 && octets[1] === 168) || octets[0] === 10;
}

function isAllowedDevDynamicOrigin(normalizedOrigin: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(normalizedOrigin);
  } catch {
    return false;
  }
  if (parsed.origin !== normalizedOrigin) {
    return false;
  }
  if (
    parsed.protocol === 'https:' &&
    parsed.port === '' &&
    CLOUDFLARE_QUICK_TUNNEL_HOST_REGEX.test(parsed.hostname)
  ) {
    return true;
  }
  if (parsed.protocol === 'http:' && isPrivateLanIpv4(parsed.hostname)) {
    return true;
  }
  return false;
}

export type DatabaseSslConfig = false | { rejectUnauthorized: boolean };

function resolveDatabaseSsl(
  databaseUrl: string | undefined,
  rawSsl: string | undefined
): DatabaseSslConfig {
  const normalized = String(rawSsl || '')
    .trim()
    .toLowerCase();
  if (normalized === 'false' || normalized === '0' || normalized === 'disable') {
    return false;
  }

  const isLocalHost = /@(?:localhost|127\.0\.0\.1)(?::|\/|$)/i.test(String(databaseUrl || ''));
  if (isLocalHost && normalized !== 'true' && normalized !== '1') {
    return false;
  }

  // ASSUMPTION: koneksi pooler Supabase memakai sertifikat TLS yang kompatibel dengan rejectUnauthorized: false di pg
  return { rejectUnauthorized: false };
}

function parsePositiveInt(
  rawValue: string | undefined,
  fallback: number,
  min = 1,
  max = 100
): number {
  const parsed = Number.parseInt(String(rawValue || ''), 10);
  if (Number.isNaN(parsed) || parsed < min) {
    return fallback;
  }
  return Math.min(parsed, max);
}

export type CookieSameSite = 'lax' | 'strict' | 'none';

function resolveCookieSameSite(rawSameSite: string | undefined): CookieSameSite {
  const value = String(rawSameSite || 'lax')
    .trim()
    .toLowerCase();
  if (value === 'strict' || value === 'none' || value === 'lax') {
    return value;
  }
  return 'lax';
}

const nodeEnv = String(process.env.NODE_ENV || 'development').trim();
const cookieSameSite = resolveCookieSameSite(process.env.COOKIE_SAMESITE);
const cookieSecure =
  nodeEnv === 'production' ||
  cookieSameSite === 'none' ||
  String(process.env.COOKIE_SECURE || '')
    .trim()
    .toLowerCase() === 'true';

export interface AppEnv {
  nodeEnv: string;
  isDevelopment: boolean;
  isProduction: boolean;
  port: number;
  frontendOrigins: string[];
  databaseUrl: string;
  databaseSsl: DatabaseSslConfig;
  databasePoolMax: number;
  jwtSecret: string;
  jwtExpiresIn: string;
  cookieName: string;
  cookieSameSite: CookieSameSite;
  cookieSecure: boolean;
  storageDriver: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  telegramBotToken: string;
  telegramChatId: string;
}

export const env: AppEnv = {
  nodeEnv,
  isDevelopment: nodeEnv === 'development',
  isProduction: nodeEnv === 'production',
  port: parsePositiveInt(process.env.PORT, 5000, 1, 65535),
  frontendOrigins: parseOrigins(process.env.FRONTEND_ORIGIN),

  databaseUrl: String(process.env.DATABASE_URL || '').trim(),
  databaseSsl: resolveDatabaseSsl(process.env.DATABASE_URL, process.env.DATABASE_SSL),
  databasePoolMax: parsePositiveInt(process.env.DATABASE_POOL_MAX, 10, 1, 20),

  jwtSecret: String(process.env.JWT_SECRET || '').trim(),
  jwtExpiresIn: String(process.env.JWT_EXPIRES_IN || '12h').trim(),
  cookieName: String(process.env.COOKIE_NAME || 'yng_admin_token').trim(),
  cookieSameSite,
  cookieSecure,

  storageDriver: String(process.env.STORAGE_DRIVER || 'supabase')
    .trim()
    .toLowerCase(),
  supabaseUrl: String(process.env.SUPABASE_URL || '')
    .trim()
    .replace(/\/+$/, ''),
  supabaseServiceRoleKey: String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),

  adminName: String(process.env.ADMIN_NAME || '').trim(),
  adminEmail: String(process.env.ADMIN_EMAIL || '').trim(),
  adminPassword: String(process.env.ADMIN_PASSWORD || ''),

  telegramBotToken: String(process.env.TELEGRAM_BOT_TOKEN || '').trim(),
  telegramChatId: String(process.env.TELEGRAM_CHAT_ID || '').trim(),
};

/**
 * Memeriksa apakah origin permintaan termasuk dalam `FRONTEND_ORIGIN`
 * (mendukung multiple origin dipisah koma) atau origin dinamis lokal/Quick Tunnel saat `NODE_ENV=development`.
 */
export function isAllowedOrigin(
  origin: string | null | undefined,
  options?: { allowedOrigins?: readonly string[]; nodeEnv?: string }
): boolean {
  if (!origin) return false;
  const normalized = origin.trim().replace(/\/+$/, '');
  if (!normalized) return false;

  const allowedOrigins = options?.allowedOrigins ?? env.frontendOrigins;
  if (allowedOrigins.includes(normalized)) {
    return true;
  }

  const activeNodeEnv = options?.nodeEnv ?? env.nodeEnv;
  if (activeNodeEnv === 'development') {
    return isAllowedDevDynamicOrigin(normalized);
  }

  return false;
}

export function assertDbEnv(): void {
  if (!env.databaseUrl) {
    throw new Error(
      'Variabel environment DATABASE_URL wajib diisi di backend/.env sebelum terhubung ke PostgreSQL.'
    );
  }
}

export function assertStorageEnv(): void {
  if (env.storageDriver === 'supabase') {
    const missing: string[] = [];
    if (!env.supabaseUrl) missing.push('SUPABASE_URL');
    if (!env.supabaseServiceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    if (missing.length > 0) {
      throw new Error(`Variabel environment storage wajib diisi: ${missing.join(', ')}`);
    }
    return;
  }

  throw new Error(`STORAGE_DRIVER "${env.storageDriver}" belum didukung.`);
}

export function assertServerEnv(): void {
  assertDbEnv();

  if (!env.jwtSecret || env.jwtSecret.length < 16) {
    throw new Error(
      'Variabel environment JWT_SECRET wajib diisi (minimal 16 karakter, disarankan >= 32 karakter).'
    );
  }

  assertStorageEnv();
}
