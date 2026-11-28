import { USER_ROLE, type ValidationErrorItem, type ValidationErrorPayload } from '@yng/shared';
import { Eye, EyeOff } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthEditorialShell } from '../../components/auth/AuthEditorialShell';
import { EditorialButton } from '../../components/ui/EditorialButton';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { ApiClientError } from '../../services/api';
import type { AuthRedirectState } from './Login';

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72;
const textEncoder = new TextEncoder();

function extractValidationErrors(data: unknown): ValidationErrorItem[] {
  if (!data || typeof data !== 'object' || !('errors' in data)) {
    return [];
  }
  const errors = (data as ValidationErrorPayload).errors;
  return Array.isArray(errors) ? errors : [];
}

function isLikelyIndonesianWhatsApp(raw: string): boolean {
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return false;
  let normalized = digits;
  if (digits.startsWith('0')) {
    normalized = `62${digits.slice(1)}`;
  } else if (digits.startsWith('8')) {
    normalized = `62${digits}`;
  }
  return /^62[0-9]{7,15}$/.test(normalized);
}

export default function Register() {
  const { user, isGuest, checked, register } = useAuth();
  const { t, pick } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();

  const routeState = (location.state as AuthRedirectState | null) ?? null;
  const preservedState = routeState?.from ? { from: routeState.from } : undefined;

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ValidationErrorItem[]>([]);

  if (checked && !isGuest && user) {
    return <Navigate to={user.role === USER_ROLE.ADMIN ? '/admin' : '/'} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setFieldErrors([]);

    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();
    const trimmedWa = whatsapp.trim();

    if (trimmedName.length < 2) {
      setErrorMessage(
        pick('Nama lengkap minimal 2 karakter.', 'Full name must be at least 2 characters.')
      );
      return;
    }

    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorMessage(
        pick('Masukkan alamat email yang valid.', 'Please enter a valid email address.')
      );
      return;
    }

    if (!isLikelyIndonesianWhatsApp(trimmedWa)) {
      setErrorMessage(
        pick(
          'Format nomor WhatsApp tidak valid. Gunakan awalan 08 atau 62.',
          'Invalid WhatsApp number format. Use 08 or 62 prefix.'
        )
      );
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setErrorMessage(
        pick(
          `Password minimal ${MIN_PASSWORD_LENGTH} karakter.`,
          `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
        )
      );
      return;
    }

    if (textEncoder.encode(password).length > MAX_PASSWORD_BYTES) {
      setErrorMessage(
        pick(
          `Password maksimal ${MAX_PASSWORD_BYTES} byte UTF-8 (karakter simbol/emoji memakan lebih banyak byte).`,
          `Password cannot exceed ${MAX_PASSWORD_BYTES} UTF-8 bytes (symbols/emoji take extra bytes).`
        )
      );
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage(
        pick('Konfirmasi password tidak cocok.', 'Password confirmation does not match.')
      );
      return;
    }

    setSubmitting(true);
    try {
      const created = await register({
        fullName: trimmedName,
        email: trimmedEmail,
        whatsapp: trimmedWa,
        password,
      });

      navigate(
        { pathname: '/login', search: location.search },
        {
          replace: true,
          state: {
            from: routeState?.from,
            registeredMessage: pick(
              'Pendaftaran berhasil. Silakan masuk dengan akun Anda.',
              'Registration succeeded. Please sign in with your new account.'
            ),
            registeredEmail: created.email,
          },
        }
      );
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
        setFieldErrors(extractValidationErrors(err.data));
      } else {
        setErrorMessage(
          pick('Pendaftaran gagal. Silakan coba lagi.', 'Registration failed. Please try again.')
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthEditorialShell
      mode="register"
      heading={t('auth.registerHeading')}
      subheading={t('auth.registerSubheading')}
      redirectState={preservedState}
      footer={
        <p>
          {t('auth.hasAccount')}{' '}
          <Link
            to={{ pathname: '/login', search: location.search }}
            state={preservedState}
            className="font-semibold text-ink underline decoration-neutral-300 underline-offset-4 transition-colors hover:decoration-ink"
          >
            {t('auth.loginLink')}
          </Link>
        </p>
      }
    >
      {errorMessage ? (
        <div
          role="alert"
          className="mb-5 rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-sm text-status-err"
        >
          <p className="font-medium">{errorMessage}</p>
          {fieldErrors.length > 1 ? (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
              {fieldErrors.map((item, index) => (
                <li key={`${item.field}-${index}`}>{item.message}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4" noValidate>
        <div>
          <label htmlFor="register-fullname" className="block text-sm font-medium text-ink">
            {pick('Nama Lengkap', 'Full Name')}
          </label>
          <input
            id="register-fullname"
            name="fullName"
            type="text"
            autoComplete="name"
            required
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Budi Santoso"
            className="input-sharp mt-1.5"
            disabled={submitting}
          />
        </div>

        <div>
          <label htmlFor="register-email" className="block text-sm font-medium text-ink">
            Email
          </label>
          <input
            id="register-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="budi@email.com"
            className="input-sharp mt-1.5"
            disabled={submitting}
          />
        </div>

        <div>
          <label htmlFor="register-whatsapp" className="block text-sm font-medium text-ink">
            {pick('Nomor WhatsApp', 'WhatsApp Number')}
          </label>
          <input
            id="register-whatsapp"
            name="whatsapp"
            type="tel"
            autoComplete="tel"
            required
            value={whatsapp}
            onChange={(event) => setWhatsapp(event.target.value)}
            placeholder="081234567890"
            className="input-sharp mt-1.5 font-mono"
            disabled={submitting}
          />
          <p className="mt-1.5 text-xs text-muted">
            {pick(
              'Contoh: 081234567890 atau 6281234567890 (otomatis dinormalisasi ke format 62).',
              'Example: 081234567890 or 6281234567890 (auto-normalized to 62 format).'
            )}
          </p>
        </div>

        <div>
          <label htmlFor="register-password" className="block text-sm font-medium text-ink">
            Password
          </label>
          <div className="relative mt-1.5">
            <input
              id="register-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={pick(
                'Minimal 8 karakter (maks 72 byte)',
                'Minimum 8 characters (max 72 bytes)'
              )}
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

        <div>
          <label htmlFor="register-confirm-password" className="block text-sm font-medium text-ink">
            {pick('Konfirmasi Password', 'Confirm Password')}
          </label>
          <div className="relative mt-1.5">
            <input
              id="register-confirm-password"
              name="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder={pick('Ulangi password', 'Repeat password')}
              className="input-sharp pr-12"
              disabled={submitting}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((prev) => !prev)}
              aria-label={showConfirmPassword ? t('auth.hidePassword') : t('auth.showPassword')}
              aria-pressed={showConfirmPassword}
              className="absolute right-1.5 top-1/2 flex h-9 w-9 min-h-0 -translate-y-1/2 items-center justify-center rounded-sm text-neutral-500 transition-colors hover:text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-ink"
            >
              {showConfirmPassword ? (
                <EyeOff className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        <EditorialButton
          type="submit"
          variant="primary"
          fullWidth
          loading={submitting}
          className="mt-2"
        >
          {submitting ? t('auth.registerSubmitting') : t('auth.registerSubmit')}
        </EditorialButton>
      </form>
    </AuthEditorialShell>
  );
}
