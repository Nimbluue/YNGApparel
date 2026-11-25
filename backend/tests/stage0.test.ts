import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  COURIERS,
  FULFILLMENT_TYPE,
  PAYMENT_SCHEME,
  PAYMENT_STAGE,
  PAYMENT_STATUS,
  PRODUCTION_STATUS,
  USER_ROLE,
  buildTrackingUrl,
  buildTrackingUrlFromCourier,
  getPaymentSchemeLabel,
  getPaymentStageLabel,
  getPaymentStatusLabel,
  getProductionStatusLabel,
} from '@yng/shared';
import cookieParser from 'cookie-parser';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { AuthDbUserRow } from '../src/types/auth.js';

process.env.SKIP_DOTENV = 'true';
process.env.JWT_SECRET = 'test_secret_minimal_32_karakter_12345';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';

const { env } = await import('../src/config/env.js');
const { generateOrderCode } = await import('../src/utils/orderCode.js');
const { getWhatsAppLast4, maskName, normalizeWhatsApp } = await import('../src/utils/phone.js');
const { mapPostgresError } = await import('../src/middleware/errorHandler.js');
const { validate } = await import('../src/middleware/validate.js');
const { createOptionalAuth, createRequireAuth, requireRole, signAuthToken } =
  await import('../src/middleware/auth.js');
const { assertSeedAllowed, computeSqlChecksum, sortSqlFiles, verifyAppliedMigrations } =
  await import('../src/utils/migrationHelpers.js');
const { isPlaceholderAdminEmail, validateSeedAdminInput } =
  await import('../src/utils/seedAdminHelpers.js');
const { default: app } = await import('../src/app.js');

describe('Tahap 0 — Utilitas & Keamanan Backend', () => {
  it('generateOrderCode menghasilkan format YNG-XXXXXX dari alfabet aman', () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateOrderCode();
      expect(code).toMatch(/^YNG-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });

  it('normalizeWhatsApp, getWhatsAppLast4, dan maskName bekerja sesuai spesifikasi', () => {
    expect(normalizeWhatsApp('0812-3456-7890')).toBe('6281234567890');
    expect(normalizeWhatsApp('+62 812 3456 7890')).toBe('6281234567890');
    expect(normalizeWhatsApp('12345')).toBeNull();
    expect(normalizeWhatsApp('')).toBeNull();
    expect(getWhatsAppLast4('081234567890')).toBe('7890');
    expect(maskName('Budi Santoso')).toBe('B*** S*****');
  });

  it('mapPostgresError memetakan kode 23505, 23514, 23503, dan 22P02', () => {
    const err23505 = mapPostgresError({ code: '23505', constraint: 'uq_oip_item_position' });
    expect(err23505?.status).toBe(400);
    expect(err23505?.message).toMatch(/posisi sablon/i);

    const err23505User = mapPostgresError({ code: '23505', constraint: 'uq_users_email' });
    expect(err23505User?.status).toBe(409);

    const err23514 = mapPostgresError({ code: '23514', constraint: 'chk_orders_dp_rule' });
    expect(err23514?.status).toBe(400);
    expect(err23514?.message).toMatch(/DP/i);

    const err23503 = mapPostgresError({ code: '23503' });
    expect(err23503?.status).toBe(400);

    const err22p02 = mapPostgresError({ code: '22P02' });
    expect(err22p02?.status).toBe(400);
  });

  it('label status bersama (@yng/shared) berjalan dinamis tanpa hardcode angka DP', () => {
    expect(getProductionStatusLabel(PRODUCTION_STATUS.SHIPPING, FULFILLMENT_TYPE.PICKUP)).toBe(
      'SIAP DIAMBIL'
    );
    expect(getPaymentStageLabel(PAYMENT_STAGE.DP, 70, 0)).toBe('DP 70%');
    expect(getPaymentStageLabel(PAYMENT_STAGE.SETTLEMENT, 70, 25000)).toBe(
      'PELUNASAN 30% + ONGKIR'
    );
    expect(getPaymentStageLabel(PAYMENT_STAGE.SETTLEMENT, 60, 0)).toBe('PELUNASAN 40%');
    expect(getPaymentSchemeLabel(PAYMENT_SCHEME.DP, 70)).toBe('DP 70%');
    expect(getPaymentStatusLabel(PAYMENT_STATUS.PENDING, null)).toBe('MENUNGGU BUKTI');
    expect(getPaymentStatusLabel(PAYMENT_STATUS.PENDING, 'uuid/proof.jpg')).toBe(
      'MENUNGGU VERIFIKASI'
    );
  });
});

