import { useQuery } from '@tanstack/react-query';
import type { ApiSuccessResponse, HealthStatusDto } from '@yng/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CardSkeleton } from '../components/ui/Skeleton';
import { useLanguage } from '../context/LanguageContext';
import api from '../services/api';
import { catalogQueryKeys, getCatalogConfig, getCatalogModels } from '../services/catalogService';
import { BRAND_LOGO_MAIN_URL } from '../utils/brandAssets';
import { formatRupiah } from '../utils/formatRupiah';
import { buildWaLink } from '../utils/whatsapp';

interface HealthState {
  status: 'loading' | 'ok' | 'offline';
  message: string | null;
}

export default function Home() {
  const { pick } = useLanguage();
  const [health, setHealth] = useState<HealthState>({
    status: 'loading',
    message: null,
  });

  const configQuery = useQuery({
    queryKey: catalogQueryKeys.config,
    queryFn: getCatalogConfig,
    retry: false,
  });

  const modelsQuery = useQuery({
    queryKey: catalogQueryKeys.models,
    queryFn: getCatalogModels,
    retry: false,
  });

  useEffect(() => {
    let active = true;

    api
      .get<ApiSuccessResponse<HealthStatusDto>>('/health')
      .then((res) => {
        if (!active) return;
        setHealth({
          status: 'ok',
          message: res.data.message || null,
        });
      })
      .catch((err: unknown) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : null;
        setHealth({
          status: 'offline',
          message,
        });
      });

    return () => {
      active = false;
    };
  }, []);

  const config = configQuery.data;
  const activeModels = modelsQuery.data ?? [];
  const previewModels = activeModels.slice(0, 6);
  const showCatalogPreview = modelsQuery.isLoading || previewModels.length > 0;

  const waHref = config?.adminWhatsapp
    ? buildWaLink(
        config.adminWhatsapp,
        pick(
          'Halo admin YNG Apparel, saya ingin konsultasi pesanan custom.',
          'Hello YNG Apparel admin, I would like to consult about a custom order.'
        )
      )
    : null;

  const resolvedHealthMessage =
    health.message ??
    (health.status === 'loading'
      ? pick('Memeriksa koneksi API...', 'Checking API connection...')
      : health.status === 'ok'
        ? pick('API backend aktif.', 'Backend API is online.')
        : pick('API backend belum terhubung.', 'Backend API is not connected.'));

  return (
    <div className="space-y-12 pb-6 sm:space-y-16">
      <section className="grid items-center gap-8 lg:grid-cols-[1.18fr_0.82fr] xl:gap-14">
        <div className="min-w-0 space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="eyebrow">Batam, Indonesia · Est. 2022</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted">
              <span
                className={`h-2 w-2 rounded-full ${
                  health.status === 'ok'
                    ? 'bg-status-ok'
                    : health.status === 'loading'
                      ? 'bg-neutral-400'
                      : 'bg-status-warn'
                }`}
                aria-hidden="true"
              />
              {health.status === 'ok'
                ? pick('Studio Online', 'Studio Online')
                : health.status === 'loading'
                  ? pick('Menghubungkan…', 'Connecting…')
                  : pick('Mode Pratinjau', 'Preview Mode')}
            </span>
          </div>

          <h1 className="text-balance font-display text-4xl font-semibold leading-[1.12] tracking-[-0.02em] text-ink sm:text-5xl lg:text-6xl">
            {pick(
              'Pakaian Custom & Sablon dengan Standar Studio.',
              'Custom Apparel & Printing with Studio Precision.'
            )}
          </h1>

          <p className="max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
            {pick(
              'Rancang kaos, polo, hoodie, hingga jaket custom langsung di Custom Lab. Pilih bahan dan warna, atur matriks ukuran, dan pantau harga resmi secara transparan.',
              'Design custom tees, polos, hoodies, and jackets directly in Custom Lab. Select fabrics and colors, set your size matrix, and get transparent server-verified pricing.'
            )}
          </p>

          <div className="flex flex-col gap-3.5 pt-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
            <Link to="/custom-lab" className="btn-primary w-full sm:w-auto">
              {pick('Mulai Custom Lab', 'Start Custom Lab')}
            </Link>
            <Link to="/track" className="btn-secondary w-full sm:w-auto">
              {pick('Lacak Pesanan', 'Track Order')}
            </Link>
            {waHref ? (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-touch w-full items-center justify-center rounded-full border border-line bg-surface px-6 py-2.5 text-sm font-medium text-ink transition-colors hover:border-ink hover:bg-white sm:w-auto"
              >
                {pick('Tanya via WhatsApp', 'Ask via WhatsApp')}
              </a>
            ) : null}
          </div>
        </div>

        <aside className="min-w-0 rounded-3xl border border-line bg-surface p-6 sm:p-8">
          <div className="flex items-center gap-4 border-b border-line pb-5">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-line bg-[#d9d9d9] sm:h-20 sm:w-20">
              <img
                src={BRAND_LOGO_MAIN_URL}
                alt="YNG Apparel Studio"
                className="h-full w-full scale-110 object-cover object-center"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-base font-semibold text-ink sm:text-lg">
                YNG Apparel Studio
              </p>
              <p className="text-xs text-muted">
                {pick('Batam · Custom & Retail Garment', 'Batam · Custom & Studio Garments')}
              </p>
              <span className="mt-2 inline-flex rounded-full border border-line bg-white px-3 py-0.5 text-xs font-medium text-ink">
                @yng.apparel.official
              </span>
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="eyebrow">{pick('Skema Pembayaran', 'Payment Scheme')}</dt>
              <dd className="mt-1 font-semibold text-ink">
                {config ? (
                  <>
                    {pick('DP', 'Deposit')}{' '}
                    <span className="tabular-price">{config.dpPercent}%</span> (min.{' '}
                    <span className="tabular-price">{config.dpMinQty} pcs</span>)
                  </>
                ) : (
                  pick('DP / Pelunasan', 'Deposit / Full Payment')
                )}
              </dd>
            </div>
            <div>
              <dt className="eyebrow">{pick('Estimasi Pengerjaan', 'Production Lead Time')}</dt>
              <dd className="mt-1 font-semibold text-ink">
                {config?.productionEstimateText ?? pick('7-14 hari kerja', '7-14 business days')}
              </dd>
            </div>
            <div>
              <dt className="eyebrow">{pick('Teknik Produksi', 'Production Technique')}</dt>
              <dd className="mt-1 font-medium text-ink">
                {pick('Sablon & Heat-Press Presisi', 'Precision Screen Print & Heat-Press')}
              </dd>
            </div>
            <div>
              <dt className="eyebrow">{pick('Pengiriman', 'Fulfillment')}</dt>
              <dd className="mt-1 font-medium text-ink">
                {pick('Seluruh Indonesia & Pickup', 'Nationwide Delivery & Workshop Pickup')}
              </dd>
            </div>
          </dl>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="font-editorial text-lg italic text-muted">
              {pick('Satuan maupun produksi tim', 'Single pieces or team runs')}
            </p>
            <Link
              to="/custom-lab"
              className="inline-flex min-h-touch items-center font-display text-xs font-semibold text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
            >
              {pick('Buka Konfigurator →', 'Open Configurator →')}
            </Link>
          </div>
        </aside>
      </section>

      {showCatalogPreview ? (
        <section aria-labelledby="home-catalog-heading" className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">{pick('Katalog Aktif', 'Active Catalog')}</p>
              <h2
                id="home-catalog-heading"
                className="mt-1 font-display text-2xl font-semibold text-ink sm:text-3xl"
              >
                {pick('Pilih Siluet Pakaian', 'Choose Garment Silhouette')}
              </h2>
            </div>

            <Link to="/custom-lab" className="btn-secondary px-5 py-2 text-xs">
              {pick('Lihat Semua di Custom Lab', 'View All in Custom Lab')}
            </Link>
          </div>

          {modelsQuery.isLoading ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:gap-7">
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:gap-7">
              {previewModels.map((model) => (
                <Link
                  key={model.id}
                  to={`/custom-lab?model=${encodeURIComponent(model.slug)}`}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-white transition-colors hover:border-ink"
                >
                  <div className="aspect-[4/5] w-full overflow-hidden bg-surface">
                    {model.imageUrl ? (
                      <img
                        src={model.imageUrl}
                        alt={model.name}
                        className="h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-5 text-center">
                        <span className="font-display text-base font-semibold text-ink">
                          {model.name}
                        </span>
                        <span className="text-xs text-muted">
                          {pick('Foto katalog segera hadir', 'Catalog photo coming soon')}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col justify-between gap-3 p-5">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-display text-base font-semibold text-ink">
                          {model.name}
                        </h3>
                        <span className="shrink-0 rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs text-muted">
                          <span className="tabular-price font-medium text-ink">
                            {model.fabricIds.length}
                          </span>{' '}
                          {pick('bahan', 'fabrics')}
                        </span>
                      </div>
                      {model.description ? (
                        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted">
                          {model.description}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex items-center justify-between border-t border-line pt-3">
                      <span className="text-sm font-semibold text-ink">
                        {pick('Mulai', 'From')}{' '}
                        <span className="tabular-price">{formatRupiah(model.basePrice)}</span>
                      </span>
                      <span className="text-xs font-medium text-muted transition-colors group-hover:text-ink">
                        {pick('Rancang →', 'Design →')}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section
        aria-label={pick('Alur layanan YNG Apparel', 'YNG Apparel workflow')}
        className="grid gap-5 md:grid-cols-3 xl:gap-6"
      >
        <article className="rounded-2xl border border-line bg-surface p-6 sm:p-7">
          <p className="text-xs font-medium text-muted">
            <span className="tabular-price font-semibold text-ink">01</span> ·{' '}
            {pick('Konfigurasi', 'Configure')}
          </p>
          <h2 className="mt-2 font-display text-xl font-semibold text-ink">
            {pick('Rancang di Custom Lab', 'Design in Custom Lab')}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {pick(
              'Pilih model, bahan yang kompatibel, warna preset atau custom, matriks ukuran, dan titik sablon dengan kalkulasi harga real-time.',
              'Pick your garment model, compatible fabric, preset or custom color, size matrix, and print spots with real-time pricing.'
            )}
          </p>
        </article>

        <article className="rounded-2xl border border-line bg-surface p-6 sm:p-7">
          <p className="text-xs font-medium text-muted">
            <span className="tabular-price font-semibold text-ink">02</span> ·{' '}
            {pick('Produksi', 'Production')}
          </p>
          <h2 className="mt-2 font-display text-xl font-semibold text-ink">
            {pick('Transparan & Terpantau', 'Transparent & Trackable')}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {pick(
              'Pantau setiap tahap produksi mulai dari cek desain, cetak sablon, pressing & QC, hingga nomor resi pengiriman.',
              'Track every production step from design check, screen printing, pressing & QC, up to shipping tracking numbers.'
            )}
          </p>
        </article>

        <article className="rounded-2xl border border-line bg-surface p-6 sm:p-7">
          <p className="text-xs font-medium text-muted">
            <span className="tabular-price font-semibold text-ink">03</span> ·{' '}
            {pick('Kualitas', 'Craftsmanship')}
          </p>
          <h2 className="mt-2 font-display text-xl font-semibold text-ink">
            {pick('Dikerjakan di Batam', 'Crafted in Batam')}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {pick(
              'Mendukung pesanan satuan maupun produksi komunitas/tim ke seluruh Indonesia dengan konsultasi langsung via WhatsApp.',
              'Supporting single pieces and community/brand runs shipped across Indonesia with direct WhatsApp consultation.'
            )}
          </p>
        </article>
      </section>

      <section className="flex flex-col justify-between gap-4 rounded-2xl bg-ink px-6 py-7 text-white sm:flex-row sm:items-center sm:px-8">
        <div>
          <p className="text-xs font-medium text-neutral-400">Workshop Batam</p>
          <p className="mt-1.5 font-display text-xl font-semibold leading-snug sm:text-2xl">
            {pick(
              'Siap wujudkan apparel custom untuk tim atau brand Anda?',
              'Ready to bring custom apparel for your team or brand to life?'
            )}
          </p>
        </div>
        <Link
          to="/custom-lab"
          className="inline-flex min-h-touch shrink-0 items-center justify-center rounded-full bg-white px-6 py-2.5 font-display text-sm font-semibold text-ink transition-colors hover:bg-neutral-200"
        >
          {pick('Simulasi Harga Sekarang', 'Estimate Price Now')}
        </Link>
      </section>

      <p className="text-xs text-muted" aria-live="polite">
        {pick('Status server:', 'Server status:')} {resolvedHealthMessage}
      </p>
    </div>
  );
}
