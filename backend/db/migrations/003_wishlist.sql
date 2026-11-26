-- =========================================================
-- MIGRASI 003  -  Wishlist pengguna lintas perangkat
-- Dijalankan lewat:  npm run db:migrate  (atau Supabase SQL Editor)
-- Prasyarat       :  001_init.sql & 002_accounts_cart.sql sudah terpasang.
--
-- RINGKASAN
--   1. Tabel user_wishlists (relasi user_id <-> garment_model_id)
--   2. Constraint UNIQUE (user_id, garment_model_id) + index lookup
--   3. Row Level Security aktif (blokir akses anon/authenticated Data API;
--      semua akses melewati backend API Express)
-- =========================================================

CREATE TABLE user_wishlists (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL,
    garment_model_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_user_wishlists_user_model UNIQUE (user_id, garment_model_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (garment_model_id) REFERENCES garment_models(id)
        ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX idx_user_wishlists_user_created ON user_wishlists (user_id, created_at DESC);
CREATE INDEX idx_user_wishlists_model ON user_wishlists (garment_model_id);

COMMENT ON TABLE user_wishlists IS 'Daftar model favorit user tersinkron lintas perangkat; diakses eksklusif melalui backend API.';

ALTER TABLE public.user_wishlists ENABLE ROW LEVEL SECURITY;
