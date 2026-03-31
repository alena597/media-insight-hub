import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from './auth.js';
import authRoutes from './routes/authRoutes.js';
import historyRoutes from './routes/historyRoutes.js';
import favoritesRoutes from './routes/favoritesRoutes.js';
import clientLogRoutes from './routes/clientLogRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import statsRoutes from './routes/statsRoutes.js';
import { getDb } from './db.js';
import { logger } from './logger.js';
import { requestContextMiddleware } from './middleware/requestContext.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app = express();
const PORT = Number(process.env.PORT) || 4000;

const origin = process.env.FRONTEND_ORIGIN || true;
app.use(cors({ origin, credentials: true }));

app.use(requestContextMiddleware);

app.use(express.json({ limit: '15mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/client-log', clientLogRoutes);
app.use('/api/analytics', analyticsRoutes);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

app.use('/api/auth', authLimiter);
app.use('/api/auth', authRoutes);

app.post('/api/history/clear', authMiddleware, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM history WHERE user_id = ?').run(req.userId);
  res.json({ ok: true });
});

app.use('/api/history', historyRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/stats', statsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(PORT, () => {
  logger.info('server_started', { port: PORT, nodeEnv: process.env.NODE_ENV || 'development' });
});

function shutdown(signal) {
  logger.info('server_shutdown', { signal });
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  logger.error('uncaught_exception', { message: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const r = reason instanceof Error ? reason : new Error(String(reason));
  logger.error('unhandled_rejection', { message: r.message, stack: r.stack });
});
