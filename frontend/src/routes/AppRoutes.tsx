import { lazy, Suspense } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { PageLoader } from '../components/ui/Spinner';
import AdminLayout from '../layouts/AdminLayout';
import PublicLayout from '../layouts/PublicLayout';

// Halaman yang sudah ada
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

// Ambil modul halaman yang memang sudah ada; rute tahap berikutnya tetap memakai placeholder.
const pageModules = import.meta.glob('../pages/**/*.tsx');

function lazyPage(modulePath: string) {
  return lazy(async () => {
    const loadModule = pageModules[modulePath];
    if (!loadModule) {
      throw new Error(`Halaman belum tersedia: ${modulePath}`);
    }
    return (await loadModule()) as { default: React.ComponentType<unknown> };
  });
}

// Custom Lab (Tahap 2)
const CustomLab = lazyPage('../pages/custom-lab/CustomLab.tsx');
// Live Tracker (Tahap 4)
const TrackLookup = lazyPage('../pages/track/TrackLookup.tsx');
const TrackDetail = lazyPage('../pages/track/TrackDetail.tsx');
// Pesanan (Tahap 3b)
const MyOrders = lazyPage('../pages/orders/MyOrders.tsx');
const MyOrderDetail = lazyPage('../pages/orders/MyOrderDetail.tsx');
// Keranjang & Checkout (Tahap 3a/3b)
const Cart = lazyPage('../pages/custom-lab/Cart.tsx');
const Checkout = lazyPage('../pages/custom-lab/Checkout.tsx');
const OrderSuccess = lazyPage('../pages/custom-lab/OrderSuccess.tsx');
// Admin (Tahap 5–6)
const Kanban = lazyPage('../pages/admin/Kanban.tsx');
const AdminOrderList = lazyPage('../pages/admin/AdminOrderList.tsx');
const AdminOrderDetail = lazyPage('../pages/admin/AdminOrderDetail.tsx');
const AdminManualOrder = lazyPage('../pages/admin/AdminManualOrder.tsx');
const AdminPayments = lazyPage('../pages/admin/AdminPayments.tsx');
const AdminReports = lazyPage('../pages/admin/AdminReports.tsx');

interface StagePlaceholderProps {
  stage: string;
  title: string;
  description: string;
}

