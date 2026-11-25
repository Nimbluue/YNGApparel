# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Guest (pengunjung tanpa login):** Calon pembeli pakaian custom (satuan maupun perwakilan komunitas/tim/brand) yang ingin melihat katalog pakaian aktif, mengecek kecocokan bahan & warna, menyimulasikan harga real-time di Custom Lab tanpa membuat akun, atau memantau progres pesanan di Live Tracker.
- **Pelanggan terdaftar (`USER`):** Pembeli yang ingin menyimpan hingga 20 konfigurasi Custom Lab ke keranjang, mengunggah file desain sendiri atau meminta bantuan desain gratis, menyimpan hingga 5 alamat pengiriman, melakukan checkout item tercentang dengan skema bayar Lunas atau DP, mengunggah bukti pembayaran QRIS/transfer, dan memantau riwayat di **Pesanan Saya** beserta lacak resi kurir eksternal.
- **Pemilik / Solo Admin (`ADMIN`):** Pemilik studio YNG Apparel di Batam yang menjalankan operasional sendirian (sering satu tangan di ponsel): mengelola board Kanban produksi, memverifikasi pembayaran & desain, mencetak SPK PDF, mengunggah foto QC, menginput ongkir/kurir/resi, mencatat order manual dari WhatsApp/Instagram tanpa akun pelanggan, mengelola master data & pengaturan toko, serta mengekspor laporan CSV.

## Product Purpose

Menyediakan aplikasi web mobile-first khusus untuk YNG Apparel (`@yng.apparel.official`) guna menggantikan pencatatan manual dan template e-commerce fast-fashion yang tidak sesuai dengan alur pakaian custom (varian ukuran, multi-titik sablon, revisi desain, dan pembayaran bertahap). Keberhasilan produk diukur dari kemudahan pelanggan menyusun spesifikasi & melihat harga resmi secara mandiri sejak kunjungan pertama, keteraturan verifikasi desain & pembayaran (Lunas/DP), serta berkurangnya chat berulang ke admin berkat Live Tracker mandiri.

## Positioning

Pendekatan **hybrid** untuk studio pakaian custom independen asal Batam (melayani satuan maupun borongan/tim ke seluruh Indonesia): menggabungkan konfigurator **Custom Lab** terbuka bagi Guest dengan kalkulasi harga resmi tervalidasi server, **Dynamic DP Gatekeeper** (persentase & minimum kuantitas DP dibaca dinamis dari pengaturan server per checkout, bukan hardcoded), serta **Live Tracker tanpa login** (kode order + 4 digit akhir WhatsApp atau magic link) yang menyatukan pesanan website dan **order manual WhatsApp/Instagram** dalam satu alur kerja solo-admin.

## Operating Context

- **Studio & produk:** Brand apparel independen di Batam, berjalan sekitar 4 tahun (Est. 2022), memproduksi kaos lengan pendek, kaos lengan panjang, polo, sweatshirt, hoodie, dan jacket zipper secara custom (satuan & borongan) serta katalog siap jual (_Ready Drops_, Fase 2).
- **Produksi in-house:** Cetak sablon dan penempelan heat-press dikerjakan sendiri oleh pemilik (solo-admin).
- **Pengiriman & pickup:** Melayani pengiriman ke seluruh Indonesia (`SHIP`, ongkir diinput admin setelah pressing & QC dan ditagihkan pada pelunasan/pembayaran akhir) serta ambil di tempat di Batam (`PICKUP`, tanpa alamat/kurir/ongkir).
- **Komunikasi & pembayaran:** Konsultasi warna custom, layanan bantuan desain gratis, dan pembaruan status pelanggan menggunakan tautan WhatsApp (`wa.me` dengan teks siap kirim), bukan WhatsApp Business API otomatis. Pembayaran dilakukan manual melalui transfer bank atau QRIS dengan unggah bukti bayar dan verifikasi admin.

## Capabilities and Constraints

