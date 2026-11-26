import cron, { type ScheduledTask } from 'node-cron';
import type { PoolClient } from 'pg';
import { STORAGE_BUCKETS } from '../config/constants.js';
import { getPool } from '../config/database.js';
import * as storageService from './storageService.js';

export const ADVISORY_LOCK_CLEANUP_TMP = 530001;
export const ADVISORY_LOCK_CLEANUP_CARTS = 530002;
export const ADVISORY_LOCK_AUTO_CANCEL_ORDERS = 530003;
export const ADVISORY_LOCK_AUTO_COMPLETE_ORDERS = 530004;

const DEFAULT_TMP_MAX_AGE_HOURS = 24;
const DEFAULT_CART_STALE_DAYS = 30;
const DEFAULT_AUTO_COMPLETE_DAYS = 7;
const TMP_FILE_LIST_PAGE_LIMIT = 100;

export interface AdvisoryLockClient {
  query: <T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ) => Promise<{ rows: T[] }>;
  release: () => void;
}

export interface AdvisoryLockPool {
  connect: () => Promise<AdvisoryLockClient>;
}

export interface StorageListEntry {
  id?: string | null;
  name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface SchedulerStorageDeps {
  list: typeof storageService.list;
  remove: typeof storageService.remove;
}

export interface AdvisoryLockResult<T> {
  acquired: boolean;
  result?: T;
}

export interface TmpCleanupSummary {
  acquired: boolean;
  scannedCount: number;
  deletedPaths: string[];
}

export interface StaleCartCleanupSummary {
  acquired: boolean;
  deletedCartItems: number;
  deletedFiles: string[];
}

export interface AutoCancelOrdersSummary {
  acquired: boolean;
  cancelledOrderCodes: string[];
}

export interface AutoCompleteOrdersSummary {
  acquired: boolean;
  completedOrderCodes: string[];
}

/**
 * Menjalankan pekerjaan dengan PostgreSQL session-level Advisory Lock (`pg_try_advisory_lock`)
 * agar job cron tidak berjalan ganda ketika ada lebih dari satu instance backend.
 */
export async function withAdvisoryLock<T>(
  lockKey: number,
  task: (client: AdvisoryLockClient) => Promise<T>,
  pool: AdvisoryLockPool = getPool() as unknown as AdvisoryLockPool
): Promise<AdvisoryLockResult<T>> {
  const client = await pool.connect();
  let acquired = false;

  try {
    const lockRes = await client.query<{ locked: boolean }>(
      `SELECT pg_try_advisory_lock($1::bigint) AS locked`,
      [lockKey]
    );
    acquired = Boolean(lockRes.rows[0]?.locked);
    if (!acquired) {
      return { acquired: false };
    }

    const result = await task(client);
    return { acquired: true, result };
  } finally {
    if (acquired) {
      try {
        await client.query(`SELECT pg_advisory_unlock($1::bigint)`, [lockKey]);
      } catch (unlockErr: unknown) {
        console.warn('[SchedulerService] Gagal melepas advisory lock:', unlockErr);
      }
    }
    client.release();
  }
}

/**
 * Membersihkan file yatim di folder `tmp/` pada bucket `designs` yang berumur lebih dari `maxAgeHours` (default 24 jam).
 */
export async function cleanupOrphanTmpDesigns(
  options: {
    maxAgeHours?: number;
    nowMs?: number;
    pool?: AdvisoryLockPool;
    storage?: SchedulerStorageDeps;
  } = {}
): Promise<TmpCleanupSummary> {
  const maxAgeHours = options.maxAgeHours ?? DEFAULT_TMP_MAX_AGE_HOURS;
  const nowMs = options.nowMs ?? Date.now();
  const cutoffMs = nowMs - maxAgeHours * 3600 * 1000;
  const storage = options.storage ?? {
    list: storageService.list,
    remove: storageService.remove,
  };

  let scannedCount = 0;
  let deletedPaths: string[] = [];

  const lockOutcome = await withAdvisoryLock(
    ADVISORY_LOCK_CLEANUP_TMP,
    async () => {
      const stalePaths: string[] = [];
      let offset = 0;

      while (true) {
        const rawEntries = (await storage.list(STORAGE_BUCKETS.DESIGNS, 'tmp', {
          limit: TMP_FILE_LIST_PAGE_LIMIT,
          offset,
          sortBy: { column: 'created_at', order: 'asc' },
        })) as StorageListEntry[];

        if (rawEntries.length === 0) {
          break;
        }

        scannedCount += rawEntries.length;

        for (const entry of rawEntries) {
          const name = typeof entry.name === 'string' ? entry.name.trim() : '';
          // Abaikan entry folder placeholder (.emptyFolderPlaceholder atau id null)
          if (
            !name ||
            entry.id === null ||
            name === '.emptyFolderPlaceholder' ||
            name.endsWith('/')
          ) {
            continue;
          }

          const timestampStr = entry.updated_at ?? entry.created_at;
          if (!timestampStr) {
            continue;
          }
          const createdMs = Date.parse(timestampStr);
          if (Number.isNaN(createdMs) || createdMs > cutoffMs) {
            continue;
          }

          stalePaths.push(`tmp/${name}`);
        }

        if (rawEntries.length < TMP_FILE_LIST_PAGE_LIMIT) {
          break;
        }
        offset += TMP_FILE_LIST_PAGE_LIMIT;
      }

      if (stalePaths.length > 0) {
        await storage.remove(STORAGE_BUCKETS.DESIGNS, stalePaths);
        deletedPaths = stalePaths;
      }
    },
    options.pool
  );

  return {
    acquired: lockOutcome.acquired,
    scannedCount,
    deletedPaths,
  };
}

interface CartPrintConfigEntry {
  fileRef?: string | null;
}

interface CartConfigRowData {
  prints?: CartPrintConfigEntry[];
}

function extractCartFileRefs(config: CartConfigRowData | null | undefined): string[] {
  if (!config || !Array.isArray(config.prints)) return [];
  const refs: string[] = [];
  for (const spot of config.prints) {
    if (typeof spot?.fileRef === 'string') {
      const trimmed = spot.fileRef.trim();
      if (trimmed.startsWith('carts/')) {
        refs.push(trimmed);
      }
    }
  }
  return refs;
}

/**
 * Menghapus item keranjang (`cart_items`) yang tidak diperbarui > `staleDays` hari (default 30 hari)
 * beserta file desain yatimnya di `designs/carts/...` yang tidak lagi direferensikan item keranjang aktif.
 */
export async function cleanupStaleCartItems(
  options: {
    staleDays?: number;
    pool?: AdvisoryLockPool;
    storage?: Pick<SchedulerStorageDeps, 'remove'>;
  } = {}
): Promise<StaleCartCleanupSummary> {
  const staleDays = options.staleDays ?? DEFAULT_CART_STALE_DAYS;
  const storage = options.storage ?? { remove: storageService.remove };

  let deletedCartItems = 0;
  let orphanPaths: string[] = [];

  const lockOutcome = await withAdvisoryLock(
    ADVISORY_LOCK_CLEANUP_CARTS,
    async (client) => {
      await client.query('BEGIN');
      try {
        const staleRes = await client.query<{
          id: number;
          user_id: number;
          config: CartConfigRowData;
        }>(
          `SELECT id, user_id, config
           FROM cart_items
           WHERE updated_at < NOW() - ($1::int * INTERVAL '1 day')
           ORDER BY id ASC
           FOR UPDATE`,
          [staleDays]
        );

        if (staleRes.rows.length === 0) {
          await client.query('COMMIT');
          return;
        }

        const staleIds = staleRes.rows.map((row) => Number(row.id));
        const affectedUserIds = [...new Set(staleRes.rows.map((row) => Number(row.user_id)))];
        const candidatePaths = new Set<string>();
        for (const row of staleRes.rows) {
          for (const fileRef of extractCartFileRefs(row.config)) {
            candidatePaths.add(fileRef);
          }
        }

        await client.query(`DELETE FROM cart_items WHERE id = ANY($1::bigint[])`, [staleIds]);
        deletedCartItems = staleIds.length;

        const stillReferencedPaths = new Set<string>();
        if (candidatePaths.size > 0 && affectedUserIds.length > 0) {
          const remainingRes = await client.query<{ config: CartConfigRowData }>(
            `SELECT config
             FROM cart_items
             WHERE user_id = ANY($1::bigint[])`,
            [affectedUserIds]
          );
          for (const rem of remainingRes.rows) {
            for (const fileRef of extractCartFileRefs(rem.config)) {
              stillReferencedPaths.add(fileRef);
            }
          }
        }

        await client.query('COMMIT');

        orphanPaths = [...candidatePaths].filter((p) => !stillReferencedPaths.has(p));
      } catch (err: unknown) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Abaikan error rollback
        }
        throw err;
      }
    },
    options.pool
  );

  if (lockOutcome.acquired && orphanPaths.length > 0) {
    try {
      await storage.remove(STORAGE_BUCKETS.DESIGNS, orphanPaths);
    } catch (err: unknown) {
      console.warn('[SchedulerService] Gagal menghapus file desain keranjang yatim:', err);
      orphanPaths = [];
    }
  }

  return {
    acquired: lockOutcome.acquired,
    deletedCartItems,
    deletedFiles: orphanPaths,
  };
}

