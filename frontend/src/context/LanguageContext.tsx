import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { PUBLIC_DICTIONARIES, type Locale, type TranslationKey } from './publicDictionary';

export type { Locale, TranslationKey };

const LOCALE_STORAGE_KEY = 'yng:locale';

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
  pick: <T>(idValue: T, enValue: T) => T;
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
      let template = PUBLIC_DICTIONARIES[locale][key] ?? PUBLIC_DICTIONARIES.id[key];
      if (!vars) return template;
      for (const [varKey, varVal] of Object.entries(vars)) {
        template = template.replaceAll(`{${varKey}}`, String(varVal));
      }
      return template;
    },
    [locale]
  );

  const pick = useCallback(
    <T,>(idValue: T, enValue: T): T => (locale === 'en' ? enValue : idValue),
    [locale]
  );

  return (
    <LanguageContext.Provider value={{ locale, setLocale, toggleLocale, t, pick }}>
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
