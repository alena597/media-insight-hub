import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes.js';
import historyRoutes from './routes/historyRoutes.js';
import favoritesRoutes from './routes/favoritesRoutes.js';

const app = express();
const PORT = Number(process.env.PORT) || 4000;

const origin = process.env.FRONTEND_ORIGIN || true;
app.use(cors({ origin, credentials: true }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/favorites', favoritesRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: 'Не знайдено', code: 'NOT_FOUND' });
});

app.listen(PORT, () => {
  console.log(`[media-insight-hub] API http://127.0.0.1:${PORT}`);
});
