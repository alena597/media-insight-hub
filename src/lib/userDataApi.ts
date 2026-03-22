import { apiFetch, apiJson } from './api';

export type HistoryKind = 'page_view' | 'search';

export type HistoryEntry = {
  id: string;
  kind: HistoryKind;
  label: string;
  path?: string;
  createdAtMs: number;
};

export type FavoriteItem = {
  id: string;
  title: string;
  path: string;
  createdAtMs: number;
};

/**
 * Додає запис історії (потрібен збережений JWT).
 *
 * @param entry - Тип події та підпис.
 * @param entry.kind - `page_view` або `search`.
 * @param entry.label - Текст для відображення.
 * @param entry.path - Опційний шлях сторінки.
 */
export async function addHistoryEntry(entry: {
  kind: HistoryKind;
  label: string;
  path?: string;
}): Promise<void> {
  await apiJson<{ ok: boolean }>('/api/history', {
    method: 'POST',
    body: JSON.stringify({
      kind: entry.kind,
      label: entry.label,
      path: entry.path ?? null
    })
  });
}

/**
 * Завантажує історію поточного користувача.
 *
 * @returns Масив записів.
 */
export async function fetchHistory(): Promise<HistoryEntry[]> {
  const data = await apiJson<{ items: HistoryEntry[] }>('/api/history');
  return data.items;
}

/**
 * Додає елемент обраного.
 *
 * @param item - Назва та шлях маршруту.
 * @param item.title - Заголовок.
 * @param item.path - Шлях маршруту.
 */
export async function addFavorite(item: { title: string; path: string }): Promise<void> {
  await apiJson<{ ok: boolean }>('/api/favorites', {
    method: 'POST',
    body: JSON.stringify(item)
  });
}

/**
 * Видаляє елемент обраного за id.
 *
 * @param favoriteId - Ідентифікатор запису на сервері.
 */
export async function removeFavorite(favoriteId: string): Promise<void> {
  const res = await apiFetch(`/api/favorites/${encodeURIComponent(favoriteId)}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    throw new Error(data.error ?? 'Не вдалося видалити');
  }
}

/**
 * Завантажує список обраного.
 *
 * @returns Масив елементів.
 */
export async function fetchFavorites(): Promise<FavoriteItem[]> {
  const data = await apiJson<{ items: FavoriteItem[] }>('/api/favorites');
  return data.items;
}
