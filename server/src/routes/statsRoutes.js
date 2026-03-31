import { Router } from 'express';
import { getDb } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();

router.use(authMiddleware);

const MODULE_PATHS = ['/ocr', '/gallery', '/detection', '/transcriber'];
const DAY_MS = 86_400_000;


router.get('/', (req, res) => {
  const db = getDb();
  const userId = req.userId;

  const { total } = db.prepare(
    'SELECT COUNT(*) as total FROM history WHERE user_id = ?'
  ).get(userId);

  const moduleCounts = {};
  for (const p of MODULE_PATHS) {
    const { cnt } = db.prepare(
      'SELECT COUNT(*) as cnt FROM history WHERE user_id = ? AND path = ?'
    ).get(userId, p);
    moduleCounts[p] = cnt;
  }

  const now = Date.now();
  const dailyActivity = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateKey = d.toISOString().slice(0, 10);
    const dayStart = new Date(dateKey + 'T00:00:00.000Z').getTime();
    const dayEnd = dayStart + DAY_MS;
    const { cnt } = db.prepare(
      'SELECT COUNT(*) as cnt FROM history WHERE user_id = ? AND created_at_ms >= ? AND created_at_ms < ?'
    ).get(userId, dayStart, dayEnd);
    dailyActivity[dateKey] = cnt;
  }

  res.json({ total, moduleCounts, dailyActivity });
});

export default router;
