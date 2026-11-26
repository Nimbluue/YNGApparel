# YNG Apparel — Custom Lab & Production Tracker

Aplikasi web untuk **YNG Apparel (@yng.apparel.official)** — platform pemesanan pakaian custom (Custom Lab), kalkulator harga & gatekeeper DP otomatis, pelacakan produksi real-time tanpa login (Live Tracker), dan Solo-Admin Production Kanban Dashboard.

---

## Arsitektur Monorepo (`npm workspaces`)

```
shared/ (@yng/shared) ──▶ backend/ (Express + TypeScript) ──▶ PostgreSQL (Supabase) + Supabase Storage
                      └──▶ frontend/ (React + Vite + TS)
```

- **`shared/` (`@yng/shared`):** Paket tipe TypeScript bersama (`strict: true`) untuk enum status PostgreSQL, pemetaan label UI Bahasa Indonesia, bentuk respons `{ success, message, data }`, dan DTO API.
- **Frontend (`frontend/`):** React 18, Vite, TypeScript (`strict: true`), React Router, Axios, Tailwind CSS. **Tidak pernah** memegang kunci Supabase ataupun memanggil Data API/PostgREST Supabase secara langsung.
- **Backend (`backend/`):** Node.js, Express.js, TypeScript (`strict: true`, `tsx` untuk dev, `tsc` untuk build), `zod` (validasi input), `pg` (node-postgres raw query berparameter + transaksi manual), `@supabase/supabase-js` (khusus object storage menggunakan _service role key_ di sisi server), JWT terpadu (`USER` & `ADMIN`) di cookie `httpOnly`, Multer `memoryStorage` (stateless, tidak menulis file ke disk server), Vitest untuk unit test.
- **Database & Storage:** PostgreSQL 15+ di Supabase (dikelola lewat migrasi bernomor di `backend/db/migrations/`, `001_init.sql` + `002_accounts_cart.sql` + tabel pelacak `schema_migrations`; RLS aktif di seluruh tabel `public` tanpa policy) + 4 bucket Supabase Storage (`catalog`, `designs`, `payment-proofs`, `qc-photos`).

---

## Panduan Setup Project Supabase (Langkah demi Langkah)

### 1. Buat Project Supabase

