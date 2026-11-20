# PROMPT — YNG APPAREL: CUSTOM LAB & PRODUCTION TRACKER (VERSI 2.1 — POSTGRESQL / SUPABASE)

## 0. PERAN & CARA KERJA

Kamu adalah **Senior Full-Stack Engineer dan UI/UX Architect**. Bangun aplikasi web untuk **YNG Apparel (@yng.apparel.official)**, brand apparel independen di Batam yang sudah berjalan 4 tahun dan melayani penjualan ritel serta custom pakaian ke seluruh Indonesia.

**Output:** kode lengkap siap jalan (backend + frontend), **dikerjakan per tahap** sesuai Bagian 11.

Aturan kerja:

1. Kerjakan **satu tahap per respons**. Di akhir tampilkan: daftar file dibuat/diubah, cara menjalankan, dan cara menguji (contoh request).
2. Jangan lanjut ke tahap berikutnya sebelum saya bilang "lanjut".
3. Database **PostgreSQL (di-host di Supabase)** mengacu **persis** pada `backend/db/migrations/001_init.sql` dan `backend/db/migrations/002_accounts_cart.sql` (sumber kebenaran skema aktif saat ini). Semua perubahan skema berikutnya hanya boleh lewat file migrasi bernomor baru (`003_xxx.sql`, dst.) dan beri tahu tim/owner setiap kali skema berubah. File migrasi yang sudah di-merge ke `main` **tidak boleh diedit**. Data contoh placeholder terpisah di `backend/db/seeds/`. Jangan menulis SQL dengan sintaks MySQL.
4. Jika ada ambiguitas kecil, ambil asumsi paling masuk akal, tulis asumsinya, lalu lanjut.
5. Bahasa UI: **Bahasa Indonesia**. Nama variabel/tabel/endpoint: Inggris.
6. Backend harus **stateless**: tidak boleh menyimpan file di disk server dan tidak boleh bergantung pada satu mesin (lihat 6.10 dan 6.4). Semua file lewat object storage.

---

## 1. KONTEKS BISNIS (HASIL WAWANCARA CLIENT)

| Topik | Fakta |
|---|---|
| Jenis usaha | Apparel clothing, berjalan 4 tahun |
| Produk | Kaos lengan pendek, kaos lengan panjang, hoodie, sweatshirt, jacket zipper, polo |
| Model bisnis | **Custom & produksi** (satuan maupun borongan) + produk siap jual |
| Saluran order saat ini | **WhatsApp dan Instagram** |
| Alur kerja | Konsultasi & desain → pilih model, bahan, detail → produksi → pengiriman |
| Data pembeli | Website: akun pelanggan (`users` + `user_addresses`: email, nama lengkap, WhatsApp, alamat tersimpan). Order manual WA/IG: tetap boleh tanpa akun/email (`orders.user_id NULL`) |
| Desain | Pembeli bisa desain sendiri, atau minta dibantu |
| Harga | Tergantung ukuran sablon dan pilihan produk. Order grosir/negosiasi kadang diberi potongan |
| Pembayaran | **DP 70% untuk minimal 12 pcs**; di bawah itu lunas. Via **QRIS / transfer** |
| Produksi | Mencetak sablon lalu menempelkannya ke produk (**heat-press**) |
| Operasional | **Dikerjakan sendiri oleh pemilik** (satu admin) |
| Pencatatan | Ada catatan saat order masuk (saat ini manual) |
| Komplain | Sangat jarang, dampaknya hanya feedback |

### Masalah yang diselesaikan
Template e-commerce fast-fashion serba ready-stock tidak cocok untuk bisnis pakaian custom dengan varian ukuran, titik sablon, revisi desain, dan pembayaran bertahap (DP/Pelunasan). YNG Apparel memakai pendekatan **hybrid**: **Guest** bebas melihat katalog serta mencoba konfigurator & kalkulator harga Custom Lab tanpa login; pelanggan login (**USER**) memakai **keranjang Custom Lab**, alamat tersimpan, dan halaman **Pesanan Saya**; sementara pemilik tetap dapat merekap **order manual WhatsApp/IG tanpa akun** serta menyediakan **Live Tracker tanpa login** (kode order + 4 digit akhir WhatsApp / magic link) agar pelanggan memantau produksi tanpa chat berulang.

---

## 2. KEPUTUSAN & ASUMSI (BELUM DIKONFIRMASI CLIENT, BISA DIUBAH)

Jalankan sesuai asumsi ini. Tandai di kode dengan komentar `// ASSUMPTION` agar mudah dicari.

### Riwayat Keputusan (2026-11-19 — Final dari Client/Tim)
1. **Role sistem hanya `ADMIN` dan `USER`** (`user_role_t`). **Guest bukan role**: Guest adalah pengunjung tanpa token login (boleh melihat beranda, katalog, konfigurator & kalkulator harga, dan Live Tracker). Login diminta saat menambah ke keranjang, upload desain, mengelola akun/alamat, checkout, dan melihat **Pesanan Saya**.
2. **Skema akun & keranjang (Migrasi `002_accounts_cart.sql`):** tabel `users` menggantikan `admin_users`, ditambah `user_addresses`, `cart_items`, dan kolom `orders.user_id` (boleh `NULL` untuk order manual WA/IG).
3. **Keranjang Custom Lab:** satu user = satu keranjang; satu baris `cart_items` menyimpan satu konfigurasi lengkap di JSONB `config` **tanpa menyimpan harga** (harga selalu dihitung ulang server lewat `pricingService`). Gatekeeper DP dihitung dari total qty item yang **dicentang** saat checkout. File desain keranjang disimpan di bucket `designs` prefix `carts/<user_uuid>/...` (tidak dibersihkan oleh job `tmp/`) lalu dipindah ke `orders/<transaction_uuid>/...` saat checkout.
4. **Tracking pengiriman eksternal:** tanpa tabel baru dan tanpa API kurir pihak ketiga; memakai `orders.shipping_courier`, `shipping_service`, dan `tracking_receipt_number` yang sudah ada serta daftar kurir tetap di `shared/src/couriers.ts`.
5. **Order manual & Live Tracker tanpa login tetap berlaku**, berdampingan dengan halaman **Pesanan Saya** bagi pelanggan login.
6. **Ditunda (di luar cakupan saat ini):** verifikasi email, lupa password, login sosial, payment gateway, dan integrasi API tracking pihak ketiga. Login memakai email + password.

| # | Asumsi | Dampak jika berubah |
|---|---|---|
| A1 | **Ready Drops** = katalog tampil saja, pembelian lewat tombol "Pesan via WhatsApp" (tanpa keranjang/stok otomatis). Masuk **Fase 2** | Jika client mau checkout ready-stock penuh, perlu modul terpisah |
| A2 | **Ongkir diinput admin** setelah pressing & QC (bukan dihitung otomatis dari kurir) | Jika mau otomatis, perlu integrasi API ongkir |
| A3 | DP dan 100% dihitung dari **subtotal bersih** = subtotal produk − diskon. Ongkir ditagihkan di **pembayaran akhir** | Mengubah alur tahap 4 |
| A4 | Pelanggan menerima update lewat **link WhatsApp** (`wa.me` dengan teks siap kirim), **bukan** WhatsApp API otomatis | Jika mau otomatis, perlu WA Business API |
| A5 | Tabel harga dan preset warna di seed SQL hanyalah **placeholder** | Wajib diisi data asli sebelum dipakai |
| A6 | Batas bayar awal **24 jam** untuk order WEBSITE, bisa diubah di `app_settings`. Order manual tidak auto-batal | - |
| A7 | Minimum DP (**12 pcs**) dihitung dari **total semua item yang dicentang saat checkout**, dibaca dari `app_settings.dp_min_qty` dan di-snapshot ke order | - |
| A8 | Ada opsi **ambil di tempat** (`PICKUP`): tanpa alamat, kurir, resi, dan ongkir | Jika tidak ada, hapus opsi ini |
| A9 | Layanan **"Bantu desainkan saya" gratis** (tidak menambah harga) | Jika berbayar, perlu kolom biaya desain dan perubahan rumus |
| A10 | **Diskon manual order-level** oleh admin. Tidak ada harga grosir bertingkat otomatis | Jika ada tier harga, perlu tabel aturan diskon |
| A11 | **Edit isi order** hanya oleh admin, hanya saat `NEW_ORDER` dan belum ada pembayaran `VERIFIED` (lihat 6.11). Di luar itu: batalkan dan buat order baru | Jika perlu edit saat produksi, perlu alur penyesuaian tagihan |
| A12 | Order dibatalkan setelah ada pembayaran `VERIFIED`: dana **tidak otomatis kembali**. Admin mencatat `refunded_amount` (0 = hangus). **Omzet = total pembayaran VERIFIED − total refunded_amount** | - |
| A13 | **Hosting data:** Supabase (PostgreSQL + Storage). Backend Node.js stateless di host mana pun (Railway/Render/Fly/VPS). Frontend static host | Lihat bagian 13 |
| A14 | **Notifikasi admin via bot Telegram** (opsional, aktif jika env diisi): order baru, bukti bayar masuk | Jika tidak diinginkan, kosongkan env |
| A15 | Format file desain publik: PNG, JPG, WEBP, SVG, PDF. Admin boleh tambahan PSD, AI, CDR, EPS, ZIP | - |
| A16 | Perpindahan `NEW_ORDER → PRINT_QUEUE` **ditekan admin** (bukan otomatis). Sistem hanya menandai badge "Siap diproses" ketika syarat terpenuhi | Jika mau otomatis, ubah di orderService |
| A17 | Batas **20 item per keranjang** dan **5 alamat tersimpan per user** (`ASSUMPTION`, konstanta aplikasi) | Ubah konstanta di `backend/src/config/constants.ts` |
| A18 | Item keranjang + file `designs/carts/<user_uuid>/...` yang tidak disentuh **> 30 hari** dibersihkan oleh scheduler (`ASSUMPTION`, konstanta aplikasi, bukan migrasi) | Ubah konstanta `CART_INACTIVE_TTL_DAYS` |
| A19 | Daftar kurir awal (`JNE`, `JNT`, `SICEPAT`, `ANTERAJA`, `POS`, `NINJA`, `GOJEK`, `GRAB`, `OTHER`) + URL lacak resmi di `shared/src/couriers.ts` (`ASSUMPTION`, menunggu konfirmasi akhir client) | Perbarui `shared/src/couriers.ts` |

---

## 3. SCOPE: MVP vs FASE 2

