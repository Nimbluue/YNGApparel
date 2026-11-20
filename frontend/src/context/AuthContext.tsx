import type { ApiSuccessResponse, AuthUserDto, UserRole } from '@yng/shared';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import api from '../services/api';

interface AuthContextValue {
  user: AuthUserDto | null;
  role: UserRole | null;
  isGuest: boolean;
  setUser: React.Dispatch<React.SetStateAction<AuthUserDto | null>>;
  loading: boolean;
  checked: boolean;
  checkSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<AuthUserDto | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUserDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);

  const checkSession = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<ApiSuccessResponse<AuthUserDto | null>>('/auth/me');
      setUser(response.data.data || null);
    } catch {
      setUser(null);
    } finally {
      setChecked(true);
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const response = await api.post<ApiSuccessResponse<AuthUserDto | null>>('/auth/login', {
        email,
        password,
      });
      const loggedInUser = response.data.data || null;
      setUser(loggedInUser);
      setChecked(true);
      return loggedInUser;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
      setChecked(true);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role ?? null,
        isGuest: user === null,
        setUser,
        loading,
        checked,
        checkSession,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- Hook konteks auth dipakai bersama AuthProvider dalam satu modul
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth harus digunakan di dalam AuthProvider.');
  }
  return ctx;
}
