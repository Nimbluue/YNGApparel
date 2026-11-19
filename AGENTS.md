# YNG Apparel — Aturan Kerja Agent

Sumber kebenaran:

- Spesifikasi: `docs/SPEC.md`
- Skema database: `backend/db/migrations/` (dan data contoh placeholder di `backend/db/seeds/`)
- Kemajuan: `docs/PROGRESS.md` (update di akhir setiap tahap)

Baca ketiganya sebelum mengerjakan tugas apa pun.

## Cara kerja

- Kerjakan SATU tahap per PR/sesi sesuai Bagian 11 SPEC. Jangan lanjut ke tahap berikutnya sebelum saya bilang "lanjut".
- Jangan mengubah file di luar cakupan tahap yang sedang dikerjakan.
- Sebelum menyatakan tahap selesai, WAJIB jalankan `npm run typecheck`, `npm run lint`, dan `npm run test` (serta `npm run build` jika menyentuh struktur build/deploy), pastikan semuanya lulus.
- Di akhir tiap tahap tampilkan: daftar file dibuat/diubah/dihapus, cara menjalankan, cara menguji, lalu update `docs/PROGRESS.md`.
- Ambiguitas kecil: ambil asumsi paling masuk akal, tulis asumsinya, lanjut. Jika bertentangan dengan SPEC: tanya dulu, jangan menyimpang diam-diam.

## Aturan keras

- Bahasa & tipe: gunakan **TypeScript `strict: true`** di seluruh `shared/`, `backend/`, dan `frontend/`. Dilarang memakai `any` tanpa komentar alasan yang jelas (`// eslint-disable-next-line @typescript-eslint/no-explicit-any -- <alasan>`).
- Tipe API, enum status, dan bentuk respons `{ success, message, data }` dibagi lewat paket `shared/` (`@yng/shared`).
- DB: PostgreSQL via `pg` raw query (`$1, $2, ...`), tanpa ORM, tanpa sintaks MySQL. Transaksi lewat `withTransaction`; `SELECT ... FOR UPDATE` untuk `orders`/`payments`.
- Skema database: perubahan skema hanya boleh lewat file migrasi bernomor baru (`backend/db/migrations/002_xxx.sql`, dst.). **Jangan pernah mengedit file migrasi yang sudah ada / sudah di-merge.** Beri tahu saya setiap kali skema berubah.
- Harga, DP, diskon, ongkir, dan sisa tagihan SELALU dihitung server (`pricingService`) dan selalu memakai **integer rupiah** (tanpa angka desimal pecahan). `grand_total` dan `is_dp_eligible` adalah generated column: jangan ditulis dari aplikasi.
- Backend stateless: tidak boleh menyimpan file di disk server. Semua file lewat `storageService` (Supabase Storage). Kolom `*_path` = path objek, bukan URL.
- Frontend TIDAK memakai Supabase langsung dan tidak memegang kunci apa pun. RLS aktif; jangan menambah policy.
- Jangan mengekspos `id` internal di API publik.
- Bahasa UI: Indonesia. Nama variabel/tabel/endpoint: Inggris. Tandai asumsi dengan komentar `// ASSUMPTION`.

## Keamanan & keselamatan

- JANGAN membaca, mencetak, atau menyalin isi `.env` ke output, log, atau commit. Hanya `.env.example` (tanpa nilai rahasia) yang boleh di-commit.
- JANGAN menjalankan perintah yang mengubah atau mengakses database maupun storage (mis. `db:check`, `db:migrate`, `db:seed`, `storage:init`, `seed:admin`) tanpa persetujuan eksplisit dari saya. Cukup sediakan skripnya dan beri tahu cara menjalankannya.
- JANGAN menjalankan `git push` atau `git commit` sendiri kecuali saya minta.

## Lingkungan

- OS pengembangan: Windows. Skrip utilitas di `npm scripts` wajib lintas platform (Node.js / `tsx`), jangan mengandalkan bash di `npm scripts`.