### MVP (kerjakan dulu)
1. **Custom Lab**: pilih model → bahan → warna (preset per bahan atau warna custom) → matriks ukuran → titik sablon + upload desain, dengan **harga real-time** (Guest bebas konfigurasi & hitung harga)
2. **Akun pelanggan (`USER`) + Keranjang Custom Lab + Alamat tersimpan + Checkout dengan gatekeeper DP** (dihitung dari total qty item yang dicentang) + halaman **Pesanan Saya** + tombol lacak resi kurir eksternal
3. **Upload bukti bayar** (QRIS / transfer) per tahap pembayaran
4. **Live Tracker** tanpa login (kode order + verifikasi 4 digit akhir WhatsApp, atau magic link) tetap tersedia untuk semua pesanan (termasuk order manual WA/IG)
5. **Solo-Admin Dashboard**: Kanban produksi, verifikasi bayar, cetak **SPK PDF**, upload foto QC, input ongkir & kurir/resi, diskon, catatan, tombol kirim update via WhatsApp
6. **Input order manual** oleh admin (untuk order dari WhatsApp/IG, `user_id` boleh `NULL`): alamat boleh menyusul, pembayaran yang sudah diterima bisa langsung dicatat, file desain bisa diunggah admin
7. **Edit isi order** terbatas oleh admin (aturan 6.11)
8. Master data (model, bahan, **warna per bahan**, ukuran, harga sablon, rekening/QRIS, pengaturan)
9. Laporan dasar (omzet, jumlah order, model terlaris) + export CSV
10. Notifikasi Telegram ke admin (opsional)

### FASE 2 (tabel sudah ada di SQL, kerjakan setelah MVP stabil)
- **Fabric Lab** interaktif (close-up serat, GSM, ketebalan, kenyamanan)
- **Recent Production Log** (rekap batch produksi nyata)
- **Mockup 2D flat-lay** + Sablon Sizer visual
- **DPI Guard** (deteksi resolusi desain)
- **Kolektif Link** (patungan ukuran komunitas)
- **Ready Drops** (katalog siap jual)

---

## 4. DESIGN LANGUAGE

**Editorial Minimalist Menswear / Monochrome Brutalist**, mobile-first.

- Warna: hitam pekat `#09090b`, putih tulang `#fafafa`, abu netral untuk teks sekunder. Satu aksen sangat terbatas (untuk status/peringatan saja).
- Border tajam (radius 0 atau sangat kecil), garis 1px solid, tanpa bayangan lembut/gradient.
- Tipografi bersih dan tegas: heading uppercase/tracking lebar (mis. Inter / Space Grotesk / sejenis), body netral. Angka harga memakai font monospace/tabular.
- Banyak ruang putih, grid tegas, foto produk besar.
- Referensi pengalaman: **bukan** template fast-fashion. Jangan meniru aset visual brand lain.
- Admin dashboard dirancang untuk **dipakai satu tangan di HP**: tombol besar (min 44px), kolom Kanban bisa digeser horizontal, aksi cepat di bagian bawah layar.
- Sertakan loading state, empty state, dan pesan error yang jelas.

---

## 5. ALUR PENGGUNA & HAK AKSES

### Matriks Pengguna & Hak Akses (`Guest` / `USER` / `ADMIN`)
| Peran / Status | Catatan | Akses |
|---|---|---|
| **Guest** *(pengunjung tanpa token, BUKAN role DB)* | Tidak ada role `GUEST` di database | Beranda (`/`), katalog & lookbook, konfigurator & kalkulator harga Custom Lab (`/custom-lab`), Live Tracker publik (`/track`, `/track/:uuid`), halaman `/login` & `/register`. Jika membuka rute terlindungi, diarahkan ke `/login` dan dikembalikan ke rute semula setelah login |
| **`USER`** *(pelanggan login)* | Registrasi publik selalu menghasilkan `USER` | Semua akses Guest + upload file desain, kelola keranjang (`/keranjang`), profil & alamat tersimpan (`/akun`), checkout item tercentang (`/checkout`), daftar & detail **Pesanan Saya** (`/pesanan`, `/pesanan/:uuid`), upload bukti bayar |
| **`ADMIN`** *(pemilik / operasional)* | Dibuat lewat `npm run seed:admin` | Semua akses admin (`/admin/*`: Kanban produksi, verifikasi bayar, SPK PDF, foto QC, ongkir, kurir & resi, diskon, edit order, input order manual, master data, pengaturan, laporan) |

### Rute 1 — Publik: Katalog & Lookbook
- Halaman utama (`/`) dengan tab: **Custom Lab** (utama) dan **Ready Drops** (Fase 2).
- Fase 2: **Tactile Fabric Lab** (serat, GSM, ketebalan 1–5, kenyamanan: Cotton Combed 30s/24s, Pique CVC, Baby Terry, Cotton Fleece 280) dan **Recent Production Log** (foto hasil press, jumlah pcs, kota tujuan).
- Tombol "Hubungi via WhatsApp" selalu tersedia.

### Rute 2 — Custom Lab, Keranjang (`/keranjang`), & Checkout (`/checkout`)
Langkah konfigurasi (wizard di mobile, dapat dicoba Guest untuk simulasi harga):
1. **Model** pakaian (kaos pendek/panjang, polo, sweatshirt, hoodie, jacket zipper)
2. **Bahan** (hanya bahan yang valid untuk model tersebut, dari `model_fabrics`) dan **warna**: pilih dari preset `fabric_colors` milik bahan itu, atau opsi **"Warna custom (konfirmasi via WhatsApp)"** (`is_custom_color = true`, nama warna bebas, hex opsional). Pelanggan tidak boleh memakai color picker bebas tanpa menandai warna custom.
3. **Matriks Size Roster**: input jumlah per ukuran S, M, L, XL, XXL. XXL ada tambahan harga
4. **Titik sablon**: tambah banyak titik (posisi + ukuran Logo/A5/A4/A3 + upload file desain, atau centang "Bantu desainkan saya"). Tiap titik menambah harga. Satu posisi hanya boleh satu kali per item (kecuali `OTHER`). *Login (`USER`) diperlukan saat mengunggah desain.*
5. **Simpan ke Keranjang (`/keranjang`):** Login diminta saat klik **"Tambah ke Keranjang"**. Satu user = satu keranjang (maks 20 item, `ASSUMPTION`). Bisa menambah beberapa konfigurasi item berbeda (mis. 10 kaos + 5 hoodie). Harga tidak disimpan di keranjang; server menghitung ulang setiap keranjang dibuka.
6. **Checkout (`/checkout`):** Dari keranjang, pelanggan mencentang item yang ingin dibeli lalu melanjutkan ke checkout:
   - **Pilih pengiriman:** kirim ke alamat (`SHIP`: pilih dari alamat tersimpan atau isi nama, WhatsApp, provinsi, kota/kab, kecamatan, kode pos, alamat lengkap — **semua wajib**) atau **ambil di tempat** (`PICKUP`: nama + WhatsApp saja).
   - **Ringkasan harga & pilih skema bayar** lalu konfirmasi pesanan → bayar manual + upload bukti.

**Harga tampil real-time** di layar (panel ringkasan sticky). Frontend boleh menghitung lokal untuk UX, tetapi **server adalah sumber kebenaran** (`POST /api/pricing/quote`, `GET /api/cart/items`, dan saat `POST /api/orders`).

**Dynamic DP Gatekeeper**
- Total qty **item yang dicentang pada checkout tersebut** `< dp_min_qty` (12) → opsi bayar dikunci **Lunas** (`FULL`).
- Total qty **item yang dicentang** `≥ dp_min_qty` → opsi **DP** terbuka otomatis (`DP`): DP `dp_percent`% di awal, pelunasan sisa + ongkir di akhir. Pelanggan tetap boleh memilih lunas.
- Jika pelanggan mengubah pilihan/qty item tercentang hingga di bawah ambang, pilihan DP otomatis terkunci dan reset ke `FULL`.
- Label UI **tidak boleh hardcode "70%" atau "12 pcs"**: baca dari `GET /api/catalog/config` (sebelum order) atau `dp_percent_snapshot` (setelah order).

**Fase 2:** Mockup 2D + Sablon Sizer, DPI Guard, Kolektif Link.

### Rute 3 — Akun (`/login`, `/register`, `/akun`), Pesanan Saya (`/pesanan`), & Live Tracker (`/track`)
- **Autentikasi & Akun:** `/login` (satu form login untuk `USER` & `ADMIN`; setelah login diarahkan kembali ke halaman asal atau beranda/admin sesuai role), `/register` (buat akun `USER`), `/akun` (profil + kelola maks 5 alamat tersimpan + ganti password + nonaktifkan akun).
- **Pesanan Saya (`/pesanan`, `/pesanan/:uuid`):** Hanya pemilik akun (`user_id`); menampilkan daftar & detail pesanan milik sendiri beserta rincian item, pembayaran, foto QC, dan tracking pengiriman.
- **Live Tracker tanpa login (`/track`, `/track/:uuid`):**
  - Akses 1: input **kode order** (mis. `YNG-K7M2QX`) + **4 digit terakhir nomor WhatsApp** (tetap berlaku untuk order manual WA/IG maupun order website).
  - Akses 2: **magic link** `/track/:transaction_uuid` (dikirim lewat WhatsApp).
  - Pada Live Tracker publik, jangan menampilkan alamat lengkap penuh — tampilkan hanya kota/provinsi (boleh kosong bila alamat belum diisi) dan nama tersamarkan.
- **Tampilan Status & Tracking Eksternal (di `/pesanan/:uuid` dan `/track`):**
  - Menampilkan 5 tahap: **Order Masuk & Cek Desain → Antre Cetak → Pressing & QC → Pelunasan → Pengiriman** (untuk `PICKUP` tahap terakhir berlabel **Siap Diambil**). Tahap Pelunasan ditandai "dilewati" jika tidak ada sisa tagihan.
  - Menampilkan: status desain (+catatan revisi), ringkasan item, **diskon (jika ada)**, **foto QC** (signed URL berumur pendek), rincian tagihan per tahap, tombol **upload bukti** untuk tagihan yang masih terbuka (DP awal, pelunasan, ongkir), serta **kurir + nomor resi**.
  - **Tracking kurir eksternal:** apabila kurir memiliki URL pelacakan resmi di `shared/src/couriers.ts` (bukan `OTHER` dan bukan kurir instan tanpa halaman lacak seperti `GOJEK`/`GRAB`), tampilkan tombol yang membuka situs lacak resmi kurir (disertai tombol salin resi bila `supportsDeepLink: false`).

