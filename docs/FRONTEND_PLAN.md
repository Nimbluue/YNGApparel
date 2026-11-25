# FRONTEND PLAN — YNG Apparel Custom Lab & Production Tracker
> Dokumen audit Fase 0 — dibuat berdasarkan kode backend aktual (bukan hanya SPEC.md)
> Tanggal: 2026-11-24

---

## A. TABEL LENGKAP ENDPOINT BACKEND

> **Legenda Akses:** `P` = Publik (Guest), `U` = USER/ADMIN login, `A` = ADMIN only  
> **Auth:** Cookie `httpOnly` bernama `yng_admin_token` berisi JWT HS256. **Frontend tidak menyimpan token di localStorage** — cookie dikirim otomatis dengan `withCredentials: true`.

### A1. AUTH (`/api/auth/*`)

| Method | Path | Akses | Request Body (Zod) | Response `data` | Catatan |
|--------|------|-------|-------------------|-----------------|---------|
| `POST` | `/api/auth/register` | P (rate-limited) | `{ fullName: string(2–150), email: string(email, max150), whatsapp: string(08/62, 9–17 digit), password: string(8–72byte) }` | `AuthUserDto` | WA dinormalisasi → `62...`; selalu role `USER`; 409 jika email duplikat |
| `POST` | `/api/auth/login` | P (rate-limited) | `{ email: string, password: string }` | `AuthUserDto` + set cookie | Satu endpoint USER & ADMIN; error login selalu generik |
| `POST` | `/api/auth/logout` | P (idempoten) | — | `null` | Selalu hapus cookie, tidak butuh auth |
| `GET` | `/api/auth/me` | U | — | `AuthUserDto` | `Cache-Control: no-store`; dipakai AuthContext untuk cek sesi |
| `PUT` | `/api/auth/password` | U | `{ currentPassword: string, newPassword: string(8–72byte) }` | `AuthUserDto` | Naikkan `token_version`, perbarui cookie |

**`AuthUserDto`:** `{ userUuid, fullName, email, whatsapp: string|null, role: 'USER'|'ADMIN' }`

---

### A2. KATALOG & HARGA (`/api/catalog/*`, `/api/pricing/*`, `/api/payment-accounts`, `/api/uploads/*`)

| Method | Path | Akses | Request | Response `data` | Catatan |
|--------|------|-------|---------|-----------------|---------|
| `GET` | `/api/catalog/models` | P | `?includeInactive=true\|false` | `GarmentModelDto[]` | Hanya aktif secara default |
| `GET` | `/api/catalog/models/:slug` | P | — | `GarmentModelDto` + fabrics dengan colors | Detail model beserta bahan valid + warna per bahan |
| `GET` | `/api/catalog/fabrics` | P | `?includeInactive=true\|false` | `FabricDto[]` (dengan `colors: FabricColorDto[]`) | |
| `GET` | `/api/catalog/sizes` | P | `?includeInactive=true\|false` | `SizeDto[]` | |
| `GET` | `/api/catalog/print-sizes` | P | `?includeInactive=true\|false` | `PrintSizeDto[]` | |
| `GET` | `/api/catalog/config` | P | — | Subset `AppSettingsMapDto`: `dp_percent`, `dp_min_qty`, `production_estimate_text`, `admin_whatsapp`, `max_design_file_mb` | **Gunakan ini untuk gatekeeper DP, jangan hardcode 70%/12** |
| `GET` | `/api/payment-accounts` | P | — | `PaymentAccountDto[]` (hanya aktif) | Rekening/QRIS untuk instruksi bayar |
| `POST` | `/api/pricing/quote` | P | `{ items: CartItemConfig[] }` | `{ subtotalAmount, totalQty, discountAmount, grandTotal, dpRequiredAmount, isDpEligible, paymentOptions }` | **Server adalah sumber kebenaran harga** |
| `POST` | `/api/uploads/design` | U (rate-limited) | `multipart/form-data: file` (field: `file`) | `{ fileRef: string, fileName: string, width?: number, height?: number }` | Simpan ke `designs/carts/<user_uuid>/...`; max `max_design_file_mb` (default 20 MB); MIME: PNG/JPG/WEBP/SVG/PDF |

> **⚠️ GAP:** Endpoint `GET /api/catalog/models/:slug`, `GET /api/catalog/config`, `POST /api/pricing/quote`, `POST /api/uploads/design`, dan `GET /api/payment-accounts` **BELUM diimplementasikan** di backend saat ini (router `publicRoutes.ts` masih kosong). Tahap 2 backend harus selesai sebelum halaman Custom Lab frontend bisa terhubung.

---

### A3. AKUN & ALAMAT (`/api/me/*`)

