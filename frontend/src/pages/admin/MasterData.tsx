import { useState } from 'react';
import FabricsTab from './master/FabricsTab';
import ModelsTab from './master/ModelsTab';
import PrintSizesTab from './master/PrintSizesTab';
import SizesTab from './master/SizesTab';

type MasterTabKey = 'models' | 'fabrics' | 'sizes' | 'print-sizes';

const MASTER_TABS: ReadonlyArray<{ key: MasterTabKey; label: string }> = [
  { key: 'models', label: 'Model Pakaian' },
  { key: 'fabrics', label: 'Bahan & Warna' },
  { key: 'sizes', label: 'Ukuran' },
  { key: 'print-sizes', label: 'Ukuran Sablon' },
];

export default function MasterData() {
  const [activeTab, setActiveTab] = useState<MasterTabKey>('models');
  const [includeInactive, setIncludeInactive] = useState(false);

  return (
    <div className="space-y-6">
      <section className="border-b-2 border-ink pb-5 sm:pb-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Ruang produksi · Katalog &amp; harga</p>
            <h1 className="mt-3 font-display text-5xl font-black leading-[0.88] tracking-[-0.06em] sm:text-7xl">
              Master Data
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted">
              Kelola model pakaian, relasi bahan kompatibel, preset warna, ukuran, dan harga sablon.
              Perubahan harga master hanya berlaku untuk pesanan baru dan tidak mengubah harga yang
              sudah terkunci di pesanan lama.
            </p>
          </div>

          <label className="inline-flex min-h-touch shrink-0 cursor-pointer items-center gap-2.5 border border-line-strong bg-bone px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.1em]">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(event) => setIncludeInactive(event.target.checked)}
              className="h-4 w-4 accent-ink"
            />
            <span>Tampilkan Nonaktif</span>
          </label>
        </div>

        <div
          role="tablist"
          aria-label="Kategori master data"
          className="mt-6 flex gap-2 overflow-x-auto border-t border-dashed border-line-strong pt-4"
        >
          {MASTER_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                role="tab"
                type="button"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex min-h-touch shrink-0 items-center justify-center whitespace-nowrap border px-4 py-2 font-display text-sm font-semibold transition-colors ${
                  isActive
                    ? 'border-accent bg-accent text-ink'
                    : 'border-line-strong bg-transparent text-ink hover:bg-ink hover:text-bone'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      {activeTab === 'models' ? <ModelsTab includeInactive={includeInactive} /> : null}
      {activeTab === 'fabrics' ? <FabricsTab includeInactive={includeInactive} /> : null}
      {activeTab === 'sizes' ? <SizesTab includeInactive={includeInactive} /> : null}
      {activeTab === 'print-sizes' ? <PrintSizesTab includeInactive={includeInactive} /> : null}
    </div>
  );
}
