import { USER_ROLE, type ValidationErrorItem, type ValidationErrorPayload } from '@yng/shared';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
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
  const location = useLocation();
  const navigate = useNavigate();

  const routeState = (location.state as AuthRedirectState | null) ?? null;

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
      setErrorMessage('Nama lengkap minimal 2 karakter.');
      return;
    }

    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorMessage('Masukkan alamat email yang valid.');
      return;
    }

    if (!isLikelyIndonesianWhatsApp(trimmedWa)) {
      setErrorMessage('Format nomor WhatsApp tidak valid. Gunakan awalan 08 atau 62.');
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setErrorMessage(`Password minimal ${MIN_PASSWORD_LENGTH} karakter.`);
      return;
    }

    if (textEncoder.encode(password).length > MAX_PASSWORD_BYTES) {
      setErrorMessage(
        `Password maksimal ${MAX_PASSWORD_BYTES} byte UTF-8 (karakter simbol/emoji memakan lebih banyak byte).`
      );
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Konfirmasi password tidak cocok.');
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

      navigate('/login', {
        replace: true,
        state: {
          from: routeState?.from,
          registeredMessage: 'Pendaftaran berhasil. Silakan masuk dengan akun Anda.',
          registeredEmail: created.email,
        },
      });
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
        setFieldErrors(extractValidationErrors(err.data));
      } else {
        setErrorMessage('Pendaftaran gagal. Silakan coba lagi.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
      <aside className="auth-brand-panel relative flex min-h-64 flex-col justify-between bg-ink p-6 text-bone sm:p-10 lg:min-h-[720px]">
        <span className="absolute right-5 top-5 font-mono text-xl text-accent" aria-hidden="true">
          +
        </span>
        <div>
          <p className="font-mono text-xs text-neutral-300">YNG APPAREL / BATAM</p>
          <p className="mt-12 max-w-md font-display text-5xl font-black leading-[0.88] tracking-[-0.06em] sm:text-7xl">
            SETIAP TIM PUNYA CERITA.
          </p>
        </div>
        <p className="mt-8 max-w-sm font-editorial text-2xl italic text-accent sm:text-3xl">
          Mulai dari satu desain, lanjut jadi identitas.
        </p>
      </aside>

      <section className="auth-form-panel py-2 sm:py-8 lg:py-10">
        <p className="eyebrow">Ruang pelanggan</p>
        <h1 className="mt-3 font-display text-5xl font-black leading-[0.88] tracking-[-0.06em] sm:text-7xl">
          Daftar Akun
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-muted">
          Buat akun untuk menyimpan konfigurasi Custom Lab di keranjang, alamat pengiriman, dan
          memantau pesanan Anda.
        </p>

        {errorMessage ? (
          <div
            role="alert"
            className="mt-6 border-l-4 border-status-err px-4 py-3 text-base text-status-err"
          >
            <p>{errorMessage}</p>
            {fieldErrors.length > 1 ? (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
                {fieldErrors.map((item, index) => (
                  <li key={`${item.field}-${index}`}>{item.message}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="mt-8 max-w-xl space-y-5"
          noValidate
        >
          <div>
            <label htmlFor="register-fullname" className="block text-sm font-semibold">
              Nama Lengkap
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
              className="input-sharp mt-2"
              disabled={submitting}
            />
          </div>

          <div>
            <label htmlFor="register-email" className="block text-sm font-semibold">
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
              className="input-sharp mt-2"
              disabled={submitting}
            />
          </div>

          <div>
            <label htmlFor="register-whatsapp" className="block text-sm font-semibold">
              Nomor WhatsApp
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
              className="input-sharp mt-2"
              disabled={submitting}
            />
            <p className="mt-2 text-sm text-muted">
              Contoh: 081234567890 atau 6281234567890 (otomatis dinormalisasi ke format 62).
            </p>
          </div>

          <div>
            <label htmlFor="register-password" className="block text-sm font-semibold">
              Password
            </label>
            <input
              id="register-password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimal 8 karakter (maks 72 byte)"
              className="input-sharp mt-2"
              disabled={submitting}
            />
          </div>

          <div>
            <label htmlFor="register-confirm-password" className="block text-sm font-semibold">
              Konfirmasi Password
            </label>
            <input
              id="register-confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Ulangi password"
              className="input-sharp mt-2"
              disabled={submitting}
            />
          </div>

          <button type="submit" className="btn-primary mt-2 w-full" disabled={submitting}>
            {submitting ? 'Mendaftarkan...' : 'Daftar Sekarang'}
          </button>
        </form>

        <div className="mt-8 border-t border-line pt-5 text-base text-muted">
          Sudah punya akun?{' '}
          <Link
            to="/login"
            state={routeState?.from ? { from: routeState.from } : undefined}
            className="font-semibold text-ink underline decoration-accent decoration-2 underline-offset-4 hover:text-muted"
          >
            Masuk di sini
          </Link>
        </div>
      </section>
    </div>
  );
}
