import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data.db');

/** @type {import('better-sqlite3').Database | null} */
let _db = null;

/**
 * @returns {import('better-sqlite3').Database}
 */
export function getDb() {
  if (_db) return _db;
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  logger.info('sqlite_opened', { dbPath });
  return _db;
}

/** @param {import('better-sqlite3').Database} db */
function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id           TEXT PRIMARY KEY,
      email        TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      created_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS history (
      id             TEXT PRIMARY KEY,
      user_id        TEXT NOT NULL,
      kind           TEXT NOT NULL DEFAULT 'page_view',
      label          TEXT NOT NULL,
      path           TEXT,
      preview_image  TEXT,
      resume_payload TEXT,
      created_at     TEXT NOT NULL,
      created_at_ms  INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_history_user_ms
      ON history(user_id, created_at_ms DESC);

    CREATE TABLE IF NOT EXISTS favorites (
      id             TEXT PRIMARY KEY,
      user_id        TEXT NOT NULL,
      title          TEXT NOT NULL,
      path           TEXT NOT NULL,
      kind           TEXT NOT NULL DEFAULT 'module',
      preview_image  TEXT,
      resume_payload TEXT,
      created_at     TEXT NOT NULL,
      created_at_ms  INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_favorites_user_ms
      ON favorites(user_id, created_at_ms DESC);

    CREATE TABLE IF NOT EXISTS detection_analytics (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      ts               TEXT NOT NULL,
      class_counts     TEXT NOT NULL DEFAULT '{}',
      total_detections INTEGER NOT NULL DEFAULT 0,
      source           TEXT NOT NULL DEFAULT 'object-detection'
    );
  `);
}
