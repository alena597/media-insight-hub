import { Router } from 'express';
import express from 'express';
import { logger } from '../logger.js';

const router = Router();

const jsonSmall = express.json({ limit: '12kb' });

/**
 * Прийом діагностичних подій з клієнта (помилки JS, дії) — лише для логів сервера.
 */
router.post('/', jsonSmall, (req, res) => {
  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  logger.info('client_log', {
    requestId: req.requestId,
    level: payload.level,
    message: typeof payload.message === 'string' ? payload.message.slice(0, 2000) : undefined,
    context: payload.context && typeof payload.context === 'object' ? payload.context : undefined,
    url: typeof payload.url === 'string' ? payload.url.slice(0, 2000) : undefined,
    userAgent: req.headers['user-agent']
  });
  res.json({ ok: true });
});

export default router;
