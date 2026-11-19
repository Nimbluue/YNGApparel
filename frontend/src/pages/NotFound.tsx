import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="card-sharp mx-auto max-w-lg p-8 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">404</p>
      <h1 className="mt-2 font-display text-2xl font-bold uppercase tracking-[0.1em]">
        Halaman Tidak Ditemukan
      </h1>
      <p className="mt-3 text-sm text-neutral-600">
        Tautan yang Anda tuju tidak tersedia atau telah dipindahkan.
      </p>
      <div className="mt-6">
        <Link to="/" className="btn-primary">
          Kembali ke Beranda
        </Link>
      </div>
    </div>
  );
}
