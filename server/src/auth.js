import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 16) {
  console.warn(
    '[server] JWT_SECRET не задано або занадто короткий. Встановіть у .env (мінімум 16 символів).'
  );
}

/**
 * @param {object} payload
 * @param {string} payload.sub
 * @param {string} payload.email
 * @returns {string}
 */
export function signToken(payload) {
  const secret = JWT_SECRET || 'dev-only-insecure-secret-change-me';
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}

/**
 * @param {string} token
 * @returns {{ sub: string; email: string } | null}
 */
export function verifyToken(token) {
  try {
    const secret = JWT_SECRET || 'dev-only-insecure-secret-change-me';
    return jwt.verify(token, secret);
  } catch {
    return null;
  }
}

/**
 * Express middleware: встановлює req.userId з Bearer JWT.
 */
export function authMiddleware(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Потрібна авторизація', code: 'UNAUTHORIZED' });
  }
  const token = h.slice(7);
  const decoded = verifyToken(token);
  if (!decoded || typeof decoded.sub !== 'string') {
    return res.status(401).json({ error: 'Недійсний токен', code: 'INVALID_TOKEN' });
  }
  req.userId = decoded.sub;
  next();
}
