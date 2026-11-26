import { USER_ROLE, type UserRole } from '@yng/shared';
import { Eye, EyeOff } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthEditorialShell } from '../../components/auth/AuthEditorialShell';
import { EditorialButton } from '../../components/ui/EditorialButton';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
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

function sanitizeInternalPath(candidate: string | null | undefined): string | null {
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) {
    return null;
  }

  const pathnameOnly = candidate.split(/[?#]/, 1)[0];
  if (pathnameOnly === '/login' || pathnameOnly === '/register') {
    return null;
  }

  return candidate;
}

function extractSafeFromPath(state: unknown, search: string): string | null {
  const queryRedirect = sanitizeInternalPath(new URLSearchParams(search).get('redirect'));
  if (queryRedirect) {
    return queryRedirect;
  }

  if (!state || typeof state !== 'object') {
    return null;
  }

  const rawFrom = (state as AuthRedirectState).from;
  if (typeof rawFrom === 'string') {
    return sanitizeInternalPath(rawFrom);
  }

  if (rawFrom && typeof rawFrom === 'object' && typeof rawFrom.pathname === 'string') {
    return sanitizeInternalPath(`${rawFrom.pathname}${rawFrom.search ?? ''}${rawFrom.hash ?? ''}`);
  }

  return null;
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
  const { t, pick } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();

  const routeState = (location.state as AuthRedirectState | null) ?? null;
  const fromPath = extractSafeFromPath(routeState, location.search);
  const preservedState = routeState?.from ? { from: routeState.from } : undefined;

  const [email, setEmail] = useState(routeState?.registeredEmail ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      setErrorMessage(pick('Email wajib diisi.', 'Email is required.'));
      return;
    }

    if (!password) {
      setErrorMessage(pick('Password wajib diisi.', 'Password is required.'));
      return;
    }

    if (textEncoder.encode(password).length > MAX_PASSWORD_BYTES) {
      setErrorMessage(
        pick(
          `Password maksimal ${MAX_PASSWORD_BYTES} byte UTF-8.`,
          `Password cannot exceed ${MAX_PASSWORD_BYTES} UTF-8 bytes.`
        )
      );
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
        setErrorMessage(
          pick('Gagal masuk. Silakan coba lagi.', 'Sign in failed. Please try again.')
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthEditorialShell
      mode="login"
      heading={t('auth.loginHeading')}
      subheading={t('auth.loginSubheading')}
      redirectState={preservedState}
      footer={
        <p>
          {t('auth.noAccount')}{' '}
          <Link
            to={{ pathname: '/register', search: location.search }}
            state={preservedState}
            className="font-semibold text-ink underline decoration-neutral-300 underline-offset-4 transition-colors hover:decoration-ink"
          >
            {t('auth.registerLink')}
          </Link>
        </p>
      }
    >
      {routeState?.registeredMessage ? (
        <div
          role="status"
          className="mb-5 rounded-sm border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-status-ok"
        >
          {routeState.registeredMessage}
        </div>
      ) : null}

      {routeState?.statusMessage ? (
        <div
          role="status"
          className="mb-5 rounded-sm border border-neutral-200 bg-[#FAFAFA] px-4 py-3 text-sm text-ink"
        >
          {routeState.statusMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div
          role="alert"
          className="mb-5 rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-status-err"
        >
          {errorMessage}
        </div>
      ) : null}

      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-5" noValidate>
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
            placeholder={pick('nama@email.com', 'name@email.com')}
            className="input-sharp mt-1.5"
            disabled={submitting}
          />
        </div>

        <div>
          <label htmlFor="login-password" className="block text-sm font-medium text-ink">
            Password
          </label>
          <div className="relative mt-1.5">
            <input
              id="login-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={pick('Masukkan password', 'Enter password')}
              className="input-sharp pr-12"
              disabled={submitting}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
              aria-pressed={showPassword}
              className="absolute right-1.5 top-1/2 flex h-9 w-9 min-h-0 -translate-y-1/2 items-center justify-center rounded-sm text-neutral-500 transition-colors hover:text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-ink"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        <EditorialButton type="submit" variant="primary" fullWidth loading={submitting}>
          {submitting ? t('auth.loginSubmitting') : t('auth.loginSubmit')}
        </EditorialButton>
      </form>
    </AuthEditorialShell>
  );
}
