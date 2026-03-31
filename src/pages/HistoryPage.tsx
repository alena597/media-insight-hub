import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrashIconButton } from '../components/TrashIconButton';
import { useAuth } from '../hooks/useAuth';
import { archiveDisplayFileName, getArchiveCardStats } from '../lib/archiveCardMeta';
import { clearLastWorkbenchForCurrentUser, loadLastWorkbenchResume } from '../lib/lastWorkbenchSession';
import { getCardPreviewUrl } from '../lib/moduleCardPreview';
import { stashResumeForPath } from '../lib/mihResumeBridge';
import { clearHistory, fetchHistory, removeHistoryEntry, type HistoryEntry } from '../lib/userDataApi';
import { isMihResume, type MihResume } from '../lib/mihResume';

const formatArchiveDate = (ms: number): string => {
  try {
    return new Date(ms).toLocaleString('uk-UA', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '—';
  }
};

/**
 * Парсить JSON відновлення з бекенду.
 *
 * @param s - Рядок JSON або undefined.
 * @returns Об’єкт MihResume або null.
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
 * Сторінка архіву аналізів (історія обробки).
 *
 * @returns Сітка карток архіву.
 */
export function HistoryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [analysisOnly, setAnalysisOnly] = useState(false);

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

  const filteredItems = useMemo(() => {
    let list = items;
    if (analysisOnly) {
      list = list.filter((i) => i.kind === 'analysis');
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (i) =>
          i.label.toLowerCase().includes(q) ||
          (i.path || '').toLowerCase().includes(q) ||
          archiveDisplayFileName(i).toLowerCase().includes(q)
      );
    }
    return list;
  }, [items, analysisOnly, searchQuery]);

  const handleClearHistory = () => {
    setClearing(true);
    setError(null);
    void (async () => {
      try {
        await clearHistory();
        clearLastWorkbenchForCurrentUser();
        setItems([]);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Не вдалося очистити');
      } finally {
        setClearing(false);
      }
    })();
  };

  const handleDeleteOne = (id: string) => {
    setDeletingId(id);
    setError(null);
    void (async () => {
      try {
        await removeHistoryEntry(id);
        setItems((prev) => prev.filter((x) => x.id !== id));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Не вдалося видалити');
      } finally {
        setDeletingId(null);
      }
    })();
  };

  const openEntry = (row: HistoryEntry) => {
    const path = row.path || '/dashboard';
    let resume = parseResume(row.resumePayload);
    if (!resume) {
      const fromLocal = loadLastWorkbenchResume(path);
      if (fromLocal) resume = fromLocal;
    }
    if (resume) {
      stashResumeForPath(path, resume);
      navigate(path, { state: { mihResume: resume } });
      return;
    }
    navigate(path);
  };

  if (!user) return null;

  return (
    <div className="archive-page">
      <header className="archive-hero">
        <h1 className="archive-title">Архів аналізів</h1>
        <p className="archive-subtitle">Історія обробки медіафайлів</p>
      </header>

      <div className="archive-toolbar">
        <label className="archive-search-wrap">
          <span className="visually-hidden">Пошук в архіві</span>
          <input
            type="search"
            className="archive-search"
            placeholder="Пошук в архіві…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoComplete="off"
          />
        </label>
        <button
          type="button"
          className={`archive-filter-btn ${analysisOnly ? 'archive-filter-btn--active' : ''}`}
          onClick={() => setAnalysisOnly((v) => !v)}
          title="Лише аналізи"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              fill="currentColor"
              d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"
            />
          </svg>
        </button>
        {items.length > 0 ? (
          <button
            type="button"
            className="archive-clear-all"
            disabled={clearing}
            onClick={handleClearHistory}
          >
            {clearing ? 'Очищення…' : 'Очистити все'}
          </button>
        ) : null}
      </div>

      {error ? <p className="auth-error">{error}</p> : null}

      {items.length === 0 ? (
        <p className="page-empty archive-empty">
          Поки порожньо. Після аналізу в модулях з’являться прев’ю та збережений стан.
        </p>
      ) : filteredItems.length === 0 ? (
        <p className="page-empty archive-empty">Нічого не знайдено за запитом.</p>
      ) : (
        <ul className="archive-grid">
          {filteredItems.map((row) => {
            const stats = getArchiveCardStats(row);
            const fileName = archiveDisplayFileName(row);
            return (
              <li key={row.id} className="archive-card">
                <div className="archive-card-visual">
                  <button
                    type="button"
                    className="archive-card-open"
                    onClick={() => openEntry(row)}
                  >
                    <img src={getCardPreviewUrl(row)} alt="" className="archive-card-img" />
                  </button>
                  <span className="archive-badge archive-badge--tl">{stats.leftBadge}</span>
                  <TrashIconButton
                    className="archive-card-trash"
                    ariaLabel="Видалити запис з архіву"
                    disabled={deletingId === row.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteOne(row.id);
                    }}
                  />
                </div>
                <div className="archive-card-body">
                  <button type="button" className="archive-card-filename" onClick={() => openEntry(row)}>
                    {fileName}
                  </button>
                  <div className="archive-card-time">
                    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" className="archive-cal-icon">
                      <path
                        fill="currentColor"
                        d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"
                      />
                    </svg>
                    <time dateTime={new Date(row.createdAtMs).toISOString()}>{formatArchiveDate(row.createdAtMs)}</time>
                  </div>
                  {(stats.objects > 0 || stats.keywords > 0) && (
                    <div className="archive-card-stats">
                      {stats.objects > 0 && (
                        <div className="archive-stat archive-stat--objects">
                          <span className="archive-stat-label">Об’єкти</span>
                          <span className="archive-stat-value">{stats.objects}</span>
                        </div>
                      )}
                      {stats.keywords > 0 && (
                        <div className="archive-stat archive-stat--keywords">
                          <span className="archive-stat-label">Слів</span>
                          <span className="archive-stat-value">{stats.keywords}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
