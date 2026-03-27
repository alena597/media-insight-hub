import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';
import { AppHttpError } from './middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dataPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data.json');
const prettyJson = process.env.STORE_PRETTY_JSON === '1';

/**
 * @typedef {{ id: string; email: string; password_hash: string; display_name: string | null; created_at: string }} UserRow
 * @typedef {{ id: string; user_id: string; kind: string; label: string; path: string | null; created_at: string; created_at_ms?: number; preview_image?: string | null; resume_payload?: string | null }} HistoryRow
 * @typedef {{ id: string; user_id: string; title: string; path: string; kind?: string; created_at: string; created_at_ms?: number; preview_image?: string | null; resume_payload?: string | null }} FavoriteRow
 * @typedef {{ users: UserRow[]; history: HistoryRow[]; favorites: FavoriteRow[] }} StoreShape
 */

/** @type {StoreShape | null} */
let cache = null;

function readFile() {
  try {
    const raw = fs.readFileSync(dataPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.users) parsed.users = [];
    if (!parsed.history) parsed.history = [];
    if (!parsed.favorites) parsed.favorites = [];
    return parsed;
  } catch {
    return { users: [], history: [], favorites: [] };
  }
}

function persist() {
  if (!cache) return;
  try {
    fs.mkdirSync(path.dirname(dataPath), { recursive: true });
    const json = prettyJson ? JSON.stringify(cache, null, 2) : JSON.stringify(cache);
    fs.writeFileSync(dataPath, json, 'utf8');
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error('store_persist_failed', {
      message: err.message,
      stack: err.stack,
      dataPath
    });
    throw new AppHttpError(500, 'STORE_WRITE_FAILED', err.message, { dataPath });
  }
}

/**
 * @returns {StoreShape}
 */
export function getStore() {
  if (!cache) {
    cache = readFile();
  }
  return cache;
}

/**
 * @param {(s: StoreShape) => void} fn
 */
export function updateStore(fn) {
  const s = getStore();
  fn(s);
  persist();
}
