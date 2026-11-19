import { Link, Route, Routes } from 'react-router-dom';
import AdminLayout from '../layouts/AdminLayout';
import PublicLayout from '../layouts/PublicLayout';
import Home from '../pages/Home';
import NotFound from '../pages/NotFound';
import AdminRoute from './AdminRoute';

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
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route element={<AdminLayout />}>
        <Route
          path="/admin/login"
          element={
            <StagePlaceholder
              stage="Tahap 1"
              title="Login Admin"
              description="Halaman login admin dan manajemen master data akan dibangun pada Tahap 1."
            />
          }
        />
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