| Method | Path | Akses | Request Body | Response `data` | Catatan |
|--------|------|-------|-------------|-----------------|---------|
| `PUT` | `/api/me/profile` | U | `{ fullName?: string, whatsapp?: string\|null }` | `AuthUserDto` | Minimal 1 field |
| `POST` | `/api/me/deactivate` | U | `{ currentPassword: string }` | `null` | `is_active=FALSE` + cabut cookie; ADMIN tidak bisa dinonaktifkan |
| `GET` | `/api/me/addresses` | U | — | `UserAddressDto[]` | Maks 5 alamat |
| `POST` | `/api/me/addresses` | U | `CreateUserAddressDto` | `UserAddressDto` | 409 jika sudah 5 alamat |
| `PUT` | `/api/me/addresses/:addressUuid` | U | `UpdateUserAddressDto` (partial, min 1) | `UserAddressDto` | 404 jika milik user lain |
| `DELETE` | `/api/me/addresses/:addressUuid` | U | — | `null` | Auto-promosi alamat utama baru |
| `GET` | `/api/me/orders` | U | `?page=&limit=` | `OrderSummaryDto[]` + `meta` | Filter `user_id` |
| `GET` | `/api/me/orders/:uuid` | U | — | `OrderDetailDto` | 404 jika milik user lain; `uuid` = `transaction_uuid` |

**`UserAddressDto`:** `{ addressUuid, label, recipientName, recipientWhatsapp, provinceName, cityName, districtName, postalCode, fullAddress, isDefault, createdAt, updatedAt }`

> **⚠️ GAP:** `GET /api/me/orders` dan `GET /api/me/orders/:uuid` **BELUM diimplementasikan** (tidak ada di `accountRoutes.ts` saat ini). Butuh endpoint ini untuk Tahap 3b/4.

---

### A4. KERANJANG CUSTOM LAB (`/api/cart/*`)

| Method | Path | Akses | Request Body | Response `data` | Catatan |
|--------|------|-------|-------------|-----------------|---------|
| `GET` | `/api/cart/items` | U | — | `CartItemWithPriceDto[]` | Server hitung ulang harga via pricingService; sertakan `priceChanged: boolean`, `masterUnavailable: boolean` |
| `POST` | `/api/cart/items` | U | `CartItemConfigDto` (config JSONB tanpa harga) | `CartItemDto` | Maks 20 item; `config` berisi modelId, fabricId, colorId/isCustomColor/customColorName, sizes[], prints[] |
| `PUT` | `/api/cart/items/:cartItemUuid` | U | `CartItemConfigDto` | `CartItemDto` | 404 jika milik user lain |
| `DELETE` | `/api/cart/items/:cartItemUuid` | U | — | `null` | Hapus file `designs/carts/...` terkait jika tidak direferensikan |

> **⚠️ GAP:** Seluruh endpoint keranjang **BELUM diimplementasikan**. Backend butuh implementasi `cartController.ts` + `cartRoutes.ts` di Tahap 3a.

---

### A5. ORDER & PEMBAYARAN

| Method | Path | Akses | Request | Response `data` | Catatan |
|--------|------|-------|---------|-----------------|---------|
| `POST` | `/api/orders` | U | Header: `Idempotency-Key: <uuid>`; Body: `{ cartItemUuids: string[], fulfillmentType: 'SHIP'\|'PICKUP', addressUuid?: string, shippingAddress?: AddressDto, paymentScheme: 'FULL'\|'DP' }` | `OrderCreatedDto` | Transaksi atomik; pindah file carts→orders; hapus item keranjang terbeli |
| `GET` | `/api/orders/:uuid/payments` | P/U | — | `PaymentDto[]` | `uuid` = `transaction_uuid` |
| `POST` | `/api/orders/:uuid/payments/:paymentUuid/proof` | P/U | `multipart/form-data: file` (field: `file`) + `method: 'QRIS'\|'BANK_TRANSFER'` | `PaymentDto` | Max 5 MB; JPEG/PNG/WEBP; upload ulang gantikan bukti lama |

> **⚠️ GAP:** Semua endpoint order & pembayaran **BELUM diimplementasikan**. Butuh Tahap 3b.

---

### A6. TRACKER (`/api/track/*`)

| Method | Path | Akses | Request | Response `data` | Catatan |
|--------|------|-------|---------|-----------------|---------|
| `POST` | `/api/track` | P (rate-limited) | `{ code: string, whatsappLast4: string }` | `TrackOrderDto` | Respons gagal selalu generik; masking data alamat |
| `GET` | `/api/track/:uuid` | P (rate-limited) | — | `TrackOrderDto` | Magic link; signed URL foto QC |

