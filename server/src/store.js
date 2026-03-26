import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';
import { AppHttpError } from './middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dataPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data.json');

/** @type {{ users: Array<{ id: string; email: string; password_hash: string; display_name: string | null; created_at: string }>; history: Array<{ id: string; user_id: string; kind: string; label: string; path: string | null; created_at: string }>; favorites: Array<{ id: string; user_id: string; title: string; path: string; created_at: string }> }} */
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
    fs.writeFileSync(dataPath, JSON.stringify(cache, null, 2), 'utf8');
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

export function getStore() {
  if (!cache) {
    cache = readFile();
  }
  return cache;
}

/**
 * @param {(s: typeof cache) => void} fn
 */
export function updateStore(fn) {
  const s = getStore();
  fn(s);
  persist();
}
