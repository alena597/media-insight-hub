import { apiFetch, apiJson } from './api';
import { getUserIdFromToken } from './jwtUser';
import {
  appendPendingFavorite,
  appendPendingHistory,
  clearPendingHistory,
  getPendingFavorites,
  getPendingHistory,
  mergeFavorites,
  mergeHistory,
  removePendingFavorite,
  removePendingHistory
} from './localUserDataStore';
import type { FavoriteItem, FavoriteKind, HistoryEntry, HistoryKind } from './userDataTypes';

export type { FavoriteItem, FavoriteKind, HistoryEntry, HistoryKind };

/**
 * Додає запис історії (потрібен збережений JWT).
 * При невдачі сервера запис кладеться в localStorage (черга), щоб прев’ю не губились.
 *
 * @param entry - Поля запису.
 * @param entry.kind - Тип події.
 * @param entry.label - Підпис.
 * @param entry.path - Маршрут.
 * @param entry.previewImage - Data URL прев’ю.
 * @param entry.resumePayload - JSON для відновлення.
 */
export async function addHistoryEntry(entry: {
  kind: HistoryKind;
  label: string;
  path?: string;
  previewImage?: string | null;
  resumePayload?: string | null;
}): Promise<void> {
  try {
    await apiJson<{ ok: boolean }>('/api/history', {
      method: 'POST',
      body: JSON.stringify({
        kind: entry.kind,
        label: entry.label,
        path: entry.path ?? null,
        previewImage: entry.previewImage ?? null,
        resumePayload: entry.resumePayload ?? null
      })
    });
  } catch {
    const uid = getUserIdFromToken();
    if (!uid) return;
    appendPendingHistory(uid, {
      id: crypto.randomUUID(),
      kind: entry.kind,
      label: entry.label,
      path: entry.path,
      createdAtMs: Date.now(),
      previewImage: entry.previewImage ?? undefined,
      resumePayload: entry.resumePayload ?? undefined
    });
  }
}

/**
 * Завантажує історію (сервер + локальна черга після невдалих POST).
 *
 * @returns Масив записів.
 */
export async function fetchHistory(): Promise<HistoryEntry[]> {
  const uid = getUserIdFromToken();
  const pending = uid ? getPendingHistory(uid) : [];
  try {
    const data = await apiJson<{ items: HistoryEntry[] }>('/api/history');
    return mergeHistory(data.items, pending);
  } catch {
    return [...pending].sort((a, b) => b.createdAtMs - a.createdAtMs);
  }
}

/**
 * Видаляє один запис історії (сервер або локальна черга).
 *
 * @param id - Ідентифікатор запису.
 */
export async function removeHistoryEntry(id: string): Promise<void> {
  const uid = getUserIdFromToken();
  if (uid) {
    const pending = getPendingHistory(uid);
    if (pending.some((p) => p.id === id)) {
      removePendingHistory(uid, id);
      return;
    }
  }
  await apiJson<{ ok: boolean }>(`/api/history/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

/**
 * Очищає історію на сервері та локальну чергу після успішної відповіді API.
 */
export async function clearHistory(): Promise<void> {
  const uid = getUserIdFromToken();
  await apiJson<{ ok: boolean }>('/api/history/clear', {
    method: 'POST',
    body: JSON.stringify({})
  });
  if (uid) clearPendingHistory(uid);
}

/**
 * Додає елемент обраного.
 *
 * @param item - Дані елемента.
 * @param item.title - Заголовок.
 * @param item.path - Шлях.
 * @param item.kind - Тип.
 * @param item.previewImage - Прев’ю.
 * @param item.resumePayload - Стан відновлення.
 * @returns id на сервері або `local-…` у черзі.
 */
export async function addFavorite(item: {
  title: string;
  path: string;
  kind?: FavoriteKind;
  previewImage?: string | null;
  resumePayload?: string | null;
}): Promise<string | undefined> {
  try {
    const data = await apiJson<{ ok: boolean; id?: string }>('/api/favorites', {
      method: 'POST',
      body: JSON.stringify({
        title: item.title,
        path: item.path,
        kind: item.kind ?? 'module',
        previewImage: item.previewImage ?? null,
        resumePayload: item.resumePayload ?? null
      })
    });
    return data.id;
  } catch {
    const uid = getUserIdFromToken();
    if (!uid) return undefined;
    const id = `local-${crypto.randomUUID()}`;
    appendPendingFavorite(uid, {
      id,
      title: item.title,
      path: item.path,
      createdAtMs: Date.now(),
      kind: item.kind ?? 'module',
      previewImage: item.previewImage ?? undefined,
      resumePayload: item.resumePayload ?? undefined
    });
    return id;
  }
}

/**
 * Видаляє елемент обраного за id (серверний або `local-…` з черги).
 *
 * @param favoriteId - Ідентифікатор.
 */
export async function removeFavorite(favoriteId: string): Promise<void> {
  if (favoriteId.startsWith('local-')) {
    const uid = getUserIdFromToken();
    if (uid) removePendingFavorite(uid, favoriteId);
    return;
  }
  const res = await apiFetch(`/api/favorites/${encodeURIComponent(favoriteId)}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    throw new Error(data.error ?? 'Не вдалося видалити');
  }
}

/**
 * Завантажує список обраного (сервер + локальна черга).
 *
 * @returns Елементи обраного.
 */
export async function fetchFavorites(): Promise<FavoriteItem[]> {
  const uid = getUserIdFromToken();
  const pending = uid ? getPendingFavorites(uid) : [];
  try {
    const data = await apiJson<{ items: FavoriteItem[] }>('/api/favorites');
    return mergeFavorites(data.items, pending);
  } catch {
    return [...pending].sort((a, b) => b.createdAtMs - a.createdAtMs);
  }
}
