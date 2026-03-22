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
    createdAtMs: new Date(r.created_at).getTime()
  }));
  res.json({ items });
});

router.post('/', (req, res) => {
  const kind = req.body?.kind === 'search' ? 'search' : 'page_view';
  const label = String(req.body?.label || '').trim();
  if (!label) {
    return res.status(400).json({ error: 'Порожній запис', code: 'INVALID_INPUT' });
  }
  const pathVal = req.body?.path != null ? String(req.body.path).trim() : null;

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  updateStore((s) => {
    s.history.push({
      id,
      user_id: req.userId,
      kind,
      label,
      path: pathVal || null,
      created_at: createdAt
    });
  });

  res.status(201).json({ ok: true });
});

export default router;
