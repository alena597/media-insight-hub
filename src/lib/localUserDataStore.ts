/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- прості операції з localStorage */
import type { FavoriteItem, HistoryEntry } from './userDataTypes';

const H_PREFIX = 'mih_pending_history_v1:';
const F_PREFIX = 'mih_pending_favorites_v1:';

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota */
  }
}

/**
 * Записи історії, що не вдалося відправити на сервер (мережа / 4xx).
 */
export function getPendingHistory(userId: string): HistoryEntry[] {
  const rows = readJson<HistoryEntry[]>(H_PREFIX + userId);
  return Array.isArray(rows) ? rows : [];
}

export function appendPendingHistory(userId: string, row: HistoryEntry): void {
  const prev = getPendingHistory(userId);
  writeJson(H_PREFIX + userId, [row, ...prev].slice(0, 120));
}

export function clearPendingHistory(userId: string): void {
  try {
    localStorage.removeItem(H_PREFIX + userId);
  } catch {
    /* ignore */
  }
}

export function removePendingHistory(userId: string, id: string): void {
  const prev = getPendingHistory(userId);
  writeJson(
    H_PREFIX + userId,
    prev.filter((x) => x.id !== id)
  );
}

export function getPendingFavorites(userId: string): FavoriteItem[] {
  const rows = readJson<FavoriteItem[]>(F_PREFIX + userId);
  return Array.isArray(rows) ? rows : [];
}

export function appendPendingFavorite(userId: string, row: FavoriteItem): void {
  const prev = getPendingFavorites(userId);
  writeJson(F_PREFIX + userId, [row, ...prev].slice(0, 120));
}

export function removePendingFavorite(userId: string, id: string): void {
  const prev = getPendingFavorites(userId);
  writeJson(
    F_PREFIX + userId,
    prev.filter((x) => x.id !== id)
  );
}

export function clearPendingFavorites(userId: string): void {
  try {
    localStorage.removeItem(F_PREFIX + userId);
  } catch {
    /* ignore */
  }
}

function byTimeDesc<T extends { createdAtMs: number }>(a: T, b: T): number {
  return b.createdAtMs - a.createdAtMs;
}

/**
 * Об’єднує відповідь сервера з локальними «завислими» записами (різні id).
 *
 * @param remote - Записи з API.
 * @param pending - Локальні записи після невдалого POST.
 * @returns Відсортовано за датою.
 */
export function mergeHistory(remote: HistoryEntry[], pending: HistoryEntry[]): HistoryEntry[] {
  const rids = new Set(remote.map((x) => x.id));
  const extra = pending.filter((p) => !rids.has(p.id));
  return [...remote, ...extra].sort(byTimeDesc);
}

/**
 * Об’єднує обране сервера з локальним.
 *
 * @param remote - З API.
 * @param pending - Локальне.
 * @returns Список.
 */
export function mergeFavorites(remote: FavoriteItem[], pending: FavoriteItem[]): FavoriteItem[] {
  const rids = new Set(remote.map((x) => x.id));
  const extra = pending.filter((p) => !rids.has(p.id));
  return [...remote, ...extra].sort(byTimeDesc);
}
