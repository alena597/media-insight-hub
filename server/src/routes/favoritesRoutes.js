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
    createdAtMs: new Date(r.created_at).getTime()
  }));
  res.json({ items });
});

router.post('/', (req, res) => {
  const title = String(req.body?.title || '').trim();
  const pathVal = String(req.body?.path || '/').trim() || '/';
  if (!title) {
    return res.status(400).json({ error: 'Вкажіть назву', code: 'INVALID_INPUT' });
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  updateStore((s) => {
    s.favorites.push({
      id,
      user_id: req.userId,
      title,
      path: pathVal,
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
