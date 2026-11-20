import { Link, Route, Routes } from 'react-router-dom';
import AdminLayout from '../layouts/AdminLayout';
import PublicLayout from '../layouts/PublicLayout';
import Home from '../pages/Home';
import NotFound from '../pages/NotFound';
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

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route
          path="/login"
          element={
            <StagePlaceholder
              stage="Tahap 1b"
              title="Masuk Akun"
              description="Halaman login terpadu untuk pelanggan (USER) dan pemilik (ADMIN) akan dibangun pada Tahap 1."
            />
          }
        />
        <Route
          path="/register"
          element={
            <StagePlaceholder
              stage="Tahap 1b"
              title="Daftar Akun"
              description="Halaman registrasi pelanggan baru akan dibangun pada Tahap 1."
            />
          }
        />
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
          <Route
            path="/akun"
            element={
              <StagePlaceholder
                stage="Tahap 1b"
                title="Profil & Alamat Tersimpan"
                description="Halaman kelola profil, ganti password, dan alamat tersimpan akan dibangun pada Tahap 1b."
              />
            }
          />
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
          <Route
            index
            element={
              <StagePlaceholder
                stage="Tahap 5"
                title="Dashboard Kanban"
                description="Kanban produksi Solo-Admin akan dibangun setelah Tahap 1–4."
              />
            }
          />
        </Route>
      </Route>
    </Routes>
  );
}
