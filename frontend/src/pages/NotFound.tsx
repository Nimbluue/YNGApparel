import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl rounded-3xl border border-line bg-surface p-6 py-12 sm:p-12">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-muted">
        <span className="tabular-price font-semibold text-ink">404</span> · Tidak Ditemukan
      </span>
      <h1 className="mt-4 font-display text-3xl font-semibold text-ink sm:text-5xl">
        Halaman ini belum tersedia.
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
        Tautan yang Anda tuju tidak ditemukan atau sudah dipindahkan.
      </p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link to="/" className="btn-primary">
          Kembali ke Beranda
        </Link>
        <Link to="/custom-lab" className="btn-secondary">
          Buka Custom Lab
        </Link>
      </div>
    </div>
  );
}
