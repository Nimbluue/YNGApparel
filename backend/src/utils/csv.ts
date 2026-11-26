/**
 * Utilitas ekspor CSV yang aman terhadap CSV Formula Injection (OWASP) dan mengikuti escaping RFC-4180.
 */

const FORMULA_INJECTION_REGEX = /^[\t\r ]*[=+\-@]|^[\t\r]/;

/**
 * Mengamankan satu nilai sel CSV:
 * - Menambahkan prefiks kutip tunggal (') jika teks diawali karakter formula (=, +, -, @, TAB, CR).
 * - Membungkus dengan tanda kutip ganda bila mengandung koma, kutip ganda, newline, atau prefiks (').
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  const rawText = String(value);
  const neutralized = FORMULA_INJECTION_REGEX.test(rawText) ? `'${rawText}` : rawText;

  if (/[",\r\n]/.test(neutralized) || neutralized !== rawText) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }

  return neutralized;
}

/**
 * Menyusun dokumen CSV lengkap dengan UTF-8 BOM agar Excel/LibreOffice membaca karakter Indonesia dengan benar.
 */
export function buildCsvDocument(
  headers: readonly string[],
  rows: ReadonlyArray<readonly unknown[]>
): string {
  const headerLine = headers.map((h) => sanitizeCsvCell(h)).join(',');
  const dataLines = rows.map((row) => row.map((cell) => sanitizeCsvCell(cell)).join(','));
  return `\uFEFF${[headerLine, ...dataLines].join('\r\n')}\r\n`;
}