/**
 * Membatalkan order WEBSITE yang melewati batas waktu pembayaran (`payment_due_at < NOW()`)
 * dan belum memiliki pembayaran VERIFIED atau bukti PENDING yang sudah diunggah.
 * Order manual dengan `payment_due_at IS NULL` tidak ikut dibatalkan.
 */
export async function cancelExpiredUnpaidOrders(
  options: {
    pool?: AdvisoryLockPool;
  } = {}
): Promise<AutoCancelOrdersSummary> {
  let cancelledOrderCodes: string[] = [];

  const lockOutcome = await withAdvisoryLock(
    ADVISORY_LOCK_AUTO_CANCEL_ORDERS,
    async (client) => {
      await client.query('BEGIN');
      try {
        const expiredRes = await client.query<{ id: number; order_code: string }>(
          `SELECT o.id, o.order_code
           FROM orders o
           WHERE o.production_status = 'NEW_ORDER'
             AND o.payment_due_at IS NOT NULL
             AND o.payment_due_at < NOW()
             AND NOT EXISTS (
               SELECT 1
               FROM payments p
               WHERE p.order_id = o.id
                 AND (
                   p.status = 'VERIFIED'
                   OR (p.status = 'PENDING' AND p.proof_image_path IS NOT NULL)
                 )
             )
           ORDER BY o.id ASC
           FOR UPDATE SKIP LOCKED`
        );

        if (expiredRes.rows.length === 0) {
          await client.query('COMMIT');
          return;
        }

        const expiredIds = expiredRes.rows.map((row) => Number(row.id));
        const reason = 'Batas waktu pembayaran awal terlewati (dibatalkan otomatis oleh sistem).';

        await client.query(
          `UPDATE orders
           SET production_status = 'CANCELLED',
               cancelled_at = NOW(),
               cancelled_reason = $2,
               updated_at = NOW()
           WHERE id = ANY($1::bigint[])`,
          [expiredIds, reason]
        );

        await client.query(
          `INSERT INTO order_status_history (order_id, from_status, to_status, notes, changed_by)
           SELECT unnest($1::bigint[]), 'NEW_ORDER', 'CANCELLED', $2, NULL`,
          [expiredIds, reason]
        );

        await client.query('COMMIT');
        cancelledOrderCodes = expiredRes.rows.map((row) => row.order_code);
      } catch (err: unknown) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Abaikan error rollback
        }
        throw err;
      }
    },
    options.pool
  );

  return {
    acquired: lockOutcome.acquired,
    cancelledOrderCodes,
  };
}

