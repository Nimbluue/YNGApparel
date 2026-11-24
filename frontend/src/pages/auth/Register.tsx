import { USER_ROLE, type ValidationErrorItem, type ValidationErrorPayload } from '@yng/shared';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ApiClientError } from '../../services/api';
import { BRAND_LOGO_MAIN_URL } from '../../utils/brandAssets';
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
              <p className="text-xs text-muted">Ruang Pelanggan · Batam</p>
            </div>
          </div>

          <h2 className="font-display text-2xl font-semibold leading-snug text-ink sm:text-3xl">
            Mulai dari satu rancangan, wujudkan bersama tim.
          </h2>
          <p className="text-sm leading-relaxed text-muted">
            Daftar sekali untuk menyimpan alamat pengiriman, keranjang Custom Lab, dan memantau
            status pesanan.
          </p>

          <ul className="space-y-2 border-t border-line pt-4 text-xs text-ink">
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink" aria-hidden="true" />
              <span>Simulasi harga transparan dengan perhitungan server</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink" aria-hidden="true" />
              <span>Skema DP atau Lunas fleksibel sesuai jumlah pesanan</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink" aria-hidden="true" />
              <span>Konsultasi bahan &amp; warna custom langsung via WhatsApp</span>
            </li>
          </ul>
        </div>

        <p className="mt-8 font-editorial text-2xl italic text-ink">@yng.apparel.official</p>
      </aside>

      <section className="rounded-3xl border border-line bg-white p-6 sm:p-10">
        <p className="eyebrow">Registrasi Akun</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-ink sm:text-4xl">
          Daftar Akun
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Isi data diri dan nomor WhatsApp aktif untuk mempermudah konfirmasi produksi.
        </p>

        {errorMessage ? (
          <div
            role="alert"
            className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-status-err"
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

        <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 space-y-4" noValidate>
          <div>
            <label htmlFor="register-fullname" className="block text-sm font-medium text-ink">
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
              className="input-sharp mt-1.5 font-mono"
              disabled={submitting}
            />
            <p className="mt-1.5 text-xs text-muted">
              Contoh: 081234567890 atau 6281234567890 (otomatis dinormalisasi ke format 62).
            </p>
          </div>

          <div>
            <label htmlFor="register-password" className="block text-sm font-medium text-ink">
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
              className="input-sharp mt-1.5"
              disabled={submitting}
            />
          </div>

          <div>
            <label
              htmlFor="register-confirm-password"
              className="block text-sm font-medium text-ink"
            >
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
              className="input-sharp mt-1.5"
              disabled={submitting}
            />
          </div>

          <button type="submit" className="btn-primary mt-2 w-full" disabled={submitting}>
            {submitting ? 'Mendaftarkan...' : 'Daftar Sekarang'}
          </button>
        </form>

        <div className="mt-8 border-t border-line pt-5 text-sm text-muted">
          Sudah punya akun?{' '}
          <Link
            to="/login"
            state={routeState?.from ? { from: routeState.from } : undefined}
            className="font-semibold text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
          >
            Masuk di sini
          </Link>
        </div>
      </section>
    </div>
  );
}
