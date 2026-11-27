import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Clock, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EditorialButton } from '../../components/ui/EditorialButton';
import { IconTooltip } from '../../components/ui/IconTooltip';
import { useLanguage } from '../../context/LanguageContext';
import { ApiClientError } from '../../services/api';
import { catalogQueryKeys, getCatalogConfig } from '../../services/catalogService';
import { lookupTrackOrder, trackerQueryKeys } from '../../services/trackerService';
import { extractApiError } from '../../utils/apiError';
import { formatLocalizedWibDateTime } from '../../utils/localizedLabels';
import {
  buildRecentTrackSummary,
  clearRecentTracks,
  getRecentTracks,
  removeRecentTrack,
  saveRecentTrack,
  type RecentTrackEntry,
} from '../../utils/recentTracks';
import { buildWaLink } from '../../utils/whatsapp';

const ORDER_CODE_INPUT_REGEX = /^(YNG-)?[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/i;

export default function TrackLookup() {
  const { locale, t, pick } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [code, setCode] = useState('');
  const [whatsappLast4, setWhatsappLast4] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [recentTracks, setRecentTracks] = useState<RecentTrackEntry[]>(() => getRecentTracks());

  const configQuery = useQuery({
    queryKey: catalogQueryKeys.config,
    queryFn: getCatalogConfig,
  });

  const lookupMutation = useMutation({
    mutationFn: lookupTrackOrder,
    onSuccess: (order) => {
      const last4 = whatsappLast4.trim();
      const nextRecent = saveRecentTrack({
        orderCode: order.orderCode,
        phoneLast4: last4,
        summary: buildRecentTrackSummary(order),
      });
      setRecentTracks(nextRecent);

      queryClient.setQueryData(trackerQueryKeys.detail(order.transactionUuid), order);
      queryClient.setQueryData(trackerQueryKeys.detail(order.orderCode), order);
      navigate(`/track/${order.transactionUuid}`, {
        state: {
          lookupCredentials: {
            code: order.orderCode,
            whatsappLast4: last4,
          },
        },
      });
    },
    onError: (err) => {
      const rateLimited = err instanceof ApiClientError && err.status === 429;
      setIsRateLimited(rateLimited);
      const parsed = extractApiError(
        err,
        pick(
          'Pesanan tidak ditemukan. Periksa kembali kode pesanan dan 4 digit terakhir WhatsApp.',
          'Order not found. Please check your order code and the last 4 digits of WhatsApp.'
        )
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
        pick(
          'Masukkan kode pesanan 6 karakter atau format YNG-XXXXXX (tanpa karakter O/0, I/1/L).',
          'Enter a 6-character order code or YNG-XXXXXX format (without O/0, I/1/L).'
        )
      );
      return;
    }

    if (!/^[0-9]{4}$/.test(trimmedWa)) {
      setFormError(
        pick(
          'Masukkan tepat 4 digit terakhir nomor WhatsApp pemesan.',
          'Enter the exact last 4 digits of the customer WhatsApp number.'
        )
      );
      return;
    }

    lookupMutation.mutate({
      code: trimmedCode,
      whatsappLast4: trimmedWa,
    });
  }

  function handleQuickOpenTrack(entry: RecentTrackEntry) {
    navigate(`/track/${encodeURIComponent(entry.orderCode)}`, {
      state: {
        lookupCredentials: {
          code: entry.orderCode,
          whatsappLast4: entry.phoneLast4,
        },
      },
    });
  }

  const adminWhatsapp = configQuery.data?.adminWhatsapp ?? '';
  const waHelpHref = adminWhatsapp
    ? buildWaLink(
        adminWhatsapp,
        pick(
          'Halo YNG Apparel, saya membutuhkan bantuan untuk melacak kode pesanan saya.',
          'Hello YNG Apparel, I need help tracking my order code.'
        )
      )
    : null;

  return (
    <div className="w-full space-y-6 pb-10">
      <header className="space-y-2 border-b border-line pb-5">
        <p className="eyebrow">YNG Studio · Live Tracker</p>
        <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
          {pick('Lacak Progres Produksi & Pengiriman', 'Track Production & Shipping Progress')}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          {pick(
            'Pantau proses produksi, foto QC, hingga resi pengiriman tanpa perlu masuk akun.',
            'Track production progress, QC photos, and courier delivery without signing in.'
          )}
        </p>
      </header>

      <div className="grid w-full grid-cols-1 items-start gap-8 lg:grid-cols-12">
        <div className="w-full min-w-0 space-y-6 lg:col-span-7">
          <section className="w-full min-w-0 rounded-sm border border-neutral-200 bg-white p-5 sm:p-7">
            <div className="border-b border-line pb-4">
              <p className="eyebrow">{pick('Cari Pesanan Anda', 'Find Your Order')}</p>
              <h2 className="mt-1 font-display text-lg font-semibold text-ink">
                {pick(
                  'Kode Order & 4 Digit Terakhir WhatsApp',
                  'Order Code & Last 4 WhatsApp Digits'
                )}
              </h2>
            </div>

            {formError ? (
              <div
                role="alert"
                className={`mt-4 rounded-sm border px-4 py-3 text-xs leading-relaxed sm:text-sm ${
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
                  {pick('Kode Pesanan', 'Order Code')}
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
                  placeholder={pick('YNG-K7M2QX atau K7M2QX', 'YNG-K7M2QX or K7M2QX')}
                  className="input-sharp mt-1.5 font-mono uppercase tracking-wider"
                />
              </div>

              <div>
                <label htmlFor="track-wa-last4" className="block text-xs font-semibold text-ink">
                  {pick('4 Digit Terakhir Nomor WhatsApp', 'Last 4 Digits of WhatsApp Number')}
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
              </div>

              <EditorialButton type="submit" fullWidth loading={lookupMutation.isPending}>
                {lookupMutation.isPending
                  ? pick('Mencari Pesanan...', 'Searching Order...')
                  : pick('Lacak Pesanan Sekarang', 'Track Order Now')}
              </EditorialButton>
            </form>
          </section>

          {/* Terakhir Dilacak di Perangkat Ini */}
          {recentTracks.length > 0 ? (
            <section
              aria-labelledby="recent-tracks-heading"
              className="w-full min-w-0 space-y-3 rounded-sm border border-neutral-200 bg-[#FAFAFA] p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <h2
                    id="recent-tracks-heading"
                    className="flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-[0.14em] text-ink"
                  >
                    <Clock size={14} strokeWidth={1.5} aria-hidden="true" />
                    <span>{t('track.recentTitle')}</span>
                  </h2>
                  <p className="mt-0.5 text-xs text-muted">{t('track.recentSubtitle')}</p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    clearRecentTracks();
                    setRecentTracks([]);
                  }}
                  className="inline-flex min-h-[36px] items-center rounded-sm px-2 text-xs font-semibold text-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
                >
                  {t('track.clearAll')}
                </button>
              </div>

              <ul className="divide-y divide-neutral-200 rounded-sm border border-neutral-200 bg-white">
                {recentTracks.map((entry) => (
                  <li
                    key={entry.orderCode}
                    className="flex items-center justify-between gap-2 transition-colors hover:bg-[#FAFAFA]"
                  >
                    <button
                      type="button"
                      onClick={() => handleQuickOpenTrack(entry)}
                      aria-label={t('track.openOrderAria', { code: entry.orderCode })}
                      className="flex min-h-touch min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-left focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-900"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold tracking-wider text-ink tabular-nums">
                            {entry.orderCode}
                          </span>
                          <span className="font-mono text-xs text-muted tabular-nums">
                            {t('track.maskedPhone', { last4: entry.phoneLast4 })}
                          </span>
                        </div>
                        <p className="truncate text-xs text-muted tabular-nums">
                          {entry.summary ? `${entry.summary} · ` : ''}
                          {t('track.checkedAt', {
                            time: formatLocalizedWibDateTime(entry.updatedAt, locale),
                          })}
                        </p>
                      </div>

                      <ArrowRight
                        size={15}
                        strokeWidth={1.5}
                        aria-hidden="true"
                        className="shrink-0 text-muted"
                      />
                    </button>

                    <IconTooltip
                      label={t('track.removeItem')}
                      tooltipPosition="left"
                      onClick={() => setRecentTracks(removeRecentTrack(entry.orderCode))}
                      className="mr-2 h-9 w-9 min-h-[36px] min-w-[36px] shrink-0 text-muted hover:text-[#DC2626]"
                    >
                      <X size={15} strokeWidth={1.5} aria-hidden="true" />
                    </IconTooltip>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="w-full min-w-0 space-y-4 lg:col-span-5">
          <div className="w-full space-y-4 rounded-sm border border-neutral-200 bg-[#FAFAFA] p-5 sm:p-6">
            <div>
              <p className="eyebrow">{pick('Informasi Pelacakan', 'Tracking Guide')}</p>
              <h2 className="mt-1 font-display text-lg font-semibold text-ink">
                {pick('Cara Membaca Progres Order', 'How to Read Order Progress')}
              </h2>
            </div>

            <ul className="space-y-2.5 text-xs leading-relaxed text-muted sm:text-sm">
              <li>
                <strong className="text-ink">{pick('Kode Pesanan:', 'Order Code:')}</strong>{' '}
                {pick(
                  <>
                    Format <span className="font-mono text-ink">YNG-XXXXXX</span> diterbitkan saat
                    checkout atau dikirim admin untuk pesanan WhatsApp.
                  </>,
                  <>
                    Formatted as <span className="font-mono text-ink">YNG-XXXXXX</span>, issued on
                    checkout or sent by admin for WhatsApp orders.
                  </>
                )}
              </li>
              <li>
                <strong className="text-ink">
                  {pick('Privasi Terjaga:', 'Privacy Protected:')}
                </strong>{' '}
                {pick(
                  'Nama, WhatsApp, dan alamat pengiriman disamarkan otomatis.',
                  'Name, WhatsApp number, and address are automatically masked.'
                )}
              </li>
              <li>
                <strong className="text-ink">
                  {pick('Tagihan & Foto QC:', 'Invoices & QC Photos:')}
                </strong>{' '}
                {pick(
                  'Cek foto hasil QC dan unggah bukti pelunasan atau ongkir langsung dari halaman ini.',
                  'View QC photos and upload balance or shipping fee proofs directly on the tracker page.'
                )}
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
                  {pick(
                    'Lupa Kode Order? Tanya Admin via WhatsApp',
                    'Forgot Order Code? Ask Admin on WhatsApp'
                  )}
                </a>
              ) : null}
              <Link to="/pesanan" className="btn-secondary w-full text-xs">
                {pick('Sudah Punya Akun? Buka Pesanan Saya', 'Have an Account? Open My Orders')}
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
