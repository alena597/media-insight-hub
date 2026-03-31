import type { FavoriteItem, HistoryEntry } from './userDataTypes';

const H_PREFIX = 'mih_pending_history_v1:';
const F_PREFIX = 'mih_pending_favorites_v1:';

/**
 * Зчитує та десеріалізує JSON-значення з localStorage.
 *
 * @param key - Ключ у localStorage.
 * @returns Розпарсоване значення або null при відсутності/помилці.
 */
function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Серіалізує та зберігає значення у localStorage.
 *
 * @param key - Ключ у localStorage.
 * @param value - Значення для збереження.
 */
function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota */
  }
}

/**
 * Записи історії, що не вдалося відправити на сервер (мережа / 4xx).
 *
 * @param userId - Ідентифікатор користувача.
 * @returns Масив незавершених записів історії.
 */
export function getPendingHistory(userId: string): HistoryEntry[] {
  const rows = readJson<HistoryEntry[]>(H_PREFIX + userId);
  return Array.isArray(rows) ? rows : [];
}

/**
 * Додає запис до локальної черги незавершеної історії.
 *
 * @param userId - Ідентифікатор користувача.
 * @param row - Запис для додавання.
 */
export function appendPendingHistory(userId: string, row: HistoryEntry): void {
  const prev = getPendingHistory(userId);
  writeJson(H_PREFIX + userId, [row, ...prev].slice(0, 120));
}

/**
 * Очищає всю локальну чергу незавершеної історії користувача.
 *
 * @param userId - Ідентифікатор користувача.
 */
export function clearPendingHistory(userId: string): void {
  try {
    localStorage.removeItem(H_PREFIX + userId);
  } catch {
    /* ignore */
  }
}

/**
 * Видаляє один запис з локальної черги незавершеної історії.
 *
 * @param userId - Ідентифікатор користувача.
 * @param id - Ідентифікатор запису для видалення.
 */
export function removePendingHistory(userId: string, id: string): void {
  const prev = getPendingHistory(userId);
  writeJson(
    H_PREFIX + userId,
    prev.filter((x) => x.id !== id)
  );
}

/**
 * Повертає локальну чергу незавершених обраних елементів користувача.
 *
 * @param userId - Ідентифікатор користувача.
 * @returns Масив незавершених обраних елементів.
 */
export function getPendingFavorites(userId: string): FavoriteItem[] {
  const rows = readJson<FavoriteItem[]>(F_PREFIX + userId);
  return Array.isArray(rows) ? rows : [];
}

/**
 * Додає елемент до локальної черги незавершених обраних.
 *
 * @param userId - Ідентифікатор користувача.
 * @param row - Елемент для додавання.
 */
export function appendPendingFavorite(userId: string, row: FavoriteItem): void {
  const prev = getPendingFavorites(userId);
  writeJson(F_PREFIX + userId, [row, ...prev].slice(0, 120));
}

/**
 * Видаляє один елемент з локальної черги незавершених обраних.
 *
 * @param userId - Ідентифікатор користувача.
 * @param id - Ідентифікатор елемента для видалення.
 */
export function removePendingFavorite(userId: string, id: string): void {
  const prev = getPendingFavorites(userId);
  writeJson(
    F_PREFIX + userId,
    prev.filter((x) => x.id !== id)
  );
}

/**
 * Очищає всю локальну чергу незавершених обраних елементів користувача.
 *
 * @param userId - Ідентифікатор користувача.
 */
export function clearPendingFavorites(userId: string): void {
  try {
    localStorage.removeItem(F_PREFIX + userId);
  } catch {
    /* ignore */
  }
}

/**
 * Компаратор для сортування записів за часом у спадному порядку.
 *
 * @param a - Перший елемент.
 * @param b - Другий елемент.
 * @returns Від'ємне число, якщо b новіше за a.
 */
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
