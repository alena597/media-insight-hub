import { Router } from 'express';
import express from 'express';
import { getDb } from '../db.js';
import { logger } from '../logger.js';

const router = Router();
const jsonSmall = express.json({ limit: '48kb' });

/**
 * Агрегована аналітика детекцій з клієнта.
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
    const db = getDb();
    db.prepare(
      'INSERT INTO detection_analytics (ts, class_counts, total_detections, source) VALUES (?, ?, ?, ?)'
    ).run(new Date().toISOString(), JSON.stringify(safeCounts), totalDetections, source);

    db.prepare(
      'DELETE FROM detection_analytics WHERE id NOT IN (SELECT id FROM detection_analytics ORDER BY id DESC LIMIT 800)'
    ).run();
  } catch (e) {
    logger.warn('analytics_detection_write_failed', { message: String(e) });
    return res.status(500).json({ ok: false, code: 'ANALYTICS_WRITE_FAILED' });
  }

  res.json({ ok: true });
});

export default router;
