import { Link, Route, Routes } from 'react-router-dom';
import AdminLayout from '../layouts/AdminLayout';
import PublicLayout from '../layouts/PublicLayout';
import Home from '../pages/Home';
import NotFound from '../pages/NotFound';
import Account from '../pages/account/Account';
import MasterData from '../pages/admin/MasterData';
import PaymentAccounts from '../pages/admin/PaymentAccounts';
import Settings from '../pages/admin/Settings';
import Login from '../pages/auth/Login';
import Register from '../pages/auth/Register';
import CustomLab from '../pages/custom-lab/CustomLab';
import AdminRoute from './AdminRoute';
import ProtectedRoute from './ProtectedRoute';

interface StagePlaceholderProps {
  stage: string;
  title: string;
  description: string;
}

function StagePlaceholder({ stage, title, description }: StagePlaceholderProps) {
  return (
    <div className="mx-auto max-w-2xl rounded-3xl border border-line bg-surface p-6 py-10 sm:p-10">
      <p className="eyebrow">YNG Studio · {stage}</p>
      <h1 className="mt-3 font-display text-3xl font-semibold text-ink sm:text-4xl">{title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">{description}</p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link to="/custom-lab" className="btn-primary">
          Buka Custom Lab
        </Link>
        <Link to="/" className="btn-secondary">
          Kembali ke Beranda
        </Link>
      </div>
    </div>
  );
}

function AdminDashboardPlaceholder() {
  return (
    <div className="rounded-3xl border border-line bg-white p-6 sm:p-10">
      <p className="eyebrow">YNG Apparel · Ruang Produksi</p>
      <h1 className="mt-3 font-display text-3xl font-semibold text-ink sm:text-4xl">
        Panel Operasional Workshop
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
        Kelola data katalog, rekening pembayaran, dan pengaturan toko. Board Kanban &amp; manajemen
        order akan aktif pada Tahap 5.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Link to="/admin/master" className="btn-primary w-full">
          Master Data Katalog
        </Link>
        <Link to="/admin/payment-accounts" className="btn-secondary w-full">
          Rekening &amp; QRIS
        </Link>
        <Link to="/admin/settings" className="btn-secondary w-full">
          Pengaturan Toko
        </Link>
      </div>
    </div>
  );
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/custom-lab" element={<CustomLab />} />

        {/* Live Tracker — Publik (Tahap 4) */}
        <Route
          path="/track"
          element={
            <StagePlaceholder
              stage="Tahap 4"
              title="Live Tracker"
              description="Pantau status produksi dan informasi pengiriman pesanan menggunakan kode order dan 4 digit akhir WhatsApp."
            />
          }
        />
        <Route
          path="/track/:uuid"
          element={
            <StagePlaceholder
              stage="Tahap 4"
              title="Detail Tracker"
              description="Ringkasan progres produksi dan pengiriman untuk tautan tracker pesanan."
            />
          }
        />

        {/* Route terlindungi USER */}
        <Route element={<ProtectedRoute />}>
          <Route path="/akun" element={<Account />} />

          <Route
            path="/keranjang"
            element={
              <StagePlaceholder
                stage="Tahap 3a"
                title="Keranjang Custom Lab"
                description="Penyimpanan konfigurasi ke keranjang dan unggah file desain akan tersedia pada Tahap 3a."
              />
            }
          />
          <Route
            path="/checkout"
            element={
              <StagePlaceholder
                stage="Tahap 3b"
                title="Checkout Pesanan"
                description="Konfirmasi pengiriman, skema pembayaran, dan pembuatan pesanan akan tersedia pada Tahap 3b."
              />
            }
          />
          <Route
            path="/checkout/sukses"
            element={
              <StagePlaceholder
                stage="Tahap 3b"
                title="Order Berhasil"
                description="Instruksi pembayaran dan unggah bukti transfer akan tampil di sini setelah checkout selesai."
              />
            }
          />
          <Route
            path="/pesanan"
            element={
              <StagePlaceholder
                stage="Tahap 3b"
                title="Pesanan Saya"
                description="Daftar pesanan yang terhubung dengan akun Anda akan tersedia pada Tahap 3b."
              />
            }
          />
          <Route
            path="/pesanan/:uuid"
            element={
              <StagePlaceholder
                stage="Tahap 3b"
                title="Detail Pesanan"
                description="Rincian tagihan, foto QC, dan tombol pelacakan resi akan tersedia pada Tahap 3b."
              />
            }
          />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Route>

      {/* Admin routes */}
      <Route element={<AdminLayout />}>
        <Route path="/admin" element={<AdminRoute />}>
          <Route index element={<AdminDashboardPlaceholder />} />
          <Route
            path="kanban"
            element={
              <StagePlaceholder
                stage="Tahap 5"
                title="Kanban Produksi"
                description="Board antrean produksi dan verifikasi order akan tersedia pada Tahap 5."
              />
            }
          />
          <Route
            path="orders"
            element={
              <StagePlaceholder
                stage="Tahap 5"
                title="Semua Order"
                description="Daftar dan pencarian pesanan masuk workshop akan tersedia pada Tahap 5."
              />
            }
          />
          <Route
            path="orders/manual"
            element={
              <StagePlaceholder
                stage="Tahap 5"
                title="Order Manual"
                description="Pencatatan order manual dari WhatsApp atau Instagram akan tersedia pada Tahap 5."
              />
            }
          />
          <Route
            path="orders/:id"
            element={
              <StagePlaceholder
                stage="Tahap 5"
                title="Detail Order Admin"
                description="Detail produksi, SPK PDF, foto QC, dan pengiriman order akan tersedia pada Tahap 5."
              />
            }
          />
          <Route
            path="payments"
            element={
              <StagePlaceholder
                stage="Tahap 5"
                title="Verifikasi Pembayaran"
                description="Verifikasi bukti transfer dan QRIS pelanggan akan tersedia pada Tahap 5."
              />
            }
          />
          <Route path="master" element={<MasterData />} />
          <Route path="payment-accounts" element={<PaymentAccounts />} />
          <Route path="settings" element={<Settings />} />
          <Route
            path="reports"
            element={
              <StagePlaceholder
                stage="Tahap 6"
                title="Laporan"
                description="Ringkasan omzet, order, model terlaris, dan export CSV akan tersedia pada Tahap 6."
              />
            }
          />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
