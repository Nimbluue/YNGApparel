import {
  DESIGN_STATUS,
  FULFILLMENT_TYPE,
  ORDER_SOURCE,
  PAYMENT_METHOD,
  PAYMENT_STAGE,
  PAYMENT_STATUS,
  PRODUCTION_STATUS,
  type CreateOrderRequestDto,
  type DesignStatus,
  type FulfillmentType,
  type OrderSource,
  type PaymentMethod,
  type PaymentScheme,
  type PaymentStage,
  type PaymentStatus,
  type PrintPosition,
  type ProductionStatus,
  type Rupiah,
} from '@yng/shared';
import path from 'node:path';
import { query, withTransaction } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import type { CartItemRow } from './cartModel.js';
import catalogModel, {
  type CatalogRepository,
  type PricingLookupIds,
  type SqlQueryExecutor,
} from './catalogModel.js';
import {
  calculateQuoteFromReferenceData,
  resolveInitialPaymentRequirement,
} from '../services/pricingService.js';
import { generateOrderCode } from '../utils/orderCode.js';
import { normalizeWhatsApp } from '../utils/phone.js';

export interface OrderRow {
  id: number;
  transaction_uuid: string;
  order_code: string;
  user_id: number | null;
  source: OrderSource;
  idempotency_key: string | null;
  customer_name: string;
  customer_whatsapp: string;
  fulfillment_type: FulfillmentType;
  province_name: string | null;
  city_name: string | null;
  district_name: string | null;
  postal_code: string | null;
  full_address: string | null;
  total_qty: number;
  dp_min_qty_snapshot: number;
  is_dp_eligible: boolean;
  payment_scheme: PaymentScheme;
  dp_percent_snapshot: number | null;
  subtotal_amount: Rupiah;
  discount_amount: Rupiah;
  discount_note: string | null;
  shipping_cost: Rupiah;
  grand_total: Rupiah;
  dp_required_amount: Rupiah;
  remaining_balance: Rupiah;
  refunded_amount: Rupiah;
  production_status: ProductionStatus;
  design_status: DesignStatus;
  design_review_notes: string | null;
  admin_notes: string | null;
  estimated_finish_date: Date | string | null;
  shipping_courier: string | null;
  shipping_service: string | null;
  tracking_receipt_number: string | null;
  shipped_at: Date | string | null;
  payment_due_at: Date | string | null;
  cancelled_reason: string | null;
  cancelled_at: Date | string | null;
  completed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface OrderItemRow {
  id: number;
  order_id: number;
  model_id: number;
  fabric_id: number;
  model_name: string;
  fabric_name: string;
  fabric_color_id: number | null;
  is_custom_color: boolean;
  color_name: string;
  color_hex: string | null;
  needs_design_help: boolean;
  production_notes: string | null;
  locked_base_price: Rupiah;
  locked_fabric_price: Rupiah;
  item_qty: number;
  line_subtotal: Rupiah;
}

export interface OrderItemSizeRow {
  id: number;
  order_item_id: number;
  size_id: number;
  size_code: string;
  qty: number;
  locked_extra_charge: Rupiah;
}

export interface OrderItemPrintRow {
  id: number;
  order_item_id: number;
  print_size_id: number;
  print_size_code: string;
  print_position: PrintPosition;
  raw_design_file_path: string | null;
  design_file_name: string | null;
  locked_spot_price: Rupiah;
}

export interface OrderPaymentRow {
  id: number;
  payment_uuid: string;
  order_id: number;
  payment_stage: PaymentStage;
  payment_method: PaymentMethod | null;
  payment_account_id: number | null;
  amount: Rupiah;
  proof_image_path: string | null;
  status: PaymentStatus;
  rejection_reason: string | null;
  proof_uploaded_at: Date | string | null;
  verified_at: Date | string | null;
  created_at: Date | string;
}

export interface OrderQcPhotoRow {
  id: number;
  order_id: number;
  photo_path: string;
  created_at: Date | string;
}

export interface OrderStatusHistoryRow {
  id: number;
  order_id: number;
  from_status: string | null;
  to_status: string;
  notes: string | null;
  created_at: Date | string;
}

export interface OrderSummaryRow {
  transaction_uuid: string;
  order_code: string;
  fulfillment_type: FulfillmentType;
  total_qty: number;
  payment_scheme: PaymentScheme;
  dp_percent_snapshot: number | null;
  grand_total: Rupiah;
  dp_required_amount: Rupiah;
  remaining_balance: Rupiah;
  production_status: ProductionStatus;
  design_status: DesignStatus;
  initial_payment_status: PaymentStatus | null;
  initial_payment_has_proof: boolean;
  payment_due_at: Date | string | null;
  created_at: Date | string;
}

export interface OrderDetailRecord {
  order: OrderRow;
  items: OrderItemRow[];
  itemSizes: OrderItemSizeRow[];
  itemPrints: OrderItemPrintRow[];
  payments: OrderPaymentRow[];
  qcPhotos: OrderQcPhotoRow[];
  statusHistory: OrderStatusHistoryRow[];
}

export interface DesignFileTransferPlan {
  fromPath: string;
  toPath: string;
  mode: 'move' | 'copy';
}

export interface OrderRepository {
  createWebsiteOrderAtomic(input: {
    userId: number;
    idempotencyKey: string | null;
    payload: CreateOrderRequestDto;
    catalogRepo: Pick<CatalogRepository, 'loadPricingReferenceData'>;
    executeDesignTransfers: (transfers: DesignFileTransferPlan[]) => Promise<void>;
  }): Promise<{ transactionUuid: string; deduplicated: boolean }>;
  listOrdersByUser(
    userId: number,
    pagination: { page: number; limit: number }
  ): Promise<{ rows: OrderSummaryRow[]; total: number }>;
  findOrderDetailByUuid(
    transactionUuid: string,
    userId?: number
  ): Promise<OrderDetailRecord | null>;
  findOrderPaymentsByTransactionUuid(
    transactionUuid: string
  ): Promise<{ order: OrderRow; payments: OrderPaymentRow[] } | null>;
  uploadPaymentProofAtomic(input: {
    transactionUuid: string;
    paymentUuid: string;
    paymentMethod: PaymentMethod;
    paymentAccountId: number | null;
    processAndUploadProof: (
      orderTransactionUuid: string,
      paymentUuid: string
    ) => Promise<{ path: string }>;
  }): Promise<{
    order: OrderRow;
    payment: OrderPaymentRow;
    previousProofPath: string | null;
  } | null>;
}

const ORDER_COLUMNS =
  'id, transaction_uuid, order_code, user_id, source, idempotency_key, customer_name, customer_whatsapp, fulfillment_type, province_name, city_name, district_name, postal_code, full_address, total_qty, dp_min_qty_snapshot, is_dp_eligible, payment_scheme, dp_percent_snapshot, subtotal_amount, discount_amount, discount_note, shipping_cost, grand_total, dp_required_amount, remaining_balance, refunded_amount, production_status, design_status, design_review_notes, admin_notes, estimated_finish_date, shipping_courier, shipping_service, tracking_receipt_number, shipped_at, payment_due_at, cancelled_reason, cancelled_at, completed_at, created_at, updated_at';

const PAYMENT_COLUMNS =
  'id, payment_uuid, order_id, payment_stage, payment_method, payment_account_id, amount, proof_image_path, status, rejection_reason, proof_uploaded_at, verified_at, created_at';

function collectLookupIds(rows: readonly CartItemRow[]): PricingLookupIds {
  const modelIds = new Set<number>();
  const fabricIds = new Set<number>();
  const fabricColorIds = new Set<number>();
  const sizeIds = new Set<number>();
  const printSizeIds = new Set<number>();

  for (const row of rows) {
    modelIds.add(row.model_id);
    fabricIds.add(row.fabric_id);
    if (row.config.fabricColorId !== null && row.config.fabricColorId !== undefined) {
      fabricColorIds.add(row.config.fabricColorId);
    }
    for (const s of row.config.sizes ?? []) {
      sizeIds.add(s.sizeId);
    }
    for (const p of row.config.prints ?? []) {
      printSizeIds.add(p.printSizeId);
    }
  }

  return {
    modelIds: [...modelIds],
    fabricIds: [...fabricIds],
    fabricColorIds: [...fabricColorIds],
    sizeIds: [...sizeIds],
    printSizeIds: [...printSizeIds],
  };
}

async function loadOrderDetailWithExecutor(
  executor: SqlQueryExecutor,
  transactionUuid: string,
  userId?: number
): Promise<OrderDetailRecord | null> {
  const orderResult =
    userId !== undefined
      ? await executor.query<OrderRow>(
          `SELECT ${ORDER_COLUMNS}
           FROM orders
           WHERE transaction_uuid = $1
             AND user_id = $2
           LIMIT 1`,
          [transactionUuid, userId]
        )
      : await executor.query<OrderRow>(
          `SELECT ${ORDER_COLUMNS}
           FROM orders
           WHERE transaction_uuid = $1
           LIMIT 1`,
          [transactionUuid]
        );

  const order = orderResult.rows[0];
  if (!order) {
    return null;
  }

  const [itemsRes, paymentsRes, qcRes, historyRes] = await Promise.all([
    executor.query<OrderItemRow>(
      `SELECT id, order_id, model_id, fabric_id, model_name, fabric_name, fabric_color_id,
              is_custom_color, color_name, color_hex, needs_design_help, production_notes,
              locked_base_price, locked_fabric_price, item_qty, line_subtotal
       FROM order_items
       WHERE order_id = $1
       ORDER BY id ASC`,
      [order.id]
    ),
    executor.query<OrderPaymentRow>(
      `SELECT ${PAYMENT_COLUMNS}
       FROM payments
       WHERE order_id = $1
       ORDER BY id ASC`,
      [order.id]
    ),
    executor.query<OrderQcPhotoRow>(
      `SELECT id, order_id, photo_path, created_at
       FROM order_qc_photos
       WHERE order_id = $1
       ORDER BY created_at ASC, id ASC`,
      [order.id]
    ),
    executor.query<OrderStatusHistoryRow>(
      `SELECT id, order_id, from_status, to_status, notes, created_at
       FROM order_status_history
       WHERE order_id = $1
       ORDER BY created_at ASC, id ASC`,
      [order.id]
    ),
  ]);

  const itemIds = itemsRes.rows.map((item) => item.id);
  let itemSizes: OrderItemSizeRow[] = [];
  let itemPrints: OrderItemPrintRow[] = [];

  if (itemIds.length > 0) {
    const [sizesRes, printsRes] = await Promise.all([
      executor.query<OrderItemSizeRow>(
        `SELECT id, order_item_id, size_id, size_code, qty, locked_extra_charge
         FROM order_item_sizes
         WHERE order_item_id = ANY($1::bigint[])
         ORDER BY id ASC`,
        [itemIds]
      ),
      executor.query<OrderItemPrintRow>(
        `SELECT id, order_item_id, print_size_id, print_size_code, print_position,
                raw_design_file_path, design_file_name, locked_spot_price
         FROM order_item_prints
         WHERE order_item_id = ANY($1::bigint[])
         ORDER BY id ASC`,
        [itemIds]
      ),
    ]);
    itemSizes = sizesRes.rows;
    itemPrints = printsRes.rows;
  }

  return {
    order,
    items: itemsRes.rows,
    itemSizes,
    itemPrints,
    payments: paymentsRes.rows,
    qcPhotos: qcRes.rows,
    statusHistory: historyRes.rows,
  };
}

export const orderModel: OrderRepository = {
  async createWebsiteOrderAtomic({
    userId,
    idempotencyKey,
    payload,
    catalogRepo,
    executeDesignTransfers,
  }) {
    return withTransaction(async (client) => {
      const userRes = await client.query<{
        id: number;
        full_name: string;
        whatsapp: string | null;
      }>(
        `SELECT id, full_name, whatsapp
         FROM users
         WHERE id = $1
           AND is_active = TRUE
         FOR UPDATE`,
        [userId]
      );
      const user = userRes.rows[0];
      if (!user) {
        throw new AppError('Akun pengguna tidak ditemukan atau tidak aktif.', 401);
      }

      if (idempotencyKey) {
        const existingOrderRes = await client.query<{
          id: number;
          user_id: number | null;
          transaction_uuid: string;
        }>(
          `SELECT id, user_id, transaction_uuid
           FROM orders
           WHERE idempotency_key = $1
           LIMIT 1`,
          [idempotencyKey]
        );
        const existingOrder = existingOrderRes.rows[0];
        if (existingOrder) {
          if (existingOrder.user_id !== userId) {
            throw new AppError('Idempotency-Key sudah digunakan.', 409);
          }
          return {
            transactionUuid: existingOrder.transaction_uuid,
            deduplicated: true,
          };
        }
      }

      const uniqueCartUuids = [...new Set(payload.cartItemUuids)];
      const cartRes = await client.query<CartItemRow>(
        `SELECT id, cart_item_uuid, user_id, model_id, fabric_id, config, config_version, created_at, updated_at
         FROM cart_items
         WHERE user_id = $1
           AND cart_item_uuid = ANY($2::uuid[])
         ORDER BY created_at ASC, id ASC
         FOR UPDATE`,
        [userId, uniqueCartUuids]
      );
      if (cartRes.rows.length !== uniqueCartUuids.length) {
        throw new AppError(
          'Sebagian item keranjang yang dipilih tidak ditemukan atau bukan milik Anda.',
          404
        );
      }

      // Resolusi & validasi alamat / penerima sebelum kalkulasi
      let customerName: string;
      let customerWhatsapp: string;
      let provinceName: string | null = null;
      let cityName: string | null = null;
      let districtName: string | null = null;
      let postalCode: string | null = null;
      let fullAddress: string | null = null;

      if (payload.fulfillmentType === FULFILLMENT_TYPE.SHIP) {
        if (payload.addressUuid) {
          const addrRes = await client.query<{
            recipient_name: string;
            recipient_whatsapp: string;
            province_name: string;
            city_name: string;
            district_name: string;
            postal_code: string;
            full_address: string;
          }>(
            `SELECT recipient_name, recipient_whatsapp, province_name, city_name,
                    district_name, postal_code, full_address
             FROM user_addresses
             WHERE address_uuid = $1
               AND user_id = $2
             LIMIT 1`,
            [payload.addressUuid, userId]
          );
          const addr = addrRes.rows[0];
          if (!addr) {
            throw new AppError('Alamat tersimpan tidak ditemukan.', 404);
          }
          customerName = addr.recipient_name;
          customerWhatsapp = addr.recipient_whatsapp;
          provinceName = addr.province_name;
          cityName = addr.city_name;
          districtName = addr.district_name;
          postalCode = addr.postal_code;
          fullAddress = addr.full_address;
        } else if (payload.address) {
          const normalizedWa = normalizeWhatsApp(payload.address.recipientWhatsapp);
          if (!normalizedWa) {
            throw new AppError(
              'Nomor WhatsApp penerima harus berformat 62xxxxxxxxxx atau 08xxxxxxxxxx.',
              400
            );
          }
          customerName = payload.address.recipientName.trim();
          customerWhatsapp = normalizedWa;
          provinceName = payload.address.provinceName.trim();
          cityName = payload.address.cityName.trim();
          districtName = payload.address.districtName.trim();
          postalCode = payload.address.postalCode.trim();
          fullAddress = payload.address.fullAddress.trim();
        } else {
          throw new AppError(
            'Pilih alamat tersimpan atau isi alamat pengiriman lengkap untuk opsi Kirim.',
            400
          );
        }
      } else {
        const rawName = (payload.pickupName ?? user.full_name).trim();
        const rawWa = payload.pickupWhatsapp ?? user.whatsapp;
        const normalizedWa = normalizeWhatsApp(rawWa);
        if (!rawName) {
          throw new AppError('Nama pengambil pesanan wajib diisi.', 400);
        }
        if (!normalizedWa) {
          throw new AppError(
            'Nomor WhatsApp wajib diisi dengan format yang valid untuk pengambilan.',
            400
          );
        }
        customerName = rawName;
        customerWhatsapp = normalizedWa;
      }

      // Hitung ulang harga & validasi Dynamic DP Gatekeeper dari katalog aktif server
      const lookup = collectLookupIds(cartRes.rows);
      const refData = await catalogRepo.loadPricingReferenceData(lookup, client);

      const quote = calculateQuoteFromReferenceData(
        {
          items: cartRes.rows.map((row) => ({
            modelId: row.model_id,
            fabricId: row.fabric_id,
            isCustomColor: row.config.isCustomColor,
            fabricColorId: row.config.fabricColorId,
            colorName: row.config.colorName,
            colorHex: row.config.colorHex,
            sizes: row.config.sizes,
            prints: (row.config.prints ?? []).map((p) => ({
              printSizeId: p.printSizeId,
              printPosition: p.printPosition,
            })),
          })),
        },
        refData
      );

      const paymentReq = resolveInitialPaymentRequirement(quote, payload.paymentScheme);

      const dueHoursRes = await client.query<{ value: string }>(
        `SELECT value FROM app_settings WHERE key = 'initial_payment_due_hours' LIMIT 1`
      );
      const parsedDueHours = Number.parseInt(dueHoursRes.rows[0]?.value ?? '', 10);
      const paymentDueHours =
        Number.isInteger(parsedDueHours) && parsedDueHours > 0 ? parsedDueHours : 24;

      // Insert orders dengan retry jika order_code bentrok (23505)
      let insertedOrder: { id: number; transaction_uuid: string; order_code: string } | null = null;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidateCode = generateOrderCode();
        try {
          await client.query('SAVEPOINT sp_insert_order');
          const insertOrderRes = await client.query<{
            id: number;
            transaction_uuid: string;
            order_code: string;
          }>(
            `INSERT INTO orders (
               order_code, user_id, source, idempotency_key,
               customer_name, customer_whatsapp,
               fulfillment_type, province_name, city_name, district_name, postal_code, full_address,
               total_qty, dp_min_qty_snapshot, payment_scheme, dp_percent_snapshot,
               subtotal_amount, discount_amount, shipping_cost, dp_required_amount, remaining_balance,
               production_status, design_status, payment_due_at
             )
             VALUES (
               $1, $2, $3, $4,
               $5, $6,
               $7, $8, $9, $10, $11, $12,
               $13, $14, $15, $16,
               $17, 0, 0, $18, $19,
               $20, $21, NOW() + ($22 * INTERVAL '1 hour')
             )
             RETURNING id, transaction_uuid, order_code`,
            [
              candidateCode,
              userId,
              ORDER_SOURCE.WEBSITE,
              idempotencyKey,
              customerName,
              customerWhatsapp,
              payload.fulfillmentType,
              provinceName,
              cityName,
              districtName,
              postalCode,
              fullAddress,
              quote.totalQty,
              quote.dpMinQty,
              paymentReq.paymentScheme,
              paymentReq.dpPercentSnapshot,
              quote.subtotalAmount,
              paymentReq.dpRequiredAmount,
              quote.subtotalAmount,
              PRODUCTION_STATUS.NEW_ORDER,
              DESIGN_STATUS.PENDING,
              paymentDueHours,
            ]
          );
          await client.query('RELEASE SAVEPOINT sp_insert_order');
          insertedOrder = insertOrderRes.rows[0];
          break;
        } catch (err: unknown) {
          await client.query('ROLLBACK TO SAVEPOINT sp_insert_order');
          const pgErr = err as { code?: string; constraint?: string };
          if (pgErr.code === '23505' && pgErr.constraint === 'orders_order_code_key') {
            continue;
          }
          throw err;
        }
      }

      if (!insertedOrder) {
        throw new AppError('Gagal menghasilkan kode pesanan unik. Silakan coba lagi.', 500);
      }

      const designTransfers: Array<{ fromPath: string; toPath: string }> = [];

      for (let i = 0; i < cartRes.rows.length; i += 1) {
        const cartRow = cartRes.rows[i]!;
        const breakdown = quote.items[i]!;
        const needsDesignHelp = (cartRow.config.prints ?? []).some((p) => p.needsDesignHelp);

        const itemRes = await client.query<{ id: number }>(
          `INSERT INTO order_items (
             order_id, model_id, fabric_id, model_name, fabric_name,
             fabric_color_id, is_custom_color, color_name, color_hex,
             needs_design_help, production_notes,
             locked_base_price, locked_fabric_price, item_qty, line_subtotal
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           RETURNING id`,
          [
            insertedOrder.id,
            breakdown.modelId,
            breakdown.fabricId,
            breakdown.modelName,
            breakdown.fabricName,
            breakdown.fabricColorId,
            breakdown.isCustomColor,
            breakdown.colorName,
            breakdown.colorHex,
            needsDesignHelp,
            cartRow.config.productionNotes ?? null,
            breakdown.basePrice,
            breakdown.fabricAdditionalPrice,
            breakdown.itemQty,
            breakdown.lineSubtotal,
          ]
        );
        const orderItemId = itemRes.rows[0]!.id;

        for (const sizeEntry of breakdown.sizes) {
          await client.query(
            `INSERT INTO order_item_sizes (
               order_item_id, size_id, size_code, qty, locked_extra_charge
             )
             VALUES ($1, $2, $3, $4, $5)`,
            [
              orderItemId,
              sizeEntry.sizeId,
              sizeEntry.sizeCode,
              sizeEntry.qty,
              sizeEntry.extraCharge,
            ]
          );
        }

        const configPrints = cartRow.config.prints ?? [];
        for (let pIdx = 0; pIdx < breakdown.prints.length; pIdx += 1) {
          const printBreakdown = breakdown.prints[pIdx]!;
          const configPrint = configPrints[pIdx];
          let targetDesignPath: string | null = null;
          let designFileName: string | null = null;

          if (configPrint && !configPrint.needsDesignHelp && configPrint.fileRef) {
            const baseFile = path.posix.basename(configPrint.fileRef);
            targetDesignPath = `orders/${insertedOrder.transaction_uuid}/${baseFile}`;
            designFileName = configPrint.fileName ?? baseFile;
            designTransfers.push({
              fromPath: configPrint.fileRef,
              toPath: targetDesignPath,
            });
          }

          await client.query(
            `INSERT INTO order_item_prints (
               order_item_id, print_size_id, print_size_code, print_position,
               raw_design_file_path, design_file_name, locked_spot_price
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              orderItemId,
              printBreakdown.printSizeId,
              printBreakdown.printSizeCode,
              printBreakdown.printPosition,
              targetDesignPath,
              designFileName,
              printBreakdown.pricePerSpot,
            ]
          );
        }
      }

      const initialStage =
        paymentReq.paymentScheme === 'DP' ? PAYMENT_STAGE.DP : PAYMENT_STAGE.FULL;
      await client.query(
        `INSERT INTO payments (order_id, payment_stage, amount, status)
         VALUES ($1, $2, $3, $4)`,
        [insertedOrder.id, initialStage, paymentReq.dpRequiredAmount, PAYMENT_STATUS.PENDING]
      );

      await client.query(
        `INSERT INTO order_status_history (order_id, from_status, to_status, notes)
         VALUES ($1, NULL, $2, $3)`,
        [insertedOrder.id, PRODUCTION_STATUS.NEW_ORDER, 'Pesanan dibuat dari keranjang website.']
      );

      // Hapus HANYA item keranjang yang di-checkout dalam transaksi yang sama
      await client.query(
        `DELETE FROM cart_items
         WHERE user_id = $1
           AND cart_item_uuid = ANY($2::uuid[])`,
        [userId, uniqueCartUuids]
      );

      if (designTransfers.length > 0) {
        const remainingRes = await client.query<{ config: CartItemRow['config'] }>(
          `SELECT config
           FROM cart_items
           WHERE user_id = $1`,
          [userId]
        );
        const stillReferenced = new Set<string>();
        for (const rem of remainingRes.rows) {
          for (const spot of rem.config.prints ?? []) {
            if (spot.fileRef) stillReferenced.add(spot.fileRef);
          }
        }

        const transferPlans: DesignFileTransferPlan[] = designTransfers.map((t) => ({
          fromPath: t.fromPath,
          toPath: t.toPath,
          mode: stillReferenced.has(t.fromPath) ? 'copy' : 'move',
        }));

        await executeDesignTransfers(transferPlans);
      }

      return {
        transactionUuid: insertedOrder.transaction_uuid,
        deduplicated: false,
      };
    });
  },

  async listOrdersByUser(userId, { page, limit }) {
    const offset = (page - 1) * limit;
    const countRes = await query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM orders
       WHERE user_id = $1`,
      [userId]
    );
    const total = countRes.rows[0]?.total ?? 0;

    const rowsRes = await query<OrderSummaryRow>(
      `SELECT o.transaction_uuid,
              o.order_code,
              o.fulfillment_type,
              o.total_qty,
              o.payment_scheme,
              o.dp_percent_snapshot,
              o.grand_total,
              o.dp_required_amount,
              o.remaining_balance,
              o.production_status,
              o.design_status,
              p.status AS initial_payment_status,
              (p.proof_image_path IS NOT NULL) AS initial_payment_has_proof,
              o.payment_due_at,
              o.created_at
       FROM orders o
       LEFT JOIN payments p
         ON p.order_id = o.id
        AND p.payment_stage IN ('DP', 'FULL')
       WHERE o.user_id = $1
       ORDER BY o.created_at DESC, o.id DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    return {
      rows: rowsRes.rows,
      total,
    };
  },

  async findOrderDetailByUuid(transactionUuid, userId) {
    return loadOrderDetailWithExecutor({ query }, transactionUuid, userId);
  },

  async findOrderPaymentsByTransactionUuid(transactionUuid) {
    const orderRes = await query<OrderRow>(
      `SELECT ${ORDER_COLUMNS}
       FROM orders
       WHERE transaction_uuid = $1
       LIMIT 1`,
      [transactionUuid]
    );
    const order = orderRes.rows[0];
    if (!order) {
      return null;
    }

    const paymentsRes = await query<OrderPaymentRow>(
      `SELECT ${PAYMENT_COLUMNS}
       FROM payments
       WHERE order_id = $1
       ORDER BY id ASC`,
      [order.id]
    );

    return {
      order,
      payments: paymentsRes.rows,
    };
  },

  async uploadPaymentProofAtomic({
    transactionUuid,
    paymentUuid,
    paymentMethod,
    paymentAccountId,
    processAndUploadProof,
  }) {
    return withTransaction(async (client) => {
      const orderRes = await client.query<OrderRow>(
        `SELECT ${ORDER_COLUMNS}
         FROM orders
         WHERE transaction_uuid = $1
         FOR UPDATE`,
        [transactionUuid]
      );
      const order = orderRes.rows[0];
      if (!order) {
        return null;
      }

      if (order.production_status === PRODUCTION_STATUS.CANCELLED) {
        throw new AppError(
          'Pesanan yang sudah dibatalkan tidak dapat menerima bukti pembayaran.',
          409
        );
      }

      const paymentRes = await client.query<OrderPaymentRow>(
        `SELECT ${PAYMENT_COLUMNS}
         FROM payments
         WHERE payment_uuid = $1
           AND order_id = $2
         FOR UPDATE`,
        [paymentUuid, order.id]
      );
      const payment = paymentRes.rows[0];
      if (!payment) {
        return null;
      }

      if (payment.status === PAYMENT_STATUS.VERIFIED) {
        throw new AppError('Pembayaran untuk tahap ini sudah terverifikasi.', 409);
      }

      if (paymentAccountId !== null) {
        const accountRes = await client.query<{
          id: number;
          method: PaymentMethod;
          is_active: boolean;
        }>(
          `SELECT id, method, is_active
           FROM payment_accounts
           WHERE id = $1
           LIMIT 1`,
          [paymentAccountId]
        );
        const account = accountRes.rows[0];
        if (!account || !account.is_active) {
          throw new AppError('Rekening atau QRIS pembayaran tidak ditemukan atau nonaktif.', 400);
        }
        if (account.method !== paymentMethod) {
          throw new AppError(
            `Metode pembayaran harus ${account.method === PAYMENT_METHOD.QRIS ? 'QRIS' : 'BANK_TRANSFER'} sesuai rekening yang dipilih.`,
            400
          );
        }
      }

      const uploaded = await processAndUploadProof(order.transaction_uuid, payment.payment_uuid);

      const updatedRes = await client.query<OrderPaymentRow>(
        `UPDATE payments
         SET payment_method = $1,
             payment_account_id = $2,
             proof_image_path = $3,
             status = $4,
             rejection_reason = NULL,
             proof_uploaded_at = NOW()
         WHERE id = $5
         RETURNING ${PAYMENT_COLUMNS}`,
        [paymentMethod, paymentAccountId, uploaded.path, PAYMENT_STATUS.PENDING, payment.id]
      );

      return {
        order,
        payment: updatedRes.rows[0],
        previousProofPath: payment.proof_image_path,
      };
    });
  },
};

export default orderModel;
