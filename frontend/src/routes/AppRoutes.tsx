import { Link, Navigate, Route, Routes } from 'react-router-dom';
import AdminLayout from '../layouts/AdminLayout';
import PublicLayout from '../layouts/PublicLayout';
import Home from '../pages/Home';
import NotFound from '../pages/NotFound';
import Account from '../pages/account/Account';
import MyOrderDetail from '../pages/account/MyOrderDetail';
import MyOrders from '../pages/account/MyOrders';
import AdminOrderDetail from '../pages/admin/AdminOrderDetail';
import AdminOrders from '../pages/admin/AdminOrders';
import KanbanBoard from '../pages/admin/KanbanBoard';
import MasterData from '../pages/admin/MasterData';
import PaymentAccounts from '../pages/admin/PaymentAccounts';
import PaymentsQueue from '../pages/admin/PaymentsQueue';
import Settings from '../pages/admin/Settings';
import Login from '../pages/auth/Login';
import Register from '../pages/auth/Register';
import Cart from '../pages/custom-lab/Cart';
import Checkout from '../pages/custom-lab/Checkout';
import CustomLab from '../pages/custom-lab/CustomLab';
import TrackDetail from '../pages/track/TrackDetail';
import TrackLookup from '../pages/track/TrackLookup';
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

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/custom-lab" element={<CustomLab />} />

        {/* Live Tracker — Publik (Tahap 4) */}
        <Route path="/track" element={<TrackLookup />} />
        <Route path="/track/:uuid" element={<TrackDetail />} />
        <Route path="/lacak" element={<Navigate to="/track" replace />} />
        <Route path="/lacak/:uuid" element={<TrackDetail />} />

        {/* Route terlindungi USER */}
        <Route element={<ProtectedRoute />}>
          <Route path="/akun" element={<Account />} />
          <Route path="/keranjang" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/checkout/sukses" element={<Navigate to="/pesanan" replace />} />
          <Route path="/pesanan" element={<MyOrders />} />
          <Route path="/pesanan/:uuid" element={<MyOrderDetail />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Route>

      {/* Admin routes */}
      <Route element={<AdminLayout />}>
        <Route path="/admin" element={<AdminRoute />}>
          <Route index element={<Navigate to="/admin/kanban" replace />} />
          <Route path="kanban" element={<KanbanBoard />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route
            path="orders/manual"
            element={
              <StagePlaceholder
                stage="Tahap 5-3"
                title="Order Manual"
                description="Pencatatan order manual dari WhatsApp atau Instagram akan tersedia pada Tahap 5-3."
              />
            }
          />
          <Route path="orders/:uuid" element={<AdminOrderDetail />} />
          <Route path="payments" element={<PaymentsQueue />} />
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
