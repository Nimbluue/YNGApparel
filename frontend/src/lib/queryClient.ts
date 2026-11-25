import { QueryClient } from '@tanstack/react-query';

/**
 * Satu instance QueryClient global.
 * - staleTime 60 detik agar tidak refetch terlalu agresif
 * - retry 1 kali (cukup untuk fluktuasi jaringan)
 * - tidak retry pada 401/403/404 (error bukan jaringan)
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: (failureCount, error: unknown) => {
        if (
          error &&
          typeof error === 'object' &&
          'status' in error &&
          typeof (error as { status: unknown }).status === 'number'
        ) {
          const status = (error as { status: number }).status;
          if (status === 401 || status === 403 || status === 404) return false;
        }
        return failureCount < 1;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
