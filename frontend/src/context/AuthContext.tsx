import type { AuthUserDto, RegisterRequestDto, UserRole } from '@yng/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import * as authService from '../services/authService';

interface AuthContextValue {
  user: AuthUserDto | null;
  role: UserRole | null;
  isGuest: boolean;
  setUser: React.Dispatch<React.SetStateAction<AuthUserDto | null>>;
  loading: boolean;
  checked: boolean;
  checkSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<AuthUserDto>;
  register: (payload: RegisterRequestDto) => Promise<AuthUserDto>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUserDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState(false);
  const inFlightCheckRef = useRef<Promise<void> | null>(null);
  const navigate = useNavigate();

  const checkSession = useCallback(async () => {
    if (inFlightCheckRef.current) {
      return inFlightCheckRef.current;
    }

    const task = (async () => {
      setLoading(true);
      try {
        const currentUser = await authService.getMe();
        setUser(currentUser);
      } catch {
        setUser(null);
      } finally {
        setChecked(true);
        setLoading(false);
        inFlightCheckRef.current = null;
      }
    })();

    inFlightCheckRef.current = task;
    return task;
  }, []);

  // Tangani event 401 dari Axios interceptor → logout & redirect login
  useEffect(() => {
    const handler = () => {
      setUser(null);
      setChecked(true);
      navigate('/login', { replace: true });
    };
    window.addEventListener('yng:unauthorized', handler);
    return () => window.removeEventListener('yng:unauthorized', handler);
  }, [navigate]);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  const login = useCallback(async (email: string, password: string) => {
    const loggedInUser = await authService.login({ email, password });
    setUser(loggedInUser);
    setChecked(true);
    return loggedInUser;
  }, []);

  const register = useCallback(async (payload: RegisterRequestDto) => {
    return authService.register(payload);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
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
        register,
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
