import { randomUUID } from 'node:crypto';
import { logger } from '../logger.js';
import { userMessageForError } from '../messages/userErrorsUk.js';

/**
 * HTTP-помилка з кодом для клієнта та локалізованим повідомленням.
 */
export class AppHttpError extends Error {
  /**
   * @param {number} status - HTTP-статус.
   * @param {string} code - Код помилки (стабільний для клієнта).
   * @param {string} message - Технічне повідомлення для логів.
   * @param {Record<string, unknown>} [context] - Контекст для логів.
   */
  constructor(status, code, message, context = {}) {
    super(message);
    this.name = 'AppHttpError';
    this.status = status;
    this.code = code;
    this.context = context;
  }
}

/**
 * Обрізає тіло запиту для логів (без великих data URL).
 *
 * @param {unknown} body - req.body.
 * @returns {unknown}
 */
function safeBodyForLog(body) {
  if (body == null || typeof body !== 'object') return body;
  const o = { ...body };
  for (const k of Object.keys(o)) {
    if (typeof o[k] === 'string' && o[k].length > 500) {
      o[k] = `${o[k].slice(0, 120)}…[truncated ${o[k].length} chars]`;
    }
  }
  return o;
}

/**
 * 404 з унікальним errorId та requestId у відповіді.
 */
export function notFoundHandler(req, res) {
  const errorId = randomUUID();
  logger.warn('route_not_found', {
    requestId: req.requestId,
    errorId,
    method: req.method,
    path: req.originalUrl || req.url
  });
  res.status(404).json({
    error: userMessageForError('NOT_FOUND'),
    code: 'NOT_FOUND',
    requestId: req.requestId,
    errorId
  });
}

/**
 * Фінальний обробник помилок Express: логує stack і контекст, повертає безпечне тіло JSON.
 *
 * @type {import('express').ErrorRequestHandler}
 */
// eslint-disable-next-line no-unused-vars -- сигнатура Express вимагає 4 аргументи
export function errorHandler(err, req, res, next) {
  const errorId = randomUUID();

  if (res.headersSent) {
    return;
  }

  if (err instanceof AppHttpError) {
    logger.warn('app_http_error', {
      requestId: req.requestId,
      errorId,
      code: err.code,
      status: err.status,
      message: err.message,
      ...err.context,
      path: req.originalUrl || req.url,
      userId: typeof req.userId === 'string' ? req.userId : null
    });
    res.status(err.status).json({
      error: userMessageForError(err.code) || err.message,
      code: err.code,
      requestId: req.requestId,
      errorId
    });
    return;
  }

  const isBadJson = err.type === 'entity.parse.failed' || err instanceof SyntaxError;
  const statusFromErr =
    typeof err.status === 'number'
      ? err.status
      : typeof err.statusCode === 'number'
        ? err.statusCode
        : isBadJson
          ? 400
          : 500;

  const status = statusFromErr >= 400 && statusFromErr < 600 ? statusFromErr : 500;
  const code = isBadJson ? 'INVALID_JSON' : 'INTERNAL_ERROR';

  if (status < 500) {
    logger.warn('request_error', {
      requestId: req.requestId,
      errorId,
      code,
      status,
      message: err.message,
      path: req.originalUrl || req.url,
      userId: typeof req.userId === 'string' ? req.userId : null
    });
  } else {
    logger.error('unhandled_error', {
      requestId: req.requestId,
      errorId,
      code,
      status,
      message: err.message,
      stack: err.stack,
      method: req.method,
      path: req.originalUrl || req.url,
      userId: typeof req.userId === 'string' ? req.userId : null,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? safeBodyForLog(req.body) : undefined
    });
  }

  const publicCode = status >= 500 ? 'INTERNAL_ERROR' : code;
  const userText =
    status >= 500 ? userMessageForError('INTERNAL_ERROR') : userMessageForError(code);

  res.status(status).json({
    error: userText,
    code: publicCode,
    requestId: req.requestId,
    errorId
  });
}