describe('Tahap 0 — Kurir & buildTrackingUrl (@yng/shared)', () => {
  it('mengembalikan URL resmi untuk kurir terverifikasi saat resi valid', () => {
    expect(COURIERS).toHaveLength(9);
    expect(buildTrackingUrl('JNE', 'JNE1234567890')).toBe('https://www.jne.co.id/tracking-package');
    expect(buildTrackingUrl('jnt', 'JP-123456789')).toBe('https://www.jet.co.id/track');
    expect(buildTrackingUrl('SICEPAT', '001234567890')).toBe('https://www.sicepat.com/checkAwb');
    expect(buildTrackingUrl('ANTERAJA', '100012345678')).toBe('https://anteraja.id/tracking');
    expect(buildTrackingUrl('POS', 'P2100012345')).toBe(
      'https://www.posindonesia.co.id/id/tracking'
    );
    expect(buildTrackingUrl('NINJA', 'NLIDAP123456')).toBe(
      'https://www.ninjaxpress.co/id-id/tracking'
    );
  });

  it('meng-encodeURIComponent resi saat supportsDeepLink aktif', () => {
    const deepCourier = {
      code: 'JNE' as const,
      name: 'Kurir Uji',
      trackingUrl: 'https://kurir.example/track?awb={resi}',
      supportsDeepLink: true,
    };
    expect(buildTrackingUrlFromCourier(deepCourier, 'ABC-1234')).toBe(
      'https://kurir.example/track?awb=ABC-1234'
    );

    const appendCourier = {
      code: 'JNE' as const,
      name: 'Kurir Append',
      trackingUrl: 'https://kurir.example/track/',
      supportsDeepLink: true,
    };
    expect(buildTrackingUrlFromCourier(appendCourier, 'RESI-9988')).toBe(
      'https://kurir.example/track/RESI-9988'
    );
  });

  it('mengembalikan null untuk resi tidak valid, kurir tanpa link, OTHER, atau kode tidak dikenal', () => {
    expect(buildTrackingUrl('JNE', '123')).toBeNull(); // < 4 karakter
    expect(buildTrackingUrl('JNE', 'A'.repeat(41))).toBeNull(); // > 40 karakter
    expect(buildTrackingUrl('JNE', 'RESI SPASI')).toBeNull();
    expect(buildTrackingUrl('JNE', 'RESI/1234?x=1')).toBeNull();
    expect(buildTrackingUrl('GOJEK', 'GK-123456')).toBeNull();
    expect(buildTrackingUrl('GRAB', 'GB-123456')).toBeNull();
    expect(buildTrackingUrl('OTHER', 'DRV-BUDI-01')).toBeNull();
    expect(buildTrackingUrl('KURIR_ASING', 'RESI-12345')).toBeNull();
  });
});

describe('Tahap 0 — Helper Migrasi, Seed & seedAdmin', () => {
  it('sortSqlFiles menyaring dan mengurutkan file .sql secara deterministik', () => {
    expect(sortSqlFiles(['002_add_col.sql', 'README.md', '001_init.sql'])).toEqual([
      '001_init.sql',
      '002_add_col.sql',
    ]);
  });

  it('computeSqlChecksum menghasilkan hash identik untuk CRLF dan LF', () => {
    const lf = 'SELECT 1;\nSELECT 2;\n';
    const crlf = 'SELECT 1;\r\nSELECT 2;\r\n';
    expect(computeSqlChecksum(crlf)).toBe(computeSqlChecksum(lf));
  });

  it('verifyAppliedMigrations mendeteksi migrasi baru dan gagal jika checksum berubah atau file hilang', () => {
    const hash1 = computeSqlChecksum('CREATE TABLE a (id INT);');
    const hash2 = computeSqlChecksum('CREATE TABLE b (id INT);');

    const pending = verifyAppliedMigrations(
      [{ version: '001_init.sql', checksum: hash1 }],
      [
        { version: '001_init.sql', checksum: hash1 },
        { version: '002_extra.sql', checksum: hash2 },
      ]
    );
    expect(pending).toEqual([{ version: '002_extra.sql', checksum: hash2 }]);

    expect(() =>
      verifyAppliedMigrations(
        [{ version: '001_init.sql', checksum: hash1 }],
        [{ version: '001_init.sql', checksum: hash2 }]
      )
    ).toThrow(/Checksum migrasi "001_init\.sql" berubah/i);

    expect(() =>
      verifyAppliedMigrations([{ version: '001_init.sql', checksum: hash1 }], [])
    ).toThrow(/tidak ditemukan/i);
  });

  it('assertSeedAllowed menolak NODE_ENV=production kecuali ada --force', () => {
    expect(() => assertSeedAllowed('production', ['node', 'seed.ts'])).toThrow(
      /NODE_ENV=production/i
    );
    expect(() => assertSeedAllowed('production', ['node', 'seed.ts', '--force'])).not.toThrow();
    expect(() => assertSeedAllowed('development', ['node', 'seed.ts'])).not.toThrow();
  });

  it('validateSeedAdminInput menolak placeholder, password pendek, dan password > 72 byte', () => {
    expect(isPlaceholderAdminEmail('admin@anda.com')).toBe(true);
    expect(isPlaceholderAdminEmail('owner@yngapparel.id')).toBe(false);

    expect(() =>
      validateSeedAdminInput({
        name: 'Owner Asli',
        email: 'admin@anda.com',
        password: 'PasswordKuat1234!',
      })
    ).toThrow(/placeholder/i);

    expect(() =>
      validateSeedAdminInput({
        name: 'Nama Anda',
        email: 'owner@yngapparel.id',
        password: 'PasswordKuat1234!',
      })
    ).toThrow(/placeholder/i);

    expect(() =>
      validateSeedAdminInput({
        name: 'Owner Asli',
        email: 'owner@yngapparel.id',
        password: 'Pendek12345', // 11 karakter (< 12)
      })
    ).toThrow(/12 karakter/i);

    expect(() =>
      validateSeedAdminInput({
        name: 'Owner Asli',
        email: 'owner@yngapparel.id',
        password: 'a'.repeat(73), // 73 byte (> 72 byte bcrypt)
      })
    ).toThrow(/72 byte/i);

    expect(() =>
      validateSeedAdminInput({
        name: 'Owner Asli',
        email: 'owner@yngapparel.id',
        password: '🔐'.repeat(19), // 19 karakter tapi 76 byte UTF-8
      })
    ).toThrow(/72 byte/i);

    const valid = validateSeedAdminInput({
      name: '  Owner YNG Apparel  ',
      email: ' Owner@YNGApparel.id ',
      password: 'PasswordSuperAman#2026',
    });
    expect(valid).toEqual({
      name: 'Owner YNG Apparel',
      email: 'owner@yngapparel.id',
      password: 'PasswordSuperAman#2026',
    });
  });
});