**`TrackOrderDto`** (perkiraan — belum ada di `@yng/shared`): `{ orderCode, productionStatus, fulfillmentType, designStatus, items[], payments[], qcPhotos[], shipping: { courier, trackingReceiptNumber }, cityName (masked) }`

> **⚠️ GAP:** Endpoint tracker **BELUM diimplementasikan**. Butuh Tahap 4.

---

### A7. ADMIN — ORDER & KANBAN (`/api/admin/orders/*`)

| Method | Path | Akses | Request | Response `data` | Catatan |
|--------|------|-------|---------|-----------------|---------|
| `GET` | `/api/admin/orders` | A | `?status=&search=&from=&to=&source=&page=&limit=` | `AdminOrderSummaryDto[]` + `meta` | |
| `GET` | `/api/admin/orders/board` | A | — | `{ [status: string]: AdminOrderCardDto[] }` | Data kanban dikelompokkan per status |
| `GET` | `/api/admin/orders/:id` | A | — | `AdminOrderDetailDto` | `:id` = internal BIGINT (hanya di admin) |
| `POST` | `/api/admin/orders/manual` | A | `{ source, fulfillmentType, customerName, customerWhatsapp, address?, items[], discountAmount?, discountNote?, paymentScheme, paymentReceived?: { method, proof? }, noAutoCancel? }` | `AdminOrderDetailDto` | `user_id = NULL`; `payment_due_at = NULL` jika `noAutoCancel` |
| `PUT` | `/api/admin/orders/:id/items` | A | `{ items: OrderItemEditDto[] }` | `AdminOrderDetailDto` | Hanya `NEW_ORDER` tanpa pembayaran VERIFIED |
| `PUT` | `/api/admin/orders/:id/discount` | A | `{ discountAmount: Rupiah, discountNote: string }` | `AdminOrderDetailDto` | |
| `PUT` | `/api/admin/orders/:id/address` | A | `{ fulfillmentType, address? }` | `AdminOrderDetailDto` | Kapan saja sebelum COMPLETED |
| `PUT` | `/api/admin/orders/:id/design` | A | `{ designStatus: 'PENDING'\|'NEED_REVISION'\|'APPROVED', designReviewNotes?: string }` | `AdminOrderDetailDto` | |
| `PUT` | `/api/admin/orders/:id/status` | A | `{ status: ProductionStatus }` | `AdminOrderDetailDto` | Divalidasi state machine; error 409 jika lompat |
| `PUT` | `/api/admin/orders/:id/notes` | A | `{ adminNotes?: string, estimatedFinishDate?: string }` | `AdminOrderDetailDto` | |
| `POST` | `/api/admin/orders/:id/qc-photos` | A | `multipart/form-data: files[]` (field: `photos`) | `QcPhotoDto[]` | Upload multi-foto |
| `DELETE` | `/api/admin/orders/:id/qc-photos/:photoId` | A | — | `null` | Hapus file dari storage |
| `PUT` | `/api/admin/orders/:id/shipping-cost` | A | `{ shippingCost: Rupiah }` | `AdminOrderDetailDto` | Aturan 6.5; hanya `PRESSING_QC`/`AWAITING_SETTLEMENT` |
| `PUT` | `/api/admin/orders/:id/shipment` | A | `{ courierCode: CourierCode, shippingService: string, trackingReceiptNumber: string }` | `AdminOrderDetailDto` | Validasi kode kurir vs `couriers.ts`; resi `^[A-Za-z0-9-]{4,40}$` |
| `PUT` | `/api/admin/orders/:id/cancel` | A | `{ reason: string, refundedAmount: Rupiah }` | `AdminOrderDetailDto` | Hanya `NEW_ORDER`/`PRINT_QUEUE` |
| `PUT` | `/api/admin/orders/:id/prints/:printId/file` | A | `{ fileRef: string }` | `AdminOrderDetailDto` | Pasang/ganti file desain |
| `GET` | `/api/admin/orders/:id/spk` | A | — | PDF binary | `Content-Type: application/pdf` |
| `GET` | `/api/admin/orders/:id/whatsapp` | A | `?template=<templateName>` | `{ url: string, text: string }` | Link `wa.me` siap pakai |
| `POST` | `/api/admin/uploads/design` | A | `multipart/form-data: file` | `{ fileRef, fileName }` | Format diperluas: +PSD/AI/CDR/EPS/ZIP |

> **⚠️ GAP:** Semua endpoint admin order **BELUM diimplementasikan**. Butuh Tahap 5.

---

### A8. ADMIN — PEMBAYARAN (`/api/admin/payments/*`)