### Rute 4 — Solo-Admin Dashboard (Production Kanban)
Kolom Kanban:
1. **Order Masuk & Cek Desain** (`NEW_ORDER`)
2. **Antrean Cetak Sablon** (`PRINT_QUEUE`), tombol **Cetak SPK (PDF)**
3. **Pressing & QC** (`PRESSING_QC`), upload foto QC (boleh lebih dari satu)
4. **Menunggu Pelunasan** (`AWAITING_SETTLEMENT`)
5. **Pengiriman / Siap Diambil** (`SHIPPING`), pilih kurir dari daftar tetap + isi layanan & resi (kecuali `PICKUP`)
(+ arsip: `COMPLETED`, `CANCELLED`)

Fitur admin: kartu order ringkas (kode, nama, total pcs, badge DP/Lunas, badge status bayar, badge "Siap diproses", badge "Alamat belum lengkap", badge "Warna custom", badge DPI), detail order, verifikasi pembayaran, diskon, edit alamat, edit isi order (6.11), catatan internal, riwayat status, tombol **"Kirim update via WhatsApp"** (template teks per tahap), **input order manual** (source WHATSAPP/INSTAGRAM/MANUAL).

### Rute 5 — Admin: Master Data & Laporan
Kelola model, bahan, **warna per bahan**, relasi model-bahan, ukuran (+biaya ekstra), ukuran sablon (+harga), rekening/QRIS, pengaturan (`app_settings`), laporan.

---

## 6. ATURAN BISNIS (WAJIB DIIKUTI)

### 6.1 Rumus Harga (dihitung server)
```
harga_satuan(ukuran) = model.base_price
                     + fabric.additional_price
                     + size.extra_charge
                     + SUM(print_size.price_per_spot  untuk semua titik sablon item itu)

line_subtotal(item)  = SUM( qty_ukuran × harga_satuan(ukuran) )
subtotal_amount      = SUM(line_subtotal semua item)
total_qty            = SUM(qty semua ukuran semua item)

subtotal_bersih      = subtotal_amount − discount_amount
grand_total          = subtotal_bersih + shipping_cost     (GENERATED COLUMN di DB, jangan ditulis manual)
```
- Semua nilai harga **di-snapshot** ke kolom `locked_*` saat order dibuat. Perubahan harga master tidak boleh mengubah order lama. Pembulatan: rupiah bulat (tanpa desimal).
- `discount_amount` default 0 (order WEBSITE selalu 0). Hanya admin yang mengisinya (order manual atau `PUT /api/admin/orders/:id/discount`) dengan alasan di `discount_note`. Syarat: `0 ≤ diskon ≤ subtotal_amount`. Perubahan diskon mengikuti aturan 6.11 (hanya bila belum ada pembayaran VERIFIED dan tagihan awal belum memiliki bukti).

### 6.2 Skema Pembayaran
| Kondisi | `payment_scheme` | `dp_required_amount` | Tahap bayar |
|---|---|---|---|
| total_qty < dp_min_qty | `FULL` | = subtotal_bersih | `FULL`, lalu `SHIPPING_FEE` bila ongkir > 0 |
| total_qty ≥ dp_min_qty, pilih DP | `DP` | = ROUND(subtotal_bersih × dp_percent_snapshot / 100) | `DP`, lalu `SETTLEMENT` (sisa + ongkir) |
| total_qty ≥ dp_min_qty, pilih lunas | `FULL` | = subtotal_bersih | `FULL`, lalu `SHIPPING_FEE` |

- `dp_min_qty` dan `dp_percent` dibaca dari `app_settings`, lalu disimpan ke `dp_min_qty_snapshot` (selalu diisi) dan `dp_percent_snapshot` (**hanya diisi bila skema `DP`**, NULL untuk `FULL`; DB menolak kombinasi lain).
- Jumlah tagihan tahap akhir: skema `DP` → `SETTLEMENT = grand_total − jumlah DP yang VERIFIED`; skema `FULL` → `SHIPPING_FEE = shipping_cost`. Jika hasilnya ≤ 0, baris tagihan tidak dibuat.
- `remaining_balance` = grand_total − SUM(payments VERIFIED). Perbarui dalam transaksi yang sama saat verifikasi, input ongkir, diskon, atau edit order.
- `payment_scheme = DP` dengan total_qty di bawah `dp_min_qty_snapshot` **harus ditolak server** (DB juga menolak lewat CHECK).

### 6.3 Mesin Status Produksi
```
NEW_ORDER ──(desain APPROVED + bayar awal VERIFIED, admin menekan)──> PRINT_QUEUE
PRINT_QUEUE ──(admin mulai/selesai cetak)─────────────────────────────> PRESSING_QC
PRESSING_QC ──(≥1 foto QC + ongkir diinput*)──┬─> AWAITING_SETTLEMENT  (jika remaining_balance > 0)
                                              └─> SHIPPING            (jika remaining_balance = 0)
AWAITING_SETTLEMENT ──(pembayaran akhir VERIFIED)─────────────────────> SHIPPING
SHIPPING ──(admin tandai selesai / otomatis N hari)───────────────────> COMPLETED
NEW_ORDER / PRINT_QUEUE ──(admin / expired)───────────────────────────> CANCELLED
```
\* Untuk `PICKUP`, ongkir otomatis 0 (langkah input ongkir dilewati).

- Loncat status ditolak. Setiap perpindahan dicatat di `order_status_history`.
- Masuk `PRINT_QUEUE` hanya jika `design_status = APPROVED` **dan** pembayaran awal `VERIFIED`. Admin yang menekan; sistem menampilkan badge "Siap diproses" saat syarat terpenuhi (A16).
- `design_status`: `PENDING` → `NEED_REVISION` (dengan catatan, pelanggan diberi tahu via WA) → `APPROVED`. Item dengan `needs_design_help` wajib melewati tahap konsultasi desain dulu. Item `is_custom_color` wajib dikonfirmasi ketersediaan warnanya via WA sebelum desain disetujui (catat di `admin_notes`).
- Masuk `SHIPPING` untuk `fulfillment_type = SHIP` wajib: **alamat lengkap terisi** (provinsi, kota, kecamatan, kode pos, alamat) dan **kurir + nomor resi** (kurir instan tanpa resi: isi dengan kode booking/nama driver). Untuk `PICKUP`: tidak wajib; `shipped_at` diisi sebagai waktu siap diambil. DB menegakkan aturan ini lewat CHECK, jadi server harus memeriksanya lebih dulu dan mengembalikan pesan yang jelas.
- **Pembatalan** (`PUT /api/admin/orders/:id/cancel`) hanya dari `NEW_ORDER` / `PRINT_QUEUE`. Jika sudah ada pembayaran `VERIFIED`, body **wajib** memuat `refundedAmount` (0 = hangus; maksimum = total VERIFIED). Order `CANCELLED` menolak upload bukti baru.
- Setelah barang diproduksi (`PRESSING_QC` dan seterusnya), order **tidak lagi otomatis dibatalkan**. Pelunasan hanya diingatkan lewat WhatsApp.

### 6.4 Job Terjadwal (`node-cron`) — aman untuk lebih dari satu instance
- Order `NEW_ORDER` dengan pembayaran awal belum `VERIFIED` setelah `payment_due_at` → `CANCELLED`, alasan "Pembayaran tidak diterima". **Lewati order dengan `payment_due_at IS NULL`** (order manual).
- Order `SHIPPING` lebih dari `auto_complete_days` (default 7) → `COMPLETED`.
- **Pembersih file sementara:** hapus objek di bucket `designs` pada prefix `tmp/` yang lebih tua dari `temp_upload_ttl_hours` (default 24 jam). **TIDAK boleh menyentuh prefix `carts/`**.
- **Pembersih keranjang kedaluwarsa (`ASSUMPTION`):** hapus baris `cart_items` beserta file `designs/carts/<user_uuid>/...` terkait (yang belum dipakai item keranjang/order lain) yang tidak disentuh (`updated_at`) lebih dari **30 hari** (`CART_INACTIVE_TTL_DAYS`).
- Jalankan tiap 10 menit (atau harian untuk keranjang kedaluwarsa) dengan zona waktu `Asia/Jakarta`.
- **Setiap job dijalankan di dalam transaksi yang diawali `SELECT pg_try_advisory_xact_lock(<kunci tetap per job>)`**. Jika hasilnya `false`, lewati (instance lain sedang menjalankannya). Gunakan varian *xact*, bukan session lock, karena connection pooler Supabase tidak menjaga session.

### 6.5 Pembayaran
- Satu baris `payments` per (order, tahap). Dibuat otomatis oleh sistem: tahap awal saat order dibuat; tahap akhir saat ongkir diinput.
- Pelanggan memilih metode (QRIS / transfer), melihat info rekening dari `payment_accounts`, lalu upload bukti → `proof_image_path` terisi (menunggu verifikasi). Upload ulang menggantikan bukti lama (hapus objek lama dari storage).
- Admin: **verifikasi** (`VERIFIED`, mengisi `verified_at`, `verified_by`) atau **tolak** dengan alasan wajib (`REJECTED`). Jika ditolak, pelanggan upload ulang pada baris yang sama dan status kembali `PENDING` (kosongkan `rejection_reason`).
- **Nominal tidak cocok** (kurang/lebih dari tagihan): admin menolak dengan alasan dan meminta transfer ulang/penyesuaian via WA. Kelebihan bayar diurus manual di luar sistem.
- `payments.status` adalah sumber kebenaran status bayar.
- **Order manual dengan pembayaran sudah diterima:** `POST /api/admin/orders/manual` menerima `paymentReceived` (metode, bukti opsional). Baris tagihan awal langsung `VERIFIED` (`verified_by` = admin pembuat), tanpa menunggu upload.

**Revisi ongkir (`PUT /api/admin/orders/:id/shipping-cost`)** — dalam satu transaksi, kunci baris `orders` dan baris `payments` tahap akhir dengan `FOR UPDATE`:
1. Hanya boleh saat status `PRESSING_QC` atau `AWAITING_SETTLEMENT` (selain itu 409). `PICKUP` tidak memakai ongkir.
2. Hitung ulang jumlah tagihan tahap akhir sesuai 6.2.
3. Tentukan tindakan berdasarkan kondisi baris tahap akhir:
   - **Belum ada baris:** jika jumlah > 0 → `INSERT`; jika 0 → tidak ada baris.
   - **`VERIFIED`:** **tolak** (409, "ongkir tidak bisa diubah, pembayaran sudah terverifikasi").
   - **`PENDING` dengan bukti sudah diupload** (customer sudah transfer nominal lama): **tolak** (409), admin harus menolak (`REJECTED`) pembayaran itu dulu agar customer upload ulang sesuai nominal baru.
   - **`PENDING` tanpa bukti, atau `REJECTED`:** jika jumlah baru > 0 → `UPDATE amount`; jika 0 → `DELETE` baris.
   - Implementasi atomik yang disarankan:
     ```sql
     INSERT INTO payments (order_id, payment_stage, amount) VALUES ($1, $2, $3)
     ON CONFLICT (order_id, payment_stage) DO UPDATE SET amount = EXCLUDED.amount
     WHERE payments.status <> 'VERIFIED'
       AND (payments.status = 'REJECTED' OR payments.proof_image_path IS NULL)
     RETURNING id;
     ```
     Jika `RETURNING` kosong pada baris yang sudah ada → kembalikan 409.