describe('Tahap 0 — Middleware Auth (USER/ADMIN/Guest), Validasi Zod & HTTP Smoke Test', () => {
  let server: http.Server;
  let baseUrl: string;
  let unitServer: http.Server;
  let unitBaseUrl: string;

  const mockUsers = new Map<string, AuthDbUserRow>([
    [
      '11111111-1111-4111-8111-111111111111',
      {
        id: 1,
        user_uuid: '11111111-1111-4111-8111-111111111111',
        role: USER_ROLE.ADMIN,
        full_name: 'Owner YNG',
        email: 'owner@yngapparel.id',
        whatsapp: null,
        is_active: true,
        token_version: 2,
      },
    ],
    [
      '22222222-2222-4222-8222-222222222222',
      {
        id: 2,
        user_uuid: '22222222-2222-4222-8222-222222222222',
        role: USER_ROLE.USER,
        full_name: 'Pelanggan Satu',
        email: 'user1@gmail.com',
        whatsapp: '6281234567890',
        is_active: true,
        token_version: 0,
      },
    ],
    [
      '33333333-3333-4333-8333-333333333333',
      {
        id: 3,
        user_uuid: '33333333-3333-4333-8333-333333333333',
        role: USER_ROLE.USER,
        full_name: 'Akun Nonaktif',
        email: 'nonaktif@gmail.com',
        whatsapp: '6281234567891',
        is_active: false,
        token_version: 0,
      },
    ],
  ]);

  const mockFindUser = async (uuid: string): Promise<AuthDbUserRow | null> => {
    return mockUsers.get(uuid) ?? null;
  };

  beforeAll(async () => {
    const testApp = express();
    testApp.use(cookieParser());
    testApp.use(express.json());

    const reqAuth = createRequireAuth(mockFindUser);
    const optAuth = createOptionalAuth(mockFindUser);

    testApp.post(
      '/test-validate',
      validate({
        body: z.object({
          qty: z.number().int().positive('Jumlah harus lebih dari 0'),
        }),
      }),
      (req, res) => {
        res.json({ success: true, message: 'OK', data: req.body });
      }
    );

    testApp.get('/user-only', reqAuth, requireRole(USER_ROLE.USER, USER_ROLE.ADMIN), (req, res) => {
      res.json({ success: true, message: 'OK', data: { user: req.user } });
    });

    testApp.get('/admin-only', reqAuth, requireRole(USER_ROLE.ADMIN), (req, res) => {
      res.json({ success: true, message: 'OK', data: { role: req.user?.role } });
    });

    testApp.get('/optional', optAuth, (req, res) => {
      res.json({
        success: true,
        message: 'OK',
        data: { isGuest: !req.user, role: req.user?.role ?? null },
      });
    });

    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    unitServer = http.createServer(testApp);
    await new Promise<void>((resolve) => {
      unitServer.listen(0, '127.0.0.1', () => resolve());
    });
    unitBaseUrl = `http://127.0.0.1:${(unitServer.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await Promise.all([
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
      new Promise<void>((resolve) => {
        unitServer.close(() => resolve());
      }),
    ]);
  });

  it('GET /api/health mengembalikan 200 tanpa memerlukan koneksi DB atau .env', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: { status: string } };
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('ok');
  });

  it('POST /api/health dari Origin asing ditolak 403 oleh originCheck', async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
    const json = (await res.json()) as { success: boolean; message: string };
    expect(json.success).toBe(false);
    expect(json.message).toMatch(/Origin/i);
  });

  it('middleware validate (Zod) menolak payload tidak valid (400) dan meneruskan payload valid (200)', async () => {
    const invalidRes = await fetch(`${unitBaseUrl}/test-validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qty: -3 }),
    });
    expect(invalidRes.status).toBe(400);
    const invalidJson = (await invalidRes.json()) as {
      success: boolean;
      data: { errors: Array<{ field: string; message: string }> };
    };
    expect(invalidJson.success).toBe(false);
    expect(invalidJson.data.errors[0]?.field).toBe('qty');

    const validRes = await fetch(`${unitBaseUrl}/test-validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qty: 12 }),
    });
    expect(validRes.status).toBe(200);
    const validJson = (await validRes.json()) as { success: boolean; data: { qty: number } };
    expect(validJson.success).toBe(true);
    expect(validJson.data.qty).toBe(12);
  });

  it('requireAuth & requireRole menolak Guest (401), USER di rute ADMIN (403), user nonaktif (401), dan token_version lama (401)', async () => {
    // 1. Guest tanpa cookie -> 401
    const guestRes = await fetch(`${unitBaseUrl}/user-only`);
    expect(guestRes.status).toBe(401);

    // 2. USER mencoba akses rute ADMIN -> 403 (meskipun klaim JWT mencoba memalsukan role ADMIN)
    const userTokenWithSpoofedJwtRole = signAuthToken({
      userUuid: '22222222-2222-4222-8222-222222222222',
      role: USER_ROLE.ADMIN,
      tokenVersion: 0,
    });
    const forbiddenRes = await fetch(`${unitBaseUrl}/admin-only`, {
      headers: { Cookie: `${env.cookieName}=${userTokenWithSpoofedJwtRole}` },
    });
    expect(forbiddenRes.status).toBe(403);

    // 3. ADMIN valid -> 200
    const adminToken = signAuthToken({
      userUuid: '11111111-1111-4111-8111-111111111111',
      role: USER_ROLE.ADMIN,
      tokenVersion: 2,
    });
    const adminRes = await fetch(`${unitBaseUrl}/admin-only`, {
      headers: { Cookie: `${env.cookieName}=${adminToken}` },
    });
    expect(adminRes.status).toBe(200);
    const adminJson = (await adminRes.json()) as { data: { role: string } };
    expect(adminJson.data.role).toBe('ADMIN');

    // 4. token_version lama (JWT 1 vs DB 2) -> 401
    const staleToken = signAuthToken({
      userUuid: '11111111-1111-4111-8111-111111111111',
      role: USER_ROLE.ADMIN,
      tokenVersion: 1,
    });
    const staleRes = await fetch(`${unitBaseUrl}/admin-only`, {
      headers: { Cookie: `${env.cookieName}=${staleToken}` },
    });
    expect(staleRes.status).toBe(401);

    // 5. Akun nonaktif -> 401
    const inactiveToken = signAuthToken({
      userUuid: '33333333-3333-4333-8333-333333333333',
      role: USER_ROLE.USER,
      tokenVersion: 0,
    });
    const inactiveRes = await fetch(`${unitBaseUrl}/user-only`, {
      headers: { Cookie: `${env.cookieName}=${inactiveToken}` },
    });
    expect(inactiveRes.status).toBe(401);

    // 6. optionalAuth: Guest lewat tanpa error; USER valid membawa req.user
    const optGuest = await fetch(`${unitBaseUrl}/optional`);
    expect(optGuest.status).toBe(200);
    expect(await optGuest.json()).toEqual({
      success: true,
      message: 'OK',
      data: { isGuest: true, role: null },
    });

    const optUser = await fetch(`${unitBaseUrl}/optional`, {
      headers: { Cookie: `${env.cookieName}=${userTokenWithSpoofedJwtRole}` },
    });
    expect(optUser.status).toBe(200);
    expect(await optUser.json()).toEqual({
      success: true,
      message: 'OK',
      data: { isGuest: false, role: 'USER' },
    });
  });
});
