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
    <div className="space-y-16 pb-8 sm:space-y-24">
      <section className="grid items-center gap-10 pt-2 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16 lg:pt-8">
        <div className="relative z-10 space-y-7">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="font-mono text-xs text-muted">
              Batam, Indonesia · Berdiri sejak 2022
            </span>
            <span className="inline-flex items-center gap-2 font-mono text-xs" aria-live="polite">
              <span
                className={`h-2.5 w-2.5 ${
                  health.status === 'ok'
                    ? 'bg-status-ok'
                    : health.status === 'loading'
                      ? 'bg-accent'
                      : 'bg-status-warn'
                }`}
                aria-hidden="true"
              />
              {health.status === 'ok'
                ? 'Layanan siap'
                : health.status === 'loading'
                  ? 'Menghubungkan…'
                  : 'Layanan terputus'}
            </span>
          </div>
          <h1 className="max-w-4xl text-balance font-display text-[clamp(3.6rem,11vw,9rem)] font-black leading-[0.82] tracking-[-0.075em]">
            BIKIN BAJU.
            <br />
            <span className="inline-block bg-accent px-2 text-ink">BIKIN BERANI.</span>
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted sm:text-xl">
            Pakaian custom dan sablon yang dirancang bareng, dicetak rapi, lalu dikirim dari
            workshop kami di Batam.
          </p>
          <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center">
            <Link to="/custom-lab" className="btn-primary w-full sm:w-auto">
              Mulai rancang pakaian{' '}
              <span aria-hidden="true" className="ml-4 font-mono">
                ↗
              </span>
            </Link>
            <Link to="/track" className="btn-secondary w-full sm:w-auto">
              Lacak pesanan
            </Link>
          </div>
        </div>

        <figure className="relative mx-auto w-full max-w-xl lg:ml-auto">
          <div className="absolute -left-2 top-10 z-10 bg-accent px-2 py-1 font-mono text-xs text-ink sm:-left-8">
            + 01
          </div>
          <div className="relative aspect-[4/5] overflow-hidden bg-[#e4dfd3]">
            <svg
              viewBox="0 0 520 620"
              role="img"
              aria-labelledby="shirt-title shirt-desc"
              className="absolute inset-0 h-full w-full"
            >
              <title id="shirt-title">Mockup kaos YNG Apparel</title>
              <desc id="shirt-desc">Ilustrasi kaos workshop dengan tanda registrasi sablon.</desc>
              <rect width="520" height="620" fill="#e4dfd3" />
              <path
                d="M149 120 210 92c8 30 25 45 50 45s42-15 50-45l61 28 92 64-49 74-52-34v260H158V224l-52 34-49-74 92-64Z"
                fill="#f7f4eb"
                stroke="#0b0b0c"
                strokeWidth="5"
              />
              <path
                d="M210 92c8 30 25 45 50 45s42-15 50-45"
                fill="none"
                stroke="#0b0b0c"
                strokeWidth="5"
              />
              <path
                d="M158 224v260m204-260v260"
                fill="none"
                stroke="#c9c3b8"
                strokeWidth="2"
                strokeDasharray="8 8"
              />
              <rect x="214" y="244" width="92" height="104" fill="#ff4f00" />
              <path d="M230 260h60v7h-60zm0 18h44v7h-44zm0 18h54v7h-54z" fill="#0b0b0c" />
              <text
                x="230"
                y="330"
                fill="#0b0b0c"
                fontFamily="IBM Plex Mono, monospace"
                fontSize="14"
                fontWeight="600"
              >
                YNG / 01
              </text>
              <path d="M36 36h28M50 22v28M456 584h28M470 570v28" stroke="#ff4f00" strokeWidth="3" />
              <text
                x="30"
                y="570"
                fill="#0b0b0c"
                fontFamily="IBM Plex Mono, monospace"
                fontSize="12"
              >
                GARMENT TEST / BATAM
              </text>
            </svg>
            <span className="absolute bottom-4 right-4 bg-ink px-3 py-2 font-mono text-xs text-bone">
              SABLON · PRESS · SELESAI
            </span>
          </div>
          <figcaption className="mt-3 flex items-center justify-between font-mono text-xs text-muted">
            <span>CONTOH MOCKUP · CUSTOM LAB</span>
            <span>01 / 03</span>
          </figcaption>
        </figure>
      </section>

      <section aria-label="Layanan YNG Apparel" className="border-y-2 border-ink">
        <article className="grid gap-2 py-6 sm:grid-cols-[100px_0.7fr_1fr] sm:items-baseline sm:gap-8">
          <span className="font-display text-5xl font-black leading-none text-ink sm:text-6xl">
            01
          </span>
          <h2 className="text-3xl font-black sm:text-4xl">Rancang sendiri</h2>
          <p className="max-w-2xl text-base leading-relaxed text-muted">
            Pilih model, bahan, warna, ukuran, dan titik sablon. Susun pesanan sesuai kebutuhan tim
            atau brand Anda.
          </p>
        </article>
        <article className="stitch-rule grid gap-2 py-6 sm:grid-cols-[100px_0.7fr_1fr] sm:items-baseline sm:gap-8">
          <span className="font-display text-5xl font-black leading-none text-ink sm:text-6xl">
            02
          </span>
          <h2 className="text-3xl font-black sm:text-4xl">Produksi terpantau</h2>
          <p className="max-w-2xl text-base leading-relaxed text-muted">
            Lihat kabar pengerjaan dan informasi pengiriman pesanan lewat halaman pelacakan.
          </p>
        </article>
        <article className="stitch-rule grid gap-2 py-6 sm:grid-cols-[100px_0.7fr_1fr] sm:items-baseline sm:gap-8">
          <span className="font-display text-5xl font-black leading-none text-ink sm:text-6xl">
            03
          </span>
          <h2 className="text-3xl font-black sm:text-4xl">Dikerjakan di Batam</h2>
          <p className="max-w-2xl text-base leading-relaxed text-muted">
            Kami bantu dari konsultasi bahan sampai sablon heat-press, untuk pesanan satuan maupun
            produksi tim.
          </p>
        </article>
      </section>

      <section className="care-label grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className="font-mono text-xs text-neutral-300">KONTAK WORKSHOP</p>
          <p className="mt-2 text-2xl font-bold tracking-tightest sm:text-3xl">
            Punya ide? Bawa ke meja produksi.
          </p>
        </div>
        <p className="font-editorial text-2xl italic text-accent sm:text-3xl">
          @yng.apparel.official
        </p>
      </section>

      <p
        className="border-l-2 border-accent pl-4 font-mono text-xs leading-relaxed text-muted"
        aria-live="polite"
      >
        {health.message}
      </p>
    </div>
  );
}