4. Perbarui `orders.shipping_cost` dan `remaining_balance`. Jika order sedang `AWAITING_SETTLEMENT` dan `remaining_balance` menjadi 0, izinkan lanjut ke `SHIPPING`.
5. Catat perubahan di `order_status_history` (kolom `notes`).

### 6.6 Kode Order & Keamanan Tracker
- `order_code`: `YNG-` + **6 karakter acak unik** dari alfabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (tanpa karakter yang mirip: O/0, I/1/L), contoh `YNG-K7M2QX`. Buat dengan `crypto.randomInt`. Jika bentrok (`23505`), generate ulang.
- Kode masih relatif pendek, karena itu tracker manual **wajib** menyertakan 4 digit terakhir nomor WhatsApp.
- `transaction_uuid` dipakai untuk magic link dan endpoint upload bukti. Jangan pernah mengekspos `id` internal (BIGINT identity) di API publik.
- Rate limit ketat pada endpoint tracker. Respons gagal selalu generik ("Pesanan tidak ditemukan") agar kode tidak bisa dienumerasi.
- Normalisasi nomor WhatsApp ke format `62xxxxxxxxxx` (0812… → 62812…). Database menolak nomor yang tidak berawalan `62` (CHECK constraint), jadi normalisasi wajib dilakukan sebelum insert.
- **Idempotensi:** `POST /api/orders` menerima header `Idempotency-Key` (UUID dibuat frontend per percobaan checkout), disimpan di `orders.idempotency_key` (UNIQUE). Request ulang dengan key yang sama mengembalikan order yang sudah ada, bukan membuat baru.

### 6.7 WhatsApp (tanpa API)
Sediakan helper yang membuat tautan `https://wa.me/<nomor>?text=<teks ter-encode>`:
- Pelanggan → admin: tombol "Tanya via WhatsApp" dengan teks berisi kode order.
- Admin → pelanggan: tombol "Kirim update" dengan template per tahap (order diterima, desain perlu revisi, konfirmasi warna custom, DP/pembayaran terverifikasi, masuk antrean cetak, foto QC & tagihan pelunasan, barang dikirim + resi / siap diambil).

### 6.8 Upload File
Semua upload **melewati backend** (Multer `memoryStorage`, bukan disk), divalidasi, diproses di memori, lalu dikirim ke object storage (6.10).
- **Desain (publik):** PNG (utama), JPG, WEBP, SVG, PDF. Maks sesuai `max_design_file_mb` (default 20 MB). Validasi **MIME asli lewat magic bytes** (mis. paket `file-type`), bukan hanya ekstensi. SVG disanitasi atau disajikan sebagai unduhan, tidak pernah di-render inline.
- **Desain (admin, untuk order manual):** ditambah PSD, AI, CDR, EPS, ZIP. Validasi ekstensi whitelist + magic bytes bila diketahui (PSD `8BPS`, AI/PDF `%PDF`, EPS `%!PS`, ZIP `PK`, CDR `RIFF....CDR`). Selalu disajikan sebagai unduhan (`Content-Disposition: attachment`).
- Upload desain publik **wajib login** (`USER`/`ADMIN`). Untuk item keranjang, file disimpan di bucket `designs` prefix **`carts/<user_uuid>/<acak>.<ext>`** (atau `tmp/<acak>.<ext>` jika sementara) dan mengembalikan `file_ref`. Saat `POST /api/orders` sukses, server **memindahkan** objek dari `carts/<user_uuid>/...` (atau `tmp/...`) ke `designs/orders/<transaction_uuid>/<acak>.<ext>` dan mengisi `raw_design_file_path`. File di prefix `carts/` **tidak** dibersihkan oleh job `tmp/` 24 jam, dan hanya dihapus saat item keranjang dihapus atau tidak disentuh > 30 hari.
- Bukti bayar dan foto QC: JPG/PNG/WEBP, maks 5 MB, kompres/resize dengan `sharp`.
- Nama file selalu acak (≥128 bit entropi), nama asli disimpan di `design_file_name`.
- **Fase 2 (DPI Guard):** hitung `effective_dpi = pixel_lebar / (lebar_cm_sablon / 2.54)` dengan `sharp`. Status `OK` ≥ `dpi_ok_min` (150), `WARNING` antara `dpi_warn_min` (100) dan 150, `LOW` di bawah 100. Peringatkan pelanggan, **jangan blokir** order. Simpan hasil ke `order_item_prints`.

### 6.9 SPK (Surat Perintah Kerja) PDF
Dibuat dengan `pdfkit`, berisi: kode order, tanggal, nama pelanggan, **jenis pengiriman (kirim / ambil di tempat + kota tujuan)**, daftar item (model, bahan, warna + swatch, penanda **warna custom**), **matriks ukuran**, daftar titik sablon (posisi, ukuran, nama file desain), catatan produksi, catatan admin, estimasi selesai. Format A4, mudah dibaca di dekat mesin press. SPK **tidak memuat harga**.
- Gambar desain diambil dari storage sebagai buffer. Hanya PNG/JPG/WEBP yang disematkan (WEBP dikonversi via `sharp`); format lain (SVG, PDF, PSD, AI, CDR) cukup menampilkan nama file.

### 6.10 Penyimpanan File (Supabase Storage)
Backend memakai **`storageService.js`** sebagai satu-satunya pintu ke storage, dengan antarmuka: `upload`, `move`, `remove`, `list`, `getPublicUrl`, `getSignedUrl`. Implementasi awal memakai `@supabase/supabase-js` dengan **service role key (hanya di backend)**. Antarmuka dibuat netral agar bisa diganti ke S3/Cloudflare R2 tanpa mengubah controller (`STORAGE_DRIVER=supabase`).

| Bucket | Akses | Isi | Pola path |
|---|---|---|---|
| `catalog` | **publik** | gambar model/bahan, QRIS, production log, ready drops | `models/…`, `fabrics/…`, `qris/…`, `logs/…`, `ready/…` |
| `designs` | privat | file desain customer | `carts/<user_uuid>/…`, `tmp/…`, lalu `orders/<transaction_uuid>/…` |
| `payment-proofs` | privat | bukti bayar | `<transaction_uuid>/<payment_uuid>/…` |
| `qc-photos` | privat | foto QC | `<transaction_uuid>/…` |

- Kolom DB bernama `*_path` menyimpan **path objek di dalam bucket**, bukan URL. Backend membuat URL saat respons: URL publik untuk bucket `catalog`, **signed URL** (`signed_url_expiry_seconds`, default 3600 detik) untuk bucket privat.
- Respons yang memuat signed URL memakai `Cache-Control: no-store`. Frontend **tidak pernah** memegang kunci Supabase dan tidak memanggil Supabase langsung; semua lewat API Express.
- Bucket dibuat oleh `scripts/initStorage.js` (idempoten): set privat/publik, batas ukuran, dan daftar MIME yang diizinkan.
- Saat baris dihapus/diganti (mis. bukti diupload ulang, foto QC dihapus, order edit), hapus objek terkait agar storage tidak menumpuk.

### 6.11 Edit Isi Order oleh Admin
Endpoint `PUT /api/admin/orders/:id/items` (mengganti seluruh item/ukuran/sablon), `PUT /api/admin/orders/:id/discount`, dan `PUT /api/admin/orders/:id/address`:
- **Alamat** boleh diedit kapan pun sebelum `COMPLETED` (tidak memengaruhi tagihan).
- **Item dan diskon** hanya boleh bila `production_status = NEW_ORDER` **dan** tidak ada pembayaran `VERIFIED`. Selain itu → 409 ("batalkan dan buat order baru").
- Jika tagihan awal berstatus `PENDING` **dengan bukti sudah diupload**, tolak (409) sampai admin menolak (`REJECTED`) pembayaran itu.
- Hitung ulang dengan `pricingService` (harga master saat ini, snapshot diperbarui): `subtotal_amount`, `total_qty`, `dp_required_amount`, `remaining_balance`, lalu **UPDATE** nominal tagihan awal (jangan insert baru).
- Jika `total_qty` turun di bawah `dp_min_qty_snapshot` dan skema `DP`, skema dipaksa menjadi `FULL` (`dp_percent_snapshot = NULL`) dan tahap tagihan awal berubah ke `FULL`; admin diberi peringatan dan teks WA konfirmasi ke customer.
- Seluruhnya dalam satu transaksi dengan `FOR UPDATE`, dan dicatat di `order_status_history.notes`.

### 6.12 Notifikasi Admin (opsional)
`notificationService.js` mengirim pesan ke bot Telegram admin (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) untuk: order baru, bukti bayar masuk, customer upload revisi. Jika env kosong, layanan ini **no-op** (tidak error). Pengiriman gagal tidak boleh menggagalkan transaksi utama (fire-and-forget dengan log error). Pesan tidak memuat alamat lengkap.

---

## 7. STRUKTUR DATABASE (24 TABEL APLIKASI + `schema_migrations`)

Lihat **`backend/db/migrations/`** (skema aktif pada `backend/db/migrations/001_init.sql` dan `backend/db/migrations/002_accounts_cart.sql`) serta data placeholder di **`backend/db/seeds/`**. Tabel tambahan `schema_migrations` dibuat otomatis oleh runner migrasi untuk mencatat `version` dan checksum tiap file migrasi (total 25 tabel di skema `public`). Ringkasan 24 tabel aplikasi:

- **Pengguna, alamat & pengaturan:** `users` (menggantikan `admin_users` sejak migrasi `002`), `user_addresses`, `app_settings`
- **Master & harga:** `garment_models`, `fabrics`, `fabric_colors`, `model_fabrics`, `sizes`, `print_sizes`, `payment_accounts`
- **Keranjang:** `cart_items`
- **Order:** `orders` (memiliki `user_id` nullable), `order_items`, `order_item_sizes`, `order_item_prints`, `order_qc_photos`
- **Pembayaran:** `payments`
- **Riwayat:** `order_status_history`
- **Fase 2:** `production_logs`, `collective_links`, `collective_entries`, `ready_products`, `ready_product_images`, `ready_product_variants`

