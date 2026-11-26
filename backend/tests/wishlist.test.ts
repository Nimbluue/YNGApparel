import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { USER_ROLE, type UserRole, type WishlistItemDto } from '@yng/shared';
import cookieParser from 'cookie-parser';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  WishlistFabricRow,
  WishlistModelRow,
  WishlistRepository,
} from '../src/models/wishlistModel.js';
import type { AuthDbUserRow } from '../src/types/auth.js';

process.env.SKIP_DOTENV = 'true';
process.env.JWT_SECRET = 'test_secret_minimal_32_karakter_12345';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';

const { env } = await import('../src/config/env.js');
const { createRequireAuth, signAuthToken } = await import('../src/middleware/auth.js');
const { errorHandler, notFoundHandler } = await import('../src/middleware/errorHandler.js');
const { originCheck } = await import('../src/middleware/originCheck.js');
const { createWishlistRouter } = await import('../src/routes/wishlistRoutes.js');
const { createWishlistService } = await import('../src/services/wishlistService.js');

interface SeedModel {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  base_price: number;
  image_path: string | null;
  sort_order: number;
  is_active: boolean;
  fabrics: Array<{
    id: number;
    code: string;
    name: string;
    additional_price: number;
    is_active: boolean;
  }>;
}

function createInMemoryWishlistStore(seedUsers: AuthDbUserRow[], seedModels: SeedModel[]) {
  const usersByUuid = new Map<string, AuthDbUserRow>();
  for (const user of seedUsers) {
    usersByUuid.set(user.user_uuid, { ...user });
  }

  const modelsById = new Map<number, SeedModel>();
  const modelsBySlug = new Map<string, SeedModel>();
  for (const model of seedModels) {
    modelsById.set(model.id, model);
    modelsBySlug.set(model.slug, model);
  }

  // userId -> Map<garmentModelId, createdAtIso>
  const entries = new Map<number, Map<number, string>>();
  let seqMs = 1_700_000_000_000;

  const findUserByUuid = async (userUuid: string): Promise<AuthDbUserRow | null> => {
    const user = usersByUuid.get(userUuid);
    return user ? { ...user } : null;
  };

  const wishlistRepo: WishlistRepository = {
    async listActiveByUser(userId) {
      const userMap = entries.get(userId);
      if (!userMap || userMap.size === 0) {
        return { items: [], fabricsByModel: new Map() };
      }

      const items: WishlistModelRow[] = [];
      const fabricsByModel = new Map<number, WishlistFabricRow[]>();

      const sorted = [...userMap.entries()].sort((a, b) => b[1].localeCompare(a[1]));
      for (const [modelId, createdAt] of sorted) {
        const model = modelsById.get(modelId);
        if (!model || !model.is_active) continue;

        items.push({
          garment_model_id: model.id,
          slug: model.slug,
          name: model.name,
          description: model.description,
          base_price: model.base_price,
          image_path: model.image_path,
          created_at: createdAt,
        });

        const activeFabrics: WishlistFabricRow[] = model.fabrics
          .filter((f) => f.is_active)
          .map((f) => ({
            model_id: model.id,
            id: f.id,
            code: f.code,
            name: f.name,
            additional_price: f.additional_price,
          }));
        fabricsByModel.set(model.id, activeFabrics);
      }

      return { items, fabricsByModel };
    },

    async findActiveModel(input) {
      const model = input.modelSlug
        ? modelsBySlug.get(input.modelSlug)
        : input.garmentModelId !== undefined
          ? modelsById.get(input.garmentModelId)
          : undefined;
      if (!model || !model.is_active) return null;
      return { id: model.id, slug: model.slug };
    },

    async addModel(userId, garmentModelId) {
      let userMap = entries.get(userId);
      if (!userMap) {
        userMap = new Map();
        entries.set(userId, userMap);
      }
      if (!userMap.has(garmentModelId)) {
        seqMs += 1000;
        userMap.set(garmentModelId, new Date(seqMs).toISOString());
      }
    },

    async removeModelBySlug(userId, modelSlug) {
      const userMap = entries.get(userId);
      const model = modelsBySlug.get(modelSlug);
      if (!userMap || !model) return false;
      return userMap.delete(model.id);
    },

    async mergeModelSlugs(userId, modelSlugs) {
      let userMap = entries.get(userId);
      if (!userMap) {
        userMap = new Map();
        entries.set(userId, userMap);
      }
      for (const slug of modelSlugs) {
        const model = modelsBySlug.get(slug);
        if (model && model.is_active && !userMap.has(model.id)) {
          seqMs += 1000;
          userMap.set(model.id, new Date(seqMs).toISOString());
        }
      }
    },
  };

  return { entries, findUserByUuid, wishlistRepo };
}

