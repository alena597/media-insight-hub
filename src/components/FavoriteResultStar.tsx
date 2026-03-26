import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { addFavorite, fetchFavorites, removeFavorite } from '../lib/userDataApi';

export type FavoriteResultStarProps = {
  /** Маршрут модуля (наприклад `/ocr`). */
  path: string;
  /** Заголовок у списку обраного. */
  title: string;
  /** JPEG data URL прев’ю. */
  previewImage: string;
  /** JSON стану для відновлення. */
  resumePayload: string;
};

/**
 * Зірка для збереження результату аналізу в обране (як на дашборді).
 *
 * @param props - Властивості компонента.
 * @param props.path - Маршрут модуля.
 * @param props.title - Заголовок у обраному.
 * @param props.previewImage - Data URL прев’ю.
 * @param props.resumePayload - Серіалізований стан.
 * @returns Кнопка-зірка або null без авторизації.
 */
export function FavoriteResultStar({ path, title, previewImage, resumePayload }: FavoriteResultStarProps) {
  const { user } = useAuth();
  const [favId, setFavId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || !resumePayload) {
      setFavId(null);
      return;
    }
    let cancelled = false;
    void fetchFavorites().then((items) => {
      if (cancelled) return;
      const found = items.find(
        (f) =>
          f.kind === 'result' &&
          f.path === path &&
          f.resumePayload === resumePayload
      );
      setFavId(found?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [user, path, resumePayload]);

  const toggle = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    try {
      if (favId) {
        await removeFavorite(favId);
        setFavId(null);
      } else {
        const id = await addFavorite({
          title,
          path,
          kind: 'result',
          previewImage,
          resumePayload
        });
        if (id) setFavId(id);
      }
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }, [user, favId, title, path, previewImage, resumePayload]);

  if (!user) return null;

  const filled = Boolean(favId);

  return (
    <button
      type="button"
      className={`mih-fav-star-btn ${filled ? 'mih-fav-star-btn--filled' : 'mih-fav-star-btn--outline'}`}
      disabled={busy}
      aria-label={filled ? 'Прибрати з обраного' : 'Додати результат в обране'}
      onClick={() => void toggle()}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        {filled ? (
          <path
            d="M12 3.2l2.4 5.5 6 .5-4.6 4 1.4 5.8L12 16.9 6.8 19l1.4-5.8-4.6-4 6-.5L12 3.2z"
            fill="currentColor"
          />
        ) : (
          <path
            d="M12 3.2l2.4 5.5 6 .5-4.6 4 1.4 5.8L12 16.9 6.8 19l1.4-5.8-4.6-4 6-.5L12 3.2z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </button>
  );
}
