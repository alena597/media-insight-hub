import { randomUUID } from 'node:crypto';
import { logger } from '../logger.js';

/**
 * Присвоює кожному HTTP-запиту `requestId` (або бере з заголовка `X-Request-Id`),
 * додає заголовок відповіді та пише підсумковий рядок після завершення відповіді.
 *
 * @param {import('express').Request} req - Запит Express.
 * @param {import('express').Response} res - Відповідь Express.
 * @param {import('express').NextFunction} next - Next.
 */
export function requestContextMiddleware(req, res, next) {
  const incoming = req.headers['x-request-id'];
  const requestId = typeof incoming === 'string' && incoming.trim() ? incoming.trim().slice(0, 80) : randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const started = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - started;
    const userId = typeof req.userId === 'string' ? req.userId : undefined;
    logger.info('http_response', {
      requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      durationMs,
      userId: userId || null
    });
  });

  next();
}
