import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

process.env.SKIP_DOTENV = 'true';
process.env.JWT_SECRET = 'test_secret_minimal_32_karakter_12345';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';

const { generateOrderCode } = await import('../src/utils/orderCode.js');
const { getWhatsAppLast4, maskName, normalizeWhatsApp } = await import('../src/utils/phone.js');
const { mapPostgresError } = await import('../src/middleware/errorHandler.js');
const { validate } = await import('../src/middleware/validate.js');
const { assertSeedAllowed, computeSqlChecksum, sortSqlFiles, verifyAppliedMigrations } =
  await import('../src/utils/migrationHelpers.js');
const {
  FULFILLMENT_TYPE,
  PAYMENT_SCHEME,
  PAYMENT_STAGE,
  PAYMENT_STATUS,
  PRODUCTION_STATUS,
  getPaymentSchemeLabel,
  getPaymentStageLabel,
  getPaymentStatusLabel,
  getProductionStatusLabel,
} = await import('../src/config/constants.js');
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

describe('Tahap 0 — Helper Migrasi & Seed', () => {
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
});

describe('Tahap 0 — Middleware Validasi Zod & HTTP Smoke Test', () => {
  let server: http.Server;
  let baseUrl: string;
  let validateServer: http.Server;
  let validateBaseUrl: string;

  beforeAll(async () => {
    const testApp = express();
    testApp.use(express.json());
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

    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    validateServer = http.createServer(testApp);
    await new Promise<void>((resolve) => {
      validateServer.listen(0, '127.0.0.1', () => resolve());
    });
    const validateAddress = validateServer.address() as AddressInfo;
    validateBaseUrl = `http://127.0.0.1:${validateAddress.port}`;
  });

  afterAll(async () => {
    await Promise.all([
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
      new Promise<void>((resolve) => {
        validateServer.close(() => resolve());
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
    const invalidRes = await fetch(`${validateBaseUrl}/test-validate`, {
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

    const validRes = await fetch(`${validateBaseUrl}/test-validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qty: 12 }),
    });
    expect(validRes.status).toBe(200);
    const validJson = (await validRes.json()) as { success: boolean; data: { qty: number } };
    expect(validJson.success).toBe(true);
    expect(validJson.data.qty).toBe(12);
  });
});
