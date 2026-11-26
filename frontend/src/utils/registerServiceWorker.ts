/**
 * Mendaftarkan service worker minimal pada build produksi agar memenuhi syarat
 * installability PWA, dan membersihkan SW lama saat mode development agar HMR tetap bersih.
 */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  if (!import.meta.env.PROD) {
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => Promise.all(registrations.map((reg) => reg.unregister())))
      .catch(() => {
        /* Abaikan kegagalan pembersihan SW pada mode dev */
      });
    return;
  }

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      /* Abaikan kegagalan registrasi SW non-kritis */
    });
  });
}