- **Bahasa:** Seluruh teks UI berbahasa Indonesia; nama variabel, tabel, dan endpoint berbahasa Inggris.
- **Role & isolasi data:** Hanya ada 2 role di database (`ADMIN` dan `USER`); Guest bukan role. Seluruh data milik pelanggan (`user_addresses`, `cart_items`, `/me/orders`) terisolasi ketat per `user_id` dan ID internal tidak diekspos pada API publik.
- **Sumber kebenaran harga:** `cart_items` tidak menyimpan harga; seluruh harga, diskon, DP, ongkir, dan sisa tagihan dihitung server dalam integer rupiah penuh tanpa desimal. Aturan DP (`dp_percent`, `dp_min_qty`) dan estimasi produksi dibaca dari `GET /api/catalog/config` dan di-snapshot ke order.
- **Aturan konfigurasi:** Bahan wajib kompatibel dengan model (`model_fabrics`); warna berasal dari preset bahan (`fabric_colors`) atau ditandai eksplisit sebagai "Warna custom (konfirmasi via WhatsApp)"; posisi titik sablon tidak boleh ganda dalam satu item kecuali `OTHER`.
- **Pelacakan kurir eksternal:** URL lacak kurir hanya dibangkitkan dari daftar kurir tetap di `shared/src/couriers.ts`, tanpa menerima URL bebas dari input.
- **Batas & asumsi aplikasi yang masih dapat disesuaikan (`ASSUMPTION`):** Maksimal 20 item per keranjang, maksimal 5 alamat tersimpan per user, batas bayar awal website 24 jam (dapat diubah di `app_settings`), pembersihan keranjang tidak aktif > 30 hari, serta daftar kurir awal menunggu konfirmasi akhir client.
- **Di luar cakupan MVP (ditunda / Fase 2):** Verifikasi email, lupa password, login sosial, payment gateway otomatis, API tracking kurir pihak ketiga, Ready Drops, Tactile Fabric Lab, Recent Production Log, Mockup 2D + Sablon Sizer, DPI Guard otomatis, dan Kolektif Link.

## Brand Commitments

- **Nama & identitas:** YNG Apparel (`@yng.apparel.official`), Batam.
- **Suara & bahasa:** Bahasa Indonesia yang lugas, transparan, modern, dan alami (bukan nada kaku/robotik).
- **Batasan visual mengikat dari pemilik:**
  - Referensi gaya editorial minimalist menswear ala Heymale: monokrom bersih (latar `#ffffff`, permukaan kartu `#f5f5f5`, teks `#111111`, garis tipis `#e5e5e5`), fokus pada foto produk.
  - Pemisahan tipografi: font sans-serif yang luwes dan alami untuk narasi, judul, label, dan keterangan; font monospace / `tabular-price` khusus untuk angka harga/rupiah, jumlah pcs/ukuran, persentase, dan kode teknis.
  - Aset logo wajib: `frontend/public/images/YNG LOGO ESSENTIAL.jpg` (header, footer, favicon) dan `frontend/public/images/YNG LOGO.avif` (emblem/aksen brand).
- **Larangan:** Tidak meniru aset visual brand lain dan tidak memfabrikasi klaim, testimoni, atau metrik.

## Evidence on Hand

- **Aset visual di repo:**
  - `frontend/public/images/YNG LOGO ESSENTIAL.jpg` — wordmark utama untuk header, footer, dan favicon.
  - `frontend/public/images/YNG LOGO.avif` — emblem/aksen identitas brand.
- **Dokumen spesifikasi & rencana:** `docs/SPEC.md` (hasil wawancara client & aturan bisnis), `docs/FRONTEND_PLAN.md`, dan `docs/PROGRESS.md`.
- **Belum tersedia (tidak boleh dikarang):**
  - Foto studio katalog produk (model pakaian, makro serat bahan) dan foto hasil produksi/QC nyata — data seed awal masih berupa placeholder.
  - Testimoni pelanggan, studi kasus, angka penjualan/jumlah pelanggan, dan ulasan nyata.
  - Daftar harga & preset warna final dari client (masih menggunakan seed placeholder).

## Product Principles

1. **Transparansi harga dari server sejak kunjungan pertama:** Guest maupun pelanggan login selalu melihat perhitungan harga resmi server tanpa biaya tersembunyi atau angka hardcoded di UI.
2. **Alur terpandu yang mencegah kesalahan spesifikasi:** Kompatibilitas model–bahan, pemilihan warna preset vs. warna custom, dan syarat DP ditegakkan melalui langkah yang jelas dan divalidasi server.
3. **Efisiensi satu tangan untuk solo-admin:** Operasi harian pemilik di dashboard admin tetap cepat, terbaca, dan mudah dijangkau di layar ponsel.
4. **Kejujuran konten & state kosong:** Tampilkan aset nyata yang ada serta state kosong/placeholder yang jujur tanpa mengarang foto produk, testimoni, atau klaim sosial.
5. **Alur hybrid website & manual WA/IG:** Akun pelanggan penuh berjalan selaras dengan order manual dan Live Tracker tanpa login.

## Accessibility & Inclusion

- **Mobile-first sejak viewport `360px` tanpa horizontal overflow**, dengan target sentuh minimal `44px × 44px` (`min-h-touch`) pada seluruh tombol, kontrol matriks ukuran, dan navigasi (untuk pelanggan maupun operasional satu tangan admin).
- Kontras teks monokrom tinggi (`#111111` pada `#ffffff` / `#f5f5f5`), indikator fokus keyboard yang jelas (`:focus-visible`), serta label form, pesan error (`role="alert"`), dan status live (`aria-live`) dalam Bahasa Indonesia yang jelas.
