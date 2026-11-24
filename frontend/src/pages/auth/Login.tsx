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
    <div className="auth-page mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
      <aside className="auth-brand-panel relative flex min-h-64 flex-col justify-between bg-ink p-6 text-bone sm:p-10 lg:min-h-[620px]">
        <span className="absolute right-5 top-5 font-mono text-xl text-accent" aria-hidden="true">
          +
        </span>
        <div>
          <p className="font-mono text-xs text-neutral-300">YNG APPAREL / BATAM</p>
          <p className="mt-12 max-w-md font-display text-5xl font-black leading-[0.88] tracking-[-0.06em] sm:text-7xl">
            BIKIN IDE JADI SERAGAM.
          </p>
        </div>
        <p className="mt-8 max-w-sm font-editorial text-2xl italic text-accent sm:text-3xl">
          Pakaian custom, dikerjakan bareng dari awal.
        </p>
      </aside>

      <section className="auth-form-panel py-2 sm:py-8 lg:py-10">
        <p className="eyebrow">Akun pelanggan &amp; workshop</p>
        <h1 className="mt-3 font-display text-5xl font-black leading-[0.88] tracking-[-0.06em] sm:text-7xl">
          Masuk Akun
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-muted">
          Masuk untuk mengelola keranjang Custom Lab, pesanan Anda, atau akses dashboard admin.
        </p>

        {routeState?.registeredMessage ? (
          <div
            role="status"
            className="care-label mt-6 border-l-status-ok bg-transparent px-0 py-0 text-base text-status-ok"
          >
            {routeState.registeredMessage}
          </div>
        ) : null}

        {routeState?.statusMessage ? (
          <div role="status" className="mt-6 border-l-4 border-ink px-4 py-3 text-base">
            {routeState.statusMessage}
          </div>
        ) : null}

        {errorMessage ? (
          <div
            role="alert"
            className="mt-6 border-l-4 border-status-err px-4 py-3 text-base text-status-err"
          >
            {errorMessage}
          </div>
        ) : null}

        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="mt-8 max-w-xl space-y-6"
          noValidate
        >
          <div>
            <label htmlFor="login-email" className="block text-sm font-semibold">
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
            <label htmlFor="login-password" className="block text-sm font-semibold">
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

        <div className="mt-8 border-t border-line pt-5 text-base text-muted">
          Belum punya akun pelanggan?{' '}
          <Link
            to="/register"
            state={routeState?.from ? { from: routeState.from } : undefined}
            className="font-semibold text-ink underline decoration-accent decoration-2 underline-offset-4 hover:text-muted"
          >
            Daftar di sini
          </Link>
        </div>
      </section>
    </div>
  );
}
