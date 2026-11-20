# Kemajuan Pengembangan — YNG Apparel

Checklist tahapan mengacu pada Bagian 11 [SPEC.md](file:///c:/Users/Lenovo/Documents/GitHub/YNGApparel/docs/SPEC.md).

## Checklist Tahapan (Tahap 0 – 8e)

- [ ] **Tahap 0 — Setup** *(konversi TypeScript, migrasi 001+002, & penyesuaian akun/keranjang/kurir selesai; menunggu verifikasi DB, Storage, `seed:admin`, dan server menyala oleh pemilik)*
  - [x] Struktur monorepo `npm workspaces` (`shared/`, `backend/`, `frontend/`, root `package.json`, `.gitattributes`)
  - [x] Paket tipe bersama `shared/` (`@yng/shared`: 12 enum PostgreSQL termasuk `USER_ROLE`, `AuthUserDto`, `couriers.ts` + `buildTrackingUrl()`, pemetaan label UI Bahasa Indonesia, tipe `Rupiah`, DTO & format respons API)
  - [x] Standar TypeScript `strict: true` (`shared/`, `backend/`, `frontend/`) + ESLint 9 + Prettier
  - [x] `backend/.env.example` dan `frontend/.env.example` (hanya `backend/.env` yang dibaca backend; frontend tanpa kunci Supabase)
  - [x] Koneksi PostgreSQL (`pg` Pool, parser `BIGINT`/`NUMERIC`, `withTransaction`, `scripts/dbCheck.ts`)
  - [x] Runner migrasi bernomor `scripts/migrate.ts` (`backend/db/migrations/*.sql` termasuk `001_init.sql` & `002_accounts_cart.sql`, tabel `schema_migrations`, validasi checksum SHA-256, `pg_advisory_lock`)
  - [x] Runner seed terpisah `scripts/seed.ts` (`backend/db/seeds/*.sql`, menolak berjalan saat `NODE_ENV=production` kecuali ada `--force`)
  - [x] Abstraksi storage `storageService.ts` + `scripts/initStorage.ts` (4 bucket idempoten)
  - [x] Middleware keamanan & utilitas backend TypeScript (`auth.ts` dengan `requireAuth`/`requireRole`/`optionalAuth` + cek `users.is_active` & `token_version` per request, `errorHandler` pemetaan 23505/23514/23503/22P02, `validate.ts` berbasis Zod, `response.ts`, `rateLimiter.ts`, `helmet`, `cors`, `originCheck.ts`, `orderCode.ts`, `phone.ts`, `migrationHelpers.ts`, `seedAdminHelpers.ts`)
  - [x] Skrip operasional (`scripts/seedAdmin.ts` menulis ke `users` role `ADMIN` + validasi Zod & tolak placeholder, `scripts/backup.sh`)
  - [x] Unit & smoke test Vitest (`backend/tests/stage0.test.ts`, termasuk `buildTrackingUrl`, mock `requireAuth`/`requireRole`/`optionalAuth`, dan validasi `seedAdminHelpers`, berjalan tanpa DB/`.env`)
  - [x] Setup Frontend TypeScript (`Vite`, `React Router`, `Axios`, `Tailwind CSS`, design tokens Editorial Minimalist Menswear / Monochrome Brutalist, `AuthContext`, `ProtectedRoute`, `AdminRoute`, `statusLabels.ts` re-export `@yng/shared`, `formatRupiah.ts`, layout & placeholder rute)
  - [x] Revisi dokumen `docs/SPEC.md`, `AGENTS.md`, `README.md`, dan `docs/PROGRESS.md` (aturan Guest/USER/ADMIN, keranjang `cart_items`, tracking resi eksternal, sub-tahap 1a/1b & 3a/3b)
  - [ ] *Verifikasi manual oleh pemilik (belum dijalankan pada state migrasi `002`):* pastikan `backend/.env` memakai nilai asli (bukan placeholder) + `PORT=5000`, jalankan `npm run db:check`, `npm run db:migrate`, `npm run db:seed`, `npm run storage:init`, `npm run seed:admin`, lalu cek `npm run dev:backend` & `npm run dev:frontend` menyala
- [ ] **Tahap 1a — Auth terpadu (`USER`+`ADMIN`) + Master data admin** (Endpoint `/api/auth/register`, `/login`, `/logout`, `/me`, `/password`, `requireAuth` + `requireRole('ADMIN')`, CRUD model/bahan/warna per bahan/ukuran/sablon/rekening, settings, upload gambar ke bucket `catalog`)
- [ ] **Tahap 1b — Akun pelanggan & alamat tersimpan** (Halaman `/login`, `/register`, `/akun` profil + ganti password + nonaktifkan akun `is_active = FALSE` + kelola maks 5 alamat via `/api/me/addresses`, alur redirect kembali setelah login)
- [ ] **Tahap 2 — Custom Lab publik** (Endpoint katalog, `pricingService` + `/pricing/quote`, wizard Custom Lab dengan Guest bebas konfigurasi & hitung harga serta login diminta saat tambah keranjang/upload desain, `ColorPicker`, `SizeMatrix`, `PrintSpotPicker`, harga real-time, gatekeeper DP dinamis)
- [ ] **Tahap 3a — Keranjang Custom Lab** (Endpoint `/api/cart/items` `GET/POST/PUT/DELETE` dengan hitung ulang harga & peringatan jika harga/status master berubah, maks 20 item, upload desain ke `designs/carts/<user_uuid>/...`, halaman `/keranjang` dengan checklist item & estimasi DP)
- [ ] **Tahap 3b — Order dari keranjang, pembayaran awal & tracking resi** (`POST /api/orders` dari item tercentang di `/checkout` dengan transaksi & idempotency key, order code 6 karakter, snapshot harga, SHIP/PICKUP, hapus item terbeli dalam transaksi, pindahkan `carts/` → `orders/`, gatekeeper DP dari qty tercentang, tagihan awal, instruksi bayar + upload bukti, `/pesanan` & `/pesanan/:uuid` + tombol lacak resi eksternal dari `shared/src/couriers.ts`, link WhatsApp)
- [ ] **Tahap 4 — Live Tracker** (Lookup kode + 4 digit WA, magic link, 5 tahap produksi, signed URL foto QC, upload bukti tagihan lanjutan, masking data, tombol lacak resi eksternal)
- [ ] **Tahap 5 — Admin Kanban & produksi** (Board, detail order, verifikasi bayar, mesin status, review desain, SPK PDF, foto QC multi, input/revisi ongkir, diskon, edit alamat, edit isi order, validasi kode kurir + resi, pembatalan + refund, riwayat status, template WA, input order manual dengan `user_id` opsional, scheduler + advisory lock + pembersih `tmp/` & keranjang > 30 hari, Telegram opsional)
- [ ] **Tahap 6 — Dashboard & laporan** (Dashboard ringkas, laporan penjualan/order/model terlaris/customer, export CSV)
- [ ] **Tahap 7 — Pengujian MVP** (Verifikasi 39 skenario checklist pengujian MVP & perapihan UI/UX)
- [ ] **Tahap 8a — Fase 2: Fabric Lab + Production Log** (Halaman edukasi bahan, log produksi CRUD admin + tampil publik)
- [ ] **Tahap 8b — Fase 2: Mockup 2D + Sablon Sizer** (Template SVG per model, pewarnaan, penempatan titik sablon)
- [ ] **Tahap 8c — Fase 2: DPI Guard** (Hitung DPI dengan `sharp`, peringatan wizard, badge DPI di kartu admin)
- [ ] **Tahap 8d — Fase 2: Kolektif Link** (Buat link, anggota isi ukuran, ketua checkout)
- [ ] **Tahap 8e — Fase 2: Ready Drops** (Katalog siap jual + tombol pesan via WhatsApp)

## Catatan Sesi

- **Tahap 0 (Awal & Konversi TS):** Fondasi monorepo TypeScript `strict: true` dan runner migrasi `001_init.sql` selesai dikonversi.
- **Tahap 0 (Revisi Akun, Keranjang & Tracking Kurir):** Dokumen (`SPEC.md`, `AGENTS.md`, `README.md`, `PROGRESS.md`) dan kode Tahap 0 disesuaikan untuk migrasi `002_accounts_cart.sql`: tipe `@yng/shared` (`USER_ROLE`, `AuthUserDto`, `couriers.ts`), middleware `auth.ts` (`requireAuth`, `requireRole`, `optionalAuth`), `seedAdmin.ts` ke tabel `users` dengan validasi Zod & penolakan placeholder, serta `AuthContext` + `ProtectedRoute`. **Tahap 0 masih berstatus belum tuntas** hingga pemilik menjalankan `db:migrate` (`002`), `db:seed`, `storage:init`, `seed:admin`, dan memverifikasi server menyala.
