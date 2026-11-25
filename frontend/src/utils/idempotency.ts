/**
 * Buat Idempotency-Key baru (UUID v4) untuk setiap percobaan checkout.
 * SPEC 6.6: UUID dibuat frontend per percobaan, bukan per session.
 */
export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}
