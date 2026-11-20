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
      <section className="card-sharp p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted">
              Admin · Katalog &amp; Harga
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold uppercase tracking-[0.08em]">
              Master Data
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-neutral-600">
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
          className="mt-5 flex gap-2 overflow-x-auto border-t border-line pt-4"
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
                className={`inline-flex min-h-touch shrink-0 items-center justify-center whitespace-nowrap border px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.14em] transition-colors ${
                  isActive
                    ? 'border-ink bg-ink text-bone'
                    : 'border-line-strong bg-surface text-ink hover:bg-bone'
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
