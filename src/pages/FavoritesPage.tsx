import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { addFavorite, fetchFavorites, removeFavorite, type FavoriteItem } from '../lib/userDataApi';

const formatTs = (ms: number): string => {
  try {
    return new Date(ms).toLocaleString('uk-UA', {
      dateStyle: 'short',
      timeStyle: 'short'
    });
  } catch {
    return '—';
  }
};

/**
 * Сторінка обраного з формою додавання та списком з API.
 *
 * @returns Елемент сторінки обраного.
 */
export function FavoritesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [path, setPath] = useState('/dashboard');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const list = await fetchFavorites();
        if (!cancelled) {
          setItems(list);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Помилка завантаження');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const onAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !title.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await addFavorite({ title: title.trim(), path: path.trim() || '/dashboard' });
      setTitle('');
      const list = await fetchFavorites();
      setItems(list);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Не вдалося додати');
    } finally {
      setAdding(false);
    }
  };

  const onRemove = async (id: string) => {
    if (!user) return;
    try {
      await removeFavorite(id);
      const list = await fetchFavorites();
      setItems(list);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Не вдалося видалити');
    }
  };

  if (!user) return null;

  return (
    <div>
      <div className="page-head">
        <h2 className="page-head-title">Обране</h2>
        <p className="page-head-desc">Модулі та посилання зберігаються в базі на сервері.</p>
      </div>

      <form className="fav-add-form" onSubmit={onAdd}>
        <div className="fav-add-row">
          <label className="auth-label">
            Назва
            <input
              className="auth-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Наприклад, OCR"
            />
          </label>
          <label className="auth-label">
            Шлях
            <input
              className="auth-input"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/ocr"
            />
          </label>
          <button className="auth-submit fav-add-btn" type="submit" disabled={adding || !title.trim()}>
            {adding ? 'Додавання…' : 'Додати'}
          </button>
        </div>
      </form>

      {error ? <p className="auth-error">{error}</p> : null}

      {items.length === 0 ? (
        <p className="page-empty">Список порожній. Додайте запис вище або зірку на картці на Dashboard.</p>
      ) : (
        <ul className="fav-list">
          {items.map((row) => (
            <li key={row.id} className="fav-item">
              <div className="fav-item-text">
                <Link to={row.path} className="fav-link">
                  {row.title}
                </Link>
                <span className="fav-path">{row.path}</span>
              </div>
              <div className="fav-item-actions">
                <time className="history-time" dateTime={new Date(row.createdAtMs).toISOString()}>
                  {formatTs(row.createdAtMs)}
                </time>
                <button type="button" className="fav-remove" onClick={() => void onRemove(row.id)}>
                  Видалити
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