Catatan penting:
- **Dual-key:** `id` `BIGINT GENERATED ALWAYS AS IDENTITY` untuk FK/index; `user_uuid`/`address_uuid`/`cart_item_uuid`/`transaction_uuid`/`payment_uuid`/`link_uuid`/`product_uuid` (tipe `UUID`, default `gen_random_uuid()`) dan `order_code` untuk publik.
- **Akun `USER` & `ADMIN` (`users`):** hanya dua role di DB (`user_role_t`: `ADMIN` dan `USER`). Guest bukan role. Order manual WhatsApp/Instagram tetap boleh tanpa akun (`orders.user_id = NULL`), sedangkan order `source = WEBSITE` wajib mengisi `orders.user_id`. Hapus akun menonaktifkan user (`is_active = FALSE`), bukan `DELETE`.
- **`cart_items`:** satu baris = satu konfigurasi Custom Lab di kolom JSONB `config`. Tidak menyimpan harga.
- `orders.is_dp_eligible` dan `orders.grand_total` adalah **generated column**. Jangan pernah ditulis dari aplikasi.
- Kolom alamat di `orders` boleh NULL; dijaga CHECK (`chk_orders_addr_web`, `chk_orders_addr_ship`, `chk_orders_courier`).
- Semua kolom file bernama `*_path` (bukan `*_url`) dan berisi path objek storage.
- Butuh **PostgreSQL 14+** (Supabase menyediakan 15+).
- Akses DB memakai **`pg` (node-postgres) dengan raw query** (`Pool`, query berparameter, transaksi manual). Tanpa ORM.

### Aturan khusus PostgreSQL / Supabase (WAJIB diikuti di semua kode backend)
1. **Placeholder** memakai `$1, $2, $3, ...` (bukan `?`). Dilarang menggabungkan input ke string SQL.
2. **Ambil id hasil insert** dengan `INSERT ... RETURNING id` (tidak ada `insertId`). Untuk update/hapus yang perlu datanya kembali, gunakan `RETURNING *`.
3. **Transaksi:** `const client = await pool.connect(); try { await client.query('BEGIN'); ...; await client.query('COMMIT'); } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }`. Seluruh query dalam satu transaksi **harus lewat `client`**, bukan `pool`. Buat helper `withTransaction(fn)` di `config/database.ts`.
4. **Penguncian baris:** gunakan `SELECT ... FOR UPDATE` pada baris `orders`/`payments` saat mengubah status atau menghitung ulang `remaining_balance`, agar dua klik admin tidak saling menimpa.
5. **Tipe data hasil query:** `pg` mengembalikan `BIGINT` dan `NUMERIC` sebagai **string**. Daftarkan type parser di `config/database.ts`: `types.setTypeParser(20, Number)` untuk `BIGINT` (id aman karena kecil) dan `types.setTypeParser(1700, Number)` untuk `NUMERIC` (harga dalam rupiah bulat). Hitung uang hanya di server memakai bilangan bulat rupiah.
6. **Waktu:** semua kolom waktu bertipe `TIMESTAMPTZ` (disimpan UTC). **Jangan bergantung pada timezone sesi** (connection pooler tidak menjaganya). Konversi ke WIB eksplisit: untuk laporan gunakan `date_trunc('day', created_at AT TIME ZONE 'Asia/Jakarta')`; untuk tampilan format di aplikasi dengan zona `Asia/Jakarta`. `node-cron` dijadwalkan dengan `timezone: 'Asia/Jakarta'`.
7. **Enum:** kolom status memakai tipe enum PostgreSQL. Nilai di kode harus **persis** sama dengan di SQL (huruf besar): `payment_scheme_t` = `FULL`/`DP`; `payment_stage_t` = `DP`/`SETTLEMENT`/`FULL`/`SHIPPING_FEE`; `fulfillment_t` = `SHIP`/`PICKUP`. Penambahan nilai di masa depan lewat `ALTER TYPE ... ADD VALUE` di file migrasi.
8. **Pencarian teks** (nama pelanggan, kode order) memakai `ILIKE` agar tidak peka huruf besar/kecil.
9. **Email admin** wajib disimpan dan dicari dalam huruf kecil (`lower(email)`). Ada unique index pada `lower(email)`.
10. **`updated_at`** diperbarui otomatis oleh trigger `set_updated_at()`. Jangan mengisinya manual.
11. **Konversi fungsi MySQL** yang tidak boleh dipakai: `IFNULL` → `COALESCE`, `DATE_FORMAT` → `to_char`/`date_trunc`, `NOW() + INTERVAL 1 DAY` → `NOW() + INTERVAL '1 day'`, `LIMIT x,y` → `LIMIT y OFFSET x`, backtick → tanpa kutip atau kutip ganda. Semua kolom pada `SELECT` dengan `GROUP BY` harus berada di `GROUP BY` atau dibungkus fungsi agregat.
12. **Kolom `print_position`** (di `order_item_prints`) menyimpan posisi sablon. Nama kolomnya sengaja bukan `position`.
13. **Penanganan error:** tangkap kode error PostgreSQL `23505` (unique violation, mis. `order_code` bentrok → generate ulang; `uq_oip_item_position` → pesan posisi sablon ganda), `23514` (check violation, petakan per nama constraint ke pesan yang jelas) dan `23503` (foreign key) lalu ubah menjadi respons yang jelas, bukan stack trace.
14. **Koneksi Supabase:** `DATABASE_URL` di `.env`. Untuk backend yang berjalan terus-menerus gunakan **Session pooler** (Supavisor, port 5432) atau koneksi langsung; untuk lingkungan serverless gunakan **Transaction pooler** (port 6543). Keduanya kompatibel dengan pola transaksi di atas selama **tidak memakai prepared statement bernama** dan tidak bergantung pada `SET` sesi. Aktifkan `ssl`. Atur ukuran `Pool` kecil (mis. `max: 5–10`) agar tidak menghabiskan koneksi.
15. **Row Level Security:** semua tabel `public` sudah di-`ENABLE ROW LEVEL SECURITY` tanpa policy. Backend terhubung sebagai role `postgres` (melewati RLS). **Jangan** menambah policy, **jangan** memakai Data API/PostgREST Supabase, dan **jangan** menaruh anon key di frontend.
16. **Penguncian job terjadwal:** `pg_try_advisory_xact_lock` di dalam transaksi (lihat 6.4).

---

## 8. STRUKTUR PROJECT

```
yng-apparel/
├── shared/                              # paket tipe bersama (@yng/shared)
│   ├── src/
│   │   ├── enums.ts                     # seluruh enum status PostgreSQL & union types
│   │   ├── statusLabels.ts              # pemetaan label DB -> UI Bahasa Indonesia
│   │   ├── couriers.ts                  # daftar kurir tetap + buildTrackingUrl()
│   │   ├── api.ts                       # Rupiah, AuthUserDto, ApiSuccessResponse/ApiErrorResponse, DTO bersama
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json                    # strict: true, declaration: true
│
├── backend/
│   ├── db/
│   │   ├── migrations/                  # 001_init.sql, 002_accounts_cart.sql, 003_xxx.sql, ... (immutable setelah merge)
│   │   └── seeds/                       # 001_placeholder_catalog.sql, ...
│   ├── src/
│   │   ├── config/        database.ts, constants.ts, env.ts
│   │   ├── types/         auth.ts, express.d.ts (req.user)
│   │   ├── controllers/
│   │   │   ├── authController.ts         # register, login, logout, me, password (USER & ADMIN)
│   │   │   ├── accountController.ts      # profil, alamat tersimpan (/me/addresses), pesanan saya (/me/orders)
│   │   │   ├── cartController.ts         # CRUD keranjang Custom Lab (/cart/items)
│   │   │   ├── catalogController.ts      # model, bahan+warna, ukuran, sablon, settings publik
│   │   │   ├── pricingController.ts
│   │   │   ├── orderController.ts        # checkout keranjang -> order
│   │   │   ├── paymentController.ts
│   │   │   ├── trackerController.ts
│   │   │   ├── uploadController.ts
│   │   │   ├── adminOrderController.ts   # kanban, status, SPK, QC, ongkir, kurir+resi, diskon, alamat, edit item, cancel
│   │   │   ├── adminMasterController.ts  # CRUD master data (termasuk fabric_colors) & settings
│   │   │   ├── adminPaymentController.ts
│   │   │   ├── dashboardController.ts
│   │   │   ├── reportController.ts
│   │   │   ├── productionLogController.ts   # fase 2
│   │   │   ├── collectiveController.ts      # fase 2
│   │   │   └── readyProductController.ts    # fase 2
│   │   ├── models/        fungsi query pg (node-postgres) per entitas
│   │   ├── routes/        publicRoutes.ts, adminRoutes.ts, index.ts
│   │   ├── middleware/    auth.ts (requireAuth, requireRole, optionalAuth),
│   │   │                  uploadMiddleware.ts (memoryStorage + magic bytes),
│   │   │                  validate.ts (Zod), rateLimiter.ts, originCheck.ts, errorHandler.ts
│   │   ├── services/
│   │   │   ├── pricingService.ts       # satu-satunya tempat rumus harga
│   │   │   ├── orderService.ts         # buat/edit order (transaksi), status machine
│   │   │   ├── paymentService.ts       # buat tagihan, verifikasi, revisi ongkir, hitung remaining
│   │   │   ├── storageService.ts       # abstraksi object storage (Supabase / S3-compatible)
│   │   │   ├── spkService.ts           # PDF (pdfkit)
│   │   │   ├── whatsappService.ts      # pembuat link wa.me + template
│   │   │   ├── notificationService.ts  # Telegram (opsional, no-op bila env kosong)
│   │   │   ├── imageService.ts         # sharp: resize, DPI
│   │   │   └── csvService.ts
│   │   ├── jobs/scheduler.ts           # node-cron + advisory lock + pembersih tmp & keranjang > 30 hari
│   │   ├── utils/         orderCode.ts, phone.ts, response.ts, asyncHandler.ts,
│   │   │                  migrationHelpers.ts, seedAdminHelpers.ts
│   │   └── app.ts
│   ├── scripts/           migrate.ts, seed.ts, dbCheck.ts, initStorage.ts, seedAdmin.ts, backup.sh (pg_dump)
│   ├── tests/             stage0.test.ts (Vitest)
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json      # strict: true
│   ├── tsconfig.build.json
│   ├── vitest.config.ts
│   └── server.ts
│
├── frontend/
│   ├── src/
│   │   ├── components/    StatusBadge.tsx, PriceSummary.tsx, SizeMatrix.tsx, PrintSpotPicker.tsx,
│   │   │                  ColorPicker.tsx (preset + custom), FileDropzone.tsx, KanbanColumn.tsx, OrderCard.tsx, ...
│   │   ├── layouts/       PublicLayout.tsx, AdminLayout.tsx
│   │   ├── pages/
│   │   │   ├── Home.tsx
│   │   │   ├── auth/         Login.tsx, Register.tsx
│   │   │   ├── account/      Account.tsx (profil + alamat), MyOrders.tsx, MyOrderDetail.tsx
│   │   │   ├── custom-lab/   CustomLab.tsx (wizard), Cart.tsx, Checkout.tsx, OrderSuccess.tsx
│   │   │   ├── track/        TrackLookup.tsx, TrackDetail.tsx
│   │   │   ├── pay/          UploadProof.tsx
│   │   │   ├── fabric-lab/       # fase 2
│   │   │   ├── collective/       # fase 2
│   │   │   ├── ready-drops/      # fase 2
│   │   │   └── admin/        Kanban.tsx, OrderDetail.tsx, ManualOrder.tsx, Payments.tsx,
│   │   │                     Master (models, fabrics+colors, sizes, prints), Settings.tsx,
│   │   │                     PaymentAccounts.tsx, Reports.tsx, ProductionLogs.tsx (fase 2)
│   │   ├── services/      api.ts (axios, withCredentials) + service per modul
│   │   ├── context/       AuthContext.tsx (user, role, isGuest, login/logout)
│   │   ├── routes/        AppRoutes.tsx, ProtectedRoute.tsx, AdminRoute.tsx
│   │   ├── utils/         formatRupiah.ts, statusLabels.ts (re-export @yng/shared), whatsapp.ts, pricing.ts (UX saja)
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── vite-env.d.ts
│   ├── index.html
│   ├── package.json
│   ├── postcss.config.js  # tetap .js (dibutuhkan postcss-load-config secara native)
│   ├── tailwind.config.ts
│   ├── tsconfig.json      # strict: true
│   ├── tsconfig.node.json
│   └── vite.config.ts
│
├── .gitattributes         # *.sql text eol=lf
├── .prettierrc
├── eslint.config.js       # ESLint 9 flat config (.js native)
├── package.json           # npm workspaces (shared, backend, frontend)
└── README.md
```

