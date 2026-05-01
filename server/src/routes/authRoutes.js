import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { getDb } from '../db.js';
import { signToken, verifyToken } from '../auth.js';
import { sendPasswordResetEmail } from '../mailer.js';

const router = Router();

function validatePassword(password) {
  if (password.length < 8) return 'WEAK_PASSWORD_SHORT';
  if (!/[\d\W_]/.test(password)) return 'WEAK_PASSWORD_CHARS';
  return null;
}

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
      return res.status(400).json({ error: 'Invalid email address', code: 'INVALID_EMAIL' });
    }
    if (validatePassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters and contain a digit or special character', code: 'WEAK_PASSWORD' });
    }

    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'This email is already registered', code: 'EMAIL_IN_USE' });
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
      return res.status(400).json({ error: 'Email and password are required', code: 'INVALID_INPUT' });
    }

    const db = getDb();
    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    const valid = row ? await bcrypt.compare(password, row.password_hash) : false;
    if (!row || !valid) {
      return res.status(401).json({ error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' });
    }

    const user = rowToUser(row);
    const token = signToken({ sub: row.id, email: row.email });
    res.json({ token, user });
  } catch (err) {
    next(err);
  }
});

router.patch('/profile', async (req, res, next) => {
  try {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization required', code: 'UNAUTHORIZED' });
    }
    const decoded = verifyToken(h.slice(7));
    if (!decoded?.sub) {
      return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
    }
    const rawName = req.body?.displayName != null ? String(req.body.displayName).trim() : null;
    const displayName = rawName && rawName.length > 0 ? rawName : null;
    const db = getDb();
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(displayName, decoded.sub);
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.sub);
    res.json({ user: rowToUser(row) });
  } catch (err) {
    next(err);
  }
});

router.patch('/password', async (req, res, next) => {
  try {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization required', code: 'UNAUTHORIZED' });
    }
    const decoded = verifyToken(h.slice(7));
    if (!decoded?.sub) {
      return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
    }
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    if (validatePassword(newPassword)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters and contain a digit or special character', code: 'WEAK_PASSWORD' });
    }
    const db = getDb();
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.sub);
    if (!row) {
      return res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
    }
    const valid = await bcrypt.compare(currentPassword, row.password_hash);
    if (!valid) {
      return res.status(400).json({ error: 'Current password is incorrect', code: 'INVALID_PASSWORD' });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, decoded.sub);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Invalid email address', code: 'INVALID_EMAIL' });
    }

    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);

    if (!user) return res.json({ ok: true });

    db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id);

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour
    db.prepare(
      'INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)'
    ).run(token, user.id, expiresAt);

    const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
    const resetUrl = `${frontendOrigin}/reset-password?token=${token}`;
    await sendPasswordResetEmail(email, resetUrl);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const token = String(req.body?.token || '').trim();
    const newPassword = String(req.body?.newPassword || '');

    if (!token) {
      return res.status(400).json({ error: 'Token is required', code: 'MISSING_TOKEN' });
    }
    if (validatePassword(newPassword)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters and contain a digit or special character', code: 'WEAK_PASSWORD' });
    }

    const db = getDb();
    const row = db.prepare('SELECT * FROM password_reset_tokens WHERE token = ?').get(token);

    if (!row || row.used || row.expires_at < Date.now()) {
      return res.status(400).json({ error: 'Reset link is invalid or has expired', code: 'INVALID_TOKEN' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, row.user_id);
    db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE token = ?').run(token);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/me', (req, res) => {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required', code: 'UNAUTHORIZED' });
  }
  const decoded = verifyToken(h.slice(7));
  if (!decoded || typeof decoded.sub !== 'string') {
    return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
  }

  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.sub);
  if (!row) {
    return res.status(401).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
  }

  res.json({ user: rowToUser(row) });
});

export default router;