/**
 * Menyelesaikan order berstatus `SHIPPING` yang sudah lunas (`remaining_balance = 0`)
 * dan melewati `auto_complete_days` hari sejak dikirim/siap diambil (`shipped_at`).
 */
export async function autoCompleteShippedOrders(
  options: {
    autoCompleteDays?: number;
    pool?: AdvisoryLockPool;
  } = {}
): Promise<AutoCompleteOrdersSummary> {
  let completedOrderCodes: string[] = [];

  const lockOutcome = await withAdvisoryLock(
    ADVISORY_LOCK_AUTO_COMPLETE_ORDERS,
    async (client) => {
      await client.query('BEGIN');
      try {
        let days = DEFAULT_AUTO_COMPLETE_DAYS;
        if (
          typeof options.autoCompleteDays === 'number' &&
          Number.isInteger(options.autoCompleteDays) &&
          options.autoCompleteDays > 0
        ) {
          days = options.autoCompleteDays;
        } else {
          const settingsRes = await client.query<{ setting_value: string }>(
            `SELECT setting_value
             FROM app_settings
             WHERE setting_key = 'auto_complete_days'
             LIMIT 1`
          );
          const parsed = Number.parseInt(settingsRes.rows[0]?.setting_value ?? '', 10);
          if (Number.isInteger(parsed) && parsed > 0) {
            days = parsed;
          }
        }

        const eligibleRes = await client.query<{ id: number; order_code: string }>(
          `SELECT o.id, o.order_code
           FROM orders o
           WHERE o.production_status = 'SHIPPING'
             AND o.remaining_balance = 0
             AND o.shipped_at IS NOT NULL
             AND o.shipped_at < NOW() - ($1::int * INTERVAL '1 day')
           ORDER BY o.id ASC
           FOR UPDATE SKIP LOCKED`,
          [days]
        );

        if (eligibleRes.rows.length === 0) {
          await client.query('COMMIT');
          return;
        }

        const eligibleIds = eligibleRes.rows.map((row) => Number(row.id));
        const notes = 'Pesanan diselesaikan otomatis setelah melewati batas hari penyelesaian.';

        await client.query(
          `UPDATE orders
           SET production_status = 'COMPLETED',
               completed_at = NOW(),
               updated_at = NOW()
           WHERE id = ANY($1::bigint[])`,
          [eligibleIds]
        );

        await client.query(
          `INSERT INTO order_status_history (order_id, from_status, to_status, notes, changed_by)
           SELECT unnest($1::bigint[]), 'SHIPPING', 'COMPLETED', $2, NULL`,
          [eligibleIds, notes]
        );

        await client.query('COMMIT');
        completedOrderCodes = eligibleRes.rows.map((row) => row.order_code);
      } catch (err: unknown) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Abaikan error rollback
        }
        throw err;
      }
    },
    options.pool
  );

  return {
    acquired: lockOutcome.acquired,
    completedOrderCodes,
  };
}

