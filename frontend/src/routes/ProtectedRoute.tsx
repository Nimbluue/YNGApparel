import type { UserRole } from '@yng/shared';
import { useEffect } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  role?: UserRole;
  redirectTo?: string;
}

export default function ProtectedRoute({ role, redirectTo = '/login' }: ProtectedRouteProps) {
  const { user, isGuest, checked, loading, checkSession } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!checked && !loading) {
      void checkSession();
    }
  }, [checked, loading, checkSession]);

  if (!checked || loading) {
    return (
      <div className="card-sharp p-6 text-center font-mono text-xs uppercase tracking-[0.14em] text-muted">
        Memverifikasi sesi akun...
      </div>
    );
  }

  if (isGuest || !user) {
    return <Navigate to={redirectTo} replace state={{ from: location }} />;
  }

  if (role && user.role !== role) {
    return (
      <div className="card-sharp mx-auto max-w-lg p-8 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-status-err">403</p>
        <h1 className="mt-2 font-display text-2xl font-bold uppercase tracking-[0.1em]">
          Akses Ditolak
        </h1>
        <p className="mt-3 text-sm text-neutral-600">
          Akun Anda tidak memiliki izin untuk membuka halaman ini.
        </p>
        <div className="mt-6">
          <Link to="/" className="btn-primary">
            Kembali ke Beranda
          </Link>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