1. Masuk ke [Supabase Dashboard](https://supabase.com/dashboard) dan buat project baru.
2. Pilih region **Singapore (`ap-southeast-1`)** agar latensi paling rendah untuk operasional di Indonesia.
3. Simpan database password yang Anda buat dengan aman.

### 2. Ambil `DATABASE_URL` (Session Pooler vs Transaction Pooler)

Buka **Project Settings → Database → Connection string** (atau tombol **Connect** di header dashboard):

- **Untuk backend yang berjalan terus-menerus (Railway / Render / Fly.io / VPS / lokal) dan untuk menjalankan `db:migrate`:**
  Gunakan **Session pooler** (Supavisor, port **`5432`**) atau koneksi langsung. Mode ini paling stabil untuk proses Node.js jangka panjang, transaksi `BEGIN ... COMMIT` + `FOR UPDATE`, serta `pg_advisory_lock` pada runner migrasi `db:migrate`.
- **Untuk lingkungan serverless (opsional jika suatu saat dipakai):**
  Gunakan **Transaction pooler** (port **`6543`**). Kode aplikasi sudah dirancang tanpa _named prepared statements_ dan tanpa ketergantungan timezone sesi. _(Catatan: `db:migrate` memakai session-level `pg_advisory_lock`, sehingga wajib dijalankan lewat Session Pooler port `5432` atau koneksi langsung.)_
- Pastikan SSL aktif (`DATABASE_SSL=true` untuk Supabase; otomatis nonaktif jika host `localhost`/`127.0.0.1`).
- **Catatan keamanan:** Jangan pernah membagikan atau menaruh `DATABASE_URL` di kode frontend atau repository Git.

### 3. Ambil `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` (Khusus Storage Backend)

Buka **Project Settings → API** (atau **API Keys**):

1. Salin **Project URL** ke `SUPABASE_URL`.
2. Salin **service_role** secret key ke `SUPABASE_SERVICE_ROLE_KEY`.
3. **Penting tentang RLS & Kunci:**
   - Seluruh tabel pada skema `public` mengaktifkan **Row Level Security (RLS)** tanpa policy sehingga akses melalui REST/Data API Supabase (`anon` / `authenticated`) otomatis ditolak.
   - Backend terhubung langsung ke PostgreSQL sebagai role `postgres` (melewati RLS).
   - Frontend **dilarang keras** memegang `SUPABASE_SERVICE_ROLE_KEY` maupun `ANON_KEY` atau memanggil Supabase secara langsung. Semua permintaan dan signed URL melewati REST API Express.

---

## Konfigurasi Environment

1. Salin `backend/.env.example` menjadi `backend/.env` dan isi nilai konfigurasi Anda:
   - `DATABASE_URL` (Session Pooler port `5432` atau direct connection)
   - `JWT_SECRET` (string acak panjang, minimal 32 karakter)
   - `FRONTEND_ORIGIN` (`http://localhost:5173` untuk lokal; atau daftar origin dipisahkan koma)
   - `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (untuk seed admin pertama)
   - `TELEGRAM_BOT_TOKEN` & `TELEGRAM_CHAT_ID` (opsional, kosongkan jika tidak dipakai)
2. _(Opsional)_ Salin `frontend/.env.example` menjadi `frontend/.env` jika ingin mengubah `VITE_API_BASE_URL` (default `/api` sudah diteruskan oleh proxy Vite ke `http://localhost:5000`).

> **PERINGATAN:** Backend hanya membaca `backend/.env` (tidak membaca `.env` di root repo). Jangan pernah meng-commit `.env` ke Git.

---

## Instalasi & Inisialisasi Awal

Jalankan seluruh perintah dari **direktori root repository**:

```bash
# 1. Install seluruh dependensi workspace (shared, backend, frontend) & build @yng/shared
npm install

# 2. Cek koneksi database PostgreSQL
npm run db:check

# 3. Jalankan seluruh migrasi skema bernomor (backend/db/migrations/*.sql -> 001 + 002)
#    Setelah selesai: total 25 tabel public (24 tabel aplikasi + schema_migrations)
npm run db:migrate

# 4. Isi data katalog placeholder (backend/db/seeds/*.sql)
#    Catatan: ditolak di NODE_ENV=production kecuali disertai --force
npm run db:seed

# 5. Buat & konfigurasi 4 bucket Supabase Storage (idempoten)
npm run storage:init

# 6. Buat akun ADMIN pertama di tabel users (role ADMIN) dari ADMIN_* di backend/.env
npm run seed:admin
```

> **PERINGATAN PENTING (`seed:admin`):** Ganti nilai `ADMIN_NAME`, `ADMIN_EMAIL`, dan `ADMIN_PASSWORD` di `backend/.env` dengan data asli milik Anda sebelum menjalankan `npm run seed:admin`. Password minimal **12 karakter** (maksimal **72 byte**), dan nilai placeholder (seperti email berakhiran `@anda.com` / `@example.com` atau nama `"Nama Anda"`) akan ditolak secara otomatis. Akun `seed:admin` kini dibuat pada tabel **`users`** dengan role **`ADMIN`**.

---

## Menjalankan Secara Lokal & Kualitas Kode

Buka dua terminal terpisah di root project:

```bash
# Terminal 1 — Backend API (default port 5000, hot reload via tsx watch)
npm run dev:backend

# Terminal 2 — Frontend Vite (default port 5173)
npm run dev:frontend
```

Perintah pemeriksaan kualitas kode & build (dijalankan dari root):

```bash
npm run typecheck     # Build shared + tsc --noEmit di backend & frontend
npm run lint          # ESLint 9 di shared, backend, dan frontend
npm run test          # Unit test Vitest (tanpa membutuhkan DB/.env)
npm run build         # Build shared -> backend/dist -> frontend/dist
npm run format:check  # Cek format Prettier
```

Uji endpoint kesehatan server setelah menyala:

- `GET http://localhost:5000/api/health` → memastikan server Express menyala.
- `GET http://localhost:5000/api/health/db` → memastikan koneksi PostgreSQL berhasil.

---

## Menjalankan & Menguji di HP (PWA)

Service Worker PWA (`frontend/public/sw.js`) hanya aktif pada build produksi. Setiap kali ada perubahan kode frontend, bangun ulang bundle terlebih dahulu sebelum menjalankan server preview:

```bash
npm -w frontend run build
```

Buka **3 terminal terpisah** di root repository:

```bash
# Terminal 1 — Backend API (port 5000)
npm run dev:backend

# Terminal 2 — Frontend Preview produksi (port 4173)
# frontend/vite.config.ts sudah mengatur preview.allowedHosts: true dan proxy /api ke http://localhost:5000
npm -w frontend run preview -- --host

# Terminal 3 — HTTPS Tunnel agar syarat Install App PWA aktif di browser mobile
npx cloudflared tunnel --url http://localhost:4173
```

### Cara Install di HP

- **Android (Chrome):** Buka URL `https://xxxx.trycloudflare.com` dari Terminal 3 → buka menu titik tiga (`⋮`) → pilih **Install app** / **Tambahkan ke layar utama**.
- **iOS (Safari):** Buka URL `https://xxxx.trycloudflare.com` → ketuk tombol **Share** → pilih **Add to Home Screen**.

### Catatan

- URL _quick tunnel_ (`trycloudflare.com`) bersifat sementara dan berubah setiap kali proses `cloudflared` di-restart. Untuk URL permanen saat pengujian rutin atau staging, gunakan **Named Tunnel** Cloudflare dengan domain sendiri.

---

## Menjalankan & Menguji di HP (PWA)

Service Worker PWA (`frontend/public/sw.js`) hanya aktif pada build produksi. Setiap kali ada perubahan kode frontend, bangun ulang bundle terlebih dahulu sebelum menjalankan server preview:

```bash
npm -w frontend run build
```

Buka **3 terminal terpisah** di root repository:

```bash
# Terminal 1 — Backend API (port 5000)
npm run dev:backend

# Terminal 2 — Frontend Preview produksi (port 4173)
# frontend/vite.config.ts sudah mengatur preview.allowedHosts: true dan proxy /api ke http://localhost:5000
npm -w frontend run preview -- --host

# Terminal 3 — HTTPS Tunnel agar syarat Install App PWA aktif di browser mobile
npx cloudflared tunnel --url http://localhost:4173
```

### Cara Install di HP

- **Android (Chrome):** Buka URL `https://xxxx.trycloudflare.com` dari Terminal 3 → buka menu titik tiga (`⋮`) → pilih **Install app** / **Tambahkan ke layar utama**.
- **iOS (Safari):** Buka URL `https://xxxx.trycloudflare.com` → ketuk tombol **Share** → pilih **Add to Home Screen**.

### Catatan

- URL _quick tunnel_ (`trycloudflare.com`) bersifat sementara dan berubah setiap kali proses `cloudflared` di-restart. Untuk URL permanen saat pengujian rutin atau staging, gunakan **Named Tunnel** Cloudflare dengan domain sendiri.

---

## Alur Kerja Tim (5 Orang)

1. **Struktur 3 Branch Tetap (`main`, `Alpha`, `Beta`):**
   - `main`: live / siap rilis, hanya menerima merge dari `Alpha`.
   - `Alpha`: leader memeriksa kode setelah merge dari `Beta`.
   - `Beta`: setiap developer melakukan `git pull` sebelum mulai bekerja dan push ke `Beta` setelah selesai mengerjakan task.
   - Alur Pull Request: `Beta` → `Alpha` (diperiksa leader), lalu `Alpha` → `main`.
2. **Syarat Lolos PR / CI:**
   - CI menjalankan seluruh pemeriksaan berikut dari root pada setiap PR:
     ```bash
     npm run typecheck && npm run lint && npm run test && npm run build
     ```
   - Gunakan tipe bersama dari `@yng/shared` dan pertahankan `strict: true` (tanpa `any` tanpa alasan tertulis).
3. **Aturan Migrasi Database dalam Tim:**
   - Perubahan skema database **hanya** lewat file baru bernomor urut di `backend/db/migrations/` (mis. `003_add_notes_index.sql`).
   - **Dilarang keras mengedit file migrasi yang sudah ada / sudah di-merge.** Runner `db:migrate` memverifikasi checksum SHA-256 dan akan gagal jika isi migrasi terpasang berubah.
   - Nomor migrasi baru (`003`, dst.) wajib dikonfirmasi bersama pemilik/leader terlebih dahulu sebelum dibuat agar tidak bentrok antar developer.
   - `.gitattributes` menetapkan `*.sql text eol=lf` agar akhir baris SQL konsisten di Windows, macOS, dan Linux.

---

## Panduan Deployment & Backup Produksi

1. **Catatan Penting Deployment Monorepo (`npm workspaces`):**
   - Karena backend dan frontend mengimpor paket lokal `shared/` (`@yng/shared`), host backend (Railway, Render, Fly.io, VPS) harus menjalankan instalasi dan build dari **root repository**, memastikan `shared/` dibangun **sebelum** `backend/`:
     - **Install command:** `npm ci` (dari root repository)
     - **Build command (Backend):** `npm run build:shared && npm -w backend run build`
     - **Start command (Backend):** `npm -w backend run start` (menjalankan `node dist/server.js`)
     - **Build command (Frontend static host):** `npm run build:shared && npm -w frontend run build` (output di `frontend/dist/`)
2. **Hosting Produksi:**
   - **Database & Storage:** Gunakan paket **Supabase Pro** untuk produksi agar mendapat backup harian otomatis dan project tidak di-pause saat trafik sepi.
   - **Backend:** Jalankan pada host Node.js _long-running process_ agar `node-cron` dan upload memori berjalan konsisten.
   - **Frontend:** Deploy ke Vercel, Netlify, atau Cloudflare Pages.
3. **Backup Database Eksternal (`backend/scripts/backup.sh`):**
   - Sediakan penjadwalan eksternal (cron di VPS Linux atau GitHub Actions) menjalankan `backend/scripts/backup.sh` dengan `DATABASE_URL` dan `BACKUP_ENCRYPTION_KEY`.
   - **Catatan pengguna Windows:** `backup.sh` adalah skrip Bash; di Windows jalankan melalui **Git Bash** atau **WSL**, atau jalankan lewat pipeline CI/Linux.
   - Backup database **tidak** mencakup objek file di Supabase Storage — jadwalkan ekspor/sinkronisasi berkala terutama untuk bucket privat **`designs`** dan **`payment-proofs`** (serta **`qc-photos`** dan **`catalog`**).
