import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Рівень логування змінюється через змінну оточення `LOG_LEVEL` без перекомпіляції
 * (наприклад: debug, info, warn, error). Значення відповідають рівням Winston.
 */
const level = (process.env.LOG_LEVEL || 'info').toLowerCase();

const logDir = process.env.LOG_DIR || path.join(__dirname, '..', 'logs');

try {
  fs.mkdirSync(logDir, { recursive: true });
} catch {
  /* ignore */
}

const lineFormat = winston.format.printf(({ timestamp, level: lvl, message, ...meta }) => {
  const keys = Object.keys(meta).filter((k) => k !== 'splat' && k !== 'symbol(level)');
  const tail = keys.length ? ` ${JSON.stringify(Object.fromEntries(keys.map((k) => [k, meta[k]])))}` : '';
  return `${timestamp} [${String(lvl).toUpperCase()}] ${message}${tail}`;
});

const baseFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  lineFormat
);

const transports = [
  new winston.transports.Console({
    format: winston.format.combine(winston.format.colorize(), baseFormat)
  }),
  new DailyRotateFile({
    dirname: logDir,
    filename: 'mih-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxSize: process.env.LOG_MAX_FILE_SIZE || '5m',
    maxFiles: process.env.LOG_MAX_FILES || '14d',
    zippedArchive: true,
    format: baseFormat
  })
];

/**
 * Глобальний логер сервера (консоль + файл з ротацією за датою/розміром).
 */
export const logger = winston.createLogger({
  level,
  transports
});

logger.info('logger_initialized', { level, logDir });
