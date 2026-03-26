import { Router } from 'express';
import crypto from 'node:crypto';
import { getStore, updateStore } from '../store.js';
import { authMiddleware } from '../auth.js';

const router = Router();

router.use(authMiddleware);

router.get('/', (req, res) => {
  const store = getStore();
  const rows = store.history
    .filter((h) => h.user_id === req.userId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 80);

  const items = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    label: r.label,
    path: r.path || undefined,
    createdAtMs: new Date(r.created_at).getTime(),
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
  const store = getStore();
  const idx = store.history.findIndex((h) => h.id === id && h.user_id === req.userId);
  if (idx === -1) {
    return res.status(404).json({ error: 'Не знайдено', code: 'NOT_FOUND' });
  }
  updateStore((s) => {
    s.history.splice(idx, 1);
  });
  res.json({ ok: true });
});

const MAX_PREVIEW_LEN = 1_200_000;
const MAX_RESUME_LEN = 1_500_000;

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
    return res.status(400).json({ error: 'Занадто велике прев\'ю', code: 'PAYLOAD_TOO_LARGE' });
  }
  if (resumePayload && resumePayload.length > MAX_RESUME_LEN) {
    return res.status(400).json({ error: 'Занадто великі дані відновлення', code: 'PAYLOAD_TOO_LARGE' });
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  updateStore((s) => {
    s.history.push({
      id,
      user_id: req.userId,
      kind,
      label,
      path: pathVal || null,
      preview_image: previewImage,
      resume_payload: resumePayload,
      created_at: createdAt
    });
  });

  res.status(201).json({ ok: true });
});

export default router;