| Method | Path | Akses | Request | Response `data` | Catatan |
|--------|------|-------|---------|-----------------|---------|
| `GET` | `/api/admin/payments` | A | `?status=PENDING&hasProof=true&page=&limit=` | `AdminPaymentDto[]` + `meta` | |
| `PUT` | `/api/admin/payments/:id/verify` | A | `{ approve: boolean, rejectionReason?: string }` | `AdminPaymentDto` | `rejectionReason` wajib jika `approve=false` |

> **⚠️ GAP:** BELUM diimplementasikan. Butuh Tahap 5.

---

### A9. ADMIN — MASTER DATA (sudah diimplementasikan ✓)

| Method | Path | Akses | Request | Response `data` |
|--------|------|-------|---------|-----------------|
| `GET` | `/api/admin/models` | A | `?includeInactive=` | `GarmentModelDto[]` |
| `POST` | `/api/admin/models` | A | `CreateGarmentModelDto` | `GarmentModelDto` |
| `PUT` | `/api/admin/models/:id` | A | `UpdateGarmentModelDto` | `GarmentModelDto` |
| `DELETE` | `/api/admin/models/:id` | A | — | `GarmentModelDto` (nonaktif) |
| `PUT` | `/api/admin/models/:id/fabrics` | A | `{ fabricIds: number[] }` | `GarmentModelDto` |
| `GET/POST/PUT/DELETE` | `/api/admin/fabrics(/:id)` | A | `CreateFabricDto` / `UpdateFabricDto` | `FabricDto` |
| `GET/POST/PUT/DELETE` | `/api/admin/fabrics/:id/colors(/:colorId)` | A | `CreateFabricColorDto` / `UpdateFabricColorDto` | `FabricColorDto` |
| `GET/POST/PUT/DELETE` | `/api/admin/sizes(/:id)` | A | `CreateSizeDto` / `UpdateSizeDto` | `SizeDto` |
| `GET/POST/PUT/DELETE` | `/api/admin/print-sizes(/:id)` | A | `CreatePrintSizeDto` / `UpdatePrintSizeDto` | `PrintSizeDto` |
| `GET/POST/PUT/DELETE` | `/api/admin/payment-accounts(/:id)` | A | `CreatePaymentAccountDto` / `UpdatePaymentAccountDto` | `PaymentAccountDto` |
| `GET` | `/api/admin/settings` | A | — | `AppSettingsResponseDto` |
| `PUT` | `/api/admin/settings` | A | `UpdateAppSettingsDto` (partial) | `AppSettingsResponseDto` |
| `POST` | `/api/admin/uploads/image` | A | `multipart/form-data: image` + `?folder=models\|fabrics\|qris\|...` | `CatalogImageUploadDto` |

---

### A10. ADMIN — DASHBOARD & LAPORAN

| Method | Path | Akses | Request | Response `data` | Catatan |
|--------|------|-------|---------|-----------------|---------|
| `GET` | `/api/admin/dashboard` | A | — | `DashboardDto` | Metrik ringkas |
| `GET` | `/api/admin/reports/sales` | A | `?from=&to=&groupBy=day\|month&format=csv` | Laporan/CSV | |
| `GET` | `/api/admin/reports/orders` | A | `?from=&to=&format=csv` | Laporan/CSV | |
| `GET` | `/api/admin/reports/top-models` | A | `?from=&to=&format=csv` | Laporan/CSV | |
| `GET` | `/api/admin/reports/customers` | A | `?from=&to=&format=csv` | Laporan/CSV | |

> **⚠️ GAP:** Dashboard & laporan **BELUM diimplementasikan**. Butuh Tahap 6.

---

### A11. HEALTH CHECK

| Method | Path | Akses | Response `data` |
|--------|------|-------|-----------------|
| `GET` | `/api/health` | P | `HealthStatusDto: { status: 'ok', env, timestamp }` |
| `GET` | `/api/health/db` | P | `DbHealthStatusDto: { status: 'ok', database, publicTables, utcNow, wibNow }` |

> **Status:** Sudah diimplementasikan ✓ (dipakai Home.tsx)

---

## B. ENUM & STATE MACHINE

### B1. Semua Enum (`@yng/shared/enums.ts`)

