import { query } from '../config/database.js';

export interface WishlistModelRow {
  garment_model_id: number;
  slug: string;
  name: string;
  description: string | null;
  base_price: number;
  image_path: string | null;
  created_at: string | Date;
}

export interface WishlistFabricRow {
  model_id: number;
  id: number;
  code: string;
  name: string;
  additional_price: number;
}

export interface ActiveWishlistTargetRow {
  id: number;
  slug: string;
}

export interface WishlistRepository {
  listActiveByUser(userId: number): Promise<{
    items: WishlistModelRow[];
    fabricsByModel: Map<number, WishlistFabricRow[]>;
  }>;
  findActiveModel(input: {
    modelSlug?: string;
    garmentModelId?: number;
  }): Promise<ActiveWishlistTargetRow | null>;
  addModel(userId: number, garmentModelId: number): Promise<void>;
  removeModelBySlug(userId: number, modelSlug: string): Promise<boolean>;
  mergeModelSlugs(userId: number, modelSlugs: string[]): Promise<void>;
}

export const wishlistModel: WishlistRepository = {
  async listActiveByUser(userId) {
    const modelsRes = await query<WishlistModelRow>(
      `SELECT gm.id AS garment_model_id,
              gm.slug,
              gm.name,
              gm.description,
              gm.base_price,
              gm.image_path,
              uw.created_at
       FROM user_wishlists uw
       INNER JOIN garment_models gm ON gm.id = uw.garment_model_id
       WHERE uw.user_id = $1 AND gm.is_active = TRUE
       ORDER BY uw.created_at DESC, gm.sort_order ASC, gm.id ASC`,
      [userId]
    );

    const fabricsByModel = new Map<number, WishlistFabricRow[]>();
    if (modelsRes.rows.length > 0) {
      const modelIds = modelsRes.rows.map((row) => row.garment_model_id);
      const fabricsRes = await query<WishlistFabricRow>(
        `SELECT mf.model_id,
                f.id,
                f.code,
                f.name,
                f.additional_price
         FROM model_fabrics mf
         INNER JOIN fabrics f ON f.id = mf.fabric_id
         WHERE mf.model_id = ANY($1::bigint[]) AND f.is_active = TRUE
         ORDER BY f.sort_order ASC, f.id ASC`,
        [modelIds]
      );

      for (const fabric of fabricsRes.rows) {
        const list = fabricsByModel.get(fabric.model_id) ?? [];
        list.push(fabric);
        fabricsByModel.set(fabric.model_id, list);
      }
    }

    return { items: modelsRes.rows, fabricsByModel };
  },

  async findActiveModel(input) {
    if (input.modelSlug) {
      const res = await query<ActiveWishlistTargetRow>(
        `SELECT id, slug
         FROM garment_models
         WHERE slug = $1 AND is_active = TRUE
         LIMIT 1`,
        [input.modelSlug]
      );
      return res.rows[0] ?? null;
    }

    if (input.garmentModelId !== undefined) {
      const res = await query<ActiveWishlistTargetRow>(
        `SELECT id, slug
         FROM garment_models
         WHERE id = $1 AND is_active = TRUE
         LIMIT 1`,
        [input.garmentModelId]
      );
      return res.rows[0] ?? null;
    }

    return null;
  },

  async addModel(userId, garmentModelId) {
    await query(
      `INSERT INTO user_wishlists (user_id, garment_model_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, garment_model_id) DO NOTHING`,
      [userId, garmentModelId]
    );
  },

  async removeModelBySlug(userId, modelSlug) {
    const res = await query(
      `DELETE FROM user_wishlists uw
       USING garment_models gm
       WHERE uw.garment_model_id = gm.id
         AND uw.user_id = $1
         AND gm.slug = $2`,
      [userId, modelSlug]
    );
    return (res.rowCount ?? 0) > 0;
  },

  async mergeModelSlugs(userId, modelSlugs) {
    if (modelSlugs.length === 0) return;
    await query(
      `INSERT INTO user_wishlists (user_id, garment_model_id)
       SELECT $1, gm.id
       FROM garment_models gm
       WHERE gm.slug = ANY($2::text[]) AND gm.is_active = TRUE
       ON CONFLICT (user_id, garment_model_id) DO NOTHING`,
      [userId, modelSlugs]
    );
  },
};

export default wishlistModel;
