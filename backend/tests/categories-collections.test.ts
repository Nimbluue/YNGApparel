import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  COLLECTION_STATUS,
  USER_ROLE,
  type AppSettingKey,
  type CatalogCategoryDto,
  type CatalogCollectionDto,
  type CreateCatalogCategoryDto,
  type CreateCatalogCollectionDto,
  type CreateGarmentModelDto,
  type GarmentModelDto,
  type PublicCatalogCategoryDto,
  type PublicCatalogCollectionDto,
  type PublicGarmentModelDto,
  type PublicModelDetailDto,
  type UpdateCatalogCategoryDto,
  type UpdateCatalogCollectionDto,
  type UpdateGarmentModelDto,
} from '@yng/shared';
import cookieParser from 'cookie-parser';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogRepository, PricingLookupIds } from '../src/models/catalogModel.js';
import type {
  CatalogCategoryRow,
  CatalogCollectionRow,
  GarmentModelRow,
  MasterRepository,
} from '../src/models/masterModel.js';
import type { AuthDbUserRow } from '../src/types/auth.js';

process.env.SKIP_DOTENV = 'true';
process.env.JWT_SECRET = 'test_secret_minimal_32_karakter_12345';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';

const { env } = await import('../src/config/env.js');
const { createRequireAuth, signAuthToken } = await import('../src/middleware/auth.js');
const { AppError, errorHandler, notFoundHandler } =
  await import('../src/middleware/errorHandler.js');
const { originCheck } = await import('../src/middleware/originCheck.js');
const { createAdminRouter } = await import('../src/routes/adminRoutes.js');
const { createPublicRouter } = await import('../src/routes/publicRoutes.js');
const { createAdminMasterService } = await import('../src/services/adminMasterService.js');
const { createCatalogService } = await import('../src/services/catalogService.js');

const STORAGE_PUBLIC_BASE = 'https://cdn.example.test/storage/v1/object/public/catalog';

function createPgUniqueError(constraint: string): Error & { code: string; constraint: string } {
  const err = new Error(
    `duplicate key value violates unique constraint "${constraint}"`
  ) as Error & {
    code: string;
    constraint: string;
  };
  err.code = '23505';
  err.constraint = constraint;
  return err;
}

