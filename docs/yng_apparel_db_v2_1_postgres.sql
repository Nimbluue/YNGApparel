-- =========================================================
-- DATABASE YNG APPAREL  -  VERSI 2.1 (PostgreSQL / Supabase)
-- Custom Lab + Solo Admin
-- Kebutuhan : PostgreSQL 14+ (IDENTITY, gen_random_uuid, generated column)
--             Target hosting: Supabase (Postgres 15+) + Supabase Storage
-- Pola key  : DUAL-KEY
--   * id (BIGINT IDENTITY)  -> internal: primary key, foreign key, index
--   * *_uuid / *_code       -> publik : URL, tracker, magic link
-- =========================================================
-- CARA MENJALANKAN
--   Supabase : buka SQL Editor, tempel seluruh file ini, Run.
--              (atau: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f yng_apparel_db_v2_1_postgres.sql)
--   Lokal    : createdb -U postgres yng_apparel_db
--              psql -U postgres -d yng_apparel_db -v ON_ERROR_STOP=1 -f yng_apparel_db_v2_1_postgres.sql
--
-- BAGIAN
--   0. Persiapan (tipe ENUM, fungsi trigger)
--   A. Akun admin & pengaturan            (MVP)
--   B. Master katalog, warna & harga      (MVP)
--   C. Order custom & rincian             (MVP)
--   D. Pembayaran bertahap                (MVP)
--   E. Riwayat status                     (MVP)
--   F. FASE 2: Production Log, Kolektif Link, Ready Drops
--   G. Trigger updated_at, Row Level Security
--   H. Seed data (placeholder)
-- =========================================================
-- CATATAN DESAIN
-- 1. Tidak ada akun customer. Pelanggan diidentifikasi lewat nomor WhatsApp
--    + order_code / transaction_uuid (magic link).
-- 2. Harga di-snapshot (locked_*) saat order dibuat.
-- 3. Ambang DP (default 12 pcs) dan persentase DP (default 70%) dibaca dari
--    app_settings dan di-SNAPSHOT ke order (dp_min_qty_snapshot,
--    dp_percent_snapshot). Perubahan setting tidak mengubah order lama.
-- 4. Diskon bersifat order-level (discount_amount). DP dihitung dari
--    (subtotal_amount - discount_amount).
--    grand_total = subtotal_amount - discount_amount + shipping_cost
--    (GENERATED COLUMN, tidak bisa selisih).
-- 5. dp_required_amount = jumlah yang WAJIB dibayar di awal
--    (DP dari subtotal bersih, atau 100% subtotal bersih bila skema FULL).
-- 6. Ongkir diinput admin setelah pressing & QC. Ongkir ditagihkan di
--    pembayaran akhir (SETTLEMENT untuk skema DP, SHIPPING_FEE untuk FULL).
-- 7. payments.status = sumber kebenaran status bayar.
--    orders.remaining_balance = grand_total - total pembayaran VERIFIED
--    (diperbarui aplikasi dalam transaksi yang sama).
-- 8. Alamat boleh NULL (order manual dari WA/IG). Dijaga CHECK:
--    wajib untuk order WEBSITE (kecuali PICKUP) dan wajib sebelum order
--    masuk SHIPPING/COMPLETED (kecuali PICKUP).
-- 9. FILE disimpan di object storage (Supabase Storage), BUKAN di disk server.
--    Semua kolom *_path menyimpan PATH objek di dalam bucket (bukan URL
--    lengkap). Backend membuat URL publik (bucket 'catalog') atau
--    signed URL berumur pendek (bucket privat).
-- 10. Semua waktu memakai TIMESTAMPTZ (disimpan UTC). Jangan bergantung pada
--     timezone sesi (connection pooler tidak menjaganya); konversi ke WIB
--     dilakukan eksplisit: created_at AT TIME ZONE 'Asia/Jakarta'.
-- 11. Email admin unik tanpa membedakan huruf besar/kecil (index lower(email)).
-- 12. Row Level Security AKTIF di semua tabel tanpa policy = tertutup untuk
--     anon/authenticated (Data API Supabase). Backend Express memakai koneksi
--     langsung (role postgres) yang melewati RLS.
-- =========================================================


