import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';

export default function AdminRoute() {
  const { admin, checked, loading, checkSession } = useAdminAuth();

  useEffect(() => {
    if (!checked && !loading) {
      void checkSession();
    }
  }, [checked, loading, checkSession]);

  if (!checked || loading) {
    return (
      <div className="card-sharp p-6 text-center font-mono text-xs uppercase tracking-[0.14em] text-muted">
        Memverifikasi sesi admin...
      </div>
    );
  }

  if (!admin) {
    return <Navigate to="/admin/login" replace />;
  }

  return <Outlet />;
}
