import type { AppSettingKey, AppSettingsMapDto, UpdateAppSettingsDto } from '@yng/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AdminFeedbackBanner } from '../../components/admin/AdminFeedbackBanner';
import { getSettings, updateSettings } from '../../services/adminMasterService';
import { extractApiError } from '../../utils/apiError';

type SettingsFormStrings = Record<AppSettingKey, string>;

const NUMERIC_KEYS: ReadonlyArray<
  Exclude<AppSettingKey, 'store_name' | 'admin_whatsapp' | 'production_estimate_text'>
> = [
  'dp_percent',
  'dp_min_qty',
  'initial_payment_due_hours',
  'auto_complete_days',
  'dpi_ok_min',
  'dpi_warn_min',
  'max_design_file_mb',
  'signed_url_expiry_seconds',
  'temp_upload_ttl_hours',
];

const NUMERIC_RULES: Readonly<
  Record<(typeof NUMERIC_KEYS)[number], { label: string; min: number; max: number }>
> = {
  dp_percent: { label: 'Persentase DP (%)', min: 1, max: 99 },
  dp_min_qty: { label: 'Minimal Qty DP (pcs)', min: 1, max: 10000 },
  initial_payment_due_hours: { label: 'Batas Bayar Awal (jam)', min: 1, max: 720 },
  auto_complete_days: { label: 'Otomatis Selesai Setelah Kirim (hari)', min: 1, max: 90 },
  dpi_ok_min: { label: 'Ambang DPI Aman Minimum', min: 50, max: 1200 },
  dpi_warn_min: { label: 'Ambang DPI Peringatan Minimum', min: 10, max: 1200 },
  max_design_file_mb: { label: 'Batas File Desain (MB)', min: 1, max: 50 },
  signed_url_expiry_seconds: { label: 'Masa Berlaku Signed URL (detik)', min: 60, max: 86400 },
  temp_upload_ttl_hours: { label: 'TTL File Sementara tmp/ (jam)', min: 1, max: 168 },
};

function mapToFormStrings(settings: AppSettingsMapDto): SettingsFormStrings {
  return {
    store_name: settings.store_name,
    admin_whatsapp: settings.admin_whatsapp,
    production_estimate_text: settings.production_estimate_text,
    dp_percent: String(settings.dp_percent),
    dp_min_qty: String(settings.dp_min_qty),
    initial_payment_due_hours: String(settings.initial_payment_due_hours),
    auto_complete_days: String(settings.auto_complete_days),
    dpi_ok_min: String(settings.dpi_ok_min),
    dpi_warn_min: String(settings.dpi_warn_min),
    max_design_file_mb: String(settings.max_design_file_mb),
    signed_url_expiry_seconds: String(settings.signed_url_expiry_seconds),
    temp_upload_ttl_hours: String(settings.temp_upload_ttl_hours),
  };
}

function parseStrictInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const num = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(num) ? num : null;
}

