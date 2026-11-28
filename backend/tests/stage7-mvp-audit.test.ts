import {
  COURIERS,
  COURIER_CODES,
  PAYMENT_SCHEME,
  PRINT_POSITION,
  buildTrackingUrl,
  isValidCourierCode,
  isValidTrackingReceipt,
} from '@yng/shared';
import { describe, expect, it } from 'vitest';
import type { PricingReferenceData } from '../src/models/catalogModel.js';
import type { AdvisoryLockClient, AdvisoryLockPool } from '../src/services/schedulerService.js';

process.env.SKIP_DOTENV = 'true';
process.env.JWT_SECRET = 'test_secret_minimal_32_karakter_12345';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';

const { DEFAULT_MAX_DESIGN_FILE_MB } = await import('../src/config/constants.js');
const { defaultGetMaxDesignFileMb } = await import('../src/services/designUploadService.js');
const {
  ADVISORY_LOCK_AUTO_CANCEL_ORDERS,
  ADVISORY_LOCK_AUTO_COMPLETE_ORDERS,
  autoCompleteShippedOrders,
  cancelExpiredUnpaidOrders,
} = await import('../src/services/schedulerService.js');
const { createPricingService, resolveInitialPaymentRequirement } =
  await import('../src/services/pricingService.js');

function createPricingRef(dpMinQty = 12, dpPercent = 70): PricingReferenceData {
  const now = '2026-11-26T00:00:00.000Z';
  return {
    dpMinQty,
    dpPercent,
    modelsById: new Map([
      [
        1,
        {
          id: 1,
          slug: 'kaos-reguler',
          name: 'Kaos Reguler',
          description: null,
          base_price: 55000,
          image_path: null,
          mockup_template: null,
          category_id: null,
          collection_id: null,
          sort_order: 1,
          is_active: true,
          created_at: now,
          updated_at: now,
        },
      ],
    ]),
    fabricsById: new Map([
      [
        1,
        {
          id: 1,
          code: 'COMBED-24S',
          name: 'Cotton Combed 24s',
          description: null,
          gsm_weight: 190,
          thickness_level: 3,
          comfort_level: 5,
          additional_price: 5000,
          image_path: null,
          macro_image_path: null,
          sort_order: 1,
          is_active: true,
          created_at: now,
          updated_at: now,
        },
      ],
    ]),
    compatibleModelFabrics: new Set(['1:1']),
    fabricColorsById: new Map([
      [
        10,
        {
          id: 10,
          fabric_id: 1,
          color_name: 'Jet Black',
          color_hex: '#111111',
          sort_order: 1,
          is_active: true,
        },
      ],
    ]),
    sizesById: new Map([
      [1, { id: 1, code: 'L', sort_order: 1, extra_charge: 0, is_active: true }],
      [2, { id: 2, code: 'XXL', sort_order: 2, extra_charge: 10000, is_active: true }],
    ]),
    printSizesById: new Map([
      [
        1,
        {
          id: 1,
          code: 'A4',
          name: 'Sablon A4',
          dimensions_cm: '21 x 29 cm',
          width_cm: 21,
          height_cm: 29,
          price_per_spot: 15000,
          sort_order: 1,
          is_active: true,
        },
      ],
    ]),
  };
}