function createInMemoryCategoryCollectionStore() {
  let modelIdSeq = 1;
  const categories = new Map<string, CatalogCategoryRow>();
  const collections = new Map<string, CatalogCollectionRow>();
  const models = new Map<number, GarmentModelRow>();
  const now = () => new Date().toISOString();

  function countActiveModelsForCategory(categoryId: string): number {
    return [...models.values()].filter((m) => m.is_active && m.category_id === categoryId).length;
  }

  function countActiveModelsForCollection(collectionId: string): number {
    return [...models.values()].filter((m) => m.is_active && m.collection_id === collectionId)
      .length;
  }

  const masterRepo: MasterRepository = {
    async listCategories(includeInactive) {
      return [...categories.values()]
        .filter((c) => includeInactive || c.is_active)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
        .map((c) => ({ ...c, active_model_count: countActiveModelsForCategory(c.id) }));
    },

    async findCategoryById(id) {
      const row = categories.get(id);
      if (!row) return null;
      return { ...row, active_model_count: countActiveModelsForCategory(row.id) };
    },

    async createCategory(input: CreateCatalogCategoryDto) {
      for (const existing of categories.values()) {
        if (existing.name === input.name) throw createPgUniqueError('catalog_categories_name_key');
        if (existing.slug === input.slug) throw createPgUniqueError('catalog_categories_slug_key');
      }
      const created: CatalogCategoryRow = {
        id: crypto.randomUUID(),
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        size_chart_image_path: input.sizeChartImagePath ?? null,
        sort_order: input.sortOrder ?? 0,
        is_active: input.isActive ?? true,
        active_model_count: 0,
        created_at: now(),
        updated_at: now(),
      };
      categories.set(created.id, created);
      return { ...created };
    },

    async updateCategory(id, patch: UpdateCatalogCategoryDto) {
      const current = categories.get(id);
      if (!current) return null;
      for (const existing of categories.values()) {
        if (existing.id === id) continue;
        if (patch.name && existing.name === patch.name) {
          throw createPgUniqueError('catalog_categories_name_key');
        }
        if (patch.slug && existing.slug === patch.slug) {
          throw createPgUniqueError('catalog_categories_slug_key');
        }
      }
      const updated: CatalogCategoryRow = {
        ...current,
        name: patch.name ?? current.name,
        slug: patch.slug ?? current.slug,
        description: patch.description !== undefined ? patch.description : current.description,
        size_chart_image_path:
          patch.sizeChartImagePath !== undefined
            ? patch.sizeChartImagePath
            : current.size_chart_image_path,
        sort_order: patch.sortOrder ?? current.sort_order,
        is_active: patch.isActive ?? current.is_active,
        updated_at: now(),
      };
      categories.set(id, updated);
      return { ...updated, active_model_count: countActiveModelsForCategory(id) };
    },

    async deactivateCategory(id) {
      const current = categories.get(id);
      if (!current) return null;
      const updated = { ...current, is_active: false, updated_at: now() };
      categories.set(id, updated);
      return { ...updated, active_model_count: countActiveModelsForCategory(id) };
    },

    async reorderCategories(items) {
      for (const item of items) {
        const current = categories.get(item.id);
        if (current) {
          categories.set(item.id, { ...current, sort_order: item.sortOrder, updated_at: now() });
        }
      }
      return this.listCategories(true);
    },

    async listCollections(includeInactive) {
      return [...collections.values()]
        .filter((c) => includeInactive || c.is_active)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
        .map((c) => ({ ...c, active_model_count: countActiveModelsForCollection(c.id) }));
    },

    async findCollectionById(id) {
      const row = collections.get(id);
      if (!row) return null;
      return { ...row, active_model_count: countActiveModelsForCollection(row.id) };
    },

    async createCollection(input: CreateCatalogCollectionDto) {
      for (const existing of collections.values()) {
        if (existing.name === input.name) throw createPgUniqueError('catalog_collections_name_key');
        if (existing.slug === input.slug) throw createPgUniqueError('catalog_collections_slug_key');
      }
      const created: CatalogCollectionRow = {
        id: crypto.randomUUID(),
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        status: input.status ?? COLLECTION_STATUS.ACTIVE,
        sort_order: input.sortOrder ?? 0,
        is_active: input.isActive ?? true,
        active_model_count: 0,
        created_at: now(),
        updated_at: now(),
      };
      collections.set(created.id, created);
      return { ...created };
    },

    async updateCollection(id, patch: UpdateCatalogCollectionDto) {
      const current = collections.get(id);
      if (!current) return null;
      for (const existing of collections.values()) {
        if (existing.id === id) continue;
        if (patch.name && existing.name === patch.name) {
          throw createPgUniqueError('catalog_collections_name_key');
        }
        if (patch.slug && existing.slug === patch.slug) {
          throw createPgUniqueError('catalog_collections_slug_key');
        }
      }
      const updated: CatalogCollectionRow = {
        ...current,
        name: patch.name ?? current.name,
        slug: patch.slug ?? current.slug,
        description: patch.description !== undefined ? patch.description : current.description,
        status: patch.status ?? current.status,
        sort_order: patch.sortOrder ?? current.sort_order,
        is_active: patch.isActive ?? current.is_active,
        updated_at: now(),
      };
      collections.set(id, updated);
      return { ...updated, active_model_count: countActiveModelsForCollection(id) };
    },

    async deactivateCollection(id) {
      const current = collections.get(id);
      if (!current) return null;
      const updated = { ...current, is_active: false, updated_at: now() };
      collections.set(id, updated);
      return { ...updated, active_model_count: countActiveModelsForCollection(id) };
    },

    async reorderCollections(items) {
      for (const item of items) {
        const current = collections.get(item.id);
        if (current) {
          collections.set(item.id, { ...current, sort_order: item.sortOrder, updated_at: now() });
        }
      }
      return this.listCollections(true);
    },

    async listModels(includeInactive) {
      const list = [...models.values()]
        .filter((m) => includeInactive || m.is_active)
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
      const fabricIdsByModel = new Map<number, number[]>();
      const categoriesById = new Map<string, CatalogCategoryRow>();
      const collectionsById = new Map<string, CatalogCollectionRow>();
      for (const m of list) {
        fabricIdsByModel.set(m.id, []);
        if (m.category_id && categories.has(m.category_id)) {
          categoriesById.set(m.category_id, { ...categories.get(m.category_id)! });
        }
        if (m.collection_id && collections.has(m.collection_id)) {
          collectionsById.set(m.collection_id, { ...collections.get(m.collection_id)! });
        }
      }
      return {
        models: list.map((m) => ({ ...m })),
        fabricIdsByModel,
        categoriesById,
        collectionsById,
      };
    },

    async findModelById(id) {
      const row = models.get(id);
      return row ? { ...row } : null;
    },

    async findModelFabricIds() {
      return [];
    },

    async createModel(input: CreateGarmentModelDto) {
      const created: GarmentModelRow = {
        id: modelIdSeq++,
        slug: input.slug,
        name: input.name,
        description: input.description ?? null,
        base_price: input.basePrice,
        image_path: input.imagePath ?? null,
        mockup_template: input.mockupTemplate ?? null,
        category_id: input.categoryId ?? null,
        collection_id: input.collectionId ?? null,
        sort_order: input.sortOrder ?? 0,
        is_active: input.isActive ?? true,
        created_at: now(),
        updated_at: now(),
      };
      models.set(created.id, created);
      return { ...created };
    },

    async updateModel(id, patch: UpdateGarmentModelDto) {
      const current = models.get(id);
      if (!current) return null;
      const updated: GarmentModelRow = {
        ...current,
        slug: patch.slug ?? current.slug,
        name: patch.name ?? current.name,
        description: patch.description !== undefined ? patch.description : current.description,
        base_price: patch.basePrice ?? current.base_price,
        image_path: patch.imagePath !== undefined ? patch.imagePath : current.image_path,
        mockup_template:
          patch.mockupTemplate !== undefined ? patch.mockupTemplate : current.mockup_template,
        category_id: patch.categoryId !== undefined ? patch.categoryId : current.category_id,
        collection_id:
          patch.collectionId !== undefined ? patch.collectionId : current.collection_id,
        sort_order: patch.sortOrder ?? current.sort_order,
        is_active: patch.isActive ?? current.is_active,
        updated_at: now(),
      };
      models.set(id, updated);
      return { ...updated };
    },

    async deactivateModel(id) {
      const current = models.get(id);
      if (!current) return null;
      const updated = { ...current, is_active: false, updated_at: now() };
      models.set(id, updated);
      return { ...updated };
    },

    async replaceModelFabrics() {
      return [];
    },

    async listFabrics() {
      return { fabrics: [], colorsByFabric: new Map() };
    },
    async findFabricById() {
      return null;
    },
    async createFabric() {
      throw new AppError('Unused in test.', 500);
    },
    async updateFabric() {
      return null;
    },
    async deactivateFabric() {
      return null;
    },
    async listFabricColors() {
      return [];
    },
    async findFabricColorById() {
      return null;
    },
    async createFabricColor() {
      throw new AppError('Unused in test.', 500);
    },
    async updateFabricColor() {
      return null;
    },
    async deactivateFabricColor() {
      return null;
    },
    async listSizes() {
      return [];
    },
    async findSizeById() {
      return null;
    },
    async createSize() {
      throw new AppError('Unused in test.', 500);
    },
    async updateSize() {
      return null;
    },
    async deactivateSize() {
      return null;
    },
    async listPrintSizes() {
      return [];
    },
    async findPrintSizeById() {
      return null;
    },
    async createPrintSize() {
      throw new AppError('Unused in test.', 500);
    },
    async updatePrintSize() {
      return null;
    },
    async deactivatePrintSize() {
      return null;
    },
    async listPaymentAccounts() {
      return [];
    },
    async findPaymentAccountById() {
      return null;
    },
    async createPaymentAccount() {
      throw new AppError('Unused in test.', 500);
    },
    async updatePaymentAccount() {
      return null;
    },
    async deactivatePaymentAccount() {
      return null;
    },
    async listSettings() {
      return [];
    },
    async updateSettingsAtomically() {
      return [];
    },
  };

  const catalogRepo: CatalogRepository = {
    async listActiveCategories() {
      return [...categories.values()]
        .filter((c) => c.is_active)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
        .map((c) => ({ ...c, active_model_count: countActiveModelsForCategory(c.id) }));
    },

    async listActiveCollections() {
      return [...collections.values()]
        .filter((c) => c.is_active && c.status !== COLLECTION_STATUS.ARCHIVED)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
        .map((c) => ({ ...c, active_model_count: countActiveModelsForCollection(c.id) }));
    },

    async listActiveModels() {
      const list = [...models.values()]
        .filter((m) => m.is_active)
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
      const fabricIdsByModel = new Map<number, number[]>();
      const categoriesById = new Map<string, CatalogCategoryRow>();
      const collectionsById = new Map<string, CatalogCollectionRow>();
      for (const m of list) {
        fabricIdsByModel.set(m.id, []);
        const cat = m.category_id ? categories.get(m.category_id) : undefined;
        if (cat && cat.is_active) {
          categoriesById.set(cat.id, { ...cat });
        }
        const col = m.collection_id ? collections.get(m.collection_id) : undefined;
        if (col && col.is_active && col.status !== COLLECTION_STATUS.ARCHIVED) {
          collectionsById.set(col.id, { ...col });
        }
      }
      return { models: list, fabricIdsByModel, categoriesById, collectionsById };
    },

    async findActiveModelDetailBySlug(slug: string) {
      const model = [...models.values()].find((m) => m.slug === slug && m.is_active);
      if (!model) return null;
      const cat = model.category_id ? categories.get(model.category_id) : undefined;
      const col = model.collection_id ? collections.get(model.collection_id) : undefined;
      return {
        model: { ...model },
        category: cat && cat.is_active ? { ...cat } : null,
        collection:
          col && col.is_active && col.status !== COLLECTION_STATUS.ARCHIVED ? { ...col } : null,
        fabrics: [],
        colorsByFabric: new Map(),
      };
    },

    async listActiveFabrics() {
      return { fabrics: [], colorsByFabric: new Map() };
    },
    async listActiveSizes() {
      return [];
    },
    async listActivePrintSizes() {
      return [];
    },
    async listPublicSettings() {
      const fallbackKeys: AppSettingKey[] = ['store_name'];
      void fallbackKeys;
      return [];
    },
    async listActivePaymentAccounts() {
      return [];
    },
    async loadPricingReferenceData(_lookup: PricingLookupIds) {
      throw new AppError('Unused in test.', 500);
    },
  };

  return { masterRepo, catalogRepo };
}