function StagePlaceholder({ title, description }: StagePlaceholderProps) {
  return (
    <div className="work-ticket mx-auto max-w-3xl p-6 py-8 sm:p-10 sm:py-12">
      <p className="eyebrow">YNG / WORKSHOP</p>
      <h1 className="mt-4 font-display text-5xl font-black leading-[0.88] tracking-[-0.06em] sm:text-7xl">{title}</h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">{description}</p>
        <div className="mt-8">
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
      <section className="care-label relative p-6 sm:p-10">
        <p className="font-mono text-xs text-neutral-300">YNG APPAREL · RUANG PRODUKSI</p>
        <h1 className="mt-4 max-w-3xl font-display text-5xl font-black leading-[0.88] tracking-[-0.06em] text-bone sm:text-7xl">
          KERJAAN HARI INI.
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-neutral-600">
          Kelola data katalog, rekening pembayaran, dan pengaturan toko dari menu produksi.
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

/**
 * Wrapper untuk lazy page — tampilkan PageLoader saat loading,
 * dan StagePlaceholder jika modul belum ada (import gagal).
 */
function LazyPage({
  component: Component,
  fallback,
}: {
  component: React.LazyExoticComponent<React.ComponentType<unknown>>;
  fallback: StagePlaceholderProps;
}) {
  return (
    <Suspense fallback={<PageLoader />}>
      <ErrorBoundaryPlaceholder fallback={fallback}>
        <Component />
      </ErrorBoundaryPlaceholder>
    </Suspense>
  );
}

import React, { Component, type ReactNode } from 'react';

class ErrorBoundaryPlaceholder extends Component<
  { children: ReactNode; fallback: StagePlaceholderProps },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: StagePlaceholderProps }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return <StagePlaceholder {...this.props.fallback} />;
    }
    return this.props.children;
  }
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Custom Lab — Publik (Tahap 2) */}
        <Route
          path="/custom-lab"
          element={
            <LazyPage
              component={CustomLab}
              fallback={{
                stage: 'Tahap 2',
                title: 'Custom Lab',
                description:
                  'Pilih model, bahan, warna, ukuran, dan detail sablon untuk mulai menyusun pesanan.',
              }}
            />
          }
        />

        {/* Live Tracker — Publik (Tahap 4) */}
        <Route
          path="/track"
          element={
            <LazyPage
              component={TrackLookup}
              fallback={{
                stage: 'Tahap 4',
                title: 'Live Tracker',
                description:
                  'Temukan kabar pengerjaan pesanan dengan kode order dan nomor WhatsApp Anda.',
              }}
            />
          }
        />
        <Route
          path="/track/:uuid"
          element={
            <LazyPage
              component={TrackDetail}
              fallback={{
                stage: 'Tahap 4',
                title: 'Detail Tracker',
                description: 'Ringkasan pengerjaan dan pengiriman untuk pesanan ini.',
              }}
            />
          }
        />

        {/* Route terlindungi USER */}
        <Route element={<ProtectedRoute />}>
          <Route path="/akun" element={<Account />} />

          <Route
            path="/keranjang"
            element={
              <LazyPage
                component={Cart}
                fallback={{
                  stage: 'Tahap 3a',
                  title: 'Keranjang Custom Lab',
                  description:
                    'Konfigurasi yang Anda simpan akan tampil di sini sebelum checkout.',
                }}
              />
            }
          />
          <Route
            path="/checkout"
            element={
              <LazyPage
                component={Checkout}
                fallback={{
                  stage: 'Tahap 3b',
                  title: 'Checkout Pesanan',
                  description:
                    'Periksa rincian pesanan, pengiriman, dan pembayaran sebelum konfirmasi.',
                }}
              />
            }
          />
          <Route
            path="/checkout/sukses"
            element={
              <LazyPage
                component={OrderSuccess}
                fallback={{
                  stage: 'Tahap 3b',
                  title: 'Order Berhasil',
                  description: 'Pesanan Anda akan tampil di sini setelah konfirmasi berhasil.',
                }}
              />
            }
          />
          <Route
            path="/pesanan"
            element={
              <LazyPage
                component={MyOrders}
                fallback={{
                  stage: 'Tahap 3b',
                  title: 'Pesanan Saya',
                  description: 'Lihat kembali pesanan yang pernah Anda buat bersama YNG Apparel.',
                }}
              />
            }
          />
          <Route
            path="/pesanan/:uuid"
            element={
              <LazyPage
                component={MyOrderDetail}
                fallback={{
                  stage: 'Tahap 3b',
                  title: 'Detail Pesanan',
                  description:
                    'Rincian pembayaran, proses produksi, dan informasi pengiriman pesanan.',
                }}
              />
            }
          />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Route>

      {/* Admin routes — lazy load */}
      <Route element={<AdminLayout />}>
        <Route path="/admin" element={<AdminRoute />}>
          <Route
            index
            element={
              <LazyPage
                component={Kanban}
                fallback={{
                  stage: 'Tahap 5',
                  title: 'Kanban Produksi',
                  description: 'Pantau antrean kerja dan pergerakan pesanan dari ruang produksi.',
                }}
              />
            }
          />
          {/* Fallback ke placeholder jika Kanban belum ada */}
          <Route
            path="kanban"
            element={
              <LazyPage
                component={Kanban}
                fallback={{
                  stage: 'Tahap 5',
                  title: 'Kanban Produksi',
                  description: 'Pantau antrean kerja dan pergerakan pesanan dari ruang produksi.',
                }}
              />
            }
          />
          <Route
            path="orders"
            element={
              <LazyPage
                component={AdminOrderList}
                fallback={{
                  stage: 'Tahap 5',
                  title: 'Semua Order',
                  description: 'Cari dan kelola pesanan yang masuk ke workshop.',
                }}
              />
            }
          />
          <Route
            path="orders/:id"
            element={
              <LazyPage
                component={AdminOrderDetail}
                fallback={{
                  stage: 'Tahap 5',
                  title: 'Detail Order Admin',
                  description: 'Buka rincian produksi, pembayaran, dan pengiriman pesanan.',
                }}
              />
            }
          />
          <Route
            path="orders/manual"
            element={
              <LazyPage
                component={AdminManualOrder}
                fallback={{
                  stage: 'Tahap 5',
                  title: 'Order Manual',
                  description: 'Catat pesanan yang masuk melalui WhatsApp atau Instagram.',
                }}
              />
            }
          />
          <Route
            path="payments"
            element={
              <LazyPage
                component={AdminPayments}
                fallback={{
                  stage: 'Tahap 5',
                  title: 'Verifikasi Pembayaran',
                  description: 'Tinjau bukti pembayaran pelanggan dan perbarui statusnya.',
                }}
              />
            }
          />
          <Route path="master" element={<MasterData />} />
          <Route path="payment-accounts" element={<PaymentAccounts />} />
          <Route path="settings" element={<Settings />} />
          <Route
            path="reports"
            element={
              <LazyPage
                component={AdminReports}
                fallback={{
                  stage: 'Tahap 6',
                  title: 'Laporan',
                  description: 'Lihat ringkasan pesanan dan performa penjualan workshop.',
                }}
              />
            }
          />
          {/* Fallback placeholder sementara jika lazy page belum ada */}
          <Route index element={<AdminDashboardPlaceholder />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
