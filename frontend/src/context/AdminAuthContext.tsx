import type { AdminUserDto, ApiSuccessResponse } from '@yng/shared';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import api from '../services/api';

interface AdminAuthContextValue {
  admin: AdminUserDto | null;
  setAdmin: React.Dispatch<React.SetStateAction<AdminUserDto | null>>;
  loading: boolean;
  checked: boolean;
  checkSession: () => Promise<void>;
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminUserDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);

  const checkSession = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<ApiSuccessResponse<AdminUserDto | null>>('/admin/auth/me');
      setAdmin(response.data.data || null);
    } catch {
      setAdmin(null);
    } finally {
      setChecked(true);
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/admin/auth/logout');
    } finally {
      setAdmin(null);
    }
  }, []);

  return (
    <AdminAuthContext.Provider
      value={{
        admin,
        setAdmin,
        loading,
        checked,
        checkSession,
        logout,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- Hook konteks auth dipakai bersama AdminAuthProvider dalam satu modul
export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) {
    throw new Error('useAdminAuth harus digunakan di dalam AdminAuthProvider.');
  }
  return ctx;
}
