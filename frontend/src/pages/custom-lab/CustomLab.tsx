import {
  PRINT_POSITION,
  type ApiSuccessResponse,
  type FabricDto,
  type GarmentModelDto,
  type PrintPosition,
  type PrintSizeDto,
  type SizeDto,
} from '@yng/shared';
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api, { ApiClientError } from '../../services/api';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/ErrorState';
import { formatRupiah } from '../../utils/formatRupiah';
import { normalizeWhatsApp } from '../../utils/phone';

interface CatalogConfig {
  dp_percent: number;
  dp_min_qty: number;
  production_estimate_text: string;
  max_design_file_mb: number;
  admin_whatsapp: string;
}

interface CatalogData {
  models: GarmentModelDto[];
  fabrics: FabricDto[];
  sizes: SizeDto[];
  printSizes: PrintSizeDto[];
  config: CatalogConfig;
}

interface DesignFile {
  fileRef: string;
  fileName: string;
}

interface PrintDraft {
  key: string;
  position: PrintPosition;
  printSizeId: number | '';
  designHelp: boolean;
  design: DesignFile | null;
  uploading: boolean;
  uploadError: string | null;
}

interface CustomLabConfig {
  modelId: number;
  fabricId: number;
  colorId?: number;
  isCustomColor: boolean;
  customColorName?: string;
  customColorHex?: string;
  sizes: Array<{ sizeId: number; qty: number }>;
  prints: Array<{
    position: PrintPosition;
    printSizeId: number;
    fileRef?: string;
    needsDesignHelp: boolean;
  }>;
}

interface QuoteResult {
  subtotalAmount: number;
  totalQty: number;
  discountAmount: number;
  grandTotal: number;
  dpRequiredAmount: number;
  isDpEligible: boolean;
}

const PRINT_POSITIONS: Array<{ value: PrintPosition; label: string }> = [
  { value: PRINT_POSITION.FRONT_CHEST, label: 'Dada depan' },
  { value: PRINT_POSITION.FRONT_CENTER, label: 'Tengah depan' },
  { value: PRINT_POSITION.BACK_CENTER, label: 'Punggung tengah' },
  { value: PRINT_POSITION.BACK_UPPER, label: 'Punggung atas' },
  { value: PRINT_POSITION.LEFT_SLEEVE, label: 'Lengan kiri' },
  { value: PRINT_POSITION.RIGHT_SLEEVE, label: 'Lengan kanan' },
  { value: PRINT_POSITION.COLLAR, label: 'Kerah' },
  { value: PRINT_POSITION.OTHER, label: 'Posisi lain' },
];

const EMPTY_CONFIG: CatalogConfig = {
  dp_percent: 0,
  dp_min_qty: 0,
  production_estimate_text: '',
  max_design_file_mb: 20,
  admin_whatsapp: '',
};

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 404) {
      return 'Katalog dan estimasi belum tersedia. Silakan coba lagi nanti atau hubungi workshop.';
    }
    return error.message;
  }
  return 'Tidak dapat terhubung ke server. Pastikan backend berjalan, lalu coba lagi.';
}

function makePrintDraft(): PrintDraft {
  return {
    key: crypto.randomUUID(),
    position: PRINT_POSITION.FRONT_CHEST,
    printSizeId: '',
    designHelp: false,
    design: null,
    uploading: false,
    uploadError: null,
  };
}

