import { Router } from 'express';
import crypto from 'node:crypto';
import { getDb } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();

router.use(authMiddleware);

const HISTORY_LIMIT = 80;
const MAX_PREVIEW_LEN = 1_200_000;
const MAX_RESUME_LEN = 1_500_000;

router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM history WHERE user_id = ? ORDER BY created_at_ms DESC LIMIT ?'
  ).all(req.userId, HISTORY_LIMIT);

  const items = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    label: r.label,
    path: r.path || undefined,
    createdAtMs: r.created_at_ms,
    previewImage: r.preview_image || undefined,
    resumePayload: r.resume_payload || undefined
  }));
  res.json({ items });
});

router.delete('/:id', (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) {
    return res.status(400).json({ error: 'Невірний id', code: 'INVALID_INPUT' });
  }
  const db = getDb();
  const result = db.prepare('DELETE FROM history WHERE id = ? AND user_id = ?').run(id, req.userId);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Не знайдено', code: 'NOT_FOUND' });
  }
  res.json({ ok: true });
});

router.post('/', (req, res) => {
  let kind = String(req.body?.kind || 'page_view');
  if (kind !== 'search' && kind !== 'page_view' && kind !== 'analysis') {
    kind = 'page_view';
  }
  const label = String(req.body?.label || '').trim();
  if (!label) {
    return res.status(400).json({ error: 'Порожній запис', code: 'INVALID_INPUT' });
  }
  const pathVal = req.body?.path != null ? String(req.body.path).trim() : null;
  let previewImage =
    req.body?.previewImage != null && req.body.previewImage !== ''
      ? String(req.body.previewImage)
      : null;
  let resumePayload =
    req.body?.resumePayload != null && req.body.resumePayload !== ''
      ? String(req.body.resumePayload)
      : null;
  if (previewImage && previewImage.length > MAX_PREVIEW_LEN) {
    return res.status(400).json({ error: "Занадто велике прев'ю", code: 'PAYLOAD_TOO_LARGE' });
  }
  if (resumePayload && resumePayload.length > MAX_RESUME_LEN) {
    return res.status(400).json({ error: 'Занадто великі дані відновлення', code: 'PAYLOAD_TOO_LARGE' });
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const createdAtMs = Date.now();

  const db = getDb();
  db.prepare(
    'INSERT INTO history (id, user_id, kind, label, path, preview_image, resume_payload, created_at, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.userId, kind, label, pathVal, previewImage, resumePayload, createdAt, createdAtMs);

  res.status(201).json({ ok: true });
});

export default router;
