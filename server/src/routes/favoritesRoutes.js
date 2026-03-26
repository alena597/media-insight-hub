import { Router } from 'express';
import crypto from 'node:crypto';
import { getStore, updateStore } from '../store.js';
import { authMiddleware } from '../auth.js';

const router = Router();

router.use(authMiddleware);

router.get('/', (req, res) => {
  const store = getStore();
  const rows = store.favorites
    .filter((f) => f.user_id === req.userId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 100);

  const items = rows.map((r) => ({
    id: r.id,
    title: r.title,
    path: r.path,
    createdAtMs: new Date(r.created_at).getTime(),
    kind: r.kind === 'result' ? 'result' : 'module',
    previewImage: r.preview_image || undefined,
    resumePayload: r.resume_payload || undefined
  }));
  res.json({ items });
});

const MAX_FAV_PREVIEW = 1_200_000;
const MAX_FAV_RESUME = 1_500_000;

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
    return res.status(400).json({ error: 'Занадто велике прев\'ю', code: 'PAYLOAD_TOO_LARGE' });
  }
  if (resumePayload && resumePayload.length > MAX_FAV_RESUME) {
    return res.status(400).json({ error: 'Занадто великі дані', code: 'PAYLOAD_TOO_LARGE' });
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  updateStore((s) => {
    s.favorites.push({
      id,
      user_id: req.userId,
      title,
      path: pathVal,
      kind,
      preview_image: previewImage,
      resume_payload: resumePayload,
      created_at: createdAt
    });
  });

  res.status(201).json({ ok: true, id });
});

router.delete('/:id', (req, res) => {
  const id = String(req.params.id || '');
  const store = getStore();
  const idx = store.favorites.findIndex((f) => f.id === id && f.user_id === req.userId);
  if (idx === -1) {
    return res.status(404).json({ error: 'Не знайдено', code: 'NOT_FOUND' });
  }

  updateStore((s) => {
    s.favorites.splice(idx, 1);
  });

  res.json({ ok: true });
});

export default router;
