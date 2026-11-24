import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl py-12 sm:py-20">
      <p className="inline-block bg-accent px-2 py-1 font-mono text-sm font-semibold text-ink">
        404 / SALAH JALAN
      </p>
      <h1 className="mt-4 font-display text-6xl font-black leading-[0.86] tracking-[-0.06em] sm:text-8xl">
        Halaman ini belum ada.
      </h1>
      <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
        Tautan yang Anda tuju tidak tersedia atau telah dipindahkan.
      </p>
      <div className="mt-8">
        <Link to="/" className="btn-primary">
          Kembali ke Beranda
        </Link>
      </div>
    </div>
  );
}
