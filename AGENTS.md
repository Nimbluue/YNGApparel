# YNG Apparel — Aturan Kerja Agent

Sumber kebenaran:
- Spesifikasi: `docs/SPEC.md`
- Skema database: `docs/yng_apparel_db_v2_1_postgres.sql`
- Kemajuan: `docs/PROGRESS.md` (update di akhir setiap tahap)

Baca ketiganya sebelum mengerjakan tugas apa pun.

## Cara kerja
- Kerjakan SATU tahap per sesi sesuai Bagian 11 SPEC. Jangan lanjut ke tahap berikutnya sebelum saya bilang "lanjut".
- Di akhir tiap tahap tampilkan: daftar file dibuat/diubah, cara menjalankan, cara menguji, lalu update `docs/PROGRESS.md`.
- Ambiguitas kecil: ambil asumsi paling masuk akal, tulis asumsinya, lanjut. Jika bertentangan dengan SPEC: tanya dulu, jangan menyimpang diam-diam.

## Aturan keras
- DB: PostgreSQL via `pg` raw query (`$1, $2, ...`), tanpa ORM, tanpa sintaks MySQL. Transaksi lewat `withTransaction`; `SELECT ... FOR UPDATE` untuk `orders`/`payments`.
- Skema hanya berubah lewat edit file SQL (selama Tahap 0 belum selesai) atau migrasi `002_xxx.sql` (sesudahnya). Beri tahu saya setiap kali skema berubah.
- Harga, DP, diskon, dan sisa tagihan SELALU dihitung server (`pricingService`). `grand_total` dan `is_dp_eligible` adalah generated column: jangan ditulis dari aplikasi.
- Backend stateless: tidak boleh menyimpan file di disk server. Semua file lewat `storageService` (Supabase Storage). Kolom `*_path` = path objek, bukan URL.
- Frontend TIDAK memakai Supabase langsung dan tidak memegang kunci apa pun. RLS aktif; jangan menambah policy.
- Jangan mengekspos `id` internal di API publik.
- Bahasa UI: Indonesia. Nama variabel/tabel/endpoint: Inggris. Tandai asumsi dengan komentar `// ASSUMPTION`.

## Keamanan & keselamatan
- JANGAN membaca, mencetak, atau menyalin isi `.env` ke output, log, atau commit. Hanya `.env.example` (tanpa nilai rahasia) yang boleh di-commit.
- JANGAN menjalankan perintah yang mengubah database atau storage (mis. `db:init`, `initStorage`) tanpa persetujuan eksplisit dari saya. Cukup sediakan skripnya dan beri tahu cara menjalankannya.
- JANGAN menjalankan `git push` atau `git commit` sendiri kecuali saya minta.

## Lingkungan
- OS pengembangan: Windows. Skrip utilitas ditulis dengan Node.js (lintas platform), jangan mengandalkan bash di `npm scripts`.