-- #########################################################
-- 0. PERSIAPAN
-- #########################################################

CREATE TYPE payment_method_t    AS ENUM ('QRIS','BANK_TRANSFER');
CREATE TYPE order_source_t      AS ENUM ('WEBSITE','WHATSAPP','INSTAGRAM','MANUAL');
CREATE TYPE fulfillment_t       AS ENUM ('SHIP','PICKUP');
-- Skema & tahap bayar sengaja generik (persentase dibaca dari dp_percent_snapshot)
CREATE TYPE payment_scheme_t    AS ENUM ('FULL','DP');
CREATE TYPE payment_stage_t     AS ENUM ('DP','SETTLEMENT','FULL','SHIPPING_FEE');
CREATE TYPE payment_status_t    AS ENUM ('PENDING','VERIFIED','REJECTED');
CREATE TYPE production_status_t AS ENUM (
    'NEW_ORDER','PRINT_QUEUE','PRESSING_QC','AWAITING_SETTLEMENT',
    'SHIPPING','COMPLETED','CANCELLED'
);
CREATE TYPE design_status_t     AS ENUM ('PENDING','NEED_REVISION','APPROVED');
CREATE TYPE print_position_t    AS ENUM (
    'FRONT_CHEST','FRONT_CENTER','BACK_CENTER','BACK_UPPER',
    'LEFT_SLEEVE','RIGHT_SLEEVE','COLLAR','OTHER'
);
CREATE TYPE dpi_status_t        AS ENUM ('OK','WARNING','LOW','UNKNOWN');
CREATE TYPE collective_status_t AS ENUM ('OPEN','CLOSED','CHECKED_OUT','EXPIRED');

-- PostgreSQL tidak punya "ON UPDATE CURRENT_TIMESTAMP"; dipakai trigger ini.
-- search_path dikosongkan (praktik aman Supabase); NOW() tetap resolve ke pg_catalog.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


-- #########################################################
-- A. AKUN ADMIN & PENGATURAN
-- #########################################################

CREATE TABLE admin_users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_admin_users_email ON admin_users (lower(email));