---

## 9. PEMETAAN LABEL STATUS (DB → UI)

**Produksi (`orders.production_status`)**

| DB | Label UI |
|---|---|
| NEW_ORDER | ORDER MASUK & CEK DESAIN |
| PRINT_QUEUE | ANTREAN CETAK SABLON |
| PRESSING_QC | PRESSING & QC |
| AWAITING_SETTLEMENT | MENUNGGU PELUNASAN |
| SHIPPING | PENGIRIMAN (untuk `PICKUP`: SIAP DIAMBIL) |
| COMPLETED | SELESAI |
| CANCELLED | DIBATALKAN |

**Desain (`design_status`):** PENDING = MENUNGGU CEK, NEED_REVISION = PERLU REVISI, APPROVED = DISETUJUI
**Pembayaran (`payments.status`):** PENDING = MENUNGGU BUKTI / MENUNGGU VERIFIKASI (lihat `proof_image_path`), VERIFIED = TERVERIFIKASI, REJECTED = DITOLAK
**Tahap bayar (`payment_stage`) — label dinamis dari `dp_percent_snapshot`, jangan hardcode angka:**
`DP` = `DP {dp_percent_snapshot}%`, `SETTLEMENT` = `PELUNASAN {100 − dp_percent_snapshot}% + ONGKIR` (tampilkan "+ ONGKIR" hanya bila ongkir > 0), `FULL` = `LUNAS`, `SHIPPING_FEE` = `ONGKIR`
**Skema (`payment_scheme`):** `FULL` = LUNAS, `DP` = `DP {dp_percent_snapshot}%`
**Pengiriman (`fulfillment_type`):** SHIP = KIRIM, PICKUP = AMBIL DI TEMPAT

Simpan pemetaan di satu file konstanta backend dan satu di frontend (`utils/statusLabels.js`).

---

## 10. API ENDPOINT

Response seragam: `{ success, message, data }`. Daftar berpagination: `?page=&limit=` + `meta`.
Akses: **P** = publik (termasuk Guest), **U** = login (`requireAuth`, akun `USER`/`ADMIN`), **A** = admin (`requireAuth` + `requireRole('ADMIN')`, cookie httpOnly berisi JWT).

**AUTH TERPADU (`USER` & `ADMIN`)**
```
POST /api/auth/register                  P (rate-limited; selalu role USER, abaikan field role dari client)
POST /api/auth/login                     P (rate-limited; satu endpoint untuk USER & ADMIN, set cookie httpOnly, error generik)
POST /api/auth/logout                    U (hapus cookie)
GET  /api/auth/me                        U (muat profil user aktif dari DB)
PUT  /api/auth/password                  U (naikkan token_version untuk cabut sesi lama)
```

**KATALOG & HARGA (P / U)**
```
GET  /api/catalog/models                 P  # model aktif
GET  /api/catalog/models/:slug           P  # + bahan valid, masing-masing dengan daftar warna aktif
GET  /api/catalog/fabrics                P  # + warna aktif per bahan
GET  /api/catalog/sizes                  P
GET  /api/catalog/print-sizes            P
GET  /api/catalog/config                 P  # dp_percent, dp_min_qty, estimasi produksi, WA admin
GET  /api/payment-accounts               P  # rekening/QRIS aktif
POST /api/pricing/quote                  P  # body: items[] -> subtotal, total_qty, dp_eligible, opsi bayar
POST /api/uploads/design                 U  # rate-limited; simpan ke designs/carts/<user_uuid>/... (atau tmp/...) -> {file_ref, file_name, width, height}
```

**AKUN, ALAMAT & PESANAN SAYA (U)**
```
GET/POST/PUT/DELETE /api/me/addresses(/:addressUuid)  # maks 5 alamat per user (ASSUMPTION); filter user_id
GET  /api/me/orders                                   # daftar pesanan milik user (filter user_id)
GET  /api/me/orders/:uuid                             # detail pesanan milik user; milik orang lain -> 404
```

**KERANJANG CUSTOM LAB (U)**
```
GET    /api/cart/items                   # hitung ulang semua item via pricingService + peringatan jika harga/status master berubah
POST   /api/cart/items                   # tambah 1 konfigurasi Custom Lab ke config JSONB (tanpa harga; maks 20 item, ASSUMPTION)
PUT    /api/cart/items/:cartItemUuid     # perbarui konfigurasi item milik user
DELETE /api/cart/items/:cartItemUuid     # hapus item milik user & bersihkan file carts/ bila tidak direferensikan
```

**ORDER & PEMBAYARAN**
```
POST /api/orders                         U  # header Idempotency-Key; wajib login untuk WEBSITE; body:
                                            # cartItemUuids[], fulfillmentType (SHIP|PICKUP), addressUuid / alamat bila SHIP, paymentScheme
                                            # hapus item keranjang terbeli dalam transaksi yang sama; pindahkan designs/carts/ -> designs/orders/
GET  /api/orders/:uuid/payments          P/U # tagihan terbuka (butuh transaction_uuid)
POST /api/orders/:uuid/payments/:paymentUuid/proof   P/U # upload bukti + metode
```

**TRACKER (P, rate-limited)**
```
POST /api/track                          # body: {code, whatsappLast4}
GET  /api/track/:uuid                    # magic link (respons memuat signed URL foto QC)
```

**ADMIN: ORDER & KANBAN (A)** *(semua rute `/api/admin/*` memakai `requireAuth` + `requireRole('ADMIN')`)*
```
GET  /api/admin/orders                   # ?status=&search=&from=&to=&source=
GET  /api/admin/orders/board             # data kanban (dikelompokkan per status)
GET  /api/admin/orders/:id
POST /api/admin/orders/manual            # input order WA/IG (user_id NULL): source, fulfillmentType, alamat (opsional),
                                         # items, discountAmount, discountNote, paymentScheme,
                                         # paymentReceived {method, proof?}, noAutoCancel
PUT  /api/admin/orders/:id/items         # edit isi order (aturan 6.11)
PUT  /api/admin/orders/:id/discount      # {discountAmount, discountNote} (aturan 6.1 & 6.11)
PUT  /api/admin/orders/:id/address       # lengkapi/ubah alamat & fulfillmentType
PUT  /api/admin/orders/:id/design        # {design_status, design_review_notes}
PUT  /api/admin/orders/:id/status        # pindah status (divalidasi mesin status)
PUT  /api/admin/orders/:id/notes         # admin_notes, estimated_finish_date
POST /api/admin/orders/:id/qc-photos     # upload foto QC (boleh banyak)
DELETE /api/admin/orders/:id/qc-photos/:photoId
PUT  /api/admin/orders/:id/shipping-cost # input/revisi ongkir (aturan 6.5)
PUT  /api/admin/orders/:id/shipment      # validasi kode kurir terhadap shared/src/couriers.ts (OTHER untuk kurir lain/instan), layanan, resi ^[A-Za-z0-9-]{4,40}$
PUT  /api/admin/orders/:id/cancel        # {reason, refundedAmount}
PUT  /api/admin/orders/:id/prints/:printId/file   # pasang/ganti file desain {file_ref}
GET  /api/admin/orders/:id/spk           # PDF SPK
GET  /api/admin/orders/:id/whatsapp      # ?template= -> link wa.me siap pakai
POST /api/admin/uploads/design           # upload desain oleh admin (format diperluas) -> {file_ref, ...}
```

**ADMIN: PEMBAYARAN (A)**
```
GET /api/admin/payments                  # ?status=PENDING&hasProof=true
PUT /api/admin/payments/:id/verify       # {approve: true|false, rejectionReason}
```

**ADMIN: MASTER DATA & PENGATURAN (A)**
```
GET/POST/PUT/DELETE  /api/admin/models(/:id)           # DELETE = nonaktifkan
GET/POST/PUT/DELETE  /api/admin/fabrics(/:id)
GET/POST/PUT/DELETE  /api/admin/fabrics/:id/colors(/:colorId)   # preset warna per bahan; DELETE = nonaktifkan
PUT                  /api/admin/models/:id/fabrics     # atur bahan valid
GET/POST/PUT/DELETE  /api/admin/sizes(/:id)
GET/POST/PUT/DELETE  /api/admin/print-sizes(/:id)
GET/POST/PUT/DELETE  /api/admin/payment-accounts(/:id)
GET/PUT              /api/admin/settings
POST                 /api/admin/uploads/image          # gambar model/bahan/QRIS -> bucket catalog
```