```typescript
// Role (DB, bukan Guest)
USER_ROLE: 'ADMIN' | 'USER'

// Metode Bayar
PAYMENT_METHOD: 'QRIS' | 'BANK_TRANSFER'

// Sumber Order
ORDER_SOURCE: 'WEBSITE' | 'WHATSAPP' | 'INSTAGRAM' | 'MANUAL'

// Tipe Pengiriman
FULFILLMENT_TYPE: 'SHIP' | 'PICKUP'

// Skema Bayar
PAYMENT_SCHEME: 'FULL' | 'DP'

// Tahap Tagihan
PAYMENT_STAGE: 'DP' | 'SETTLEMENT' | 'FULL' | 'SHIPPING_FEE'

// Status Pembayaran
PAYMENT_STATUS: 'PENDING' | 'VERIFIED' | 'REJECTED'

// Status Produksi
PRODUCTION_STATUS: 'NEW_ORDER' | 'PRINT_QUEUE' | 'PRESSING_QC' | 'AWAITING_SETTLEMENT' | 'SHIPPING' | 'COMPLETED' | 'CANCELLED'

// Status Desain
DESIGN_STATUS: 'PENDING' | 'NEED_REVISION' | 'APPROVED'

// Posisi Sablon
PRINT_POSITION: 'FRONT_CHEST' | 'FRONT_CENTER' | 'BACK_CENTER' | 'BACK_UPPER' | 'LEFT_SLEEVE' | 'RIGHT_SLEEVE' | 'COLLAR' | 'OTHER'

// DPI (Fase 2)
DPI_STATUS: 'OK' | 'WARNING' | 'LOW' | 'UNKNOWN'

// Kolektif (Fase 2)
COLLECTIVE_STATUS: 'OPEN' | 'CLOSED' | 'CHECKED_OUT' | 'EXPIRED'

// Kurir
COURIER_CODES: 'JNE' | 'JNT' | 'SICEPAT' | 'ANTERAJA' | 'POS' | 'NINJA' | 'GOJEK' | 'GRAB' | 'OTHER'
```

### B2. State Machine Produksi

```
NEW_ORDER ──[desain APPROVED + bayar awal VERIFIED, admin tekan]──> PRINT_QUEUE
PRINT_QUEUE ──[admin mulai/selesai cetak]──> PRESSING_QC
PRESSING_QC ──[≥1 foto QC + ongkir diinput]──┬──> AWAITING_SETTLEMENT  (remaining_balance > 0)
                                              └──> SHIPPING            (remaining_balance = 0)
AWAITING_SETTLEMENT ──[pembayaran akhir VERIFIED]──> SHIPPING
SHIPPING ──[admin tandai selesai / auto N hari]──> COMPLETED
NEW_ORDER / PRINT_QUEUE ──[admin / expired]──> CANCELLED
```

**Validasi admin untuk SHIPPING:**
- `SHIP`: wajib alamat lengkap + kurir + resi
- `PICKUP`: tidak perlu; `shipped_at` = waktu siap diambil

### B3. State Machine Desain

```
PENDING ──[admin review]──> NEED_REVISION ──[customer revisi]──> PENDING
PENDING ──[admin setujui]──> APPROVED
APPROVED ──[syarat masuk PRINT_QUEUE]
```

### B4. State Machine Pembayaran

```
PENDING (tanpa bukti) ──[customer upload]──> PENDING (dengan bukti)
PENDING (dengan bukti) ──[admin verifikasi]──> VERIFIED
PENDING (dengan bukti) ──[admin tolak]──> REJECTED
REJECTED ──[customer upload ulang]──> PENDING (dengan bukti)
```

**Label dinamis tahap bayar (dari `statusLabels.ts`):**
- `DP` → `"DP {dp_percent_snapshot}%"`
- `SETTLEMENT` → `"PELUNASAN {100-pct}% + ONGKIR"` (jika ongkir > 0)
- `FULL` → `"LUNAS"`
- `SHIPPING_FEE` → `"ONGKIR"`

### B5. Skema Bayar & Gatekeeper DP

```
total_qty (item tercentang) < dp_min_qty (dari /api/catalog/config)
  → payment_scheme = FULL (dikunci, DP tidak bisa dipilih)

total_qty (item tercentang) >= dp_min_qty
  → payment_scheme = DP tersedia (DP default) atau FULL (opsional)
  
Label TIDAK boleh hardcode "70%" atau "12 pcs" — baca dari GET /api/catalog/config
```

---

## C. PEMETAAN HALAMAN → ENDPOINT

### C1. Publik (Guest)

| Halaman | Route | Endpoint yang Dipakai |
|---------|-------|----------------------|
| Beranda | `/` | `GET /api/health` (health check badge) |
| Login | `/login` | `POST /api/auth/login` |
| Register | `/register` | `POST /api/auth/register` |
| Custom Lab (wizard) | `/custom-lab` | `GET /api/catalog/models`, `GET /api/catalog/models/:slug`, `GET /api/catalog/sizes`, `GET /api/catalog/print-sizes`, `GET /api/catalog/config`, `POST /api/pricing/quote` |
| Upload desain (dalam wizard) | `/custom-lab` | `POST /api/uploads/design` **(U)** |
| Live Tracker — lookup | `/track` | `POST /api/track` |
| Live Tracker — detail | `/track/:uuid` | `GET /api/track/:uuid` |
| Upload bukti (dari tracker) | `/track/:uuid` | `GET /api/orders/:uuid/payments`, `POST /api/orders/:uuid/payments/:paymentUuid/proof` |

