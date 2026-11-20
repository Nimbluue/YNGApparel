-- =========================================================
-- MIGRASI 002  -  Akun pengguna (ADMIN / USER), alamat tersimpan, keranjang
-- Dijalankan lewat:  npm run db:migrate   (jangan dijalankan manual)
-- Prasyarat       :  001_init.sql sudah terpasang.
--
-- RINGKASAN
--   1. Tipe ENUM user_role_t ('ADMIN','USER')
--   2. Tabel users menggantikan admin_users (id admin lama DIPERTAHANKAN,
--      sehingga payments.verified_by dan order_status_history.changed_by
--      tetap valid), lalu admin_users dihapus
--   3. Tabel user_addresses  (alamat tersimpan, satu alamat utama per user)
--   4. orders.user_id        (BOLEH NULL: order manual WhatsApp/Instagram
--                             tidak punya akun)
--   5. Tabel cart_items      (satu baris = satu konfigurasi Custom Lab)
--   6. Trigger updated_at + RLS aktif untuk tabel baru
--
-- ATURAN YANG DITEGAKKAN APLIKASI (bukan constraint DB):
--   * "Guest" BUKAN role. Guest = pengunjung tanpa token login.
--   * Registrasi publik SELALU membuat role USER. Role tidak pernah diterima
--     dari client. Akun ADMIN hanya dibuat lewat  npm run seed:admin.
--   * POST /api/orders dengan source WEBSITE wajib login (user_id terisi).
--   * Hapus akun = nonaktifkan (is_active = FALSE), bukan DELETE.
--   * Harga TIDAK disimpan di cart_items. Server menghitung ulang dengan
--     pricingService, dan mengunci harga ke order_items saat order dibuat.
--   * File desain di keranjang disimpan di bucket 'designs' prefix
--     carts/<user_uuid>/..., BUKAN tmp/ (pembersih tmp berjalan tiap 24 jam).
-- =========================================================


-- #########################################################
-- 1. AKUN PENGGUNA
-- #########################################################

CREATE TYPE user_role_t AS ENUM ('ADMIN', 'USER');

CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_uuid UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    role user_role_t NOT NULL DEFAULT 'USER',
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL,
    whatsapp VARCHAR(20) NULL,                       -- format 62xxxxxxxxxx (dinormalisasi server)
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    token_version INT NOT NULL DEFAULT 0,            -- naikkan untuk mencabut semua sesi (ganti password / paksa logout)
    last_login_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_users_wa_format CHECK (whatsapp IS NULL OR whatsapp ~ '^62[0-9]{7,15}$'),
    -- USER wajib punya WhatsApp (dipakai untuk order); ADMIN boleh kosong.
    CONSTRAINT chk_users_user_wa CHECK (role = 'ADMIN' OR whatsapp IS NOT NULL)
);
CREATE UNIQUE INDEX uq_users_email ON users (lower(email));
CREATE INDEX idx_users_role ON users (role);

COMMENT ON COLUMN users.token_version IS 'JWT memuat token_version; ditolak bila tidak sama dengan nilai di DB';

-- Salin admin lama dengan id yang SAMA agar FK lama tetap benar.
INSERT INTO users (id, role, full_name, email, password_hash, is_active, last_login_at, created_at, updated_at)
OVERRIDING SYSTEM VALUE
SELECT id, 'ADMIN', name, email, password_hash, is_active, last_login_at, created_at, updated_at
FROM admin_users;

-- Sinkronkan penghitung identity setelah menyisipkan id manual.
SELECT setval(
    pg_get_serial_sequence('users', 'id'),
    COALESCE((SELECT MAX(id) FROM users), 0) + 1,
    false
);

-- Arahkan ulang FK dari admin_users ke users.
ALTER TABLE payments DROP CONSTRAINT payments_verified_by_fkey;
ALTER TABLE payments ADD CONSTRAINT payments_verified_by_fkey
    FOREIGN KEY (verified_by) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE order_status_history DROP CONSTRAINT order_status_history_changed_by_fkey;
ALTER TABLE order_status_history ADD CONSTRAINT order_status_history_changed_by_fkey
    FOREIGN KEY (changed_by) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL;

DROP TABLE admin_users;


-- #########################################################
-- 2. ALAMAT TERSIMPAN
-- #########################################################

CREATE TABLE user_addresses (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    address_uuid UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    user_id BIGINT NOT NULL,
    label VARCHAR(50) NOT NULL,                      -- mis. 'Rumah', 'Kantor'
    recipient_name VARCHAR(150) NOT NULL,
    recipient_whatsapp VARCHAR(20) NOT NULL,
    province_name VARCHAR(100) NOT NULL,
    city_name VARCHAR(100) NOT NULL,
    district_name VARCHAR(100) NOT NULL,
    postal_code VARCHAR(10) NOT NULL,
    full_address TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_ua_wa_format CHECK (recipient_whatsapp ~ '^62[0-9]{7,15}$'),
    FOREIGN KEY (user_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX idx_ua_user ON user_addresses (user_id);
-- Paling banyak satu alamat utama per user.
CREATE UNIQUE INDEX uq_ua_one_default ON user_addresses (user_id) WHERE is_default;

COMMENT ON TABLE user_addresses IS 'Alamat tersimpan. Saat checkout, alamat DISALIN (snapshot) ke orders.*; mengubah alamat di sini tidak mengubah order lama.';


-- #########################################################
-- 3. ORDER MILIK USER
-- #########################################################

ALTER TABLE orders ADD COLUMN user_id BIGINT NULL;
ALTER TABLE orders ADD CONSTRAINT orders_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL;
CREATE INDEX idx_orders_user ON orders (user_id, created_at DESC) WHERE user_id IS NOT NULL;

COMMENT ON COLUMN orders.user_id IS 'NULL = order manual/WhatsApp/Instagram tanpa akun. Order source WEBSITE wajib terisi (ditegakkan server).';


-- #########################################################
-- 4. KERANJANG
--    Satu user = satu keranjang (tidak perlu tabel carts).
--    Satu baris = satu konfigurasi Custom Lab lengkap.
-- #########################################################

CREATE TABLE cart_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cart_item_uuid UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    user_id BIGINT NOT NULL,
    model_id BIGINT NOT NULL,
    fabric_id BIGINT NOT NULL,
    config JSONB NOT NULL,                           -- warna, jumlah per ukuran, sablon, path file desain, catatan produksi
    config_version SMALLINT NOT NULL DEFAULT 1,      -- naikkan bila bentuk config berubah
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_cart_config_object CHECK (jsonb_typeof(config) = 'object'),
    FOREIGN KEY (user_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (model_id) REFERENCES garment_models(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (fabric_id) REFERENCES fabrics(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX idx_cart_user ON cart_items (user_id, created_at);

COMMENT ON TABLE cart_items IS 'TIDAK menyimpan harga. Harga dihitung ulang server tiap keranjang dibuka dan dikunci ke order_items saat checkout.';
COMMENT ON COLUMN cart_items.config IS 'Path file desain berawalan carts/<user_uuid>/ di bucket designs (bukan tmp/).';


-- #########################################################
-- 5. TRIGGER updated_at & RLS UNTUK TABEL BARU
-- #########################################################

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['users', 'user_addresses', 'cart_items'] LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I
             FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END LOOP;
END $$;

-- =========================================================
-- Setelah migrasi:
--   Admin pertama : npm run seed:admin  (kini menulis ke tabel users, role ADMIN)
--   Tabel admin_users sudah dihapus; jangan merujuknya lagi di kode.
-- =========================================================
