import type { ApiSuccessResponse, HealthStatusDto } from '@yng/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

interface HealthState {
  status: 'loading' | 'ok' | 'offline';
  message: string;
}

export default function Home() {
  const [health, setHealth] = useState<HealthState>({
    status: 'loading',
    message: 'Memeriksa API backend...',
  });

  useEffect(() => {
    let active = true;

    api
      .get<ApiSuccessResponse<HealthStatusDto>>('/health')
      .then((res) => {
        if (!active) return;
        setHealth({
          status: 'ok',
          message: res.data.message || 'API backend aktif.',
        });
      })
      .catch((err: unknown) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : 'API backend belum terhubung.';
        setHealth({
          status: 'offline',
          message,
        });
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-10">
      <section className="card-sharp p-6 sm:p-10">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <span className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-muted">
            Batam — Indonesia · Est. 4 Tahun
          </span>
          <span
            className={`inline-flex items-center gap-2 border px-2.5 py-1 font-mono text-[11px] uppercase ${
              health.status === 'ok'
                ? 'border-status-ok text-status-ok'
                : health.status === 'loading'
                  ? 'border-line-strong text-muted'
                  : 'border-status-warn text-status-warn'
            }`}
          >
            {health.status === 'ok'
              ? 'API TERHUBUNG'
              : health.status === 'loading'
                ? 'MEMERIKSA API...'
                : 'API OFFLINE'}
          </span>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-12 lg:items-end">
          <div className="space-y-4 lg:col-span-8">
            <h1 className="font-display text-3xl font-bold uppercase tracking-[0.06em] sm:text-5xl">
              YNG Apparel Custom Lab &amp; Production Tracker
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-neutral-600 sm:text-base">
              Studio pemesanan pakaian custom tanpa akun. Pilih model, bahan, warna, matriks ukuran,
              dan titik sablon dengan kalkulasi harga real-time serta pelacakan produksi transparan
              dari desain hingga pengiriman.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row lg:col-span-4 lg:flex-col">
            <Link to="/custom-lab" className="btn-primary w-full">
              Buka Custom Lab
            </Link>
            <Link to="/track" className="btn-secondary w-full">
              Lacak Pesanan
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="card-sharp p-6">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">01 / Studio</p>
          <h2 className="mt-2 font-display text-lg font-semibold uppercase tracking-[0.08em]">
            Custom Lab
          </h2>
          <p className="mt-2 text-sm text-neutral-600">
            Kalkulasi harga otomatis dari model, bahan, warna preset/custom, ukuran, dan titik
            sablon dengan gatekeeper DP dinamis.
          </p>
        </article>

        <article className="card-sharp p-6">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
            02 / Transparan
          </p>
          <h2 className="mt-2 font-display text-lg font-semibold uppercase tracking-[0.08em]">
            Live Tracker
          </h2>
          <p className="mt-2 text-sm text-neutral-600">
            Pantau 5 tahap produksi, foto QC, rincian tagihan, unggah bukti bayar, dan nomor resi
            cukup dengan kode order dan 4 digit terakhir WhatsApp.
          </p>
        </article>

        <article className="card-sharp p-6">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
            03 / Operasional
          </p>
          <h2 className="mt-2 font-display text-lg font-semibold uppercase tracking-[0.08em]">
            Solo-Admin Kanban
          </h2>
          <p className="mt-2 text-sm text-neutral-600">
            Dashboard mobile-first untuk verifikasi pembayaran, cetak SPK PDF, unggah foto QC,
            kelola ongkir/resi, dan kirim update WhatsApp.
          </p>
        </article>
      </section>

      <section className="border border-line bg-surface px-5 py-4 text-xs text-muted">
        Status fondasi (Tahap 0): {health.message}
      </section>
    </div>
  );
}