describe('Gelombang 2 — API Wishlist Tersinkron Lintas Perangkat', () => {
  const ADMIN_UUID = '11111111-1111-4111-8111-111111111111';
  const USER_A_UUID = '22222222-2222-4222-8222-222222222222';
  const USER_B_UUID = '33333333-3333-4333-8333-333333333333';

  let server: http.Server;
  let baseUrl: string;
  let entries: Map<number, Map<number, string>>;
  let adminCookie: string;
  let userACookie: string;
  let userBCookie: string;

  async function apiJson<T>(
    path: string,
    options: {
      method?: string;
      cookie?: string;
      origin?: string | null;
      body?: unknown;
    } = {}
  ): Promise<{ status: number; body: { success: boolean; message: string; data: T } }> {
    const headers: Record<string, string> = {};
    if (options.cookie) headers.Cookie = options.cookie;
    if (options.origin !== null) {
      headers.Origin = options.origin ?? 'http://localhost:5173';
    }
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    const body = (await res.json()) as { success: boolean; message: string; data: T };
    return { status: res.status, body };
  }

  function makeCookie(userUuid: string, role: UserRole) {
    const token = signAuthToken({ userUuid, role, tokenVersion: 0 });
    return `${env.cookieName}=${token}`;
  }

  beforeAll(async () => {
    const store = createInMemoryWishlistStore(
      [
        {
          id: 1,
          user_uuid: ADMIN_UUID,
          role: USER_ROLE.ADMIN,
          full_name: 'Owner Studio',
          email: 'owner@yngapparel.id',
          whatsapp: null,
          is_active: true,
          token_version: 0,
        },
        {
          id: 2,
          user_uuid: USER_A_UUID,
          role: USER_ROLE.USER,
          full_name: 'Pelanggan Alpha',
          email: 'alpha@yng.test',
          whatsapp: '6281211111111',
          is_active: true,
          token_version: 0,
        },
        {
          id: 3,
          user_uuid: USER_B_UUID,
          role: USER_ROLE.USER,
          full_name: 'Pelanggan Beta',
          email: 'beta@yng.test',
          whatsapp: '6281222222222',
          is_active: true,
          token_version: 0,
        },
      ],
      [
        {
          id: 101,
          slug: 'heavyweight-boxy-tee',
          name: 'Heavyweight Boxy Tee',
          description: 'Kaos boxy 240 GSM',
          base_price: 95000,
          image_path: 'models/boxy-tee.webp',
          sort_order: 1,
          is_active: true,
          fabrics: [
            {
              id: 10,
              code: 'CTN24S',
              name: 'Cotton Combed 24s',
              additional_price: 0,
              is_active: true,
            },
            {
              id: 11,
              code: 'HVY16S',
              name: 'Heavyweight 16s',
              additional_price: 15000,
              is_active: true,
            },
            {
              id: 12,
              code: 'OLD',
              name: 'Bahan Nonaktif',
              additional_price: 5000,
              is_active: false,
            },
          ],
        },
        {
          id: 102,
          slug: 'essential-pullover-hoodie',
          name: 'Essential Pullover Hoodie',
          description: 'Hoodie fleece studio',
          base_price: 225000,
          image_path: 'models/hoodie.webp',
          sort_order: 2,
          is_active: true,
          fabrics: [
            {
              id: 20,
              code: 'FLEECE330',
              name: 'Cotton Fleece 330 GSM',
              additional_price: 25000,
              is_active: true,
            },
          ],
        },
        {
          id: 103,
          slug: 'archived-jacket',
          name: 'Archived Jacket',
          description: null,
          base_price: 310000,
          image_path: null,
          sort_order: 3,
          is_active: false,
          fabrics: [],
        },
      ]
    );

    entries = store.entries;
    const requireAuthMw = createRequireAuth(store.findUserByUuid);
    const wishlistService = createWishlistService({
      wishlistRepo: store.wishlistRepo,
      getPublicCatalogUrl: (filePath) =>
        filePath ? `https://cdn.yng.test/catalog/${filePath}` : null,
    });

    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use(
      '/api/wishlist',
      originCheck,
      createWishlistRouter({ wishlistService, requireAuthMiddleware: requireAuthMw })
    );
    app.use(notFoundHandler);
    app.use(errorHandler);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    adminCookie = makeCookie(ADMIN_UUID, USER_ROLE.ADMIN);
    userACookie = makeCookie(USER_A_UUID, USER_ROLE.USER);
    userBCookie = makeCookie(USER_B_UUID, USER_ROLE.USER);
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  beforeEach(() => {
    entries.clear();
  });

  it('menolak Guest tanpa sesi (401) dan Origin lintas situs tidak sah (403)', async () => {
    const getGuest = await apiJson('/api/wishlist');
    expect(getGuest.status).toBe(401);

    const postGuest = await apiJson('/api/wishlist', {
      method: 'POST',
      body: { modelSlug: 'heavyweight-boxy-tee' },
    });
    expect(postGuest.status).toBe(401);

    const mergeGuest = await apiJson('/api/wishlist/merge', {
      method: 'POST',
      body: { modelSlugs: ['heavyweight-boxy-tee'] },
    });
    expect(mergeGuest.status).toBe(401);

    const delGuest = await apiJson('/api/wishlist/heavyweight-boxy-tee', { method: 'DELETE' });
    expect(delGuest.status).toBe(401);

    const badOrigin = await apiJson('/api/wishlist', {
      method: 'POST',
      cookie: userACookie,
      origin: 'https://evil.example',
      body: { modelSlug: 'heavyweight-boxy-tee' },
    });
    expect(badOrigin.status).toBe(403);
  });

  it('mengizinkan USER & ADMIN menyimpan item dengan slug/id secara idempoten dan menolak model nonaktif (404)', async () => {
    const addBySlug = await apiJson<WishlistItemDto[]>('/api/wishlist', {
      method: 'POST',
      cookie: userACookie,
      body: { modelSlug: 'heavyweight-boxy-tee' },
    });
    expect(addBySlug.status).toBe(200);
    expect(addBySlug.body.data).toHaveLength(1);
    expect(addBySlug.body.data[0]).toMatchObject({
      garmentModelId: 101,
      slug: 'heavyweight-boxy-tee',
      name: 'Heavyweight Boxy Tee',
      basePrice: 95000,
      imageUrl: 'https://cdn.yng.test/catalog/models/boxy-tee.webp',
    });
    expect(addBySlug.body.data[0]?.fabrics).toEqual([
      { id: 10, code: 'CTN24S', name: 'Cotton Combed 24s', additionalPrice: 0 },
      { id: 11, code: 'HVY16S', name: 'Heavyweight 16s', additionalPrice: 15000 },
    ]);

    // Duplikasi tetap idempoten
    const addDuplicate = await apiJson<WishlistItemDto[]>('/api/wishlist', {
      method: 'POST',
      cookie: userACookie,
      body: { garmentModelId: 101 },
    });
    expect(addDuplicate.status).toBe(200);
    expect(addDuplicate.body.data).toHaveLength(1);

    // ADMIN juga dapat mengakses wishlist
    const addAdmin = await apiJson<WishlistItemDto[]>('/api/wishlist', {
      method: 'POST',
      cookie: adminCookie,
      body: { garmentModelId: 102 },
    });
    expect(addAdmin.status).toBe(200);
    expect(addAdmin.body.data.map((i) => i.slug)).toEqual(['essential-pullover-hoodie']);

    // Model nonaktif -> 404
    const addInactive = await apiJson('/api/wishlist', {
      method: 'POST',
      cookie: userACookie,
      body: { modelSlug: 'archived-jacket' },
    });
    expect(addInactive.status).toBe(404);

    // Body kosong -> 400
    const addInvalid = await apiJson('/api/wishlist', {
      method: 'POST',
      cookie: userACookie,
      body: {},
    });
    expect(addInvalid.status).toBe(400);
  });

  it('mengisolasi wishlist antar user dan DELETE bersifat idempoten', async () => {
    await apiJson('/api/wishlist', {
      method: 'POST',
      cookie: userACookie,
      body: { modelSlug: 'heavyweight-boxy-tee' },
    });
    await apiJson('/api/wishlist', {
      method: 'POST',
      cookie: userBCookie,
      body: { modelSlug: 'essential-pullover-hoodie' },
    });

    const getA = await apiJson<WishlistItemDto[]>('/api/wishlist', { cookie: userACookie });
    const getB = await apiJson<WishlistItemDto[]>('/api/wishlist', { cookie: userBCookie });
    expect(getA.body.data.map((i) => i.slug)).toEqual(['heavyweight-boxy-tee']);
    expect(getB.body.data.map((i) => i.slug)).toEqual(['essential-pullover-hoodie']);

    // User B mencoba hapus item milik User A -> item User A tetap utuh
    const delOther = await apiJson<WishlistItemDto[]>('/api/wishlist/heavyweight-boxy-tee', {
      method: 'DELETE',
      cookie: userBCookie,
    });
    expect(delOther.status).toBe(200);
    expect(delOther.body.data.map((i) => i.slug)).toEqual(['essential-pullover-hoodie']);

    const getAAfter = await apiJson<WishlistItemDto[]>('/api/wishlist', { cookie: userACookie });
    expect(getAAfter.body.data.map((i) => i.slug)).toEqual(['heavyweight-boxy-tee']);

    // User A menghapus itemnya sendiri
    const delOwn = await apiJson<WishlistItemDto[]>('/api/wishlist/heavyweight-boxy-tee', {
      method: 'DELETE',
      cookie: userACookie,
    });
    expect(delOwn.status).toBe(200);
    expect(delOwn.body.data).toEqual([]);
  });

  it('POST /api/wishlist/merge menggabungkan daftar tamu tanpa duplikasi dan mengabaikan slug tidak aktif', async () => {
    await apiJson('/api/wishlist', {
      method: 'POST',
      cookie: userACookie,
      body: { modelSlug: 'heavyweight-boxy-tee' },
    });

    const merged = await apiJson<WishlistItemDto[]>('/api/wishlist/merge', {
      method: 'POST',
      cookie: userACookie,
      body: {
        modelSlugs: [
          'heavyweight-boxy-tee',
          'essential-pullover-hoodie',
          'essential-pullover-hoodie',
          'archived-jacket',
          'tidak-ada',
        ],
      },
    });

    expect(merged.status).toBe(200);
    expect(merged.body.data.map((i) => i.slug)).toEqual([
      'essential-pullover-hoodie',
      'heavyweight-boxy-tee',
    ]);
  });
});