### C2. USER (Pelanggan Login)

| Halaman | Route | Endpoint yang Dipakai |
|---------|-------|----------------------|
| Profil & Alamat | `/akun` | `GET /api/auth/me`, `PUT /api/me/profile`, `GET/POST/PUT/DELETE /api/me/addresses`, `PUT /api/auth/password`, `POST /api/me/deactivate` |
| Keranjang | `/keranjang` | `GET /api/cart/items`, `PUT /api/cart/items/:uuid`, `DELETE /api/cart/items/:uuid`, `POST /api/pricing/quote` |
| Checkout | `/checkout` | `GET /api/me/addresses`, `GET /api/catalog/config`, `GET /api/payment-accounts`, `POST /api/orders` (dengan `Idempotency-Key`) |
| Order sukses | `/pesanan/:uuid` (redirect) | — |
| Pesanan Saya (list) | `/pesanan` | `GET /api/me/orders` |
| Pesanan Saya (detail) | `/pesanan/:uuid` | `GET /api/me/orders/:uuid`, `GET /api/orders/:uuid/payments`, `POST /api/orders/:uuid/payments/:paymentUuid/proof` |

### C3. ADMIN

| Halaman | Route | Endpoint yang Dipakai |
|---------|-------|----------------------|
| Dashboard Kanban | `/admin` | `GET /api/admin/dashboard`, `GET /api/admin/orders/board` |
| Daftar Order | `/admin/orders` | `GET /api/admin/orders` |
| Detail Order | `/admin/orders/:id` | `GET /api/admin/orders/:id`, `PUT .../design`, `PUT .../status`, `PUT .../notes`, `GET .../spk`, `GET .../whatsapp`, `POST .../qc-photos`, `DELETE .../qc-photos/:photoId`, `PUT .../shipping-cost`, `PUT .../shipment`, `PUT .../cancel`, `PUT .../address`, `PUT .../discount`, `PUT .../items` |
| Verifikasi Pembayaran | `/admin/payments` | `GET /api/admin/payments`, `PUT /api/admin/payments/:id/verify` |
| Order Manual | `/admin/orders/manual` | `POST /api/admin/orders/manual`, `POST /api/admin/uploads/design` |
| Master Data | `/admin/master` | CRUD `/api/admin/models`, `/api/admin/fabrics`, `/api/admin/sizes`, `/api/admin/print-sizes` + `/api/admin/uploads/image` |
| Rekening & QRIS | `/admin/payment-accounts` | CRUD `/api/admin/payment-accounts` + `/api/admin/uploads/image` |
| Pengaturan | `/admin/settings` | `GET/PUT /api/admin/settings` |
| Laporan | `/admin/reports` | `GET /api/admin/reports/*` |

---

## D. GAP, INKONSISTENSI & ASUMSI

### D1. Endpoint Backend Belum Diimplementasikan (Gap Kritis untuk Frontend)

| Gap | Endpoint | Butuh di Fase Frontend |
|-----|----------|------------------------|
| **G1** | `GET /api/catalog/models`, `GET /api/catalog/models/:slug`, `GET /api/catalog/fabrics`, `GET /api/catalog/sizes`, `GET /api/catalog/print-sizes`, `GET /api/catalog/config` | Fase 2 (Custom Lab) |
| **G2** | `GET /api/payment-accounts` (publik) | Fase 2, 3b (Checkout) |
| **G3** | `POST /api/pricing/quote` | Fase 2, 3a |
| **G4** | `POST /api/uploads/design`, `POST /api/admin/uploads/design` | Fase 2, 5 |
| **G5** | `GET/POST/PUT/DELETE /api/cart/items` | Fase 3a |
| **G6** | `POST /api/orders`, `GET/POST /api/orders/:uuid/payments(/:paymentUuid/proof)` | Fase 3b |
| **G7** | `GET /api/me/orders`, `GET /api/me/orders/:uuid` | Fase 3b |
| **G8** | `POST /api/track`, `GET /api/track/:uuid` | Fase 4 |
| **G9** | Semua `/api/admin/orders/*` (kanban, detail, status, SPK, QC, dll.) | Fase 5 |
| **G10** | `GET/PUT /api/admin/payments/:id/verify` | Fase 5 |
| **G11** | `GET /api/admin/dashboard`, `GET /api/admin/reports/*` | Fase 6 |

### D2. Inkonsistensi SPEC vs Kode Backend Aktual