CREATE TABLE app_settings (
    setting_key VARCHAR(100) PRIMARY KEY,
    setting_value VARCHAR(500) NOT NULL,
    description VARCHAR(255) NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_settings (setting_key, setting_value, description) VALUES
('store_name', 'YNG Apparel', 'Nama brand'),
('admin_whatsapp', '6280000000000', 'Nomor WA admin (format 62...) untuk tombol hubungi'),
('dp_percent', '70', 'Persentase DP untuk order yang memenuhi dp_min_qty'),
('dp_min_qty', '12', 'Minimal total pcs agar skema DP diperbolehkan'),
('initial_payment_due_hours', '24', 'Batas waktu pembayaran awal (jam) sebelum order WEBSITE otomatis dibatalkan'),
('auto_complete_days', '7', 'Order SHIPPING otomatis COMPLETED setelah N hari'),
('dpi_ok_min', '150', 'DPI minimum dianggap aman (DPI Guard)'),
('dpi_warn_min', '100', 'DPI di bawah ini dianggap buram (DPI Guard)'),
('max_design_file_mb', '20', 'Ukuran maksimum file desain (MB)'),
('signed_url_expiry_seconds', '3600', 'Masa berlaku signed URL file privat (detik)'),
('temp_upload_ttl_hours', '24', 'File desain sementara (belum terpasang ke order) dihapus setelah N jam'),
('production_estimate_text', '7-14 hari kerja', 'Estimasi produksi yang ditampilkan ke customer');


-- #########################################################
-- B. MASTER KATALOG, WARNA & HARGA
--    Kolom *_path = path objek di Supabase Storage (bucket 'catalog')
-- #########################################################

CREATE TABLE garment_models (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug VARCHAR(120) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    base_price NUMERIC(15,2) NOT NULL,
    image_path VARCHAR(500) NULL,
    mockup_template VARCHAR(100) NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_gm_price CHECK (base_price >= 0)
);
COMMENT ON COLUMN garment_models.mockup_template IS 'Kunci template mockup 2D (fase 2)';

CREATE TABLE fabrics (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    gsm_weight INT NULL,
    thickness_level SMALLINT NOT NULL DEFAULT 3,
    comfort_level SMALLINT NULL,
    additional_price NUMERIC(15,2) NOT NULL DEFAULT 0,
    image_path VARCHAR(500) NULL,
    macro_image_path VARCHAR(500) NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_fabric_thickness CHECK (thickness_level BETWEEN 1 AND 5),
    CONSTRAINT chk_fabric_comfort CHECK (comfort_level IS NULL OR comfort_level BETWEEN 1 AND 5),
    CONSTRAINT chk_fabric_price CHECK (additional_price >= 0)
);
COMMENT ON COLUMN fabrics.macro_image_path IS 'Close-up serat bahan (Fabric Lab, fase 2)';

CREATE TABLE model_fabrics (
    model_id BIGINT NOT NULL,
    fabric_id BIGINT NOT NULL,

    PRIMARY KEY (model_id, fabric_id),
    FOREIGN KEY (model_id) REFERENCES garment_models(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (fabric_id) REFERENCES fabrics(id)
        ON UPDATE CASCADE ON DELETE CASCADE
);

-- Preset warna yang BENAR-BENAR tersedia per bahan (stok YNG Apparel).
-- Warna di luar daftar ini = "Warna custom (konfirmasi WA)" -> order_items.is_custom_color.
CREATE TABLE fabric_colors (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fabric_id BIGINT NOT NULL,
    color_name VARCHAR(50) NOT NULL,
    color_hex VARCHAR(7) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT uq_fabric_color UNIQUE (fabric_id, color_name),
    CONSTRAINT chk_fc_hex CHECK (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
    FOREIGN KEY (fabric_id) REFERENCES fabrics(id)
        ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX idx_fc_fabric ON fabric_colors (fabric_id, is_active);

CREATE TABLE sizes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE,
    sort_order INT NOT NULL DEFAULT 0,
    extra_charge NUMERIC(15,2) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT chk_size_charge CHECK (extra_charge >= 0)
);

CREATE TABLE print_sizes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    dimensions_cm VARCHAR(30) NOT NULL,
    width_cm NUMERIC(6,2) NOT NULL,
    height_cm NUMERIC(6,2) NOT NULL,
    price_per_spot NUMERIC(15,2) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT chk_print_price CHECK (price_per_spot >= 0)
);

CREATE TABLE payment_accounts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    method payment_method_t NOT NULL,
    provider_name VARCHAR(100) NOT NULL,
    account_number VARCHAR(100) NULL,
    account_holder VARCHAR(150) NOT NULL,
    qr_image_path VARCHAR(500) NULL,
    instructions TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- #########################################################
-- C. ORDER CUSTOM
-- #########################################################

CREATE TABLE orders (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    transaction_uuid UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    order_code VARCHAR(20) NOT NULL UNIQUE,          -- 'YNG-' + 6 karakter acak
    source order_source_t NOT NULL DEFAULT 'WEBSITE',
    idempotency_key UUID NULL UNIQUE,                -- cegah order ganda (double submit)

    -- data pelanggan
    customer_name VARCHAR(150) NOT NULL,
    customer_whatsapp VARCHAR(20) NOT NULL,

    -- pengiriman / pengambilan
    fulfillment_type fulfillment_t NOT NULL DEFAULT 'SHIP',
    province_name VARCHAR(100) NULL,
    city_name VARCHAR(100) NULL,
    district_name VARCHAR(100) NULL,
    postal_code VARCHAR(10) NULL,
    full_address TEXT NULL,

    -- bisnis
    total_qty INT NOT NULL,
    dp_min_qty_snapshot SMALLINT NOT NULL,
    is_dp_eligible BOOLEAN GENERATED ALWAYS AS (total_qty >= dp_min_qty_snapshot) STORED,
    payment_scheme payment_scheme_t NOT NULL DEFAULT 'FULL',
    dp_percent_snapshot SMALLINT NULL,               -- hanya terisi untuk skema DP

    subtotal_amount NUMERIC(15,2) NOT NULL,
    discount_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    discount_note VARCHAR(255) NULL,
    shipping_cost NUMERIC(15,2) NOT NULL DEFAULT 0,
    grand_total NUMERIC(15,2) GENERATED ALWAYS AS
        (subtotal_amount - discount_amount + shipping_cost) STORED,
    dp_required_amount NUMERIC(15,2) NOT NULL,
    remaining_balance NUMERIC(15,2) NOT NULL,
    refunded_amount NUMERIC(15,2) NOT NULL DEFAULT 0,

    production_status production_status_t NOT NULL DEFAULT 'NEW_ORDER',

    design_status design_status_t NOT NULL DEFAULT 'PENDING',
    design_review_notes TEXT,
    admin_notes TEXT,

    -- produksi (foto QC ada di tabel order_qc_photos)
    estimated_finish_date DATE NULL,

    -- pengiriman
    shipping_courier VARCHAR(100) NULL,
    shipping_service VARCHAR(100) NULL,
    tracking_receipt_number VARCHAR(100) NULL,
    shipped_at TIMESTAMPTZ NULL,                     -- untuk PICKUP: waktu siap diambil

    -- siklus
    payment_due_at TIMESTAMPTZ NULL,                 -- NULL = tidak auto-cancel (mis. order manual)
    cancelled_reason VARCHAR(255) NULL,
    cancelled_at TIMESTAMPTZ NULL,
    completed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_orders_qty CHECK (total_qty > 0),
    CONSTRAINT chk_orders_dp_min CHECK (dp_min_qty_snapshot > 0),
    CONSTRAINT chk_orders_amounts CHECK (
        subtotal_amount >= 0 AND discount_amount >= 0 AND shipping_cost >= 0
        AND dp_required_amount >= 0 AND remaining_balance >= 0 AND refunded_amount >= 0
    ),
    CONSTRAINT chk_orders_discount CHECK (discount_amount <= subtotal_amount),
    CONSTRAINT chk_orders_dp_amount CHECK (dp_required_amount <= subtotal_amount - discount_amount),
    CONSTRAINT chk_orders_dp_rule CHECK (payment_scheme = 'FULL' OR total_qty >= dp_min_qty_snapshot),
    CONSTRAINT chk_orders_dp_pct CHECK (
        (payment_scheme = 'DP' AND dp_percent_snapshot BETWEEN 1 AND 99)
        OR (payment_scheme = 'FULL' AND dp_percent_snapshot IS NULL)
    ),
    CONSTRAINT chk_orders_wa_format CHECK (customer_whatsapp ~ '^62[0-9]{7,15}$'),

    -- Alamat wajib untuk order WEBSITE (kecuali ambil di tempat)
    CONSTRAINT chk_orders_addr_web CHECK (
        source <> 'WEBSITE' OR fulfillment_type = 'PICKUP' OR (
            province_name IS NOT NULL AND city_name IS NOT NULL AND district_name IS NOT NULL
            AND postal_code IS NOT NULL AND full_address IS NOT NULL)
    ),
    -- Alamat wajib terisi sebelum SHIPPING / COMPLETED (kecuali ambil di tempat)
    CONSTRAINT chk_orders_addr_ship CHECK (
        production_status NOT IN ('SHIPPING','COMPLETED') OR fulfillment_type = 'PICKUP' OR (
            province_name IS NOT NULL AND city_name IS NOT NULL AND district_name IS NOT NULL
            AND postal_code IS NOT NULL AND full_address IS NOT NULL)
    ),
    -- Kurir & resi wajib sebelum SHIPPING / COMPLETED (kecuali ambil di tempat)
    -- Kurir instan tanpa resi: isi resi dengan kode booking / nama driver.
    CONSTRAINT chk_orders_courier CHECK (
        production_status NOT IN ('SHIPPING','COMPLETED') OR fulfillment_type = 'PICKUP' OR (
            shipping_courier IS NOT NULL AND tracking_receipt_number IS NOT NULL)
    )
);
CREATE INDEX idx_orders_status  ON orders (production_status, created_at);
CREATE INDEX idx_orders_wa      ON orders (customer_whatsapp);
CREATE INDEX idx_orders_created ON orders (created_at);
CREATE INDEX idx_orders_due     ON orders (payment_due_at)
    WHERE production_status = 'NEW_ORDER' AND payment_due_at IS NOT NULL;

COMMENT ON COLUMN orders.customer_whatsapp  IS 'Format 62xxxxxxxxxx';
COMMENT ON COLUMN orders.dp_required_amount IS 'Wajib dibayar di awal: DP% dari (subtotal-diskon) atau 100% (subtotal-diskon)';
COMMENT ON COLUMN orders.remaining_balance  IS 'grand_total - total pembayaran VERIFIED';
COMMENT ON COLUMN orders.refunded_amount    IS 'Dicatat manual saat order dibatalkan setelah ada pembayaran VERIFIED (0 = hangus)';
COMMENT ON COLUMN orders.payment_due_at     IS 'NULL = tidak auto-cancel';

CREATE TABLE order_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id BIGINT NOT NULL,
    model_id BIGINT NOT NULL,
    fabric_id BIGINT NOT NULL,

    model_name VARCHAR(150) NOT NULL,
    fabric_name VARCHAR(150) NOT NULL,
    fabric_color_id BIGINT NULL,                     -- preset warna (NULL jika custom)
    is_custom_color BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE = konfirmasi stok via WA
    color_name VARCHAR(50) NOT NULL,                 -- snapshot nama warna
    color_hex VARCHAR(7) NULL,
    needs_design_help BOOLEAN NOT NULL DEFAULT FALSE,
    production_notes TEXT,

    locked_base_price NUMERIC(15,2) NOT NULL,
    locked_fabric_price NUMERIC(15,2) NOT NULL DEFAULT 0,
    item_qty INT NOT NULL,
    line_subtotal NUMERIC(15,2) NOT NULL,

    CONSTRAINT chk_oi_qty CHECK (item_qty > 0),
    CONSTRAINT chk_oi_hex CHECK (color_hex IS NULL OR color_hex ~ '^#[0-9A-Fa-f]{6}$'),
    CONSTRAINT chk_oi_color CHECK (is_custom_color OR fabric_color_id IS NOT NULL),

    FOREIGN KEY (order_id) REFERENCES orders(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (model_id) REFERENCES garment_models(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (fabric_id) REFERENCES fabrics(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (fabric_color_id) REFERENCES fabric_colors(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX idx_oi_order ON order_items (order_id);

CREATE TABLE order_item_sizes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_item_id BIGINT NOT NULL,
    size_id BIGINT NOT NULL,
    size_code VARCHAR(10) NOT NULL,
    qty INT NOT NULL,
    locked_extra_charge NUMERIC(15,2) NOT NULL DEFAULT 0,

    CONSTRAINT uq_item_size UNIQUE (order_item_id, size_id),
    CONSTRAINT chk_ois_qty CHECK (qty > 0),

    FOREIGN KEY (order_item_id) REFERENCES order_items(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (size_id) REFERENCES sizes(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

-- File desain disimpan di bucket privat 'designs'.
-- Upload sementara: tmp/<acak>.<ext>  ->  dipindah ke orders/<transaction_uuid>/<acak>.<ext> saat order dibuat.
CREATE TABLE order_item_prints (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_item_id BIGINT NOT NULL,
    print_size_id BIGINT NOT NULL,
    print_size_code VARCHAR(20) NOT NULL,
    print_position print_position_t NOT NULL,
    raw_design_file_path VARCHAR(500) NULL,
    design_file_name VARCHAR(255) NULL,
    image_width_px INT NULL,
    image_height_px INT NULL,
    effective_dpi INT NULL,
    dpi_status dpi_status_t NOT NULL DEFAULT 'UNKNOWN',
    locked_spot_price NUMERIC(15,2) NOT NULL,
    notes VARCHAR(255) NULL,

    CONSTRAINT chk_oip_price CHECK (locked_spot_price >= 0),

    FOREIGN KEY (order_item_id) REFERENCES order_items(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (print_size_id) REFERENCES print_sizes(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX idx_oip_item ON order_item_prints (order_item_id);
-- Satu posisi sablon hanya boleh satu kali per item (kecuali 'OTHER')
CREATE UNIQUE INDEX uq_oip_item_position ON order_item_prints (order_item_id, print_position)
    WHERE print_position <> 'OTHER';
COMMENT ON COLUMN order_item_prints.effective_dpi IS 'Hasil DPI Guard (fase 2)';

-- Foto QC (bisa lebih dari satu). Bucket privat 'qc-photos'.
CREATE TABLE order_qc_photos (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id BIGINT NOT NULL,
    photo_path VARCHAR(500) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    FOREIGN KEY (order_id) REFERENCES orders(id)
        ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX idx_oqp_order ON order_qc_photos (order_id);


-- #########################################################
-- D. PEMBAYARAN BERTAHAP
--    1 baris per (order, tahap). Jika ditolak, customer upload
--    ulang pada baris yang sama (status kembali PENDING).
--    PENDING + proof NULL  = belum upload
--    PENDING + proof ada   = menunggu verifikasi admin
--    Bukti bayar disimpan di bucket privat 'payment-proofs'.
-- #########################################################

CREATE TABLE payments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    payment_uuid UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    order_id BIGINT NOT NULL,
    payment_stage payment_stage_t NOT NULL,
    payment_method payment_method_t NULL,
    payment_account_id BIGINT NULL,
    amount NUMERIC(15,2) NOT NULL,
    proof_image_path VARCHAR(500) NULL,
    status payment_status_t NOT NULL DEFAULT 'PENDING',
    rejection_reason VARCHAR(255) NULL,
    proof_uploaded_at TIMESTAMPTZ NULL,
    verified_by BIGINT NULL,
    verified_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_payment_stage UNIQUE (order_id, payment_stage),
    CONSTRAINT chk_payment_amount CHECK (amount > 0),
    CONSTRAINT chk_payment_verified CHECK (status <> 'VERIFIED' OR verified_at IS NOT NULL),
    CONSTRAINT chk_payment_rejected CHECK (status <> 'REJECTED' OR rejection_reason IS NOT NULL),

    FOREIGN KEY (order_id) REFERENCES orders(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (payment_account_id) REFERENCES payment_accounts(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    FOREIGN KEY (verified_by) REFERENCES admin_users(id)
        ON UPDATE CASCADE ON DELETE SET NULL
);
CREATE INDEX idx_payments_status ON payments (status);
CREATE INDEX idx_payments_waiting ON payments (proof_uploaded_at)
    WHERE status = 'PENDING' AND proof_image_path IS NOT NULL;

COMMENT ON COLUMN payments.verified_by IS 'NULL + VERIFIED = diverifikasi otomatis (order manual yang pembayarannya sudah diterima)';


-- #########################################################
-- E. RIWAYAT STATUS
-- #########################################################

CREATE TABLE order_status_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id BIGINT NOT NULL,
    from_status VARCHAR(30) NULL,
    to_status VARCHAR(30) NOT NULL,
    notes VARCHAR(500) NULL,
    changed_by BIGINT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    FOREIGN KEY (order_id) REFERENCES orders(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (changed_by) REFERENCES admin_users(id)
        ON UPDATE CASCADE ON DELETE SET NULL
);
CREATE INDEX idx_osh_order ON order_status_history (order_id, created_at);
COMMENT ON COLUMN order_status_history.changed_by IS 'NULL = sistem/otomatis/customer';


-- #########################################################
-- F. FASE 2
-- #########################################################

-- F1. Recent Production Log (pengganti testimoni). Bucket publik 'catalog'.
CREATE TABLE production_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id BIGINT NULL,
    title VARCHAR(200) NOT NULL,
    garment_label VARCHAR(150) NULL,
    photo_path VARCHAR(500) NOT NULL,
    total_qty INT NOT NULL,
    destination_city VARCHAR(100) NOT NULL,
    produced_at DATE NOT NULL,
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_plog_qty CHECK (total_qty > 0),
    FOREIGN KEY (order_id) REFERENCES orders(id)
        ON UPDATE CASCADE ON DELETE SET NULL
);
CREATE INDEX idx_plog_pub ON production_logs (is_published, produced_at);

-- F2. Kolektif Link (patungan ukuran komunitas)
CREATE TABLE collective_links (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    link_uuid UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    public_code VARCHAR(16) NOT NULL UNIQUE,
    leader_token_hash VARCHAR(255) NOT NULL,
    leader_name VARCHAR(150) NOT NULL,
    leader_whatsapp VARCHAR(20) NOT NULL,
    title VARCHAR(200) NOT NULL,

    model_id BIGINT NOT NULL,
    fabric_id BIGINT NOT NULL,
    fabric_color_id BIGINT NULL,
    color_name VARCHAR(50) NOT NULL,
    color_hex VARCHAR(7) NULL,
    print_config JSONB NULL,
    notes TEXT,

    deadline_at TIMESTAMPTZ NOT NULL,
    status collective_status_t NOT NULL DEFAULT 'OPEN',
    order_id BIGINT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_cl_hex CHECK (color_hex IS NULL OR color_hex ~ '^#[0-9A-Fa-f]{6}$'),
    FOREIGN KEY (model_id) REFERENCES garment_models(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (fabric_id) REFERENCES fabrics(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (fabric_color_id) REFERENCES fabric_colors(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (order_id) REFERENCES orders(id)
        ON UPDATE CASCADE ON DELETE SET NULL
);
CREATE INDEX idx_cl_status ON collective_links (status, deadline_at);
COMMENT ON COLUMN collective_links.print_config IS 'Titik sablon + file desain yang dipilih ketua';

CREATE TABLE collective_entries (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    collective_id BIGINT NOT NULL,
    member_name VARCHAR(150) NOT NULL,
    size_id BIGINT NOT NULL,
    size_code VARCHAR(10) NOT NULL,
    qty INT NOT NULL DEFAULT 1,
    back_name VARCHAR(100) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_ce_qty CHECK (qty > 0),
    FOREIGN KEY (collective_id) REFERENCES collective_links(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (size_id) REFERENCES sizes(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX idx_ce_collective ON collective_entries (collective_id);
COMMENT ON COLUMN collective_entries.back_name IS 'Nama di punggung (opsional)';

-- F3. Ready Drops (katalog tampil saja; pembelian lewat tombol WhatsApp)
CREATE TABLE ready_products (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_uuid UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    slug VARCHAR(220) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    garment_model_id BIGINT NULL,
    fabric_id BIGINT NULL,
    price NUMERIC(15,2) NOT NULL,
    sale_price NUMERIC(15,2) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    deleted_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_rp_price CHECK (price >= 0),
    CONSTRAINT chk_rp_sale CHECK (sale_price IS NULL OR (sale_price >= 0 AND sale_price < price)),
    FOREIGN KEY (garment_model_id) REFERENCES garment_models(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    FOREIGN KEY (fabric_id) REFERENCES fabrics(id)
        ON UPDATE CASCADE ON DELETE SET NULL
);
CREATE INDEX idx_rp_active ON ready_products (is_active, deleted_at);

CREATE TABLE ready_product_images (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id BIGINT NOT NULL,
    image_path VARCHAR(500) NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 0,

    FOREIGN KEY (product_id) REFERENCES ready_products(id)
        ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX idx_rpi_product ON ready_product_images (product_id);

CREATE TABLE ready_product_variants (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id BIGINT NOT NULL,
    size_id BIGINT NOT NULL,
    color_name VARCHAR(50) NOT NULL,
    sku VARCHAR(100) NULL UNIQUE,
    stock INT NOT NULL DEFAULT 0,

    CONSTRAINT uq_rpv_combo UNIQUE (product_id, size_id, color_name),
    CONSTRAINT chk_rpv_stock CHECK (stock >= 0),
    FOREIGN KEY (product_id) REFERENCES ready_products(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (size_id) REFERENCES sizes(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);


-- #########################################################
-- G. TRIGGER updated_at & ROW LEVEL SECURITY
-- #########################################################

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'admin_users','app_settings','garment_models','fabrics','payment_accounts',
        'orders','payments','collective_links','ready_products'
    ] LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I
             FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
    END LOOP;
END $$;

-- RLS aktif di SEMUA tabel public, tanpa policy = anon/authenticated (Data API
-- Supabase) tidak bisa membaca/menulis apa pun. Backend memakai koneksi langsung
-- (role postgres) yang melewati RLS. Frontend TIDAK PERNAH memakai anon key
-- untuk database; semua data lewat API Express.
-- Aman dijalankan juga di PostgreSQL biasa (owner tabel tidak terkena RLS).
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    END LOOP;
END $$;


-- #########################################################
-- H. SEED DATA  (*** PLACEHOLDER: WAJIB diganti dengan data asli client ***)
-- #########################################################

INSERT INTO sizes (code, sort_order, extra_charge) VALUES
('S', 1, 0), ('M', 2, 0), ('L', 3, 0), ('XL', 4, 0), ('XXL', 5, 10000);

INSERT INTO print_sizes (code, name, dimensions_cm, width_cm, height_cm, price_per_spot, sort_order) VALUES
('LOGO', 'Logo',  '10 x 10',     10.00, 10.00, 10000, 1),
('A5',   'A5',    '14.8 x 21',   14.80, 21.00, 15000, 2),
('A4',   'A4',    '21 x 29.7',   21.00, 29.70, 25000, 3),
('A3',   'A3',    '29.7 x 42',   29.70, 42.00, 35000, 4);

INSERT INTO garment_models (slug, name, base_price, sort_order, mockup_template) VALUES
('kaos-lengan-pendek', 'Kaos Lengan Pendek',  65000, 1, 'tee-short'),
('kaos-lengan-panjang','Kaos Lengan Panjang', 75000, 2, 'tee-long'),
('polo',               'Polo',                95000, 3, 'polo'),
('sweatshirt',         'Sweatshirt',         140000, 4, 'sweatshirt'),
('hoodie',             'Hoodie',             160000, 5, 'hoodie'),
('jacket-zipper',      'Jacket Zipper',      175000, 6, 'jacket-zip');

INSERT INTO fabrics (code, name, gsm_weight, thickness_level, comfort_level, additional_price, sort_order) VALUES
('CC30S',  'Cotton Combed 30s', 150, 2, 5, 0,     1),
('CC24S',  'Cotton Combed 24s', 175, 3, 4, 10000, 2),
('PQCVC',  'Pique CVC',         210, 3, 4, 15000, 3),
('BTERRY', 'Baby Terry',        240, 4, 4, 0,     4),
('CF280',  'Cotton Fleece 280', 280, 5, 5, 15000, 5);

INSERT INTO model_fabrics (model_id, fabric_id)
SELECT m.id, f.id FROM garment_models m JOIN fabrics f ON
    (m.slug IN ('kaos-lengan-pendek','kaos-lengan-panjang') AND f.code IN ('CC30S','CC24S'))
 OR (m.slug = 'polo' AND f.code = 'PQCVC')
 OR (m.slug IN ('sweatshirt','hoodie','jacket-zipper') AND f.code IN ('BTERRY','CF280'));

-- PLACEHOLDER warna: ganti dengan warna yang benar-benar ada di stok per bahan
INSERT INTO fabric_colors (fabric_id, color_name, color_hex, sort_order)
SELECT f.id, c.color_name, c.color_hex, c.ord
FROM fabrics f
CROSS JOIN (VALUES
    ('Hitam',     '#111111', 1),
    ('Putih',     '#FFFFFF', 2),
    ('Navy',      '#1F2A44', 3),
    ('Abu Misty', '#9CA3AF', 4),
    ('Maroon',    '#6B1F2A', 5)
) AS c(color_name, color_hex, ord);

INSERT INTO payment_accounts (method, provider_name, account_number, account_holder, instructions) VALUES
('QRIS', 'QRIS YNG Apparel', NULL, 'YNG Apparel', 'Scan QRIS, bayar sesuai nominal, lalu upload bukti.'),
('BANK_TRANSFER', 'BCA', '0000000000', 'YNG Apparel', 'Transfer sesuai nominal, lalu upload bukti.');

-- ADMIN PERTAMA: jangan insert password manual. Jalankan:
--   node backend/scripts/seedAdmin.js
-- (membaca ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME dari .env, hash bcrypt,
--  email disimpan huruf kecil)
--
-- BUCKET STORAGE: jangan dibuat manual. Jalankan:
--   node backend/scripts/initStorage.js
