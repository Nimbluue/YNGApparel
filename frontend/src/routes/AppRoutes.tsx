import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AdminLayout from '../layouts/AdminLayout';
import PublicLayout from '../layouts/PublicLayout';
import Catalog from '../pages/Catalog';
import Home from '../pages/Home';
import NotFound from '../pages/NotFound';
import Wishlist from '../pages/Wishlist';
import Account from '../pages/account/Account';
import MyOrderDetail from '../pages/account/MyOrderDetail';
import MyOrders from '../pages/account/MyOrders';
import AdminOrderDetail from '../pages/admin/AdminOrderDetail';
import AdminOrders from '../pages/admin/AdminOrders';
import KanbanBoard from '../pages/admin/KanbanBoard';
import ManualOrder from '../pages/admin/ManualOrder';
import MasterData from '../pages/admin/MasterData';
import PaymentAccounts from '../pages/admin/PaymentAccounts';
import PaymentsQueue from '../pages/admin/PaymentsQueue';
import Reports from '../pages/admin/Reports';
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

function RedirectPreservingSearch({ to }: { to: string }) {
  const location = useLocation();
  return <Navigate to={{ pathname: to, search: location.search }} replace />;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/katalog" element={<Catalog />} />
        <Route path="/catalog" element={<RedirectPreservingSearch to="/katalog" />} />
        <Route path="/wishlist" element={<Wishlist />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/custom-lab" element={<CustomLab />} />

        {/* Live Tracker — Publik (Tahap 4) */}
        <Route path="/track" element={<TrackLookup />} />
        <Route path="/track/:uuid" element={<TrackDetail />} />
        <Route path="/lacak" element={<Navigate to="/track" replace />} />
        <Route path="/lacak/:uuid" element={<TrackDetail />} />

        {/* Alias rute bahasa Inggris ke path kanonik Indonesia */}
        <Route path="/cart" element={<RedirectPreservingSearch to="/keranjang" />} />
        <Route path="/account" element={<RedirectPreservingSearch to="/akun" />} />
        <Route path="/account/orders" element={<RedirectPreservingSearch to="/pesanan" />} />

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
          <Route path="orders/new" element={<ManualOrder />} />
          <Route path="orders/manual" element={<ManualOrder />} />
          <Route path="orders/:uuid" element={<AdminOrderDetail />} />
          <Route path="payments" element={<PaymentsQueue />} />
          <Route path="master" element={<MasterData />} />
          <Route path="payment-accounts" element={<PaymentAccounts />} />
          <Route path="settings" element={<Settings />} />
          <Route path="reports" element={<Reports />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
