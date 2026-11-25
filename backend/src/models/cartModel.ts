import type { CartItemConfigDto } from '@yng/shared';
import { query, withTransaction } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';

export interface CartItemRow {
  id: number;
  cart_item_uuid: string;
  user_id: number;
  model_id: number;
  fabric_id: number;
  config: CartItemConfigDto;
  config_version: number;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CartRepository {
  listByUser(userId: number): Promise<CartItemRow[]>;
  findByUuidAndUser(userId: number, cartItemUuid: string): Promise<CartItemRow | null>;
  createAtomic(input: {
    userId: number;
    modelId: number;
    fabricId: number;
    config: CartItemConfigDto;
    maxItems: number;
  }): Promise<CartItemRow>;
  updateAtomic(input: {
    userId: number;
    cartItemUuid: string;
    modelId: number;
    fabricId: number;
    config: CartItemConfigDto;
  }): Promise<{
    updated: CartItemRow;
    previousConfig: CartItemConfigDto;
    otherCartItems: CartItemRow[];
  } | null>;
  deleteAtomic(
    userId: number,
    cartItemUuid: string
  ): Promise<{
    deleted: CartItemRow;
    remainingCartItems: CartItemRow[];
  } | null>;
}

const CART_COLUMNS =
  'id, cart_item_uuid, user_id, model_id, fabric_id, config, config_version, created_at, updated_at';

export const cartModel: CartRepository = {
  async listByUser(userId: number) {
    const result = await query<CartItemRow>(
      `SELECT ${CART_COLUMNS}
       FROM cart_items
       WHERE user_id = $1
       ORDER BY created_at ASC, id ASC`,
      [userId]
    );
    return result.rows;
  },

  async findByUuidAndUser(userId: number, cartItemUuid: string) {
    const result = await query<CartItemRow>(
      `SELECT ${CART_COLUMNS}
       FROM cart_items
       WHERE cart_item_uuid = $1
         AND user_id = $2
       LIMIT 1`,
      [cartItemUuid, userId]
    );
    return result.rows[0] ?? null;
  },

  async createAtomic(input) {
    return withTransaction(async (client) => {
      const userLock = await client.query<{ id: number }>(
        `SELECT id
         FROM users
         WHERE id = $1
           AND is_active = TRUE
         FOR UPDATE`,
        [input.userId]
      );
      if (userLock.rows.length === 0) {
        throw new AppError('Akun pengguna tidak ditemukan atau tidak aktif.', 401);
      }

      const countResult = await client.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total
         FROM cart_items
         WHERE user_id = $1`,
        [input.userId]
      );
      const currentTotal = countResult.rows[0]?.total ?? 0;

      if (currentTotal >= input.maxItems) {
        throw new AppError(`Keranjang sudah mencapai batas maksimal ${input.maxItems} item.`, 400);
      }

      const insertResult = await client.query<CartItemRow>(
        `INSERT INTO cart_items (user_id, model_id, fabric_id, config, config_version)
         VALUES ($1, $2, $3, $4::jsonb, 1)
         RETURNING ${CART_COLUMNS}`,
        [input.userId, input.modelId, input.fabricId, JSON.stringify(input.config)]
      );

      return insertResult.rows[0];
    });
  },

  async updateAtomic(input) {
    return withTransaction(async (client) => {
      const existingResult = await client.query<CartItemRow>(
        `SELECT ${CART_COLUMNS}
         FROM cart_items
         WHERE cart_item_uuid = $1
           AND user_id = $2
         FOR UPDATE`,
        [input.cartItemUuid, input.userId]
      );
      const existing = existingResult.rows[0];
      if (!existing) {
        return null;
      }

      const updatedResult = await client.query<CartItemRow>(
        `UPDATE cart_items
         SET model_id = $1,
             fabric_id = $2,
             config = $3::jsonb
         WHERE id = $4
           AND user_id = $5
         RETURNING ${CART_COLUMNS}`,
        [input.modelId, input.fabricId, JSON.stringify(input.config), existing.id, input.userId]
      );

      const othersResult = await client.query<CartItemRow>(
        `SELECT ${CART_COLUMNS}
         FROM cart_items
         WHERE user_id = $1
           AND id <> $2`,
        [input.userId, existing.id]
      );

      return {
        updated: updatedResult.rows[0],
        previousConfig: existing.config,
        otherCartItems: othersResult.rows,
      };
    });
  },

  async deleteAtomic(userId: number, cartItemUuid: string) {
    return withTransaction(async (client) => {
      const deletedResult = await client.query<CartItemRow>(
        `DELETE FROM cart_items
         WHERE cart_item_uuid = $1
           AND user_id = $2
         RETURNING ${CART_COLUMNS}`,
        [cartItemUuid, userId]
      );
      const deleted = deletedResult.rows[0];
      if (!deleted) {
        return null;
      }

      const remainingResult = await client.query<CartItemRow>(
        `SELECT ${CART_COLUMNS}
         FROM cart_items
         WHERE user_id = $1`,
        [userId]
      );

      return {
        deleted,
        remainingCartItems: remainingResult.rows,
      };
    });
  },
};

export default cartModel;