**ADMIN: DASHBOARD & LAPORAN (A)**
```
GET /api/admin/dashboard     # order baru, menunggu verifikasi bayar, siap diproses, antrean cetak,
                             # menunggu pelunasan, omzet bulan ini, order terlambat, alamat belum lengkap
GET /api/admin/reports/sales        # ?from=&to=&groupBy=day|month  (omzet = SUM payments VERIFIED − SUM refunded_amount)
GET /api/admin/reports/orders
GET /api/admin/reports/top-models
GET /api/admin/reports/customers    # dikelompokkan per customer_whatsapp
    (semua mendukung ?format=csv)
```

**FASE 2**
```
GET  /api/production-logs                        P
CRUD /api/admin/production-logs(/:id)            A
GET  /api/ready-products(/:slug)                 P
CRUD /api/admin/ready-products(/:id)             A  (+ gambar & varian)
POST /api/collectives                            P  -> public_code + leaderToken (tampil sekali)
GET  /api/collectives/:publicCode                P
POST /api/collectives/:publicCode/entries        P  (anggota isi ukuran)
POST /api/collectives/:publicCode/checkout       P  (butuh leaderToken) -> buat order
POST /api/uploads/design  (DPI Guard aktif)      P
```

---

## 11. TAHAPAN PENGEMBANGAN

| Tahap | Cakupan | Deliverable |
|---|---|---|
| **0** | Setup | Monorepo npm workspaces + TypeScript `strict: true` di `shared/`, `backend/`, dan `frontend/`; paket tipe bersama `shared/` (`@yng/shared`: enum `USER_ROLE`, `AuthUserDto`, `couriers.ts` + `buildTrackingUrl()`, label status); ESLint + Prettier; `.env.example`; koneksi DB (`pg` Pool, type parser, `withTransaction`); runner migrasi `scripts/migrate.ts` (`backend/db/migrations/*.sql`, `001_init.sql` + `002_accounts_cart.sql`, `schema_migrations` + checksum + `pg_advisory_lock`); runner seed `scripts/seed.ts`; `storageService.ts` + `scripts/initStorage.ts`; error handler, response helper, rate limiter, helmet, CORS, `originCheck`, `middleware/auth.ts` (`requireAuth`, `requireRole`, `optionalAuth`, cookie httpOnly JWT), validasi Zod, `seedAdmin.ts` (menulis ke `users` role `ADMIN` + tolak placeholder), `backup.sh`; Vitest smoke/unit test; Vite + Tailwind + Router + Axios TypeScript (`AuthContext`, `ProtectedRoute`, `AdminRoute`); design tokens monokrom; skrip npm; panduan setup Supabase & alur kerja tim di README |
| **1a** | Auth terpadu (`USER`+`ADMIN`) + Master data | Endpoint auth terpadu (`/api/auth/register`, `/login`, `/logout`, `/me`, `/password`), `requireAuth` + `requireRole('ADMIN')`, CRUD master data model/bahan/**warna per bahan**/ukuran/sablon/rekening, settings, upload gambar ke bucket `catalog`, form admin responsif |
| **1b** | Akun pelanggan & alamat tersimpan | Halaman `/login`, `/register`, `/akun` (profil, ganti password, nonaktifkan akun `is_active = FALSE`, kelola maks 5 alamat tersimpan via `/api/me/addresses`), alur redirect kembali ke rute asal setelah login |
| **2** | Custom Lab publik | Endpoint katalog (bahan+warna), `pricingService` + `/pricing/quote`, wizard Custom Lab (Guest bebas konfigurasi & hitung harga; login diminta saat tambah keranjang / upload desain), ColorPicker (preset + custom), SizeMatrix, PrintSpotPicker, panel harga real-time, gatekeeper DP dinamis |
| **3a** | Keranjang Custom Lab | Endpoint `/api/cart/items` (`GET/POST/PUT/DELETE`, hitung ulang harga & peringatan jika harga/status master berubah, maks 20 item), upload desain ke `designs/carts/<user_uuid>/...`, halaman `/keranjang` dengan checklist item & estimasi DP |
| **3b** | Order dari keranjang, pembayaran awal & tracking resi | `POST /api/orders` dari item tercentang di `/checkout` (transaksi, idempotency key, order code 6 karakter, snapshot harga, SHIP/PICKUP, hapus item terbeli, pindahkan `carts/` → `orders/`), gatekeeper DP dari qty tercentang, tagihan awal, halaman instruksi bayar + upload bukti, `/pesanan` & `/pesanan/:uuid` + tombol lacak resi eksternal (`shared/src/couriers.ts`), link WhatsApp |
| **4** | Live Tracker | Lookup kode + 4 digit WA, magic link, tampilan 5 tahap, signed URL foto QC, upload bukti untuk tagihan lanjutan, masking data |
| **5** | Admin Kanban & produksi | Board, detail order, verifikasi bayar, mesin status, review desain, SPK PDF, foto QC (multi), input/revisi ongkir → tagihan akhir, diskon, edit alamat, edit isi order, resi, pembatalan + refund, riwayat status, template WhatsApp, input order manual (pembayaran diterima, file desain admin), scheduler (advisory lock + pembersih tmp), notifikasi Telegram |
| **6** | Dashboard & laporan | Dashboard ringkas, laporan penjualan/order/model terlaris/customer, export CSV |
| **7** | Pengujian MVP | Checklist uji (lihat di bawah) dan perapihan UI/UX |
| **8a** | Fase 2: Fabric Lab + Production Log | Halaman edukasi bahan, log produksi (CRUD admin + tampil publik) |
| **8b** | Fase 2: Mockup 2D + Sablon Sizer | Template SVG per model, pewarnaan, penempatan titik sablon |
| **8c** | Fase 2: DPI Guard | Hitung DPI (sharp), peringatan di wizard, badge DPI di kartu admin |
| **8d** | Fase 2: Kolektif Link | Buat link, anggota isi ukuran, ketua checkout |
| **8e** | Fase 2: Ready Drops | Katalog siap jual + tombol pesan via WhatsApp |

**Checklist pengujian MVP (Tahap 7):**
1. Order 5 pcs: opsi DP terkunci, hanya Lunas.
2. Order 12 pcs: opsi DP terbuka. Hitung DP dari subtotal bersih benar.
3. Turunkan qty dari 12 ke 11 saat DP dipilih: otomatis reset ke Lunas.
4. Kirim `payment_scheme=DP` dengan 5 pcs lewat API langsung: ditolak server.
5. Harga dari frontend dimanipulasi: server tetap memakai harga sendiri.
6. Ubah harga master setelah order dibuat: order lama tidak berubah.
7. Upload bukti, tolak admin, upload ulang, verifikasi: status benar.
8. Pembayaran awal tidak masuk 24 jam (order WEBSITE): order otomatis dibatalkan.
9. Alur lengkap DP: NEW_ORDER → PRINT_QUEUE → PRESSING_QC → ongkir diinput → AWAITING_SETTLEMENT → pelunasan verifikasi → SHIPPING (resi) → COMPLETED.
10. Alur lengkap Lunas dengan ongkir 0 (tanpa tahap pelunasan).
11. Tracker: kode benar + 4 digit salah = ditolak; rate limit bekerja; data alamat tersamarkan (dan tidak error bila alamat NULL).
12. Loncat status via API (mis. NEW_ORDER ke SHIPPING) ditolak.
13. Endpoint admin tanpa cookie/token: 401. File upload dengan ekstensi palsu (magic bytes tidak cocok): ditolak.
14. Tampilan admin Kanban dan Custom Lab di layar 360px nyaman dipakai.
15. Dua admin menekan verifikasi pembayaran yang sama bersamaan: hanya satu yang berhasil, `remaining_balance` tidak dobel terhitung (uji `FOR UPDATE`).
16. Login admin dengan email berbeda huruf besar/kecil tetap berhasil; harga di respons API bertipe angka (bukan string).
17. **Diskon:** DP dan `grand_total` dihitung dari subtotal − diskon; diskon > subtotal ditolak; diskon tidak bisa diubah setelah ada pembayaran VERIFIED.
18. **Alamat:** order WEBSITE (SHIP) tanpa alamat ditolak; order manual WA tanpa alamat berhasil dibuat; memindahkan ke `SHIPPING` tanpa alamat/kurir/resi ditolak dengan pesan jelas; order `PICKUP` lolos tanpa alamat dan resi.
19. **Warna:** warna di luar preset tanpa `is_custom_color` ditolak; warna custom ditandai badge di kanban dan SPK.
20. **Revisi ongkir** pada 4 kondisi tagihan akhir: (a) PENDING tanpa bukti → nominal ter-update, (b) PENDING dengan bukti → 409, (c) VERIFIED → 409, (d) ongkir direvisi jadi 0 pada skema `FULL` → baris `SHIPPING_FEE` terhapus dan order bisa lanjut.
21. **Order manual:** `paymentReceived` langsung `VERIFIED`; order manual tanpa `payment_due_at` tidak ikut auto-cancel.
22. **Edit isi order:** di `NEW_ORDER` tanpa pembayaran VERIFIED → tagihan awal dihitung ulang (bukan baris baru); ditolak bila ada bukti/VERIFIED; qty turun di bawah ambang pada skema `DP` → dipaksa `FULL`.
23. **Pembatalan:** membatalkan order yang sudah memiliki DP VERIFIED tanpa `refundedAmount` ditolak; dengan `refundedAmount` omzet laporan = VERIFIED − refunded.
24. **Storage:** file bucket privat tidak bisa diakses tanpa signed URL; signed URL kedaluwarsa setelah waktunya; file `tmp/` yatim terhapus oleh job; bukti lama terhapus saat upload ulang.
25. **Scheduler:** dua instance backend berjalan bersamaan → job tidak berjalan ganda (advisory lock).
26. **RLS:** permintaan ke REST/Data API Supabase memakai anon key tidak dapat membaca satu pun tabel.
27. **Idempotensi:** `POST /api/orders` dengan `Idempotency-Key` sama dua kali menghasilkan satu order.
28. **Rekonsiliasi:** untuk semua order, `remaining_balance = grand_total − SUM(payments VERIFIED)` (jalankan query pemeriksa di akhir pengujian).
29. **Kode order:** format `YNG-` + 6 karakter dari alfabet yang ditentukan; bentrok memicu generate ulang.
30. **Role & akses Guest:** Guest mengakses `/api/cart/items` atau `/api/me/*` ditolak `401`.
31. **Role guard Admin:** `USER` mengakses `/api/admin/*` ditolak `403`.
32. **Isolasi data pemilik:** User A membaca order/alamat/item keranjang milik User B ditolak `404`.
33. **Anti-privilege escalation:** `POST /api/auth/register` dengan field `role: "ADMIN"` tetap menghasilkan user dengan role `USER`.
34. **Revokasi sesi (`token_version`):** token dengan `token_version` lama (setelah ganti password/cabut sesi) ditolak `401`.
35. **User nonaktif:** akun dengan `is_active = FALSE` selalu ditolak `401` walaupun JWT belum kedaluwarsa.
36. **Hitung ulang harga keranjang:** mengubah harga master memicu `GET /api/cart/items` mengembalikan harga terbaru + peringatan perubahan (atau peringatan model/bahan nonaktif).
37. **Gatekeeper DP item tercentang:** jika keranjang memiliki total 15 pcs tetapi hanya 8 pcs yang dicentang saat checkout, DP terkunci ke `FULL` (dibuka bila item dicentang ≥ `dp_min_qty`).
38. **Validasi kurir & resi:** `PUT /api/admin/orders/:id/shipment` menolak kode kurir di luar `shared/src/couriers.ts` dan menolak format resi di luar `^[A-Za-z0-9-]{4,40}$`; `buildTrackingUrl` mengembalikan `null` untuk `OTHER`, kurir tanpa link, atau resi invalid.
39. **Transaksi checkout keranjang:** checkout memindahkan file `designs/carts/<user_uuid>/...` ke `designs/orders/<transaction_uuid>/...` dan menghapus hanya item keranjang yang dicentang dalam transaksi yang sama.

