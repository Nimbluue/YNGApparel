import type { Rupiah } from '@yng/shared';

const rupiahFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatRupiah(amount: Rupiah | null | undefined): string {
  const value = Math.round(Number(amount) || 0);
  return rupiahFormatter.format(value);
}
