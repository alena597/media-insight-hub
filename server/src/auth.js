import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { logger } from './logger.js';
import { userMessageForError } from './messages/userErrorsUk.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 16) {
  logger.warn('jwt_secret_weak', {
    message: 'JWT_SECRET не задано або занадто короткий. Встановіть у .env (мінімум 16 символів).'
  });
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
 * @param {import('express').Request} req
 * @param {string} code
 */
function authError(res, req, code) {
  const errorId = randomUUID();
  return res.status(401).json({
    error: userMessageForError(code),
    code,
    requestId: req.requestId,
    errorId
  });
}

export function authMiddleware(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) {
    return authError(res, req, 'UNAUTHORIZED');
  }
  const token = h.slice(7);
  const decoded = verifyToken(token);
  if (!decoded || typeof decoded.sub !== 'string') {
    return authError(res, req, 'INVALID_TOKEN');
  }
  req.userId = decoded.sub;
  next();
}