describe('Tahap 1 — Kategori, Koleksi/Series, Size Chart, & Relasi Bank Model', () => {
  let server: http.Server;
  let baseUrl = '';
  let adminCookie = '';

  const adminUser: AuthDbUserRow = {
    id: 1,
    user_uuid: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    full_name: 'Admin Studio',
    email: 'admin@yng.test',
    whatsapp: null,
    role: USER_ROLE.ADMIN,
    is_active: true,
    token_version: 0,
  };

  const removedStoragePaths: string[] = [];

  const { masterRepo, catalogRepo } = createInMemoryCategoryCollectionStore();

  const masterService = createAdminMasterService({
    masterRepo,
    catalogStorage: {
      upload: vi.fn().mockResolvedValue('unused'),
      remove: vi.fn().mockImplementation(async (_bucket, paths: string[]) => {
        removedStoragePaths.push(...paths);
      }),
    },
    getPublicCatalogUrl: (filePath) => (filePath ? `${STORAGE_PUBLIC_BASE}/${filePath}` : null),
  });

  const publicCatalogService = createCatalogService({
    catalogRepo,
    getPublicCatalogUrl: (filePath) => (filePath ? `${STORAGE_PUBLIC_BASE}/${filePath}` : null),
  });

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(originCheck);

    const requireAuth = createRequireAuth(async () => adminUser);
    app.use('/api/admin', createAdminRouter({ requireAuthMiddleware: requireAuth, masterService }));
    app.use('/api', createPublicRouter({ catalogService: publicCatalogService }));
    app.use(notFoundHandler);
    app.use(errorHandler);

    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    const token = signAuthToken({
      userUuid: adminUser.user_uuid,
      role: adminUser.role,
      tokenVersion: adminUser.token_version,
    });
    adminCookie = `${env.cookieName}=${token}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    removedStoragePaths.length = 0;
  });

  it('CRUD Kategori dengan Size Chart (hapus path lama saat diganti) & Reorder', async () => {
    const firstChartPath = 'size-charts/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png';
    const secondChartPath = 'size-charts/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.webp';

    const createRes = await fetch(`${baseUrl}/api/admin/categories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        name: 'T-Shirt',
        slug: 't-shirt',
        description: 'Kaos custom',
        sizeChartImagePath: firstChartPath,
        sortOrder: 1,
      }),
    });
    expect(createRes.status).toBe(201);
    const createdJson = (await createRes.json()) as { data: CatalogCategoryDto };
    expect(createdJson.data.sizeChartImageUrl).toBe(`${STORAGE_PUBLIC_BASE}/${firstChartPath}`);

    const secondRes = await fetch(`${baseUrl}/api/admin/categories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ name: 'Hoodie', slug: 'hoodie', sortOrder: 2 }),
    });
    expect(secondRes.status).toBe(201);
    const hoodieJson = (await secondRes.json()) as { data: CatalogCategoryDto };

    // Ganti size chart -> path lama dibersihkan dari storage
    const patchRes = await fetch(`${baseUrl}/api/admin/categories/${createdJson.data.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ sizeChartImagePath: secondChartPath }),
    });
    expect(patchRes.status).toBe(200);
    const patchedJson = (await patchRes.json()) as { data: CatalogCategoryDto };
    expect(patchedJson.data.sizeChartImageUrl).toBe(`${STORAGE_PUBLIC_BASE}/${secondChartPath}`);
    expect(removedStoragePaths).toContain(firstChartPath);

    // Reorder kategori
    const reorderRes = await fetch(`${baseUrl}/api/admin/categories/reorder`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        items: [
          { id: hoodieJson.data.id, sortOrder: 1 },
          { id: createdJson.data.id, sortOrder: 2 },
        ],
      }),
    });
    expect(reorderRes.status).toBe(200);
    const reorderedJson = (await reorderRes.json()) as { data: CatalogCategoryDto[] };
    expect(reorderedJson.data[0]?.slug).toBe('hoodie');
    expect(reorderedJson.data[1]?.slug).toBe('t-shirt');
  });

  it('CRUD Koleksi (ACTIVE, SOLD_OUT, ARCHIVED), relasi Model, & filter Katalog Publik', async () => {
    const catListRes = await fetch(`${baseUrl}/api/admin/categories`, {
      headers: { Cookie: adminCookie },
    });
    const catList = ((await catListRes.json()) as { data: CatalogCategoryDto[] }).data;
    const tshirtCat = catList.find((c) => c.slug === 't-shirt')!;

    const colUrbanRes = await fetch(`${baseUrl}/api/admin/collections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        name: 'Urban Collection',
        slug: 'urban-collection',
        status: COLLECTION_STATUS.ACTIVE,
        sortOrder: 1,
      }),
    });
    expect(colUrbanRes.status).toBe(201);
    const colUrban = ((await colUrbanRes.json()) as { data: CatalogCollectionDto }).data;

    const colXmasRes = await fetch(`${baseUrl}/api/admin/collections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        name: 'Christmas Collection',
        slug: 'christmas-collection',
        status: COLLECTION_STATUS.SOLD_OUT,
        sortOrder: 2,
      }),
    });
    expect(colXmasRes.status).toBe(201);
    const colXmas = ((await colXmasRes.json()) as { data: CatalogCollectionDto }).data;

    const colArchivedRes = await fetch(`${baseUrl}/api/admin/collections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        name: 'Draft Series',
        slug: 'draft-series',
        status: COLLECTION_STATUS.ARCHIVED,
        sortOrder: 3,
      }),
    });
    expect(colArchivedRes.status).toBe(201);

    // Tolak categoryId yang tidak ada
    const invalidModelRes = await fetch(`${baseUrl}/api/admin/models`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        slug: 'kaos-gagal',
        name: 'Kaos Gagal',
        basePrice: 80000,
        categoryId: crypto.randomUUID(),
      }),
    });
    expect(invalidModelRes.status).toBe(400);

    // Buat model terhubung ke T-Shirt + Urban Collection
    const createModelRes = await fetch(`${baseUrl}/api/admin/models`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        slug: 'urban-tee',
        name: 'Urban Boxy Tee',
        basePrice: 95000,
        categoryId: tshirtCat.id,
        collectionId: colUrban.id,
        sortOrder: 1,
      }),
    });
    expect(createModelRes.status).toBe(201);
    const createdModel = ((await createModelRes.json()) as { data: GarmentModelDto }).data;
    expect(createdModel.category?.slug).toBe('t-shirt');
    expect(createdModel.category?.sizeChartImageUrl).toBeTruthy();
    expect(createdModel.collection?.slug).toBe('urban-collection');
    expect(createdModel.collection?.status).toBe(COLLECTION_STATUS.ACTIVE);

    // Pindahkan koleksi model ke Christmas (SOLD_OUT)
    const updateModelRes = await fetch(`${baseUrl}/api/admin/models/${createdModel.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ collectionId: colXmas.id }),
    });
    expect(updateModelRes.status).toBe(200);
    const updatedModel = ((await updateModelRes.json()) as { data: GarmentModelDto }).data;
    expect(updatedModel.collection?.status).toBe(COLLECTION_STATUS.SOLD_OUT);

    // Cek endpoint publik: categories, collections (ARCHIVED tersembunyi), models, & detail model
    const [pubCatsRes, pubColsRes, pubModelsRes, pubDetailRes] = await Promise.all([
      fetch(`${baseUrl}/api/catalog/categories`),
      fetch(`${baseUrl}/api/catalog/collections`),
      fetch(`${baseUrl}/api/catalog/models`),
      fetch(`${baseUrl}/api/catalog/models/urban-tee`),
    ]);

    expect(pubCatsRes.status).toBe(200);
    expect(pubColsRes.status).toBe(200);
    expect(pubModelsRes.status).toBe(200);
    expect(pubDetailRes.status).toBe(200);

    const pubCats = ((await pubCatsRes.json()) as { data: PublicCatalogCategoryDto[] }).data;
    const pubCols = ((await pubColsRes.json()) as { data: PublicCatalogCollectionDto[] }).data;
    const pubModels = ((await pubModelsRes.json()) as { data: PublicGarmentModelDto[] }).data;
    const pubDetail = ((await pubDetailRes.json()) as { data: PublicModelDetailDto }).data;

    expect(pubCats.find((c) => c.slug === 't-shirt')?.activeModelCount).toBe(1);
    expect(pubCols.some((c) => c.slug === 'draft-series')).toBe(false);
    expect(pubCols.find((c) => c.slug === 'christmas-collection')?.status).toBe(
      COLLECTION_STATUS.SOLD_OUT
    );
    expect(pubModels[0]?.category?.sizeChartImageUrl).toBeTruthy();
    expect(pubModels[0]?.collection?.slug).toBe('christmas-collection');
    expect(pubDetail.category?.sizeChartImageUrl).toBeTruthy();
    expect(pubDetail.collection?.status).toBe(COLLECTION_STATUS.SOLD_OUT);
  });
});
