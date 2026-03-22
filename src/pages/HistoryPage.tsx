import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { fetchHistory, type HistoryEntry } from '../lib/userDataApi';

const formatTs = (ms: number): string => {
  try {
    return new Date(ms).toLocaleString('uk-UA', {
      dateStyle: 'short',
      timeStyle: 'medium'
    });
  } catch {
    return '—';
  }
};

/**
 * Сторінка історії дій (база на бекенді).
 *
 * @returns Елемент сторінки історії.
 */
export function HistoryPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const list = await fetchHistory();
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

  if (!user) return null;

  return (
    <div>
      <div className="page-head">
        <h2 className="page-head-title">Історія</h2>
        <p className="page-head-desc">Пошукові запити та переглянуті сторінки зберігаються на сервері.</p>
      </div>
      {error ? <p className="auth-error">{error}</p> : null}
      {items.length === 0 ? (
        <p className="page-empty">Поки що порожньо. Переглядайте модулі або шукайте на Dashboard — записи з’являться тут.</p>
      ) : (
        <ul className="history-list">
          {items.map((row) => (
            <li key={row.id} className="history-item">
              <div className="history-item-main">
                <span className={`history-badge history-badge--${row.kind}`}>
                  {row.kind === 'search' ? 'Пошук' : 'Перегляд'}
                </span>
                <span className="history-label">{row.label}</span>
              </div>
              <div className="history-item-meta">
                {row.path ? (
                  <Link to={row.path} className="history-path">
                    {row.path}
                  </Link>
                ) : (
                  <span className="history-path-muted">—</span>
                )}
                <time className="history-time" dateTime={new Date(row.createdAtMs).toISOString()}>
                  {formatTs(row.createdAtMs)}
                </time>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
