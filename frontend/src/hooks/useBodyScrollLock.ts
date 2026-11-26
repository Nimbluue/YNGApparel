import { useEffect } from 'react';

/**
 * Mengunci scroll vertikal pada `document.body` saat drawer atau overlay aktif,
 * lalu mengembalikan gaya overflow semula ketika ditutup/unmount.
 */
export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [locked]);
}