---

## 12. TEKNOLOGI

**Paket Bersama (`shared/`):** TypeScript strict (`@yng/shared`) untuk enum status, label UI, tipe respons API, dan DTO bersama backend/frontend
**Frontend:** React.js (Vite + TypeScript strict), React Router, Axios, Tailwind CSS
**Backend:** Node.js, Express.js, TypeScript strict (`tsx` untuk development/skrip, `tsc` untuk build produksi), REST API, **`zod`** untuk validasi input (*dipilih dibanding `express-validator` karena menyediakan satu sumber kebenaran validasi runtime sekaligus inferensi tipe statis `z.infer`, bersih untuk payload bersarang Custom Lab dan aturan kondisional lintas field tanpa `any`, serta mudah diuji di Vitest*), JWT terpadu (`USER` & `ADMIN`, cookie `httpOnly`), bcrypt (8–72 byte), Multer (`memoryStorage`), `file-type`, `pg`, `@supabase/supabase-js` (khusus storage), `helmet`, `cors`, `cookie-parser`, `express-rate-limit`, `node-cron`, `sharp`, `pdfkit`, `dotenv`
**Testing & Kualitas Kode:** Vitest (unit test, terutama `pricingService`, validasi, dan helper bisnis), ESLint + Prettier
**Database & storage:** PostgreSQL 14+ (Supabase, dikelola lewat migrasi bernomor di `backend/db/migrations/`) + Supabase Storage
Arsitektur: `React.js (TS) → REST API → Node.js/Express.js (TS) → PostgreSQL (Supabase) + Object Storage`

---

## 13. KEAMANAN, DEPLOYMENT & KUALITAS

- **Autentikasi, Sesi, & Otorisasi:**
  - Password di-hash `bcrypt` (cost ≥ 10), panjang minimal 8 karakter (minimal 12 karakter untuk `seed:admin`) dan **maksimal 72 byte** (batas implementasi bcrypt). Jangan pernah mengembalikan `password_hash`.
  - Satu cookie **`httpOnly` + `Secure`** untuk `USER` dan `ADMIN`. JWT bermasa berlaku pendek (mis. 12 jam), secret dari `.env`, memuat `sub` (`user_uuid`), `role`, dan `token_version`.
  - Middleware autentikasi **selalu memuat user dari DB per request**; tolak `401` apabila `is_active = FALSE` atau `token_version` di token tidak cocok dengan nilai di DB, serta selalu ambil `role` aktual dari DB (jangan percaya klaim `role` di JWT).
  - Rate limit pada endpoint login dan register; pesan error login wajib generik ("Email atau password salah") tanpa membocorkan apakah email terdaftar.
  - Semua query resource milik pelanggan (keranjang, alamat, pesanan saya) wajib memfilter `user_id = req.user.id`; resource milik orang lain dijawab `404`.
  - Hapus akun hanya menonaktifkan user (`is_active = FALSE`), bukan `DELETE`.
- **Cookie & CORS:** disarankan API dan frontend berada di bawah domain induk yang sama (mis. `yngapparel.id` dan `api.yngapparel.id`) sehingga `SameSite=Lax` cukup. Jika lintas situs, gunakan `SameSite=None; Secure`, `credentials: true`, dan middleware `originCheck` yang menolak request ubah-data (POST/PUT/DELETE) dengan header `Origin` di luar `FRONTEND_ORIGIN`. CORS hanya untuk origin frontend.
- Semua query memakai **query berparameter** (`$1, $2, ...`). Dilarang menggabungkan input ke string SQL.
- Validasi semua input publik (panjang, tipe, format nomor WhatsApp, kode pos, qty bulat positif, hex warna, `file_ref` hanya berawalan `tmp/`).
- Endpoint publik yang menerima `uuid`/kode harus rate-limited dan tidak membocorkan ada/tidaknya data. `POST /api/uploads/design` juga rate-limited per IP.
- Harga, total, DP, diskon, dan sisa tagihan **selalu dihitung ulang di server**.
- Semua operasi multi-tabel (buat order, edit order, verifikasi bayar, input ongkir, ubah status) memakai **transaksi**.
- **Storage:** bucket privat hanya diakses lewat signed URL berumur pendek; service role key hanya ada di backend (`.env`, tidak pernah ke frontend/repo). Validasi MIME asli, batas ukuran, nama acak. SVG tidak pernah dirender inline dari storage.
- `.env` tidak di-commit. Error handler terpusat tanpa stack trace di production.
- **Deployment (Supabase):**
  - Untuk produksi gunakan paket **Supabase Pro** (backup harian otomatis dan project tidak di-pause karena tidak aktif). Paket gratis hanya untuk pengembangan/uji.
  - Tetap sediakan `scripts/backup.sh` (`pg_dump` ke file terenkripsi, dijadwalkan dari luar, mis. GitHub Actions/cron di mesin lain) dan catat di README. Data order adalah aset bisnis. Backup database **tidak** mencakup isi bucket storage; ekspor berkala untuk bucket `designs` dan `payment-proofs` dicatat sebagai tugas operasional.
  - Backend: host Node.js mana pun yang menjalankan proses terus-menerus (Railway/Render/Fly.io/VPS). Hindari serverless murni karena `node-cron` dan upload memori butuh proses yang hidup. Frontend: static host (Vercel/Netlify/Cloudflare Pages).
- Data pribadi pelanggan (alamat, nomor HP) hanya terlihat oleh admin dan, sebagian tersamarkan, oleh pemilik order lewat tracker. Pesan notifikasi Telegram tidak memuat alamat lengkap.
- **Alur Git & Kerja Tim (5 Orang, satu monorepo `backend/`, `frontend/`, `shared/`):**
  - Struktur 3 branch tetap:
    - `main`: live / siap rilis, hanya menerima merge dari `Alpha`.
    - `Alpha`: leader memeriksa kode setelah merge dari `Beta`.
    - `Beta`: setiap developer melakukan `git pull` sebelum mulai bekerja dan push ke `Beta` setelah selesai mengerjakan task.
  - **Pull Request & CI:** alur PR adalah `Beta` → `Alpha` (diperiksa leader), lalu `Alpha` → `main`. CI wajib menjalankan `npm run typecheck`, `npm run lint`, `npm run test`, dan `npm run build` pada setiap PR.
  - **Aturan agent dalam alur Git:** agent **tidak** membuat branch, **tidak** `commit`, dan **tidak** `push`. Agent bekerja di branch aktif (seharusnya `Beta`); jika branch aktif adalah `main` atau `Alpha`, agent wajib berhenti dan memberi tahu pemilik/developer. Sebelum memulai tugas baru, agent mengingatkan untuk `git pull` terlebih dahulu dan menutup semua tab editor yang berisi file yang akan diubah.
  - **Aturan migrasi DB dalam tim:** jangan pernah mengedit file migrasi yang sudah ada / sudah di-merge. Nomor migrasi baru (`003`, dst.) wajib dikonfirmasi terlebih dahulu sebelum dibuat agar tidak bentrok antar developer.

---

## 14. DI LUAR SCOPE

**Ditunda (di luar cakupan saat ini):** verifikasi email, lupa password, login sosial (OAuth), payment gateway otomatis, integrasi API tracking kurir pihak ketiga.
**Lainnya:** WhatsApp Business API otomatis, integrasi API ongkir pihak ketiga, COD, retur/refund otomatis (refund ditangani manual; sistem hanya mencatat `refunded_amount`), harga grosir bertingkat otomatis, biaya layanan desain, review/rating produk, multi-bahasa, multi-mata uang, aplikasi mobile native.

---

## 15. RINGKASAN PERUBAHAN v2.0 → v2.1 (REFERENSI)

| Area | Perubahan |
|---|---|
| Harga | Tambah `discount_amount` + `discount_note`; DP dihitung dari subtotal bersih; `grand_total` jadi generated column |
| Alamat | Kolom alamat NULL; CHECK untuk WEBSITE dan gerbang SHIPPING; tambah `fulfillment_type` (SHIP/PICKUP) dan CHECK kurir/resi |
| Warna | Tabel `fabric_colors`; `order_items.fabric_color_id` + `is_custom_color` |
| ENUM | `DP_70/SETTLEMENT_30/FULL_100` → `DP/SETTLEMENT/FULL`; label UI dinamis dari `dp_percent_snapshot` |
| Ambang DP | `dp_min_qty` di `app_settings` + `dp_min_qty_snapshot` di order; `is_dp_eligible` mengikuti snapshot |
| Ongkir | Aturan revisi lengkap (upsert terkondisi, tolak bila ada bukti/VERIFIED, hapus bila 0) |
| Kode order | 4 digit → 6 karakter acak |
| Order manual | `paymentReceived`, `payment_due_at` boleh NULL, upload desain admin, format file diperluas |
| Edit order | Aturan 6.11 dan endpoint terkait |
| Pembatalan | `refunded_amount`, definisi omzet |
| Foto QC | `qc_photo_url` → tabel `order_qc_photos` |
| Storage | File di Supabase Storage (4 bucket), kolom `*_url` → `*_path`, upload via memori, signed URL, pembersih `tmp/` |
| Supabase | RLS aktif di semua tabel, panduan pooler, tanpa ketergantungan timezone sesi, advisory lock untuk cron |
| Keamanan | JWT di cookie httpOnly, `originCheck`, idempotency key, rate limit upload |
| Lain-lain | Unique `(order_item_id, print_position)`; CHECK konsistensi payments; notifikasi Telegram opsional |
