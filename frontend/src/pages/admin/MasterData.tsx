import { useState } from 'react';
import CategoriesCollectionsTab from './master/CategoriesCollectionsTab';
import FabricsTab from './master/FabricsTab';
import ModelsTab from './master/ModelsTab';
import PrintSizesTab from './master/PrintSizesTab';
import SizesTab from './master/SizesTab';

type MasterTabKey = 'models' | 'categories-collections' | 'fabrics' | 'sizes' | 'print-sizes';

const MASTER_TABS: ReadonlyArray<{ key: MasterTabKey; label: string }> = [
  { key: 'models', label: 'Bank Model' },
  { key: 'categories-collections', label: 'Kategori & Koleksi' },
  { key: 'fabrics', label: 'Bahan & Warna' },
  { key: 'sizes', label: 'Ukuran' },
  { key: 'print-sizes', label: 'Ukuran Sablon' },
];

export default function MasterData() {
  const [activeTab, setActiveTab] = useState<MasterTabKey>('models');
  const [includeInactive, setIncludeInactive] = useState(false);

  return (
    <div className="space-y-6">
      <section className="rounded-sm border border-line bg-white p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Ruang Produksi · Katalog &amp; Harga</p>
            <h1 className="mt-2 font-display text-3xl font-semibold text-ink sm:text-4xl">
              Master Data
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
              Perubahan harga hanya berlaku untuk pesanan baru.
            </p>
          </div>

          {activeTab !== 'models' ? (
            <label className="inline-flex min-h-touch shrink-0 cursor-pointer items-center gap-2.5 rounded-sm border border-line bg-[#FAFAFA] px-4 py-2 text-xs font-semibold text-ink">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(event) => setIncludeInactive(event.target.checked)}
                className="h-4 w-4 accent-ink"
              />
              <span>Tampilkan Nonaktif</span>
            </label>
          ) : null}
        </div>

        <div
          role="tablist"
          aria-label="Kategori master data"
          className="mt-6 flex gap-2 overflow-x-auto border-t border-line pt-4"
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
                className={`inline-flex min-h-touch shrink-0 items-center justify-center whitespace-nowrap rounded-sm border px-4 py-2 font-display text-xs font-semibold transition-colors ${
                  isActive
                    ? 'border-ink bg-ink text-white'
                    : 'border-line bg-[#FAFAFA] text-ink hover:border-ink'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      {activeTab === 'models' ? (
        <ModelsTab includeInactive={includeInactive} onChangeIncludeInactive={setIncludeInactive} />
      ) : null}
      {activeTab === 'categories-collections' ? (
        <CategoriesCollectionsTab includeInactive={includeInactive} />
      ) : null}
      {activeTab === 'fabrics' ? <FabricsTab includeInactive={includeInactive} /> : null}
      {activeTab === 'sizes' ? <SizesTab includeInactive={includeInactive} /> : null}
      {activeTab === 'print-sizes' ? <PrintSizesTab includeInactive={includeInactive} /> : null}
    </div>
  );
}