export default function Settings() {
  const [initialSettings, setInitialSettings] = useState<AppSettingsMapDto | null>(null);
  const [form, setForm] = useState<SettingsFormStrings | null>(null);
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [feedback, setFeedback] = useState<{
    variant: 'error' | 'success';
    message: string;
    details?: string[];
  } | null>(null);

  const applyResponse = useCallback((settings: AppSettingsMapDto, updatedList: string[]) => {
    setInitialSettings(settings);
    setForm(mapToFormStrings(settings));
    if (updatedList.length > 0) {
      const latest = updatedList
        .map((ts) => new Date(ts).getTime())
        .filter((ms) => !Number.isNaN(ms))
        .sort((a, b) => b - a)[0];
      if (latest) {
        setLastUpdatedLabel(
          new Intl.DateTimeFormat('id-ID', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'Asia/Jakarta',
          }).format(new Date(latest))
        );
      }
    }
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSettings();
      applyResponse(
        data.settings,
        data.items.map((item) => item.updatedAt)
      );
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal memuat pengaturan aplikasi.');
      setFeedback({ variant: 'error', message: parsed.message, details: parsed.details });
    } finally {
      setLoading(false);
    }
  }, [applyResponse]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  function setField(key: AppSettingKey, value: string) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || !initialSettings) return;
    setFeedback(null);

    const storeName = form.store_name.trim();
    const adminWa = form.admin_whatsapp.trim();
    const prodEstimate = form.production_estimate_text.trim();

    if (!storeName || !adminWa || !prodEstimate) {
      setFeedback({
        variant: 'error',
        message: 'Nama toko, WhatsApp admin, dan teks estimasi produksi tidak boleh kosong.',
      });
      return;
    }

    const parsedNumeric: Partial<Record<(typeof NUMERIC_KEYS)[number], number>> = {};
    for (const key of NUMERIC_KEYS) {
      const rule = NUMERIC_RULES[key];
      const parsed = parseStrictInt(form[key]);
      if (parsed === null || parsed < rule.min || parsed > rule.max) {
        setFeedback({
          variant: 'error',
          message: `${rule.label} harus berupa bilangan bulat antara ${rule.min} sampai ${rule.max}.`,
        });
        return;
      }
      parsedNumeric[key] = parsed;
    }

    const dpiOkMin = parsedNumeric.dpi_ok_min ?? initialSettings.dpi_ok_min;
    const dpiWarnMin = parsedNumeric.dpi_warn_min ?? initialSettings.dpi_warn_min;
    if (dpiOkMin <= dpiWarnMin) {
      setFeedback({
        variant: 'error',
        message: 'Nilai Ambang DPI Aman harus lebih besar daripada Ambang DPI Peringatan.',
      });
      return;
    }

    const patch: UpdateAppSettingsDto = {};
    if (storeName !== initialSettings.store_name) patch.store_name = storeName;
    if (adminWa !== initialSettings.admin_whatsapp) patch.admin_whatsapp = adminWa;
    if (prodEstimate !== initialSettings.production_estimate_text) {
      patch.production_estimate_text = prodEstimate;
    }

    for (const key of NUMERIC_KEYS) {
      const val = parsedNumeric[key];
      if (val !== undefined && val !== initialSettings[key]) {
        patch[key] = val;
      }
    }

    if (Object.keys(patch).length === 0) {
      setFeedback({
        variant: 'success',
        message: 'Tidak ada perubahan pengaturan yang perlu disimpan.',
      });
      return;
    }

    setSubmitting(true);
    try {
      const updated = await updateSettings(patch);
      applyResponse(
        updated.settings,
        updated.items.map((item) => item.updatedAt)
      );
      setFeedback({
        variant: 'success',
        message: 'Pengaturan aplikasi berhasil disimpan secara atomik.',
      });
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal menyimpan pengaturan aplikasi.');
      setFeedback({ variant: 'error', message: parsed.message, details: parsed.details });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="card-sharp p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted">
              Admin · Konfigurasi
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold uppercase tracking-[0.08em]">
              Pengaturan Toko
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-neutral-600">
              Nilai pengaturan (persentase DP, minimal qty DP, batas bayar, dan DPI Guard) akan
              dibaca dari server dan di-snapshot ke setiap order baru.
            </p>
          </div>
          {lastUpdatedLabel ? (
            <p className="font-mono text-xs text-muted">
              Pembaruan terakhir: {lastUpdatedLabel} WIB
            </p>
          ) : null}
        </div>
      </section>

      {feedback ? (
        <AdminFeedbackBanner
          variant={feedback.variant}
          message={feedback.message}
          details={feedback.details}
          onDismiss={() => setFeedback(null)}
        />
      ) : null}

      {loading || !form ? (
        <div className="card-sharp p-6 text-center font-mono text-xs uppercase tracking-[0.14em] text-muted">
          Memuat pengaturan aplikasi...
        </div>
      ) : (
        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-6" noValidate>
          <section className="card-sharp p-4 sm:p-6">
            <h2 className="border-b border-line pb-3 font-display text-base font-bold uppercase tracking-[0.1em]">
              01 / Identitas &amp; Operasional
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="set-store-name"
                  className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
                >
                  Nama Brand / Toko
                </label>
                <input
                  id="set-store-name"
                  type="text"
                  value={form.store_name}
                  onChange={(event) => setField('store_name', event.target.value)}
                  className="input-sharp mt-1.5"
                  disabled={submitting}
                />
              </div>

              <div>
                <label
                  htmlFor="set-admin-wa"
                  className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
                >
                  Nomor WhatsApp Admin
                </label>
                <input
                  id="set-admin-wa"
                  type="tel"
                  value={form.admin_whatsapp}
                  onChange={(event) => setField('admin_whatsapp', event.target.value)}
                  placeholder="6281234567890"
                  className="input-sharp mt-1.5 font-mono"
                  disabled={submitting}
                />
                <p className="mt-1 text-xs text-muted">
                  Otomatis dinormalisasi ke format 62xxxxxxxxxx.
                </p>
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="set-estimate"
                  className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
                >
                  Teks Estimasi Produksi
                </label>
                <input
                  id="set-estimate"
                  type="text"
                  value={form.production_estimate_text}
                  onChange={(event) => setField('production_estimate_text', event.target.value)}
                  placeholder="7-14 hari kerja"
                  className="input-sharp mt-1.5"
                  disabled={submitting}
                />
              </div>
            </div>
          </section>

          <section className="card-sharp p-4 sm:p-6">
            <h2 className="border-b border-line pb-3 font-display text-base font-bold uppercase tracking-[0.1em]">
              02 / Aturan DP &amp; Siklus Order
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="set-dp-percent"
                  className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
                >
                  Persentase DP (1–99%)
                </label>
                <input
                  id="set-dp-percent"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={99}
                  value={form.dp_percent}
                  onChange={(event) => setField('dp_percent', event.target.value)}
                  className="input-sharp tabular-price mt-1.5"
                  disabled={submitting}
                />
              </div>

              <div>
                <label
                  htmlFor="set-dp-min-qty"
                  className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
                >
                  Minimal Total Qty untuk DP (pcs)
                </label>
                <input
                  id="set-dp-min-qty"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={form.dp_min_qty}
                  onChange={(event) => setField('dp_min_qty', event.target.value)}
                  className="input-sharp tabular-price mt-1.5"
                  disabled={submitting}
                />
              </div>

              <div>
                <label
                  htmlFor="set-due-hours"
                  className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
                >
                  Batas Bayar Awal Order Website (jam)
                </label>
                <input
                  id="set-due-hours"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={720}
                  value={form.initial_payment_due_hours}
                  onChange={(event) => setField('initial_payment_due_hours', event.target.value)}
                  className="input-sharp tabular-price mt-1.5"
                  disabled={submitting}
                />
              </div>

              <div>
                <label
                  htmlFor="set-auto-complete"
                  className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
                >
                  Otomatis Selesai Setelah Pengiriman (hari)
                </label>
                <input
                  id="set-auto-complete"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={90}
                  value={form.auto_complete_days}
                  onChange={(event) => setField('auto_complete_days', event.target.value)}
                  className="input-sharp tabular-price mt-1.5"
                  disabled={submitting}
                />
              </div>
            </div>
          </section>

          <section className="card-sharp p-4 sm:p-6">
            <h2 className="border-b border-line pb-3 font-display text-base font-bold uppercase tracking-[0.1em]">
              03 / Unggahan Desain, DPI Guard &amp; Storage
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label
                  htmlFor="set-max-design"
                  className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
                >
                  Maks File Desain (MB)
                </label>
                <input
                  id="set-max-design"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={50}
                  value={form.max_design_file_mb}
                  onChange={(event) => setField('max_design_file_mb', event.target.value)}
                  className="input-sharp tabular-price mt-1.5"
                  disabled={submitting}
                />
              </div>

              <div>
                <label
                  htmlFor="set-dpi-ok"
                  className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
                >
                  Ambang DPI Aman Minimum
                </label>
                <input
                  id="set-dpi-ok"
                  type="number"
                  inputMode="numeric"
                  min={50}
                  max={1200}
                  value={form.dpi_ok_min}
                  onChange={(event) => setField('dpi_ok_min', event.target.value)}
                  className="input-sharp tabular-price mt-1.5"
                  disabled={submitting}
                />
              </div>

              <div>
                <label
                  htmlFor="set-dpi-warn"
                  className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
                >
                  Ambang DPI Peringatan
                </label>
                <input
                  id="set-dpi-warn"
                  type="number"
                  inputMode="numeric"
                  min={10}
                  max={1200}
                  value={form.dpi_warn_min}
                  onChange={(event) => setField('dpi_warn_min', event.target.value)}
                  className="input-sharp tabular-price mt-1.5"
                  disabled={submitting}
                />
              </div>

              <div>
                <label
                  htmlFor="set-signed-expiry"
                  className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
                >
                  Kedaluwarsa Signed URL (detik)
                </label>
                <input
                  id="set-signed-expiry"
                  type="number"
                  inputMode="numeric"
                  min={60}
                  max={86400}
                  value={form.signed_url_expiry_seconds}
                  onChange={(event) => setField('signed_url_expiry_seconds', event.target.value)}
                  className="input-sharp tabular-price mt-1.5"
                  disabled={submitting}
                />
              </div>

              <div>
                <label
                  htmlFor="set-tmp-ttl"
                  className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
                >
                  TTL File Sementara tmp/ (jam)
                </label>
                <input
                  id="set-tmp-ttl"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={168}
                  value={form.temp_upload_ttl_hours}
                  onChange={(event) => setField('temp_upload_ttl_hours', event.target.value)}
                  className="input-sharp tabular-price mt-1.5"
                  disabled={submitting}
                />
              </div>
            </div>
          </section>

          <div className="flex flex-wrap gap-3">
            <button type="submit" className="btn-primary w-full sm:w-auto" disabled={submitting}>
              {submitting ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (initialSettings) {
                  setFeedback(null);
                  setForm(mapToFormStrings(initialSettings));
                }
              }}
              className="btn-secondary w-full sm:w-auto"
              disabled={submitting}
            >
              Reset Perubahan
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
