import { USER_ROLE, type UserRole } from '@yng/shared';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ApiClientError } from '../../services/api';
import { BRAND_LOGO_MAIN_URL } from '../../utils/brandAssets';

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
    <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-10">
      <aside className="flex flex-col justify-between rounded-3xl border border-line bg-surface p-6 sm:p-10">
        <div className="space-y-6">
          <div className="flex items-center gap-3.5">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-line bg-[#d9d9d9] sm:h-16 sm:w-16">
              <img
                src={BRAND_LOGO_MAIN_URL}
                alt="Emblem YNG Apparel"
                className="h-full w-full scale-110 object-cover object-center"
              />
            </div>
            <div className="min-w-0">
              <p className="font-display text-base font-semibold text-ink">YNG Apparel</p>
              <p className="text-xs text-muted">Batam Studio · Est. 2022</p>
            </div>
          </div>

          <h2 className="font-display text-2xl font-semibold leading-snug text-ink sm:text-3xl">
            Lanjutkan rancangan pakaian custom Anda.
          </h2>
          <p className="text-sm leading-relaxed text-muted">
            Simpan konfigurasi Custom Lab ke keranjang, atur alamat pengiriman, dan pantau setiap
            tahap produksi dalam satu akun.
          </p>

          <ul className="space-y-2 border-t border-line pt-4 text-xs text-ink">
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink" aria-hidden="true" />
              <span>Simpan beberapa konfigurasi Custom Lab sekaligus</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink" aria-hidden="true" />
              <span>Kelola alamat pengiriman tersimpan untuk checkout cepat</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink" aria-hidden="true" />
              <span>Pantau status desain, pembayaran, QC, dan resi pengiriman</span>
            </li>
          </ul>
        </div>

        <p className="mt-8 font-editorial text-2xl italic text-ink">@yng.apparel.official</p>
      </aside>

      <section className="rounded-3xl border border-line bg-white p-6 sm:p-10">
        <p className="eyebrow">Akun Pelanggan &amp; Studio</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-ink sm:text-4xl">
          Masuk Akun
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Gunakan email dan password yang terdaftar untuk melanjutkan.
        </p>

        {routeState?.registeredMessage ? (
          <div
            role="status"
            className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-status-ok"
          >
            {routeState.registeredMessage}
          </div>
        ) : null}

        {routeState?.statusMessage ? (
          <div
            role="status"
            className="mt-5 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink"
          >
            {routeState.statusMessage}
          </div>
        ) : null}

        {errorMessage ? (
          <div
            role="alert"
            className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-status-err"
          >
            {errorMessage}
          </div>
        ) : null}

        <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 space-y-5" noValidate>
          <div>
            <label htmlFor="login-email" className="block text-sm font-medium text-ink">
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
              className="input-sharp mt-1.5"
              disabled={submitting}
            />
          </div>

          <div>
            <label htmlFor="login-password" className="block text-sm font-medium text-ink">
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
              className="input-sharp mt-1.5"
              disabled={submitting}
            />
          </div>

          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? 'Memproses...' : 'Masuk'}
          </button>
        </form>

        <div className="mt-8 border-t border-line pt-5 text-sm text-muted">
          Belum punya akun pelanggan?{' '}
          <Link
            to="/register"
            state={routeState?.from ? { from: routeState.from } : undefined}
            className="font-semibold text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
          >
            Daftar di sini
          </Link>
        </div>
      </section>
    </div>
  );
}
