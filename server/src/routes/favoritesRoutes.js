import { Router } from 'express';
import crypto from 'node:crypto';
import { getDb } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();

router.use(authMiddleware);

const FAVORITES_LIMIT = 100;
const MAX_FAV_PREVIEW = 1_200_000;
const MAX_FAV_RESUME = 1_500_000;

router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at_ms DESC LIMIT ?'
  ).all(req.userId, FAVORITES_LIMIT);

  const items = rows.map((r) => ({
    id: r.id,
    title: r.title,
    path: r.path,
    createdAtMs: r.created_at_ms,
    kind: r.kind === 'result' ? 'result' : 'module',
    previewImage: r.preview_image || undefined,
    resumePayload: r.resume_payload || undefined
  }));
  res.json({ items });
});

router.post('/', (req, res) => {
  const title = String(req.body?.title || '').trim();
  const pathVal = String(req.body?.path || '/').trim() || '/';
  if (!title) {
    return res.status(400).json({ error: 'Вкажіть назву', code: 'INVALID_INPUT' });
  }
  const kind = req.body?.kind === 'result' ? 'result' : 'module';
  let previewImage =
    req.body?.previewImage != null && req.body.previewImage !== ''
      ? String(req.body.previewImage)
      : null;
  let resumePayload =
    req.body?.resumePayload != null && req.body.resumePayload !== ''
      ? String(req.body.resumePayload)
      : null;
  if (previewImage && previewImage.length > MAX_FAV_PREVIEW) {
    return res.status(400).json({ error: "Занадто велике прев'ю", code: 'PAYLOAD_TOO_LARGE' });
  }
  if (resumePayload && resumePayload.length > MAX_FAV_RESUME) {
    return res.status(400).json({ error: 'Занадто великі дані', code: 'PAYLOAD_TOO_LARGE' });
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const createdAtMs = Date.now();

  const db = getDb();
  db.prepare(
    'INSERT INTO favorites (id, user_id, title, path, kind, preview_image, resume_payload, created_at, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.userId, title, pathVal, kind, previewImage, resumePayload, createdAt, createdAtMs);

  res.status(201).json({ ok: true, id });
});

router.delete('/:id', (req, res) => {
  const id = String(req.params.id || '');
  const db = getDb();
  const result = db.prepare('DELETE FROM favorites WHERE id = ? AND user_id = ?').run(id, req.userId);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Не знайдено', code: 'NOT_FOUND' });
  }
  res.json({ ok: true });
});

export default router;
