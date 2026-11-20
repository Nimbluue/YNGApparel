# YNG Apparel — Aturan Kerja Agent

Sumber kebenaran:

- Spesifikasi: `docs/SPEC.md`
- Skema database: `backend/db/migrations/` (saat ini `001_init.sql` dan `002_accounts_cart.sql`, dan migrasi bernomor berikutnya; data contoh placeholder di `backend/db/seeds/`)
- Kemajuan: `docs/PROGRESS.md` (update di akhir setiap tahap)

Baca ketiganya sebelum mengerjakan tugas apa pun.

## Cara kerja

- Kerjakan SATU tahap per sesi/task sesuai Bagian 11 SPEC. Jangan lanjut ke tahap berikutnya sebelum saya bilang "lanjut".
- Jangan mengubah file di luar cakupan tahap yang sedang dikerjakan.
- Sebelum menyatakan tahap selesai, WAJIB jalankan `npm run typecheck`, `npm run lint`, dan `npm run test` (serta `npm run build` jika menyentuh struktur build/deploy), pastikan semuanya lulus.
- Di akhir tiap tahap tampilkan: daftar file dibuat/diubah/dihapus, cara menjalankan, cara menguji, lalu update `docs/PROGRESS.md`.
- Ambiguitas kecil: ambil asumsi paling masuk akal, tulis asumsinya, lanjut. Jika bertentangan dengan SPEC: tanya dulu, jangan menyimpang diam-diam.

## Alur Git & Kerja Tim

Tim beranggotakan 5 orang bekerja di satu monorepo (`backend/`, `frontend/`, `shared/`) dengan 3 branch tetap:

- `main`: live / siap rilis, hanya menerima merge dari `Alpha`.
- `Alpha`: leader memeriksa kode setelah merge dari `Beta`.
- `Beta`: setiap developer push ke branch ini setelah selesai mengerjakan task.
- **Pull Request & CI:** alur PR adalah `Beta` → `Alpha` (diperiksa leader), lalu `Alpha` → `main`. CI menjalankan `npm run typecheck`, `npm run lint`, `npm run test`, dan `npm run build` pada setiap PR.
- **Batas kerja agent di Git:** agent **TIDAK** membuat branch, **TIDAK** `commit`, dan **TIDAK** `push`. Agent bekerja di branch aktif (seharusnya `Beta`); jika branch aktif adalah `main` atau `Alpha`, agent wajib berhenti dan memberi tahu saya.
- **Persiapan sebelum tugas baru:** sebelum memulai tugas baru, agent mengingatkan saya untuk `git pull` dulu dan menutup semua tab editor yang berisi file yang akan diubah.
- **Koordinasi nomor migrasi:** nomor migrasi baru (`003`, dst.) harus dikonfirmasi saya dulu sebelum dibuat agar tidak bentrok antar developer.

## Aturan keras

- Bahasa & tipe: gunakan **TypeScript `strict: true`** di seluruh `shared/`, `backend/`, dan `frontend/`. Dilarang memakai `any` tanpa komentar alasan yang jelas (`// eslint-disable-next-line @typescript-eslint/no-explicit-any -- <alasan>`).
- Tipe API, enum status, dan bentuk respons `{ success, message, data }` dibagi lewat paket `shared/` (`@yng/shared`).
- Akun, role, & otorisasi: role di DB hanya `ADMIN` dan `USER` (`user_role_t`). `"Guest"` bukan role (hanya pengunjung tanpa token). Role **tidak pernah** diterima dari input client (registrasi publik selalu membuat `USER`). Middleware wajib memuat user aktif dari DB (`is_active = TRUE` dan `token_version` cocok).
- Isolasi data user: seluruh query resource milik pelanggan (`user_addresses`, `cart_items`, `orders` pada rute `/me/*`) **wajib** difilter berdasarkan `user_id = req.user.id`; akses ke resource milik orang lain wajib dijawab `404`.
- Keranjang & harga: `cart_items` **tidak** menyimpan harga. Harga, DP, diskon, ongkir, dan sisa tagihan SELALU dihitung server (`pricingService`) dan selalu memakai **integer rupiah** (tanpa angka desimal pecahan). `grand_total` dan `is_dp_eligible` adalah generated column: jangan ditulis dari aplikasi.
- Tracking kurir eksternal: URL tracking kurir **hanya** dibuat dari daftar kurir tetap di `shared/` (`shared/src/couriers.ts`), tidak pernah menerima URL bebas dari input admin atau customer.
- DB: PostgreSQL via `pg` raw query (`$1, $2, ...`), tanpa ORM, tanpa sintaks MySQL. Transaksi lewat `withTransaction`; `SELECT ... FOR UPDATE` untuk `orders`/`payments`.
- Skema database: perubahan skema hanya boleh lewat file migrasi bernomor baru (`backend/db/migrations/003_xxx.sql`, dst.), dan nomor migrasi baru harus dikonfirmasi saya dulu agar tidak bentrok antar developer. **Jangan pernah mengedit file migrasi yang sudah ada / sudah di-merge.** Beri tahu saya setiap kali skema berubah.
- Backend stateless: tidak boleh menyimpan file di disk server. Semua file lewat `storageService` (Supabase Storage). Kolom `*_path` = path objek, bukan URL. File desain keranjang disimpan di prefix `designs/carts/<user_uuid>/...` (bukan `tmp/`) dan dipindahkan ke `designs/orders/<transaction_uuid>/...` saat checkout.
- Frontend TIDAK memakai Supabase langsung dan tidak memegang kunci apa pun. RLS aktif; jangan menambah policy.
- Jangan mengekspos `id` internal di API publik.
- Bahasa UI: Indonesia. Nama variabel/tabel/endpoint: Inggris. Tandai asumsi dengan komentar `// ASSUMPTION`.

## Keamanan & keselamatan

- JANGAN membaca, mencetak, atau menyalin isi `.env` ke output, log, atau commit. Hanya `.env.example` (tanpa nilai rahasia) yang boleh di-commit.
- JANGAN menjalankan perintah yang mengubah atau mengakses database maupun storage (mis. `db:check`, `db:migrate`, `db:seed`, `storage:init`, `seed:admin`) tanpa persetujuan eksplisit dari saya. Cukup sediakan skripnya dan beri tahu cara menjalankannya.
- JANGAN membuat branch, menjalankan `git commit`, atau menjalankan `git push`. Bekerjalah di branch aktif (seharusnya `Beta`); jika branch aktif adalah `main` atau `Alpha`, segera berhenti dan beri tahu saya.

## Lingkungan

- OS pengembangan: Windows. Skrip utilitas di `npm scripts` wajib lintas platform (Node.js / `tsx`), jangan mengandalkan bash di `npm scripts`.
