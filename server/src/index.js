import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { authMiddleware } from './auth.js';
import authRoutes from './routes/authRoutes.js';
import historyRoutes from './routes/historyRoutes.js';
import favoritesRoutes from './routes/favoritesRoutes.js';
import clientLogRoutes from './routes/clientLogRoutes.js';
import { updateStore } from './store.js';
import { logger } from './logger.js';
import { requestContextMiddleware } from './middleware/requestContext.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app = express();
const PORT = Number(process.env.PORT) || 4000;

const origin = process.env.FRONTEND_ORIGIN || true;
app.use(cors({ origin, credentials: true }));

app.use(requestContextMiddleware);

/** За замовчуванням ~100kb — обрізає data URL прев’ю/resume; потрібно для збереження зображень. */
app.use(express.json({ limit: '15mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/client-log', clientLogRoutes);

app.use('/api/auth', authRoutes);

/** Окремо на `app`, щоб гарантовано збігалося з `POST /api/history/clear` (без 404 від вкладеного Router). */
app.post('/api/history/clear', authMiddleware, (req, res) => {
  updateStore((s) => {
    s.history = s.history.filter((h) => h.user_id !== req.userId);
  });
  res.json({ ok: true });
});

app.use('/api/history', historyRoutes);
app.use('/api/favorites', favoritesRoutes);

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