| ID | SPEC menyebutkan | Kode backend aktual | Dampak Frontend |
|----|-----------------|---------------------|-----------------|
| **I1** | `GET /api/me/orders` dan `GET /api/me/orders/:uuid` di SPEC Bagian 10 | Tidak ada di `accountRoutes.ts` saat ini | Frontend harus menunggu backend selesai; sementara pakai placeholder |
| **I2** | SPEC menyebut `POST /api/uploads/design` mengembalikan `{file_ref, file_name, width, height}` | Belum ada implementasi — perlu dikonfirmasi field exakt di controller nanti | Pastikan field name sesuai saat Tahap 2 backend selesai |
| **I3** | SPEC menyebut tracker menampilkan "signed URL foto QC" | DTO tracker belum ada di `@yng/shared` | Perlu tambah `TrackOrderDto` ke `shared/src/api.ts` |
| **I4** | `GET /api/admin/orders/board` disebutkan SPEC tapi belum ada schema DTO di shared | Belum jelas struktur response board (apakah `Record<ProductionStatus, OrderCard[]>` atau array) | **ASUMSI A-FE-1:** Gunakan `Record<ProductionStatus, AdminOrderCardDto[]>` |
| **I5** | `GET /api/admin/orders/:id/whatsapp?template=` belum ada list template yang terdefinisi di shared | Tidak ada enum template di `@yng/shared` | **ASUMSI A-FE-2:** Template: `order_received`, `design_revision`, `custom_color`, `payment_verified`, `print_queue`, `qc_done`, `shipped`, `pickup_ready` |

### D3. Asumsi Frontend (ASSUMPTION)

| ID | Asumsi | Alasan |
|----|--------|--------|
| **A-FE-1** | Kanban board response = `Record<ProductionStatus, AdminOrderCardDto[]>` | Paling umum untuk client-side grouping |
| **A-FE-2** | WhatsApp template names menggunakan snake_case sesuai SPEC 6.7 | Belum ada enum di shared |
| **A-FE-3** | Frontend menggunakan **TanStack Query (React Query)** untuk data-fetching server | Alasan: caching otomatis, stale-while-revalidate, loading/error state built-in, dedup concurrent request — jauh lebih rapi dibanding manual `useEffect+useState` untuk 20+ endpoint |
| **A-FE-4** | State global menggunakan **Zustand** untuk cart state lokal (item tercentang, konfigurasi sementara) + **AuthContext** yang sudah ada untuk auth | Cart state perlu persist across route, Zustand lebih ringan dari Redux |
| **A-FE-5** | Config wizard Custom Lab disimpan sementara di **sessionStorage** (bukan localStorage) agar hilang setelah tab ditutup | Tidak sensitif; hanya config sementara sebelum login |
| **A-FE-6** | Upload progress ditampilkan via `XMLHttpRequest` / `axios` `onUploadProgress` | Axios mendukung ini natively |
| **A-FE-7** | Idempotency-Key untuk checkout dibuat di frontend dengan `crypto.randomUUID()` per percobaan submit | SPEC 6.6 mensyaratkan UUID |
| **A-FE-8** | File SPK PDF dibuka di tab baru (`window.open`) bukan diunduh paksa | UX lebih baik; pengguna bisa cetak dari browser |
| **A-FE-9** | Nomor WhatsApp dinormalisasi di frontend sebelum dikirim (helper `phone.ts` di utils) HANYA untuk UX (tampilan); validasi tetap di server | Mengikuti pola backend `normalizeWhatsApp()` |
| **A-FE-10** | Halaman `/track/:uuid` dan `/pesanan/:uuid` berbagi komponen `OrderTimeline` dan `PaymentSection` yang di-reuse | DRY principle |
| **A-FE-11** | Admin layout menambahkan item navigasi baru: `Kanban`, `Orders`, `Payments`, `Order Manual`, `Reports` selain yang sudah ada | Sesuai scope Tahap 5–6 |

---

## E. RINGKASAN DESAIN SISTEM FRONTEND

### E1. Tech Stack (konfirmasi dari kode aktual)

```
React 18 + Vite + TypeScript strict: true
React Router v6 (file-based routing di AppRoutes.tsx)
Axios (withCredentials: true, baseURL: VITE_API_BASE_URL || '/api')
Tailwind CSS (zero border-radius, font Space Grotesk/Inter/JetBrains Mono)
@yng/shared (DTO, enum, couriers — JANGAN duplikasi)

Tambahan yang direkomendasikan:
- TanStack Query v5 (data-fetching, caching)
- Zustand v4 (cart state)
```

### E2. Auth Pattern (dari kode aktual)

- **Cookie `httpOnly`** bernama `yng_admin_token` — frontend tidak perlu menyimpan token
- **`AuthContext`** sudah ada: `user`, `role`, `isGuest`, `loading`, `checked`, `checkSession`, `login`, `register`, `logout`
- **`ProtectedRoute`** dan **`AdminRoute`** sudah ada di `routes/`
- Redirect setelah login: `state.from` → `/admin` jika ADMIN → `/` default

