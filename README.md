# YNG Apparel

Etalase e-commerce mobile-first berbasis Expo Router. Produk dan varian contoh berada di `data/products.json`; halaman Home, Semua Produk, dan Detail Produk berada di `src/app/`.

## Menjalankan

```bash
npm install
npm run web
```

Buka alamat lokal yang ditampilkan Expo, lalu gunakan browser dengan lebar 360–412 px untuk melihat layout mobile. Pemeriksaan proyek:

```bash
npm run lint
npx tsc --noEmit
```

## Checkout dan gambar

- URL checkout default berada di `config/checkout.ts` pada konstanta `CHECKOUT_BASE_URL`. Saat ini diarahkan ke `https://www.chrome.com`.
- URL checkout khusus per produk dapat ditambahkan sebagai `checkoutUrl` di `data/products.json`; nilai ini mengesampingkan URL default.
- Foto produk dan kategori contoh memakai URL gambar Unsplash yang didefinisikan di `data/products.json` dan `src/components/storefront.tsx`.
- Banner Capsule dapat diganti melalui konstanta `capsuleImage` di `src/app/index.tsx`. Hero memakai pola doodle hitam-putih dan logo teks `YNGAPPAREL`; sesuaikan pola/teks di file yang sama jika aset lokal tersedia.

## Catatan implementasi

- Wishlist disimpan di `localStorage` browser dengan key `yng-wishlist`.
- Parameter filter, pencarian, dan urutan produk dipertahankan di query URL halaman `/shop`.
- Aset desain `public/assets/hero-doodle.jpg`, `public/assets/logo-yng.png`, dan `public/assets/banner-capsule-2026.jpg` belum tersedia dalam repository ini, sehingga tampilan awal memakai foto placeholder remote dan logo berbasis teks.
- Tombol akun sengaja berupa placeholder; tidak ada login, keranjang internal, atau pembayaran di aplikasi.