let scheduledTasks: ScheduledTask[] = [];

/**
 * Memulai job pembersih & otomatisasi siklus order memakai `node-cron` + PostgreSQL Advisory Lock.
 */
export function startSchedulers(): void {
  if (scheduledTasks.length > 0) {
    return;
  }

  const tmpCleanupTask = cron.schedule(
    '0 2 * * *',
    () => {
      void cleanupOrphanTmpDesigns()
        .then((res) => {
          if (res.acquired && res.deletedPaths.length > 0) {
            console.log(
              `[Scheduler] Pembersihan tmp/ selesai: ${res.deletedPaths.length} file yatim dihapus.`
            );
          }
        })
        .catch((err: unknown) => {
          console.error('[Scheduler] Error pembersihan tmp/:', err);
        });
    },
    { timezone: 'Asia/Jakarta' }
  );

  const staleCartTask = cron.schedule(
    '0 3 * * *',
    () => {
      void cleanupStaleCartItems()
        .then((res) => {
          if (res.acquired && (res.deletedCartItems > 0 || res.deletedFiles.length > 0)) {
            console.log(
              `[Scheduler] Pembersihan keranjang >30 hari: ${res.deletedCartItems} item & ${res.deletedFiles.length} file dihapus.`
            );
          }
        })
        .catch((err: unknown) => {
          console.error('[Scheduler] Error pembersihan keranjang kedaluwarsa:', err);
        });
    },
    { timezone: 'Asia/Jakarta' }
  );

  const autoCancelTask = cron.schedule(
    '*/15 * * * *',
    () => {
      void cancelExpiredUnpaidOrders()
        .then((res) => {
          if (res.acquired && res.cancelledOrderCodes.length > 0) {
            console.log(
              `[Scheduler] Auto-cancel order belum bayar: ${res.cancelledOrderCodes.join(', ')}`
            );
          }
        })
        .catch((err: unknown) => {
          console.error('[Scheduler] Error auto-cancel order belum bayar:', err);
        });
    },
    { timezone: 'Asia/Jakarta' }
  );

  const autoCompleteTask = cron.schedule(
    '0 4 * * *',
    () => {
      void autoCompleteShippedOrders()
        .then((res) => {
          if (res.acquired && res.completedOrderCodes.length > 0) {
            console.log(
              `[Scheduler] Auto-complete order selesai kirim: ${res.completedOrderCodes.join(', ')}`
            );
          }
        })
        .catch((err: unknown) => {
          console.error('[Scheduler] Error auto-complete order dikirim:', err);
        });
    },
    { timezone: 'Asia/Jakarta' }
  );

  scheduledTasks = [tmpCleanupTask, staleCartTask, autoCancelTask, autoCompleteTask];
  console.log(
    '[Scheduler] Cron aktif: tmp/ (02:00 WIB), cart >30h (03:00 WIB), auto-cancel (tiap 15m), auto-complete (04:00 WIB).'
  );
}

/**
 * Menghentikan seluruh cron job aktif saat server shutdown.
 */
export function stopSchedulers(): void {
  for (const task of scheduledTasks) {
    task.stop();
  }
  scheduledTasks = [];
}

export type PoolClientType = PoolClient;
