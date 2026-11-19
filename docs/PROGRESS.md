# Kemajuan Pengembangan — YNG Apparel

Checklist tahapan mengacu pada Bagian 11 [SPEC.md](file:///c:/Users/Lenovo/Documents/GitHub/YNGApparel/docs/SPEC.md).

## Checklist Tahapan (Tahap 0 – 8e)

- [ ] **Tahap 0 — Setup** *(konversi TypeScript & migrasi selesai; menunggu verifikasi DB, Storage, dan server oleh pemilik)*
  - [x] Struktur monorepo `npm workspaces` (`shared/`, `backend/`, `frontend/`, root `package.json`, `.gitattributes`)
  - [x] Paket tipe bersama `shared/` (`@yng/shared`: 11 enum status PostgreSQL, pemetaan label UI Bahasa Indonesia, tipe `Rupiah`, DTO & format respons API)
  - [x] Standar TypeScript `strict: true` (`shared/`, `backend/`, `frontend/`) + ESLint 9 + Prettier
  - [x] `backend/.env.example` dan `frontend/.env.example` (hanya `backend/.env` yang dibaca backend; frontend tanpa kunci Supabase)
  - [x] Koneksi PostgreSQL (`pg` Pool, parser `BIGINT`/`NUMERIC`, `withTransaction`, `scripts/dbCheck.ts`)
  - [x] Runner migrasi bernomor `scripts/migrate.ts` (`backend/db/migrations/*.sql`, tabel `schema_migrations`, validasi checksum SHA-256, `pg_advisory_lock`)
  - [x] Runner seed terpisah `scripts/seed.ts` (`backend/db/seeds/*.sql`, menolak berjalan saat `NODE_ENV=production` kecuali ada `--force`)
  - [x] Abstraksi storage `storageService.ts` + `scripts/initStorage.ts` (4 bucket idempoten)
  - [x] Middleware keamanan & utilitas backend TypeScript (`errorHandler` pemetaan 23505/23514/23503/22P02, `validate.ts` berbasis Zod, `response.ts`, `rateLimiter.ts`, `helmet`, `cors`, `originCheck.ts`, `adminAuth.ts` cookie httpOnly JWT, `orderCode.ts`, `phone.ts`, `migrationHelpers.ts`)
  - [x] Skrip operasional (`scripts/seedAdmin.ts`, `scripts/backup.sh`)
  - [x] Unit & smoke test Vitest (`backend/tests/stage0.test.ts`, berjalan tanpa DB/`.env`)
  - [x] Setup Frontend TypeScript (`Vite`, `React Router`, `Axios`, `Tailwind CSS`, design tokens Editorial Minimalist Menswear / Monochrome Brutalist, `statusLabels.ts` re-export `@yng/shared`, `formatRupiah.ts`, layout & halaman awal)
  - [x] Revisi dokumen `docs/SPEC.md`, `AGENTS.md`, dan `README.md` (panduan setup Supabase, deployment workspaces, alur kerja tim 5 orang)
  - [ ] *Verifikasi manual oleh pemilik (belum dijalankan):* isi `backend/.env`, jalankan `npm run db:check`, `npm run db:migrate`, `npm run db:seed`, `npm run storage:init`, `npm run seed:admin`, lalu cek `npm run dev:backend` & `npm run dev:frontend` menyala
- [ ] **Tahap 1 — Admin auth + Master data** (Login admin JWT cookie httpOnly, CRUD model/bahan/warna per bahan/ukuran/sablon/rekening, settings, upload gambar ke bucket `catalog`)
- [ ] **Tahap 2 — Custom Lab publik** (Endpoint katalog, `pricingService` + `/pricing/quote`, wizard Custom Lab, `ColorPicker`, `SizeMatrix`, `PrintSpotPicker`, upload desain ke `tmp/`, harga real-time, gatekeeper DP dinamis)
- [ ] **Tahap 3 — Pembuatan order & pembayaran awal** (`POST /api/orders` dengan transaksi & idempotency key, order code 6 karakter, snapshot harga, SHIP/PICKUP, pindahkan `tmp/` → `orders/`, tagihan awal, halaman instruksi bayar + upload bukti, link WhatsApp)
- [ ] **Tahap 4 — Live Tracker** (Lookup kode + 4 digit WA, magic link, 5 tahap produksi, signed URL foto QC, upload bukti tagihan lanjutan, masking data)
- [ ] **Tahap 5 — Admin Kanban & produksi** (Board, detail order, verifikasi bayar, mesin status, review desain, SPK PDF, foto QC multi, input/revisi ongkir, diskon, edit alamat, edit isi order, resi, pembatalan + refund, riwayat status, template WA, input order manual, scheduler + advisory lock, Telegram opsional)
- [ ] **Tahap 6 — Dashboard & laporan** (Dashboard ringkas, laporan penjualan/order/model terlaris/customer, export CSV)
- [ ] **Tahap 7 — Pengujian MVP** (Verifikasi 29 skenario checklist pengujian MVP & perapihan UI/UX)
- [ ] **Tahap 8a — Fase 2: Fabric Lab + Production Log** (Halaman edukasi bahan, log produksi CRUD admin + tampil publik)
- [ ] **Tahap 8b — Fase 2: Mockup 2D + Sablon Sizer** (Template SVG per model, pewarnaan, penempatan titik sablon)
- [ ] **Tahap 8c — Fase 2: DPI Guard** (Hitung DPI dengan `sharp`, peringatan wizard, badge DPI di kartu admin)
- [ ] **Tahap 8d — Fase 2: Kolektif Link** (Buat link, anggota isi ukuran, ketua checkout)
- [ ] **Tahap 8e — Fase 2: Ready Drops** (Katalog siap jual + tombol pesan via WhatsApp)

## Catatan Sesi

- **Tahap 0 (Awal — JS):** Fondasi awal selesai dibuat sebagai prototipe JavaScript.
- **Tahap 0 (Konversi TS + Migrasi DB):** Seluruh kode `backend/` dan `frontend/` telah dikonversi ke TypeScript `strict: true`, dilengkapi paket tipe bersama `@yng/shared`, ESLint + Prettier, migrasi bernomor (`migrate.ts` + `seed.ts`), validasi `zod`, dan unit test Vitest (`stage0.test.ts`). **Tahap 0 masih berstatus belum tuntas** hingga pemilik menjalankan `db:migrate`, `db:seed`, `storage:init`, `seed:admin`, dan memverifikasi server menyala.
