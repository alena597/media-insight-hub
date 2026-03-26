import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrashIconButton } from '../components/TrashIconButton';
import { useAuth } from '../hooks/useAuth';
import { loadLastWorkbenchResume } from '../lib/lastWorkbenchSession';
import { getCardPreviewUrl } from '../lib/moduleCardPreview';
import { stashResumeForPath } from '../lib/mihResumeBridge';
import { fetchFavorites, removeFavorite, type FavoriteItem } from '../lib/userDataApi';
import { isMihResume, type MihResume } from '../lib/mihResume';

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
 * Парсить JSON відновлення для переходу з обраного.
 *
 * @param s - Рядок JSON або undefined.
 * @returns MihResume або null.
 */
function parseResume(s?: string): MihResume | null {
  if (!s) return null;
  try {
    const o = JSON.parse(s) as unknown;
    return isMihResume(o) ? o : null;
  } catch {
    return null;
  }
}

/**
 * Сторінка обраного: модулі та збережені результати.
 *
 * @returns Сітка карток обраного.
 */
export function FavoritesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

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

  const onRemove = async (id: string) => {
    if (!user) return;
    setRemovingId(id);
    setError(null);
    try {
      await removeFavorite(id);
      const list = await fetchFavorites();
      setItems(list);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Не вдалося видалити');
    } finally {
      setRemovingId(null);
    }
  };

  if (!user) return null;

  return (
    <div className="archive-page">
      <header className="archive-hero">
        <h1 className="archive-title">Обране</h1>
        <p className="archive-subtitle">Збережені модулі та результати аналізів</p>
      </header>

      {error ? <p className="auth-error">{error}</p> : null}

      {items.length === 0 ? (
        <p className="page-empty archive-empty">
          Натисніть зірку на картці модуля на головній або збережіть результат у модулі.
        </p>
      ) : (
        <ul className="archive-grid">
          {items.map((row) => {
            const resume =
              parseResume(row.resumePayload) ?? loadLastWorkbenchResume(row.path) ?? undefined;
            const to = row.path;
            const state = resume ? { mihResume: resume } : undefined;
            const stash = () => {
              if (resume) stashResumeForPath(to, resume);
            };
            return (
              <li key={row.id} className="archive-card fav-card">
                <div className="archive-card-visual">
                  <Link to={to} state={state} className="archive-card-open" onClick={stash}>
                    <img src={getCardPreviewUrl(row)} alt="" className="archive-card-img" />
                  </Link>
                  {row.kind === 'result' ? (
                    <span className="fav-card-chip">Результат</span>
                  ) : null}
                  <TrashIconButton
                    className="fav-card-trash"
                    ariaLabel="Прибрати з обраного"
                    disabled={removingId === row.id}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void onRemove(row.id);
                    }}
                  />
                </div>
                <div className="archive-card-body">
                  <Link to={to} state={state} className="archive-card-filename fav-card-title-link" onClick={stash}>
                    {row.title}
                  </Link>
                  <div className="archive-card-time">
                    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" className="archive-cal-icon">
                      <path
                        fill="currentColor"
                        d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"
                      />
                    </svg>
                    <time dateTime={new Date(row.createdAtMs).toISOString()}>{formatTs(row.createdAtMs)}</time>
                  </div>
                  <div className="fav-card-actions-min">
                    <Link to={to} state={state} className="fav-card-open-link" onClick={stash}>
                      Відкрити
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
