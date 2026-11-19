import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';

interface LimiterConfig {
  windowMs: number;
  max: number;
  message: string;
}

function createLimiter({ windowMs, max, message }: LimiterConfig): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      return res.status(429).json({
        success: false,
        message,
        data: null,
      });
    },
  });
}

export const generalLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: 'Terlalu banyak permintaan dari IP ini. Silakan coba beberapa saat lagi.',
});

export const trackerLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Terlalu banyak percobaan pelacakan pesanan. Silakan tunggu 15 menit.',
});

export const uploadLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Batas unggahan sementara tercapai. Silakan coba lagi dalam beberapa menit.',
});

export const adminLoginLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Terlalu banyak percobaan login. Silakan tunggu 15 menit.',
});
