import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiClientError } from '../../services/api';
import { catalogQueryKeys, getCatalogConfig } from '../../services/catalogService';
import { lookupTrackOrder, trackerQueryKeys } from '../../services/trackerService';
import { extractApiError } from '../../utils/apiError';
import { buildWaLink } from '../../utils/whatsapp';

const ORDER_CODE_INPUT_REGEX = /^(YNG-)?[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/i;

export default function TrackLookup() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [code, setCode] = useState('');
  const [whatsappLast4, setWhatsappLast4] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);

  const configQuery = useQuery({
    queryKey: catalogQueryKeys.config,
    queryFn: getCatalogConfig,
  });

  const lookupMutation = useMutation({
    mutationFn: lookupTrackOrder,
    onSuccess: (order) => {
      queryClient.setQueryData(trackerQueryKeys.detail(order.transactionUuid), order);
      navigate(`/track/${order.transactionUuid}`, {
        state: {
          lookupCredentials: {
            code: order.orderCode,
            whatsappLast4: whatsappLast4.trim(),
          },
        },
      });
    },
    onError: (err) => {
      const rateLimited = err instanceof ApiClientError && err.status === 429;
      setIsRateLimited(rateLimited);
      const parsed = extractApiError(
        err,
        'Pesanan tidak ditemukan. Periksa kembali kode pesanan dan 4 digit terakhir WhatsApp.'
      );
      setFormError(parsed.message);
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setIsRateLimited(false);

    const trimmedCode = code.trim().toUpperCase();
    const trimmedWa = whatsappLast4.trim();

    if (!ORDER_CODE_INPUT_REGEX.test(trimmedCode)) {
      setFormError(
        'Masukkan kode pesanan 6 karakter atau format YNG-XXXXXX (tanpa karakter O/0, I/1/L).'
      );
      return;
    }

    if (!/^[0-9]{4}$/.test(trimmedWa)) {
      setFormError('Masukkan tepat 4 digit terakhir nomor WhatsApp pemesan.');
      return;
    }

    lookupMutation.mutate({
      code: trimmedCode,
      whatsappLast4: trimmedWa,
    });
  }

  const adminWhatsapp = configQuery.data?.adminWhatsapp ?? '';
  const waHelpHref = adminWhatsapp
    ? buildWaLink(
        adminWhatsapp,
        'Halo YNG Apparel, saya membutuhkan bantuan untuk melacak kode pesanan saya.'
      )
    : null;

  return (
    <div className="w-full space-y-6 pb-10">
      <header className="space-y-2 border-b border-line pb-5">
        <p className="eyebrow">YNG Studio · Live Tracker</p>
        <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
          Lacak Progres Produksi &amp; Pengiriman
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          Pantau antrean sablon, foto hasil Quality Control, tagihan pelunasan atau ongkir, serta
          nomor resi kurir tanpa perlu login. Berlaku untuk order website maupun manual WhatsApp.
        </p>
      </header>

      <div className="grid w-full grid-cols-1 items-start gap-8 lg:grid-cols-12">
        {/* Form Lookup Publik */}
        <section className="w-full min-w-0 rounded-3xl border border-line bg-white p-5 sm:p-7 lg:col-span-7">
          <div className="border-b border-line pb-4">
            <p className="eyebrow">Cari Pesanan Anda</p>
            <h2 className="mt-1 font-display text-lg font-semibold text-ink">
              Kode Order &amp; 4 Digit Terakhir WhatsApp
            </h2>
          </div>

          {formError ? (
            <div
              role="alert"
              className={`mt-4 rounded-2xl border px-4 py-3 text-xs leading-relaxed sm:text-sm ${
                isRateLimited
                  ? 'border-amber-200 bg-amber-50 text-status-warn'
                  : 'border-red-200 bg-red-50 text-status-err'
              }`}
            >
              {formError}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="track-order-code" className="block text-xs font-semibold text-ink">
                Kode Pesanan
              </label>
              <input
                id="track-order-code"
                type="text"
                required
                autoCapitalize="characters"
                autoComplete="off"
                maxLength={10}
                value={code}
                onChange={(event) => {
                  const cleaned = event.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9-]/g, '')
                    .slice(0, 10);
                  setCode(cleaned);
                }}
                placeholder="YNG-K7M2QX atau K7M2QX"
                className="input-sharp mt-1.5 font-mono uppercase tracking-wider"
              />
              <p className="mt-1.5 text-xs text-muted">
                Ketik 6 karakter kode atau lengkap dengan awalan{' '}
                <span className="font-mono">YNG-</span>.
              </p>
            </div>

            <div>
              <label htmlFor="track-wa-last4" className="block text-xs font-semibold text-ink">
                4 Digit Terakhir Nomor WhatsApp
              </label>
              <input
                id="track-wa-last4"
                type="text"
                inputMode="numeric"
                required
                autoComplete="off"
                maxLength={4}
                value={whatsappLast4}
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D/g, '').slice(0, 4);
                  setWhatsappLast4(digits);
                }}
                placeholder="7890"
                className="input-sharp tabular-price mt-1.5 font-mono tracking-[0.25em]"
              />
              <p className="mt-1.5 text-xs text-muted">
                Sesuai nomor WhatsApp penerima yang tercatat pada pesanan.
              </p>
            </div>

            <button
              type="submit"
              disabled={lookupMutation.isPending}
              className="btn-primary w-full"
            >
              {lookupMutation.isPending ? 'Mencari Pesanan...' : 'Lacak Pesanan Sekarang'}
            </button>
          </form>
        </section>

        {/* Informasi Bantuan Tracker */}
        <aside className="w-full min-w-0 space-y-4 lg:col-span-5">
          <div className="w-full space-y-4 rounded-3xl border border-line bg-surface p-5 sm:p-6">
            <div>
              <p className="eyebrow">Informasi Pelacakan</p>
              <h2 className="mt-1 font-display text-lg font-semibold text-ink">
                Cara Membaca Progres Order
              </h2>
            </div>

            <ul className="space-y-2.5 text-xs leading-relaxed text-muted sm:text-sm">
              <li>
                <strong className="text-ink">1. Kode Pesanan &amp; Magic Link:</strong> Kode order
                berformat <span className="font-mono text-ink">YNG-XXXXXX</span> diterbitkan saat
                checkout website atau dikirim admin untuk pesanan WhatsApp.
              </li>
              <li>
                <strong className="text-ink">2. Privasi Terjaga:</strong> Nama, nomor WhatsApp, dan
                alamat tujuan disamarkan otomatis pada halaman publik.
              </li>
              <li>
                <strong className="text-ink">3. Tagihan Lanjutan &amp; Foto QC:</strong> Anda dapat
                melihat hasil foto Quality Control dan langsung mengunggah bukti pelunasan atau
                ongkos kirim dari halaman tracker.
              </li>
            </ul>

            <div className="flex flex-col gap-2.5 border-t border-line pt-4">
              {waHelpHref ? (
                <a
                  href={waHelpHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary w-full text-xs"
                >
                  Lupa Kode Order? Tanya Admin via WhatsApp
                </a>
              ) : null}
              <Link to="/pesanan" className="btn-secondary w-full text-xs">
                Sudah Punya Akun? Buka Pesanan Saya
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
