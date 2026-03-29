import { Router } from 'express';
import express from 'express';
import { updateStore } from '../store.js';
import { logger } from '../logger.js';

const router = Router();
const jsonSmall = express.json({ limit: '48kb' });

/**
 * Агрегована аналітика детекцій з клієнта (для звітів / моніторингу навантаження модуля).
 */
router.post('/detection', jsonSmall, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const classCounts =
    body.classCounts && typeof body.classCounts === 'object' && !Array.isArray(body.classCounts)
      ? body.classCounts
      : {};
  const totalDetections = Math.min(5000, Math.max(0, Number(body.totalDetections) || 0));
  const safeCounts = {};
  for (const k of Object.keys(classCounts)) {
    if (typeof k !== 'string' || k.length > 64) continue;
    const n = Number(classCounts[k]);
    if (Number.isFinite(n) && n >= 0) safeCounts[k.slice(0, 64)] = Math.min(10000, Math.floor(n));
  }
  const source =
    typeof body.source === 'string' ? body.source.slice(0, 80) : 'object-detection';

  try {
    updateStore((s) => {
      if (!s.detection_analytics) s.detection_analytics = { events: [] };
      s.detection_analytics.events.push({
        ts: new Date().toISOString(),
        classCounts: safeCounts,
        totalDetections,
        source
      });
      const max = 800;
      while (s.detection_analytics.events.length > max) {
        s.detection_analytics.events.shift();
      }
    });
  } catch (e) {
    logger.warn('analytics_detection_write_failed', { message: String(e) });
    return res.status(500).json({ ok: false, code: 'ANALYTICS_WRITE_FAILED' });
  }

  res.json({ ok: true });
});

export default router;
