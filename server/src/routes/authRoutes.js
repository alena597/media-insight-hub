import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { getDb } from '../db.js';
import { signToken, verifyToken } from '../auth.js';

const router = Router();

function rowToUser(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name || null,
    createdAt: row.created_at
  };
}

router.post('/register', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || '');
    const rawName = req.body?.displayName ? String(req.body.displayName).trim() : '';
    const displayName = rawName.length > 0 ? rawName : null;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Некоректний email', code: 'INVALID_EMAIL' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Пароль мінімум 8 символів', code: 'WEAK_PASSWORD' });
    }
    if (!/[\d\W_]/.test(password)) {
      return res.status(400).json({ error: 'Пароль повинен містити хоча б одну цифру або спецсимвол', code: 'WEAK_PASSWORD' });
    }

    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'Цей email уже зареєстровано', code: 'EMAIL_IN_USE' });
    }

    const id = crypto.randomUUID();
    const hash = await bcrypt.hash(password, 10);
    const createdAt = new Date().toISOString();

    db.prepare(
      'INSERT INTO users (id, email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, email, hash, displayName, createdAt);

    const user = rowToUser({ id, email, display_name: displayName, created_at: createdAt });
    const token = signToken({ sub: id, email });
    res.status(201).json({ token, user });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Вкажіть email і пароль', code: 'INVALID_INPUT' });
    }

    const db = getDb();
    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    const valid = row ? await bcrypt.compare(password, row.password_hash) : false;
    if (!row || !valid) {
      return res.status(401).json({ error: 'Невірний email або пароль', code: 'INVALID_CREDENTIALS' });
    }

    const user = rowToUser(row);
    const token = signToken({ sub: row.id, email: row.email });
    res.json({ token, user });
  } catch (err) {
    next(err);
  }
});

router.get('/me', (req, res) => {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Потрібна авторизація', code: 'UNAUTHORIZED' });
  }
  const decoded = verifyToken(h.slice(7));
  if (!decoded || typeof decoded.sub !== 'string') {
    return res.status(401).json({ error: 'Недійсний токен', code: 'INVALID_TOKEN' });
  }

  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.sub);
  if (!row) {
    return res.status(401).json({ error: 'Користувача не знайдено', code: 'USER_NOT_FOUND' });
  }

  res.json({ user: rowToUser(row) });
});

export default router;
