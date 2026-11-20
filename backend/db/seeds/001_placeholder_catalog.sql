-- =========================================================
-- SEED DATA CONTOH  (*** PLACEHOLDER: WAJIB diganti dengan data asli client ***)
-- Dijalankan lewat:  npm run db:seed
-- IDEMPOTEN: aman dijalankan berulang kali (tidak menggandakan data).
-- Bukan bagian dari migrasi; jangan dipakai di production sebelum diisi data asli.
-- =========================================================

INSERT INTO sizes (code, sort_order, extra_charge) VALUES
('S', 1, 0), ('M', 2, 0), ('L', 3, 0), ('XL', 4, 0), ('XXL', 5, 10000)
ON CONFLICT (code) DO NOTHING;

INSERT INTO print_sizes (code, name, dimensions_cm, width_cm, height_cm, price_per_spot, sort_order) VALUES
('LOGO', 'Logo',  '10 x 10',     10.00, 10.00, 10000, 1),
('A5',   'A5',    '14.8 x 21',   14.80, 21.00, 15000, 2),
('A4',   'A4',    '21 x 29.7',   21.00, 29.70, 25000, 3),
('A3',   'A3',    '29.7 x 42',   29.70, 42.00, 35000, 4)
ON CONFLICT (code) DO NOTHING;

INSERT INTO garment_models (slug, name, base_price, sort_order, mockup_template) VALUES
('kaos-lengan-pendek', 'Kaos Lengan Pendek',  65000, 1, 'tee-short'),
('kaos-lengan-panjang','Kaos Lengan Panjang', 75000, 2, 'tee-long'),
('polo',               'Polo',                95000, 3, 'polo'),
('sweatshirt',         'Sweatshirt',         140000, 4, 'sweatshirt'),
('hoodie',             'Hoodie',             160000, 5, 'hoodie'),
('jacket-zipper',      'Jacket Zipper',      175000, 6, 'jacket-zip')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO fabrics (code, name, gsm_weight, thickness_level, comfort_level, additional_price, sort_order) VALUES
('CC30S',  'Cotton Combed 30s', 150, 2, 5, 0,     1),
('CC24S',  'Cotton Combed 24s', 175, 3, 4, 10000, 2),
('PQCVC',  'Pique CVC',         210, 3, 4, 15000, 3),
('BTERRY', 'Baby Terry',        240, 4, 4, 0,     4),
('CF280',  'Cotton Fleece 280', 280, 5, 5, 15000, 5)
ON CONFLICT (code) DO NOTHING;

INSERT INTO model_fabrics (model_id, fabric_id)
SELECT m.id, f.id FROM garment_models m JOIN fabrics f ON
    (m.slug IN ('kaos-lengan-pendek','kaos-lengan-panjang') AND f.code IN ('CC30S','CC24S'))
 OR (m.slug = 'polo' AND f.code = 'PQCVC')
 OR (m.slug IN ('sweatshirt','hoodie','jacket-zipper') AND f.code IN ('BTERRY','CF280'))
ON CONFLICT DO NOTHING;

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
) AS c(color_name, color_hex, ord)
ON CONFLICT (fabric_id, color_name) DO NOTHING;

-- payment_accounts tidak punya unique key: hanya diisi bila tabel masih kosong
INSERT INTO payment_accounts (method, provider_name, account_number, account_holder, instructions)
SELECT v.method::payment_method_t, v.provider_name, v.account_number, v.account_holder, v.instructions
FROM (VALUES
    ('QRIS', 'QRIS YNG Apparel', NULL, 'YNG Apparel', 'Scan QRIS, bayar sesuai nominal, lalu upload bukti.'),
    ('BANK_TRANSFER', 'BCA', '0000000000', 'YNG Apparel', 'Transfer sesuai nominal, lalu upload bukti.')
) AS v(method, provider_name, account_number, account_holder, instructions)
WHERE NOT EXISTS (SELECT 1 FROM payment_accounts);
