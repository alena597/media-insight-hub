import { Router } from 'express';
import crypto from 'node:crypto';
import { getDb } from '../db.js';
import { logger } from '../logger.js';

const router = Router();

router.post('/', (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  const whatHappened = typeof body.whatHappened === 'string' ? body.whatHappened.trim() : '';
  if (!whatHappened) {
    return res.status(400).json({ error: 'whatHappened is required', code: 'MISSING_FIELD' });
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const db = getDb();
  db.prepare(`
    INSERT INTO reports (id, user_id, what_happened, steps, contact, client_ref, viewport, language, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    typeof body.userId === 'string' ? body.userId : null,
    whatHappened.slice(0, 4000),
    typeof body.steps === 'string' ? body.steps.slice(0, 4000) : null,
    typeof body.contact === 'string' ? body.contact.slice(0, 200) : null,
    typeof body.clientRef === 'string' ? body.clientRef.slice(0, 200) : null,
    typeof body.viewport === 'string' ? body.viewport.slice(0, 40) : null,
    typeof body.language === 'string' ? body.language.slice(0, 20) : null,
    now
  );

  logger.info('report_submitted', { requestId: req.requestId, reportId: id });

  res.status(201).json({ ok: true, reportId: id });
});

export default router;