describe('Tahap 7 — Pengujian MVP & Audit Kritis', () => {
  it('designUploadService membaca app_settings memakai kolom setting_key & setting_value', async () => {
    const executedQueries: string[] = [];

    const mockQuery = async <T extends Record<string, unknown>>(text: string) => {
      executedQueries.push(text);
      return {
        rows: [{ setting_value: '25' } as unknown as T],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      };
    };

    const resolved = await defaultGetMaxDesignFileMb(
      mockQuery as unknown as typeof import('../src/config/database.js').query
    );

    expect(resolved).toBe(25);
    expect(executedQueries[0]).toContain('setting_value');
    expect(executedQueries[0]).toContain("setting_key = 'max_design_file_mb'");
    expect(executedQueries[0]).not.toMatch(/\bSELECT value\b/i);
    expect(executedQueries[0]).not.toMatch(/\bWHERE key\b/i);

    const fallbackQuery = async <T extends Record<string, unknown>>() => ({
      rows: [{ setting_value: 'bukan-angka' } as unknown as T],
      command: 'SELECT',
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    const fallback = await defaultGetMaxDesignFileMb(
      fallbackQuery as unknown as typeof import('../src/config/database.js').query
    );
    expect(fallback).toBe(DEFAULT_MAX_DESIGN_FILE_MB);
  });

  it('cancelExpiredUnpaidOrders membatalkan order WEBSITE kedaluwarsa, menjaga order manual, & mencatat history', async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    let released = false;

    const client: AdvisoryLockClient = {
      async query<T extends Record<string, unknown>>(text: string, params: unknown[] = []) {
        const normalized = text.replace(/\s+/g, ' ').trim();
        queries.push({ sql: normalized, params });

        if (normalized.includes('pg_try_advisory_lock')) {
          expect(params[0]).toBe(ADVISORY_LOCK_AUTO_CANCEL_ORDERS);
          return { rows: [{ locked: true } as unknown as T] };
        }
        if (normalized.startsWith('SELECT o.id, o.order_code FROM orders o')) {
          return {
            rows: [
              { id: 101, order_code: 'YNG-AAA111' } as unknown as T,
              { id: 102, order_code: 'YNG-BBB222' } as unknown as T,
            ],
          };
        }
        return { rows: [] };
      },
      release() {
        released = true;
      },
    };

    const pool: AdvisoryLockPool = {
      connect: async () => client,
    };

    const summary = await cancelExpiredUnpaidOrders({ pool });

    expect(summary.acquired).toBe(true);
    expect(summary.cancelledOrderCodes).toEqual(['YNG-AAA111', 'YNG-BBB222']);
    expect(released).toBe(true);

    const selectQuery = queries.find((q) =>
      q.sql.startsWith('SELECT o.id, o.order_code FROM orders o')
    );
    expect(selectQuery?.sql).toContain('o.payment_due_at IS NOT NULL');
    expect(selectQuery?.sql).toContain('o.payment_due_at < NOW()');
    expect(selectQuery?.sql).toContain("p.status = 'VERIFIED'");
    expect(selectQuery?.sql).toContain("p.status = 'PENDING' AND p.proof_image_path IS NOT NULL");
    expect(selectQuery?.sql).toContain('FOR UPDATE SKIP LOCKED');

    const updateQuery = queries.find((q) => q.sql.startsWith('UPDATE orders SET'));
    expect(updateQuery?.params[0]).toEqual([101, 102]);
    expect(updateQuery?.sql).toContain("production_status = 'CANCELLED'");

    const historyQuery = queries.find((q) => q.sql.startsWith('INSERT INTO order_status_history'));
    expect(historyQuery?.sql).toContain('NULL');
    expect(queries.some((q) => q.sql === 'COMMIT')).toBe(true);
    expect(
      queries.some(
        (q) =>
          q.sql.includes('pg_advisory_unlock') && q.params[0] === ADVISORY_LOCK_AUTO_CANCEL_ORDERS
      )
    ).toBe(true);
  });

  it('autoCompleteShippedOrders membaca app_settings.auto_complete_days & melewatkan saat lock dipegang instance lain', async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];

    const activeClient: AdvisoryLockClient = {
      async query<T extends Record<string, unknown>>(text: string, params: unknown[] = []) {
        const normalized = text.replace(/\s+/g, ' ').trim();
        queries.push({ sql: normalized, params });

        if (normalized.includes('pg_try_advisory_lock')) {
          expect(params[0]).toBe(ADVISORY_LOCK_AUTO_COMPLETE_ORDERS);
          return { rows: [{ locked: true } as unknown as T] };
        }
        if (normalized.includes('FROM app_settings')) {
          expect(normalized).toContain("setting_key = 'auto_complete_days'");
          return { rows: [{ setting_value: '10' } as unknown as T] };
        }
        if (normalized.startsWith('SELECT o.id, o.order_code FROM orders o')) {
          expect(normalized).toContain('o.remaining_balance = 0');
          expect(params[0]).toBe(10);
          return { rows: [{ id: 55, order_code: 'YNG-DONE55' } as unknown as T] };
        }
        return { rows: [] };
      },
      release() {},
    };

    const result = await autoCompleteShippedOrders({ pool: { connect: async () => activeClient } });
    expect(result).toEqual({ acquired: true, completedOrderCodes: ['YNG-DONE55'] });
    expect(
      queries.some((q) => q.sql.startsWith('UPDATE orders SET') && q.sql.includes("'COMPLETED'"))
    ).toBe(true);

    let lockedClientQueries = 0;
    const busyClient: AdvisoryLockClient = {
      async query<T extends Record<string, unknown>>() {
        lockedClientQueries += 1;
        return { rows: [{ locked: false } as unknown as T] };
      },
      release() {},
    };

    const skippedCancel = await cancelExpiredUnpaidOrders({
      pool: { connect: async () => busyClient },
    });
    const skippedComplete = await autoCompleteShippedOrders({
      pool: { connect: async () => busyClient },
    });
    expect(skippedCancel).toEqual({ acquired: false, cancelledOrderCodes: [] });
    expect(skippedComplete).toEqual({ acquired: false, completedOrderCodes: [] });
    expect(lockedClientQueries).toBe(2);
  });

  it('validasi kurir resmi dan buildTrackingUrl tetap konsisten', () => {
    expect(COURIERS.map((c) => c.code)).toEqual([...COURIER_CODES]);
    expect(COURIER_CODES).toEqual(
      expect.arrayContaining([
        'JNE',
        'JNT',
        'SICEPAT',
        'ANTERAJA',
        'POS',
        'NINJA',
        'IDEXPRESS',
        'LIONPARCEL',
        'GOJEK',
        'GRAB',
        'OTHER',
      ])
    );

    expect(isValidCourierCode('IDEXPRESS')).toBe(true);
    expect(isValidCourierCode('KURIR_TIDAK_ADA')).toBe(false);
    expect(isValidTrackingReceipt('JNE-123456')).toBe(true);
    expect(isValidTrackingReceipt('AB')).toBe(false);
    expect(isValidTrackingReceipt('https://evil.test/phish')).toBe(false);

    expect(buildTrackingUrl('JNE', 'JNE1234567890')).toBe('https://www.jne.co.id/tracking-package');
    expect(buildTrackingUrl('IDEXPRESS', 'IDE99887766')).toBe('https://idexpress.com/lacak-paket');
    expect(buildTrackingUrl('LIONPARCEL', 'LP-12345678')).toBe('https://lionparcel.com/track/stt');
    expect(buildTrackingUrl('GOJEK', 'GK-001122')).toBeNull();
    expect(buildTrackingUrl('GRAB', 'GR-001122')).toBeNull();
    expect(buildTrackingUrl('OTHER', '123456')).toBeNull();
    expect(buildTrackingUrl('JNE', 'https://evil.test/phish')).toBeNull();
    expect(buildTrackingUrl('JNE', 'AB')).toBeNull();
  });

  it('Dynamic DP Gatekeeper & kalkulasi DP atas subtotal bersih menghasilkan integer rupiah & rekonsiliasi tepat', async () => {
    const pricingService = createPricingService({
      catalogRepo: {
        loadPricingReferenceData: async () => createPricingRef(12, 70),
      },
    });

    const quoteUnderLimit = await pricingService.calculateQuote({
      items: [
        {
          modelId: 1,
          fabricId: 1,
          isCustomColor: false,
          fabricColorId: 10,
          sizes: [{ sizeId: 1, qty: 8 }],
          prints: [
            {
              printSizeId: 1,
              printPosition: PRINT_POSITION.FRONT_CHEST,
            },
          ],
        },
      ],
    });

    expect(quoteUnderLimit.dpEligible).toBe(false);
    expect(() => resolveInitialPaymentRequirement(quoteUnderLimit, PAYMENT_SCHEME.DP)).toThrow();

    const quoteEligible = await pricingService.calculateQuote({
      items: [
        {
          modelId: 1,
          fabricId: 1,
          isCustomColor: false,
          fabricColorId: 10,
          sizes: [
            { sizeId: 1, qty: 10 },
            { sizeId: 2, qty: 2 },
          ],
          prints: [
            {
              printSizeId: 1,
              printPosition: PRINT_POSITION.FRONT_CHEST,
            },
          ],
        },
      ],
    });

    // 12 pcs x (55.000 + 5.000 + 15.000) + 2 XXL x 10.000 = 920.000
    expect(quoteEligible.totalQty).toBe(12);
    expect(quoteEligible.subtotalAmount).toBe(920000);
    expect(quoteEligible.dpEligible).toBe(true);

    // Diskon 20.000 => netSubtotal = 900.000 => DP 70% = 630.000
    const dpReq = resolveInitialPaymentRequirement(quoteEligible, PAYMENT_SCHEME.DP, 20000);
    expect(dpReq.dpRequiredAmount).toBe(630000);
    expect(Number.isInteger(dpReq.dpRequiredAmount)).toBe(true);

    // Simulasi rekonsiliasi grand_total = (920.000 - 20.000) + ongkir 35.000 = 935.000
    const grandTotal = quoteEligible.subtotalAmount - 20000 + 35000;
    const verifiedSum = 630000 + 305000;
    const remainingBalance = grandTotal - verifiedSum;
    expect(grandTotal).toBe(935000);
    expect(remainingBalance).toBe(0);
  });
});
