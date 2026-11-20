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
import AdminRoute from './AdminRoute';
import ProtectedRoute from './ProtectedRoute';

interface StagePlaceholderProps {
  stage: string;
  title: string;
  description: string;
}

function StagePlaceholder({ stage, title, description }: StagePlaceholderProps) {
  return (
    <div className="card-sharp mx-auto max-w-xl p-6 sm:p-8">
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted">{stage}</p>
      <h1 className="mt-2 font-display text-2xl font-bold uppercase tracking-[0.08em]">{title}</h1>
      <p className="mt-3 text-sm text-neutral-600">{description}</p>
      <div className="mt-6">
        <Link to="/" className="btn-secondary">
          Kembali ke Beranda
        </Link>
      </div>
    </div>
  );
}

function AdminDashboardPlaceholder() {
  return (
    <div className="space-y-6">
      <section className="card-sharp p-6 sm:p-8">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted">
          Admin Studio · Tahap 5
        </p>
        <h1 className="mt-2 font-display text-2xl font-bold uppercase tracking-[0.08em]">
          Dashboard Kanban
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-neutral-600">
          Kanban produksi Solo-Admin akan dibangun pada Tahap 5. Gunakan menu di bawah atau bar
          navigasi di atas untuk mengelola master data katalog, rekening pembayaran, dan pengaturan
          toko sekarang.
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
      </section>
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
        <Route
          path="/custom-lab"
          element={
            <StagePlaceholder
              stage="Tahap 2"
              title="Custom Lab"
              description="Wizard studio pemesanan pakaian custom dan kalkulator harga real-time akan dibangun pada Tahap 2."
            />
          }
        />
        <Route
          path="/track"
          element={
            <StagePlaceholder
              stage="Tahap 4"
              title="Live Tracker"
              description="Pelacakan status produksi 5 tahap dengan kode order dan 4 digit terakhir WhatsApp akan dibangun pada Tahap 4."
            />
          }
        />

        <Route element={<ProtectedRoute />}>
          <Route path="/akun" element={<Account />} />
          <Route
            path="/keranjang"
            element={
              <StagePlaceholder
                stage="Tahap 3a"
                title="Keranjang Custom Lab"
                description="Halaman keranjang dengan hitung ulang harga server dan pemilihan item checkout akan dibangun pada Tahap 3a."
              />
            }
          />
          <Route
            path="/checkout"
            element={
              <StagePlaceholder
                stage="Tahap 3b"
                title="Checkout Pesanan"
                description="Halaman checkout dari item keranjang tercentang dengan gatekeeper DP akan dibangun pada Tahap 3b."
              />
            }
          />
          <Route
            path="/pesanan"
            element={
              <StagePlaceholder
                stage="Tahap 3b"
                title="Pesanan Saya"
                description="Daftar pesanan milik akun Anda akan dibangun pada Tahap 3b."
              />
            }
          />
          <Route
            path="/pesanan/:uuid"
            element={
              <StagePlaceholder
                stage="Tahap 3b"
                title="Detail Pesanan"
                description="Detail pesanan beserta rincian pembayaran dan tombol lacak resi kurir akan dibangun pada Tahap 3b."
              />
            }
          />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Route>

      <Route element={<AdminLayout />}>
        <Route path="/admin" element={<AdminRoute />}>
          <Route index element={<AdminDashboardPlaceholder />} />
          <Route path="master" element={<MasterData />} />
          <Route path="payment-accounts" element={<PaymentAccounts />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