### E3. Design Tokens (dari Tailwind config aktual)

```
ink: #09090b        bone: #fafafa       surface: #ffffff
muted: #71717a      line: #e4e4e7       line-strong: #18181b
status-ok: #15803d  status-warn: #b45309  status-err: #b91c1c
border-radius: 0px (semua)
font-display: Space Grotesk
font-sans: Inter
font-mono: JetBrains Mono
min-height-touch: 44px
```

### E4. CSS Class Utilities (dari index.css aktual)

```css
.btn-primary    — hitam solid, hover abu-abu gelap
.btn-secondary  — outline hitam, hover hitam/putih
.input-sharp    — border line-strong, focus border-ink
.card-sharp     — border line-strong, bg-surface
.tabular-price  — font-mono tabular-nums
```

### E5. Axios Instance (dari api.ts aktual)

- `baseURL`: `VITE_API_BASE_URL` atau `/api`
- `withCredentials: true`
- `timeout: 15000ms`
- Error interceptor → `ApiClientError` dengan `status`, `message`, `data`
- **Yang perlu ditambahkan:**
  - Interceptor 401 → `logout()` + redirect `/login`
  - Interceptor 403 → redirect atau show error state
  - Mendukung `multipart/form-data` (override `Content-Type` otomatis oleh browser)

### E6. Struktur Folder Target

```
frontend/src/
├── components/
│   ├── ui/              # Button, Input, Select, Badge, Modal, Drawer, Toast, Skeleton, EmptyState, ErrorState
│   ├── layout/          # Navbar, Footer (extracted dari PublicLayout/AdminLayout)
│   ├── order/           # OrderTimeline, PaymentSection, QcPhotos, CourierLink
│   ├── admin/           # AdminFeedbackBanner ✓, CatalogImageField ✓, KanbanColumn, OrderCard
│   └── forms/           # AddressForm, SizeMatrix, PrintSpotPicker, ColorPicker, FileDropzone
├── features/
│   ├── auth/            # halaman Login ✓, Register ✓
│   ├── account/         # halaman Account ✓
│   ├── custom-lab/      # wizard CustomLab, cart hooks
│   ├── cart/            # halaman Cart, Checkout, OrderSuccess
│   ├── orders/          # halaman MyOrders, MyOrderDetail
│   ├── tracker/         # halaman TrackLookup, TrackDetail
│   └── admin/
│       ├── kanban/      # Kanban board
│       ├── orders/      # OrderDetail, ManualOrder
│       ├── payments/    # PaymentVerification
│       ├── master/      # MasterData ✓, tabs ✓
│       ├── reports/     # Reports, Dashboard
│       └── settings/    # Settings ✓, PaymentAccounts ✓
├── services/            # api.ts ✓, authService.ts ✓, adminMasterService.ts ✓, accountService.ts ✓
│                        # + catalogService, pricingService, cartService, orderService, trackerService, adminOrderService, adminPaymentService, reportService
├── hooks/               # useCart, useAuth ✓ (via context), useCatalog, useOrderDetail
├── context/             # AuthContext.tsx ✓
├── routes/              # AppRoutes.tsx ✓, ProtectedRoute.tsx ✓, AdminRoute.tsx ✓
├── utils/               # formatRupiah.ts ✓, statusLabels.ts ✓, apiError.ts ✓
│                        # + whatsapp.ts, phone.ts, idempotency.ts
└── lib/                 # queryClient.ts (TanStack Query), store.ts (Zustand)
```

---

## F. RENCANA FASE IMPLEMENTASI FRONTEND

| Fase | Scope | Prerequisite Backend |
|------|-------|----------------------|
| **Fase 0** | Audit + dokumen ini | ✓ |
| **Fase 1** | Design system UI, komponen reusable, axios layer (401/403 interceptor), layout update, health check | ✓ (sudah ada) |
| **Fase 2** | Beranda (rapi), Custom Lab wizard, kalkulasi harga, Live Tracker publik | Tahap 2 backend (catalog + pricing + tracker) |
| **Fase 3** | Keranjang, checkout, Pesanan Saya, upload bukti | Tahap 3a + 3b + 4 backend |
| **Fase 4** | Admin Kanban, detail order, verifikasi bayar, SPK, QC, resi, WA | Tahap 5 backend |
| **Fase 5** | Admin order manual, master data lanjutan, laporan | Tahap 5–6 backend |
| **Fase 6** | Polish, aksesibilitas, test Vitest, update PROGRESS.md | — |

---

*Dokumen ini bersumber dari kode aktual backend saat audit (2026-11-24). Update jika ada perubahan backend.*