export default function CustomLab() {
  const { isGuest } = useAuth();
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<number | ''>('');
  const [selectedFabricId, setSelectedFabricId] = useState<number | ''>('');
  const [selectedColorId, setSelectedColorId] = useState<number | ''>('');
  const [isCustomColor, setIsCustomColor] = useState(false);
  const [customColorName, setCustomColorName] = useState('');
  const [customColorHex, setCustomColorHex] = useState('');
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [prints, setPrints] = useState<PrintDraft[]>([makePrintDraft()]);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [cartMessage, setCartMessage] = useState<string | null>(null);
  const [cartLoading, setCartLoading] = useState(false);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [modelsResponse, fabricsResponse, sizesResponse, printSizesResponse, configResponse] =
        await Promise.all([
          api.get<ApiSuccessResponse<GarmentModelDto[]>>('/catalog/models'),
          api.get<ApiSuccessResponse<FabricDto[]>>('/catalog/fabrics'),
          api.get<ApiSuccessResponse<SizeDto[]>>('/catalog/sizes'),
          api.get<ApiSuccessResponse<PrintSizeDto[]>>('/catalog/print-sizes'),
          api.get<ApiSuccessResponse<CatalogConfig>>('/catalog/config'),
        ]);

      const nextCatalog: CatalogData = {
        models: modelsResponse.data.data,
        fabrics: fabricsResponse.data.data,
        sizes: sizesResponse.data.data,
        printSizes: printSizesResponse.data.data,
        config: configResponse.data.data,
      };
      setCatalog(nextCatalog);
      setSelectedModelId((current) => current || nextCatalog.models[0]?.id || '');
    } catch (error: unknown) {
      setLoadError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const selectedModel = useMemo(
    () => catalog?.models.find((model) => model.id === selectedModelId) ?? null,
    [catalog, selectedModelId]
  );
  const availableFabrics = useMemo(
    () => catalog?.fabrics.filter((fabric) => selectedModel?.fabricIds.includes(fabric.id)) ?? [],
    [catalog, selectedModel]
  );
  const selectedFabric = availableFabrics.find((fabric) => fabric.id === selectedFabricId) ?? null;
  const totalQty = Object.values(quantities).reduce((total, qty) => total + qty, 0);
  const adminWhatsapp = catalog ? normalizeWhatsApp(catalog.config.admin_whatsapp) : null;

  useEffect(() => {
    if (selectedFabricId && !availableFabrics.some((fabric) => fabric.id === selectedFabricId)) {
      setSelectedFabricId('');
      setSelectedColorId('');
      setIsCustomColor(false);
    }
  }, [availableFabrics, selectedFabricId]);

  const buildConfig = useCallback((): CustomLabConfig | null => {
    if (!selectedModelId || !selectedFabricId || totalQty < 1) return null;
    if (
      isCustomColor &&
      (!customColorName.trim() || (customColorHex && !/^#[0-9A-Fa-f]{6}$/.test(customColorHex)))
    )
      return null;
    if (!isCustomColor && !selectedColorId) return null;
    if (
      prints.some((print) => !print.printSizeId || (!print.designHelp && print.design === null))
    ) {
      return null;
    }

    return {
      modelId: selectedModelId,
      fabricId: selectedFabricId,
      ...(selectedColorId ? { colorId: selectedColorId } : {}),
      isCustomColor,
      ...(isCustomColor ? { customColorName: customColorName.trim() } : {}),
      ...(isCustomColor && customColorHex ? { customColorHex } : {}),
      sizes: Object.entries(quantities)
        .filter(([, qty]) => qty > 0)
        .map(([sizeId, qty]) => ({ sizeId: Number(sizeId), qty })),
      prints: prints.map((print) => ({
        position: print.position,
        printSizeId: print.printSizeId as number,
        ...(print.design ? { fileRef: print.design.fileRef } : {}),
        needsDesignHelp: print.designHelp,
      })),
    };
  }, [
    customColorHex,
    customColorName,
    isCustomColor,
    prints,
    quantities,
    selectedColorId,
    selectedFabricId,
    selectedModelId,
    totalQty,
  ]);

  const requestQuote = useCallback(async () => {
    const item = buildConfig();
    if (!item) {
      setQuote(null);
      setQuoteError(
        'Lengkapi pilihan model, bahan, warna, ukuran, dan detail sablon untuk melihat estimasi.'
      );
      return;
    }

    setQuoteLoading(true);
    setQuoteError(null);
    try {
      const response = await api.post<ApiSuccessResponse<QuoteResult>>('/pricing/quote', {
        items: [item],
      });
      setQuote(response.data.data);
    } catch (error: unknown) {
      setQuote(null);
      setQuoteError(getErrorMessage(error));
    } finally {
      setQuoteLoading(false);
    }
  }, [buildConfig]);

  useEffect(() => {
    if (!buildConfig()) {
      setQuote(null);
      return;
    }
    const timer = window.setTimeout(() => void requestQuote(), 350);
    return () => window.clearTimeout(timer);
  }, [buildConfig, requestQuote]);

  async function handleDesignUpload(event: ChangeEvent<HTMLInputElement>, printKey: string) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (isGuest) {
      navigate('/login', { state: { from: '/custom-lab' } });
      return;
    }

    const maxSizeBytes =
      (catalog?.config.max_design_file_mb ?? EMPTY_CONFIG.max_design_file_mb) * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      setPrints((current) =>
        current.map((print) =>
          print.key === printKey
            ? {
                ...print,
                uploadError: `Ukuran file maksimal ${catalog?.config.max_design_file_mb ?? EMPTY_CONFIG.max_design_file_mb} MB.`,
              }
            : print
        )
      );
      return;
    }

    const body = new FormData();
    body.append('file', file);
    setPrints((current) =>
      current.map((print) =>
        print.key === printKey ? { ...print, uploading: true, uploadError: null } : print
      )
    );
    try {
      const response = await api.post<ApiSuccessResponse<{ fileRef: string; fileName: string }>>(
        '/uploads/design',
        body,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setPrints((current) =>
        current.map((print) =>
          print.key === printKey
            ? {
                ...print,
                design: {
                  fileRef: response.data.data.fileRef,
                  fileName: response.data.data.fileName,
                },
                uploading: false,
                uploadError: null,
              }
            : print
        )
      );
    } catch (error: unknown) {
      setPrints((current) =>
        current.map((print) =>
          print.key === printKey
            ? { ...print, uploading: false, uploadError: getErrorMessage(error) }
            : print
        )
      );
    }
  }

  async function handleAddToCart() {
    setCartMessage(null);
    const item = buildConfig();
    if (!item) {
      setCartMessage(
        'Lengkapi konfigurasi dan pastikan harga berhasil dihitung sebelum menyimpan.'
      );
      return;
    }
    if (isGuest) {
      navigate('/login', { state: { from: '/custom-lab' } });
      return;
    }

    setCartLoading(true);
    try {
      await api.post('/cart/items', item);
      setCartMessage('Konfigurasi berhasil ditambahkan ke keranjang.');
    } catch (error: unknown) {
      setCartMessage(getErrorMessage(error));
    } finally {
      setCartLoading(false);
    }
  }

  function updatePrint(key: string, update: Partial<PrintDraft>) {
    setPrints((current) =>
      current.map((print) => (print.key === key ? { ...print, ...update } : print))
    );
    setQuote(null);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl py-12" aria-live="polite">
        <p className="eyebrow">Custom Lab · YNG Apparel</p>
        <h1 className="mt-4 font-display text-5xl font-black tracking-[-0.06em] sm:text-7xl">
          Menyiapkan meja kerja…
        </h1>
        <p className="mt-4 text-lg text-muted">Mengambil pilihan produk dan harga dari server.</p>
      </div>
    );
  }

  if (loadError || !catalog) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <ErrorState
          title="Studio sedang disiapkan"
          message={loadError ?? 'Data katalog belum tersedia.'}
          retry={() => void loadCatalog()}
        />
        <p className="font-mono text-xs leading-relaxed text-muted">
          Pilihan model, bahan, dan harga akan muncul setelah katalog workshop terhubung.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="grid gap-5 border-b-2 border-ink pb-8 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <p className="eyebrow">Studio pesanan · dibuat di Batam</p>
          <h1 className="mt-3 font-display text-6xl font-black leading-[0.84] tracking-[-0.07em] sm:text-8xl">
            Custom Lab
          </h1>
        </div>
        <p className="max-w-lg text-lg leading-relaxed text-muted">
          Susun pakaian custom Anda. Estimasi harga selalu dihitung oleh server berdasarkan katalog
          dan konfigurasi yang dipilih.
        </p>
        {catalog.config.production_estimate_text ? (
          <p className="care-label sm:col-span-2 sm:justify-self-end sm:max-w-lg">
            Estimasi produksi: {catalog.config.production_estimate_text}
          </p>
        ) : null}
      </header>

      <div
        role="group"
        aria-label="Langkah perancangan"
        className="overflow-x-auto border-b border-line"
      >
        <ol className="flex min-w-max items-center gap-2 py-2">
          {[
            ['#garment-model', '01', 'Model'],
            ['#fabric-color', '02', 'Bahan & warna'],
            ['#size-roster', '03', 'Ukuran'],
            ['#print-spots', '04', 'Sablon'],
          ].map(([href, number, label]) => (
            <li key={href}>
              <span className="inline-flex min-h-touch items-center gap-2 px-3 text-sm font-semibold">
                <span className="bg-accent px-1.5 py-0.5 font-mono text-xs text-ink">{number}</span>
                {label}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="space-y-6">
          <section
            id="garment-model"
            className="card-sharp p-5 sm:p-7"
            aria-labelledby="model-heading"
          >
            <p className="eyebrow">01 · Model</p>
            <h2 id="model-heading" className="mt-2 font-display text-2xl font-bold">
              Pilih model pakaian
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {catalog.models.map((model) => (
                <button
                  type="button"
                  key={model.id}
                  onClick={() => {
                    setSelectedModelId(model.id);
                    setQuote(null);
                  }}
                  aria-pressed={selectedModelId === model.id}
                  className={`min-h-24 border-l-4 p-4 text-left transition-colors ${selectedModelId === model.id ? 'border-accent bg-ink text-bone' : 'border-transparent border-t border-line bg-transparent hover:bg-surface'}`}
                >
                  {model.imageUrl ? (
                    <img
                      src={model.imageUrl}
                      alt=""
                      className="mb-3 h-24 w-full object-cover sm:h-32"
                    />
                  ) : null}
                  <span className="block font-display text-lg font-bold tracking-tight">
                    {model.name}
                  </span>
                  {model.description ? (
                    <span className="mt-1 block text-sm opacity-75">{model.description}</span>
                  ) : null}
                </button>
              ))}
            </div>
            {catalog.models.length === 0 ? (
              <p className="mt-4 text-sm text-muted">Belum ada model aktif di katalog.</p>
            ) : null}
          </section>

          <section
            id="fabric-color"
            className="card-sharp p-5 sm:p-7"
            aria-labelledby="fabric-heading"
          >
            <p className="eyebrow">02 · Bahan &amp; warna</p>
            <h2 id="fabric-heading" className="mt-2 font-display text-2xl font-bold">
              Sesuaikan bahan
            </h2>
            <label htmlFor="custom-lab-fabric" className="mt-4 block text-sm font-semibold">
              Bahan
            </label>
            <select
              id="custom-lab-fabric"
              value={selectedFabricId}
              onChange={(event) => {
                setSelectedFabricId(event.target.value ? Number(event.target.value) : '');
                setSelectedColorId('');
                setIsCustomColor(false);
                setQuote(null);
              }}
              className="input-sharp mt-2"
              disabled={!selectedModel || availableFabrics.length === 0}
            >
              <option value="">Pilih bahan</option>
              {availableFabrics.map((fabric) => (
                <option key={fabric.id} value={fabric.id}>
                  {fabric.name}
                  {fabric.gsmWeight ? ` · ${fabric.gsmWeight} GSM` : ''}
                </option>
              ))}
            </select>
            {selectedFabric?.description ? (
              <p className="mt-2 text-sm text-muted">{selectedFabric.description}</p>
            ) : null}

            {selectedFabric ? (
              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-[0.12em]">Warna tersedia</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedFabric.colors
                    .filter((color) => color.isActive)
                    .map((color) => (
                      <button
                        key={color.id}
                        type="button"
                        onClick={() => {
                          setSelectedColorId(color.id);
                          setIsCustomColor(false);
                          setQuote(null);
                        }}
                        aria-pressed={!isCustomColor && selectedColorId === color.id}
                        className={`inline-flex min-h-14 items-center gap-3 border px-3 text-sm ${!isCustomColor && selectedColorId === color.id ? 'border-ink bg-ink text-bone' : 'border-line-strong bg-surface'}`}
                      >
                        <span
                          className="swatch-chip h-9 w-9 shrink-0 border border-line-strong"
                          style={{ backgroundColor: color.colorHex }}
                          aria-hidden="true"
                        />
                        <span className="text-left">
                          <span className="block font-semibold">{color.colorName}</span>
                          <span className="mt-0.5 block font-mono text-[11px] opacity-75">
                            {color.colorHex}
                          </span>
                        </span>
                      </button>
                    ))}
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomColor(true);
                      setSelectedColorId('');
                      setQuote(null);
                    }}
                    aria-pressed={isCustomColor}
                    className={`min-h-14 border px-4 text-sm font-semibold ${isCustomColor ? 'border-ink bg-ink text-bone' : 'border-line-strong bg-surface'}`}
                  >
                    Warna custom · konfirmasi via WhatsApp
                  </button>
                </div>
                {isCustomColor ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="custom-color-name"
                        className="text-xs font-semibold uppercase"
                      >
                        Nama warna *
                      </label>
                      <input
                        id="custom-color-name"
                        className="input-sharp mt-2"
                        value={customColorName}
                        onChange={(event) => {
                          setCustomColorName(event.target.value);
                          setQuote(null);
                        }}
                        maxLength={80}
                        placeholder="Contoh: hijau sage"
                      />
                    </div>
                    <div>
                      <label htmlFor="custom-color-hex" className="text-xs font-semibold uppercase">
                        Kode warna (opsional)
                      </label>
                      <input
                        id="custom-color-hex"
                        className="input-sharp mt-2"
                        value={customColorHex}
                        onChange={(event) => {
                          setCustomColorHex(event.target.value);
                          setQuote(null);
                        }}
                        pattern="^#[0-9A-Fa-f]{6}$"
                        maxLength={7}
                        placeholder="#AABBCC"
                      />
                    </div>
                    <p className="text-xs text-muted sm:col-span-2">
                      Ketersediaan warna custom perlu dikonfirmasi sebelum produksi.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <section
            id="size-roster"
            className="card-sharp p-5 sm:p-7"
            aria-labelledby="size-heading"
          >
            <p className="eyebrow">03 · Matriks ukuran</p>
            <h2 id="size-heading" className="mt-2 font-display text-2xl font-bold">
              Jumlah per ukuran
            </h2>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[440px] border-collapse text-left">
                <caption className="sr-only">Matriks jumlah pakaian per ukuran</caption>
                <thead className="border-b-2 border-ink font-mono text-xs text-muted">
                  <tr>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      UKURAN
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      BIAYA TAMBAHAN
                    </th>
                    <th scope="col" className="py-3 font-medium">
                      JUMLAH
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {catalog.sizes.map((size) => (
                    <tr key={size.id} className="border-b border-dashed border-line-strong">
                      <th scope="row" className="py-2 pr-4 font-display text-lg font-bold">
                        {size.code}
                      </th>
                      <td className="py-2 pr-4 font-mono text-sm text-muted">
                        {formatRupiah(size.extraCharge)}
                      </td>
                      <td className="py-2">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          inputMode="numeric"
                          aria-label={`Jumlah ukuran ${size.code}`}
                          value={quantities[size.id] ?? 0}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            setQuantities((current) => ({
                              ...current,
                              [size.id]:
                                Number.isFinite(value) && value > 0 ? Math.floor(value) : 0,
                            }));
                            setQuote(null);
                          }}
                          className="input-sharp max-w-28 text-right font-mono"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={2} className="py-4 text-left font-semibold">
                      Total sementara
                    </th>
                    <td className="py-4 text-right font-mono font-semibold">
                      <span className="inline-block bg-accent px-2 py-1 text-ink">
                        {totalQty} pcs
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <section
            id="print-spots"
            className="card-sharp p-5 sm:p-7"
            aria-labelledby="print-heading"
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="eyebrow">04 · Sablon</p>
                <h2 id="print-heading" className="mt-2 font-display text-2xl font-bold">
                  Titik sablon
                </h2>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setPrints((current) => [...current, makePrintDraft()]);
                  setQuote(null);
                }}
              >
                Tambah titik
              </Button>
            </div>
            <div className="mt-4 space-y-4">
              {prints.map((print, index) => (
                <article key={print.key} className="border-t border-dashed border-line-strong py-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-display text-sm font-semibold uppercase">
                      Titik {index + 1}
                    </h3>
                    {prints.length > 1 ? (
                      <button
                        type="button"
                        className="min-h-11 px-2 text-xs font-semibold underline"
                        onClick={() => {
                          setPrints((current) =>
                            current.filter((entry) => entry.key !== print.key)
                          );
                          setQuote(null);
                        }}
                      >
                        Hapus
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.1em]">
                      Posisi
                      <select
                        className="input-sharp mt-2"
                        value={print.position}
                        onChange={(event) =>
                          updatePrint(print.key, { position: event.target.value as PrintPosition })
                        }
                      >
                        {PRINT_POSITIONS.map((position) => (
                          <option
                            key={position.value}
                            value={position.value}
                            disabled={
                              position.value !== PRINT_POSITION.OTHER &&
                              prints.some(
                                (entry) =>
                                  entry.key !== print.key && entry.position === position.value
                              )
                            }
                          >
                            {position.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-semibold uppercase tracking-[0.1em]">
                      Ukuran sablon
                      <select
                        className="input-sharp mt-2"
                        value={print.printSizeId}
                        onChange={(event) =>
                          updatePrint(print.key, {
                            printSizeId: event.target.value ? Number(event.target.value) : '',
                          })
                        }
                      >
                        <option value="">Pilih ukuran</option>
                        {catalog.printSizes.map((size) => (
                          <option key={size.id} value={size.id}>
                            {size.name} · {size.dimensionsCm}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="mt-4 flex min-h-11 items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={print.designHelp}
                      onChange={(event) =>
                        updatePrint(print.key, {
                          designHelp: event.target.checked,
                          design: event.target.checked ? null : print.design,
                        })
                      }
                      className="h-4 w-4 accent-ink"
                    />
                    Bantu desainkan saya
                  </label>
                  {!print.designHelp ? (
                    <div className="mt-3">
                      {print.design ? (
                        <p className="text-sm text-status-ok" role="status">
                          File terunggah: {print.design.fileName}
                        </p>
                      ) : (
                        <>
                          <label
                            htmlFor={`design-${print.key}`}
                            className="inline-flex min-h-11 cursor-pointer items-center border border-line-strong px-4 text-xs font-semibold uppercase tracking-[0.1em] hover:bg-bone"
                          >
                            {print.uploading ? 'Mengunggah...' : 'Pilih file desain'}
                          </label>
                          <input
                            id={`design-${print.key}`}
                            type="file"
                            accept=".png,.jpg,.jpeg,.webp,.svg,.pdf"
                            className="sr-only"
                            disabled={print.uploading}
                            onChange={(event) => void handleDesignUpload(event, print.key)}
                          />
                          <p className="mt-2 text-xs text-muted">
                            PNG, JPG, WEBP, SVG, atau PDF. Upload memerlukan akun.
                          </p>
                        </>
                      )}
                      {print.uploadError ? (
                        <p className="mt-2 text-xs text-status-err" role="alert">
                          {print.uploadError}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>

          <div className="card-sharp p-5 sm:p-7">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                variant="secondary"
                onClick={() => void requestQuote()}
                loading={quoteLoading}
                className="w-full"
              >
                Hitung estimasi harga
              </Button>
              <Button
                type="button"
                onClick={() => void handleAddToCart()}
                loading={cartLoading}
                className="w-full"
              >
                {isGuest ? 'Masuk untuk simpan' : 'Tambah ke keranjang'}
              </Button>
            </div>
            {quoteError ? (
              <p className="mt-3 text-sm text-status-err" role="alert">
                {quoteError}
              </p>
            ) : null}
            {cartMessage ? (
              <p className="mt-3 text-sm text-neutral-700" role="status">
                {cartMessage}
              </p>
            ) : null}
            {!isGuest ? (
              <Link
                to="/keranjang"
                className="mt-4 inline-block min-h-11 text-xs font-semibold uppercase underline underline-offset-4"
              >
                Buka keranjang
              </Link>
            ) : null}
          </div>
        </main>

        <aside
          className="work-ticket registration-mark h-fit p-5 sm:p-6 lg:sticky lg:top-5"
          aria-label="Ringkasan konfigurasi dan harga"
        >
          <p className="eyebrow">Meja potong · Ringkasan</p>
          <h2 className="mt-2 font-display text-2xl font-bold">Estimasi pesanan</h2>
          <dl className="mt-4 space-y-3 border-y border-line py-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt>Model</dt>
              <dd className="text-right font-semibold">{selectedModel?.name ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Bahan</dt>
              <dd className="text-right font-semibold">{selectedFabric?.name ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Jumlah</dt>
              <dd className="font-mono font-semibold">{totalQty} pcs</dd>
            </div>
            {quote ? (
              <>
                <div className="flex justify-between gap-3">
                  <dt>Subtotal</dt>
                  <dd className="tabular-price">{formatRupiah(quote.subtotalAmount)}</dd>
                </div>
                {quote.discountAmount > 0 ? (
                  <div className="flex justify-between gap-3">
                    <dt>Diskon</dt>
                    <dd className="tabular-price">−{formatRupiah(quote.discountAmount)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-3 font-semibold">
                  <dt>Total estimasi</dt>
                  <dd className="price-total text-lg">{formatRupiah(quote.grandTotal)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Skema bayar</dt>
                  <dd className="text-right">
                    {quote.isDpEligible ? `DP ${catalog.config.dp_percent}% tersedia` : 'Lunas'}
                  </dd>
                </div>
                {quote.isDpEligible ? (
                  <div className="flex justify-between gap-3">
                    <dt>Estimasi DP</dt>
                    <dd className="tabular-price">{formatRupiah(quote.dpRequiredAmount)}</dd>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-xs leading-relaxed text-muted">
                Harga akan muncul setelah server menghitung konfigurasi Anda.
              </p>
            )}
          </dl>
          {catalog.config.dp_min_qty > 0 ? (
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Opsi DP mengikuti ketentuan katalog: minimal {catalog.config.dp_min_qty} pcs.
              Perhitungan final dilakukan server saat checkout.
            </p>
          ) : null}
          {quoteError ? (
            <p className="mt-3 text-xs text-status-err" role="alert">
              Estimasi belum tersedia.
            </p>
          ) : null}
        </aside>
      </div>
      <p className="text-xs leading-relaxed text-muted">
        Estimasi bersifat sementara. Harga final dan kelayakan DP ditentukan server berdasarkan
        harga katalog terbaru.
        {adminWhatsapp ? (
          <>
            {' '}
            Untuk konsultasi warna custom,{' '}
            <a
              href={`https://wa.me/${adminWhatsapp}`}
              target="_blank"
              rel="noreferrer"
              className="font-semibold underline"
            >
              hubungi admin melalui WhatsApp
            </a>
            .
          </>
        ) : null}
      </p>
    </div>
  );
}
