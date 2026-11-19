import crypto from 'node:crypto';
import {
  ORDER_CODE_ALPHABET,
  ORDER_CODE_PREFIX,
  ORDER_CODE_RANDOM_LENGTH,
} from '../config/constants.js';

/**
 * Membuat kode order unik berformat `YNG-XXXXXX` menggunakan `crypto.randomInt`
 * tanpa karakter ambigu (O/0, I/1/L).
 */
export function generateOrderCode(length = ORDER_CODE_RANDOM_LENGTH): string {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    const idx = crypto.randomInt(0, ORDER_CODE_ALPHABET.length);
    code += ORDER_CODE_ALPHABET[idx];
  }
  return `${ORDER_CODE_PREFIX}${code}`;
}
