/**
 * Zustand store untuk cart Custom Lab.
 *
 * Menyimpan:
 * - cartItemUuids yang tercentang untuk checkout
 * - konfigurasi wizard Custom Lab sementara (sebelum login / sebelum tambah keranjang)
 * - flag reload cart (sinyal agar halaman keranjang refetch setelah checkout)
 */
import { create } from 'zustand';

// Konfigurasi satu titik sablon di wizard
export interface PrintSpotConfig {
  position: string;
  printSizeId: number | null;
  fileRef: string | null;
  fileName: string | null;
  needsDesignHelp: boolean;
}

// Konfigurasi satu item Custom Lab di wizard (belum ada di keranjang)
export interface WizardConfig {
  modelId: number | null;
  modelSlug: string | null;
  fabricId: number | null;
  colorId: number | null;
  isCustomColor: boolean;
  customColorName: string;
  customColorHex: string;
  // Record<sizeCode, qty>
  sizes: Record<string, number>;
  prints: PrintSpotConfig[];
}

export const DEFAULT_WIZARD_CONFIG: WizardConfig = {
  modelId: null,
  modelSlug: null,
  fabricId: null,
  colorId: null,
  isCustomColor: false,
  customColorName: '',
  customColorHex: '',
  sizes: {},
  prints: [],
};

interface CartStore {
  // UUID item keranjang yang tercentang di halaman /keranjang
  checkedItems: Set<string>;
  toggleItem: (uuid: string) => void;
  setCheckedItems: (uuids: string[]) => void;
  checkAll: (uuids: string[]) => void;
  uncheckAll: () => void;

  // Konfigurasi wizard Custom Lab (sementara, bukan di keranjang)
  wizardConfig: WizardConfig;
  setWizardConfig: (config: Partial<WizardConfig>) => void;
  resetWizardConfig: () => void;

  // Sinyal refresh keranjang setelah aksi (tambah/hapus item)
  cartVersion: number;
  bumpCartVersion: () => void;
}

export const useCartStore = create<CartStore>((set) => ({
  checkedItems: new Set<string>(),
  toggleItem: (uuid) =>
    set((state) => {
      const next = new Set(state.checkedItems);
      if (next.has(uuid)) {
        next.delete(uuid);
      } else {
        next.add(uuid);
      }
      return { checkedItems: next };
    }),
  setCheckedItems: (uuids) => set({ checkedItems: new Set(uuids) }),
  checkAll: (uuids) => set({ checkedItems: new Set(uuids) }),
  uncheckAll: () => set({ checkedItems: new Set<string>() }),

  wizardConfig: { ...DEFAULT_WIZARD_CONFIG },
  setWizardConfig: (config) =>
    set((state) => ({ wizardConfig: { ...state.wizardConfig, ...config } })),
  resetWizardConfig: () => set({ wizardConfig: { ...DEFAULT_WIZARD_CONFIG } }),

  cartVersion: 0,
  bumpCartVersion: () => set((state) => ({ cartVersion: state.cartVersion + 1 })),
}));
