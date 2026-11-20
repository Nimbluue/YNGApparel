import { USER_ROLE, type UserRole } from '@yng/shared';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ApiClientError } from '../../services/api';

interface RedirectFromLocation {
  pathname?: string;
  search?: string;
  hash?: string;
}

export interface AuthRedirectState {
  from?: RedirectFromLocation | string;
  registeredMessage?: string;
  registeredEmail?: string;
  statusMessage?: string;
}

const MAX_PASSWORD_BYTES = 72;
const textEncoder = new TextEncoder();

function extractSafeFromPath(state: unknown): string | null {
  if (!state || typeof state !== 'object') {
    return null;
  }

  const rawFrom = (state as AuthRedirectState).from;
  let candidate: string | null = null;

  if (typeof rawFrom === 'string') {
    candidate = rawFrom;
  } else if (rawFrom && typeof rawFrom === 'object' && typeof rawFrom.pathname === 'string') {
    candidate = `${rawFrom.pathname}${rawFrom.search ?? ''}${rawFrom.hash ?? ''}`;
  }

  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) {
    return null;
  }

  const pathnameOnly = candidate.split(/[?#]/, 1)[0];
  if (pathnameOnly === '/login' || pathnameOnly === '/register') {
    return null;
  }

  return candidate;
}

function resolvePostLoginTarget(role: UserRole, fromPath: string | null): string {
  if (role === USER_ROLE.ADMIN) {
    if (
      fromPath &&
      (fromPath === '/admin' || fromPath.startsWith('/admin/') || fromPath.startsWith('/admin?'))
    ) {
      return fromPath;
    }
    return '/admin';
  }

  return fromPath ?? '/';
}

export default function Login() {
  const { user, isGuest, checked, login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const routeState = (location.state as AuthRedirectState | null) ?? null;
  const fromPath = extractSafeFromPath(routeState);

  const [email, setEmail] = useState(routeState?.registeredEmail ?? '');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (checked && !isGuest && user) {
    return <Navigate to={resolvePostLoginTarget(user.role, fromPath)} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage('Email wajib diisi.');
      return;
    }

    if (!password) {
      setErrorMessage('Password wajib diisi.');
      return;
    }

    if (textEncoder.encode(password).length > MAX_PASSWORD_BYTES) {
      setErrorMessage(`Password maksimal ${MAX_PASSWORD_BYTES} byte UTF-8.`);
      return;
    }

    setSubmitting(true);
    try {
      const loggedInUser = await login(trimmedEmail, password);
      const target = resolvePostLoginTarget(loggedInUser.role, fromPath);
      navigate(target, { replace: true });
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Gagal masuk. Silakan coba lagi.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="card-sharp p-6 sm:p-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted">Autentikasi</p>
        <h1 className="mt-2 font-display text-2xl font-bold uppercase tracking-[0.08em]">
          Masuk Akun
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          Masuk untuk mengelola keranjang Custom Lab, pesanan Anda, atau akses dashboard admin.
        </p>

        {routeState?.registeredMessage ? (
          <div
            role="status"
            className="mt-5 border border-status-ok bg-surface px-4 py-3 text-sm text-status-ok"
          >
            {routeState.registeredMessage}
          </div>
        ) : null}

        {routeState?.statusMessage ? (
          <div
            role="status"
            className="mt-5 border border-line-strong bg-bone px-4 py-3 text-sm text-ink"
          >
            {routeState.statusMessage}
          </div>
        ) : null}

        {errorMessage ? (
          <div
            role="alert"
            className="mt-5 border border-status-err bg-surface px-4 py-3 text-sm text-status-err"
          >
            {errorMessage}
          </div>
        ) : null}

        <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 space-y-5" noValidate>
          <div>
            <label
              htmlFor="login-email"
              className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
            >
              Email
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nama@email.com"
              className="input-sharp mt-2"
              disabled={submitting}
            />
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
            >
              Password
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Masukkan password"
              className="input-sharp mt-2"
              disabled={submitting}
            />
          </div>

          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? 'Memproses...' : 'Masuk'}
          </button>
        </form>

        <div className="mt-6 border-t border-line pt-5 text-sm text-neutral-600">
          Belum punya akun pelanggan?{' '}
          <Link
            to="/register"
            state={routeState?.from ? { from: routeState.from } : undefined}
            className="font-semibold text-ink underline underline-offset-4 hover:text-neutral-600"
          >
            Daftar di sini
          </Link>
        </div>
      </div>
    </div>
  );
}
