import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type Locale = 'id' | 'en';

const LOCALE_STORAGE_KEY = 'yng:locale';

const id = {
  'nav.home': 'Home',
  'nav.customLab': 'Custom Lab',
  'nav.categories': 'Kategori',
  'nav.viewAllCategories': 'Lihat Semua',
  'nav.track': 'Lacak Pesanan',
  'nav.menu': 'Menu',
  'nav.closeMenu': 'Tutup Menu',
  'nav.primaryAria': 'Navigasi utama',
  'nav.mobileAria': 'Navigasi seluler',

  'tooltip.search': 'Cari Produk',
  'tooltip.wishlist': 'Wishlist',
  'tooltip.cart': 'Keranjang',
  'tooltip.account': 'Akun',
  'tooltip.language': 'Ganti Bahasa',

  'account.login': 'Masuk',
  'account.register': 'Daftar',
  'account.myAccount': 'Akun Saya',
  'account.myOrders': 'Pesanan Saya',
  'account.adminStudio': 'Admin Studio',
  'account.logout': 'Keluar',
  'account.loggingOut': 'Keluar...',
  'account.hello': 'Halo, {name}',

  'search.placeholder': 'Cari model, kategori, atau bahan...',
  'search.close': 'Tutup pencarian',
  'search.popular': 'Pencarian Populer',
  'search.recent': 'Baru Dilihat',
  'search.noResults': 'Tidak ada model atau bahan yang cocok dengan pencarian Anda.',
  'search.results': '{count} hasil ditemukan',
  'search.startingFrom': 'Mulai {price}',
  'search.fabric': 'Bahan: {name}',
  'search.escHint': 'ESC',

  'cart.title': 'Keranjang',
  'cart.close': 'Tutup keranjang',
  'cart.emptyTitle': 'Keranjang Anda masih kosong',
  'cart.emptyBody': 'Mulai rancang pakaian custom satuan maupun produksi tim di Custom Lab.',
  'cart.guestBody':
    'Masuk untuk menyinkronkan keranjang tersimpan atau langsung rancang di Custom Lab.',
  'cart.startCustomLab': 'Mulai Custom Lab',
  'cart.login': 'Masuk ke Akun',
  'cart.recommendations': 'Rekomendasi Model',
  'cart.pcs': '{count} pcs',
  'cart.subtotal': 'Subtotal',
  'cart.totalQty': 'Total Kuantitas',
  'cart.remove': 'Hapus item {name}',
  'cart.removing': 'Menghapus...',
  'cart.removed': 'Item dihapus dari keranjang.',
  'cart.checkout': 'Lanjut ke Checkout',
  'cart.viewFull': 'Lihat Keranjang Penuh',
  'cart.unavailable': 'Tidak tersedia',
  'cart.shippingNote': 'Ongkir dan skema pelunasan dihitung saat checkout.',
  'cart.loadError': 'Gagal memuat isi keranjang.',
  'cart.retry': 'Coba Lagi',
  'cart.capacity': '{count}/{max} item',
  'cart.noAvailable': 'Semua item di keranjang saat ini tidak tersedia.',

  'common.loading': 'Memuat...',
} as const;

export type TranslationKey = keyof typeof id;

const en: Record<TranslationKey, string> = {
  'nav.home': 'Home',
  'nav.customLab': 'Custom Lab',
  'nav.categories': 'Categories',
  'nav.viewAllCategories': 'View All',
  'nav.track': 'Track Order',
  'nav.menu': 'Menu',
  'nav.closeMenu': 'Close Menu',
  'nav.primaryAria': 'Primary navigation',
  'nav.mobileAria': 'Mobile navigation',

  'tooltip.search': 'Search Products',
  'tooltip.wishlist': 'Wishlist',
  'tooltip.cart': 'Bag',
  'tooltip.account': 'Account',
  'tooltip.language': 'Switch Language',

  'account.login': 'Sign In',
  'account.register': 'Register',
  'account.myAccount': 'My Account',
  'account.myOrders': 'My Orders',
  'account.adminStudio': 'Admin Studio',
  'account.logout': 'Sign Out',
  'account.loggingOut': 'Signing out...',
  'account.hello': 'Hello, {name}',

  'search.placeholder': 'Search models, categories, or fabrics...',
  'search.close': 'Close search',
  'search.popular': 'Popular Searches',
  'search.recent': 'Recently Viewed',
  'search.noResults': 'No matching garment models or fabrics were found.',
  'search.results': '{count} results found',
  'search.startingFrom': 'From {price}',
  'search.fabric': 'Fabric: {name}',
  'search.escHint': 'ESC',

  'cart.title': 'Shopping Bag',
  'cart.close': 'Close bag',
  'cart.emptyTitle': 'Your bag is empty',
  'cart.emptyBody': 'Design custom pieces for single orders or team runs in Custom Lab.',
  'cart.guestBody': 'Sign in to access saved items or start designing right away in Custom Lab.',
  'cart.startCustomLab': 'Start Custom Lab',
  'cart.login': 'Sign In',
  'cart.recommendations': 'Recommended Models',
  'cart.pcs': '{count} pcs',
  'cart.subtotal': 'Subtotal',
  'cart.totalQty': 'Total Quantity',
  'cart.remove': 'Remove {name}',
  'cart.removing': 'Removing...',
  'cart.removed': 'Item removed from bag.',
  'cart.checkout': 'Proceed to Checkout',
  'cart.viewFull': 'View Full Bag',
  'cart.unavailable': 'Unavailable',
  'cart.shippingNote': 'Shipping cost and payment scheme are calculated at checkout.',
  'cart.loadError': 'Failed to load shopping bag.',
  'cart.retry': 'Try Again',
  'cart.capacity': '{count}/{max} items',
  'cart.noAvailable': 'No available items in your bag can be checked out.',

  'common.loading': 'Loading...',
};

const DICTIONARIES: Record<Locale, Record<TranslationKey, string>> = { id, en };

function readInitialLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === 'en' || stored === 'id') {
      return stored;
    }
  } catch {
    // Abaikan bila localStorage tidak dapat diakses
  }
  return 'id';
}

export interface LanguageContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  toggleLocale: () => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readInitialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // Abaikan kegagalan menulis ke localStorage
    }
  }, []);

  const toggleLocale = useCallback(() => {
    setLocaleState((prev) => {
      const next: Locale = prev === 'id' ? 'en' : 'id';
      try {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
      } catch {
        // Abaikan kegagalan menulis ke localStorage
      }
      return next;
    });
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => {
      let template = DICTIONARIES[locale][key] ?? DICTIONARIES.id[key];
      if (!vars) return template;
      for (const [varKey, varVal] of Object.entries(vars)) {
        template = template.replaceAll(`{${varKey}}`, String(varVal));
      }
      return template;
    },
    [locale]
  );

  return (
    <LanguageContext.Provider value={{ locale, setLocale, toggleLocale, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- Hook konteks bahasa dipakai bersama LanguageProvider dalam satu modul
export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage harus digunakan di dalam LanguageProvider.');
  }
  return ctx;
}
