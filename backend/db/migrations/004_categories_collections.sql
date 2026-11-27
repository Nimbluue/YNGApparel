-- =========================================================
-- MIGRASI 004  -  Kategori Pakaian, Koleksi/Series & Size Chart
-- Dijalankan lewat:  npm run db:migrate  (atau Supabase SQL Editor)
-- Prasyarat       :  001_init.sql, 002_accounts_cart.sql, & 003_wishlist.sql sudah terpasang.
--
-- RINGKASAN
--   1. Tabel catalog_categories (termasuk size_chart_image_path)
--   2. Tabel catalog_collections (status ACTIVE | SOLD_OUT | ARCHIVED)
--   3. Relasi category_id & collection_id pada garment_models (ON DELETE SET NULL) + index
--   4. Trigger updated_at, RLS ketat tanpa policy publik, seed awal, & backfill model eksisting
-- =========================================================

-- #########################################################
-- 1. TABEL catalog_categories
-- #########################################################

CREATE TABLE IF NOT EXISTS catalog_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT NULL,
    size_chart_image_path TEXT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_categories_active_sort
    ON catalog_categories (sort_order ASC, name ASC)
    WHERE is_active = TRUE;

DROP TRIGGER IF EXISTS trg_catalog_categories_updated_at ON catalog_categories;
CREATE TRIGGER trg_catalog_categories_updated_at
    BEFORE UPDATE ON catalog_categories
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE catalog_categories IS 'Kategori jenis pakaian dinamis beserta path foto size chart.';

ALTER TABLE public.catalog_categories ENABLE ROW LEVEL SECURITY;

-- #########################################################
-- 2. TABEL catalog_collections
-- #########################################################

CREATE TABLE IF NOT EXISTS catalog_collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE'
        CONSTRAINT chk_catalog_collections_status CHECK (status IN ('ACTIVE', 'SOLD_OUT', 'ARCHIVED')),
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_collections_active_sort
    ON catalog_collections (sort_order ASC, name ASC)
    WHERE is_active = TRUE;

DROP TRIGGER IF EXISTS trg_catalog_collections_updated_at ON catalog_collections;
CREATE TRIGGER trg_catalog_collections_updated_at
    BEFORE UPDATE ON catalog_collections
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE catalog_collections IS 'Koleksi atau series pakaian (ACTIVE / SOLD_OUT / ARCHIVED).';

ALTER TABLE public.catalog_collections ENABLE ROW LEVEL SECURITY;

-- #########################################################
-- 3. RELASI KE TABEL MODEL PAKAIAN (garment_models)
-- #########################################################

ALTER TABLE garment_models
    ADD COLUMN IF NOT EXISTS category_id UUID NULL
        REFERENCES catalog_categories(id) ON UPDATE CASCADE ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS collection_id UUID NULL
        REFERENCES catalog_collections(id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_garment_models_category_id
    ON garment_models (category_id);

CREATE INDEX IF NOT EXISTS idx_garment_models_collection_id
    ON garment_models (collection_id);

-- #########################################################
-- 4. SEED AWAL & BACKFILL IDEMPOTEN
-- #########################################################

INSERT INTO catalog_categories (name, slug, description, sort_order, is_active) VALUES
    ('T-Shirt', 't-shirt', 'Kaos lengan pendek, lengan panjang, oversize, dan varian tee.', 1, TRUE),
    ('Hoodie', 'hoodie', 'Hoodie pullover maupun zipper dengan bahan fleece tebal.', 2, TRUE),
    ('Sweatshirt', 'sweatshirt', 'Crewneck dan sweatshirt custom satuan maupun tim.', 3, TRUE)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO catalog_collections (name, slug, description, status, sort_order, is_active) VALUES
    ('Basic Series', 'basic-series', 'Siluet dasar untuk kebutuhan harian dan produksi tim.', 'ACTIVE', 1, TRUE),
    ('Basic Logo Series', 'basic-logo-series', 'Koleksi dengan fokus penempatan logo minimal.', 'ACTIVE', 2, TRUE),
    ('Urban Collection', 'urban-collection', 'Siluet streetwear dengan potongan modern.', 'ACTIVE', 3, TRUE),
    ('Japanese Series', 'japanese-series', 'Rilisan bertema tipografi dan grafis Jepang.', 'ACTIVE', 4, TRUE),
    ('Vintage Series', 'vintage-series', 'Koleksi bernuansa retro dan washed editorial.', 'ACTIVE', 5, TRUE),
    ('YNG Collection', 'yng-collection', 'Koleksi khas studio YNG Apparel.', 'ACTIVE', 6, TRUE),
    ('Christmas Collection', 'christmas-collection', 'Edisi spesial liburan akhir tahun.', 'SOLD_OUT', 7, TRUE)
ON CONFLICT (slug) DO NOTHING;

-- Backfill category_id pada garment_models yang masih NULL berdasarkan kecocokan nama/slug
UPDATE garment_models gm
SET category_id = CASE
    WHEN gm.name ~* 'hoodie' OR gm.slug ~* 'hoodie'
        THEN (SELECT id FROM catalog_categories WHERE slug = 'hoodie' LIMIT 1)
    WHEN gm.name ~* 'sweatshirt|crewneck' OR gm.slug ~* 'sweatshirt|crewneck'
        THEN (SELECT id FROM catalog_categories WHERE slug = 'sweatshirt' LIMIT 1)
    WHEN gm.name ~* 't-?shirt|kaos|\btee\b|lengan[- ]?(pendek|panjang)' OR gm.slug ~* 't-?shirt|kaos|\btee\b|lengan[- ]?(pendek|panjang)'
        THEN (SELECT id FROM catalog_categories WHERE slug = 't-shirt' LIMIT 1)
    ELSE gm.category_id
END
WHERE gm.category_id IS NULL;

-- Backfill collection_id pada garment_models yang masih NULL (cek basic logo sebelum basic)
UPDATE garment_models gm
SET collection_id = CASE
    WHEN gm.name ~* 'xmas|christmas' OR gm.slug ~* 'xmas|christmas'
        THEN (SELECT id FROM catalog_collections WHERE slug = 'christmas-collection' LIMIT 1)
    WHEN gm.name ~* 'basic[- ]?logo' OR gm.slug ~* 'basic[- ]?logo'
        THEN (SELECT id FROM catalog_collections WHERE slug = 'basic-logo-series' LIMIT 1)
    WHEN gm.name ~* 'urban' OR gm.slug ~* 'urban'
        THEN (SELECT id FROM catalog_collections WHERE slug = 'urban-collection' LIMIT 1)
    WHEN gm.name ~* 'japanese|japan' OR gm.slug ~* 'japanese|japan'
        THEN (SELECT id FROM catalog_collections WHERE slug = 'japanese-series' LIMIT 1)
    WHEN gm.name ~* 'vintage' OR gm.slug ~* 'vintage'
        THEN (SELECT id FROM catalog_collections WHERE slug = 'vintage-series' LIMIT 1)
    WHEN gm.name ~* '\byng\b' OR gm.slug ~* '(^|-)yng(-|$)'
        THEN (SELECT id FROM catalog_collections WHERE slug = 'yng-collection' LIMIT 1)
    WHEN gm.name ~* 'basic' OR gm.slug ~* 'basic'
        THEN (SELECT id FROM catalog_collections WHERE slug = 'basic-series' LIMIT 1)
    ELSE gm.collection_id
END
WHERE gm.collection_id IS NULL;
