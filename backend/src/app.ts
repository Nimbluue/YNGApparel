import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { isAllowedOrigin } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { originCheck } from './middleware/originCheck.js';
import { generalLimiter } from './middleware/rateLimiter.js';
import apiRoutes from './routes/index.js';

const app: Express = express();

// ASSUMPTION: backend berjalan di belakang reverse proxy (Railway/Render/Fly/Nginx/Vite dev proxy)
app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      // Request tanpa header Origin (mis. curl, healthcheck, server-to-server) tidak diblokir CORS
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, isAllowedOrigin(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Idempotency-Key'],
  })
);
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.use('/api', originCheck, generalLimiter, apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
