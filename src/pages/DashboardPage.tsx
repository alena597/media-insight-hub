import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { gradientDataUrlForModulePath } from '../lib/moduleCardPreview';
import { addFavorite, fetchFavorites, removeFavorite, type FavoriteItem } from '../lib/userDataApi';
import { apiJson } from '../lib/api';

/** Назви модулів для відображення в легенді діаграми */
const MODULE_LABELS: Record<string, string> = {
  '/ocr': 'OCR',
  '/gallery': 'Gallery',
  '/detection': 'Detection',
  '/transcriber': 'Transcriber'
};

/** Кольори акцентів для кожного модуля */
const MODULE_COLORS: Record<string, string> = {
  '/ocr': '#22d3ee',
  '/gallery': '#a78bfa',
  '/detection': '#34d399',
  '/transcriber': '#fcd34d'
};

/** Скорочені назви днів тижня для графіка активності */
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type StatsResponse = {
  total: number;
  moduleCounts: Record<string, number>;
  dailyActivity: Record<string, number>;
};

/** Порожні дані за замовчуванням (до завантаження або коли не авторизовано) */
const EMPTY_MODULE_COUNTS: Record<string, number> = {
  '/ocr': 0,
  '/gallery': 0,
  '/detection': 0,
  '/transcriber': 0
};

function buildDailyData(daily: Record<string, number>): Array<{ label: string; count: number }> {
  const result: Array<{ label: string; count: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const label = DAY_NAMES[d.getDay()];
    result.push({ label, count: Number(daily[key] ?? 0) });
  }
  return result;
}

/**
 * Донатна SVG-діаграма використання модулів.
 */
function ModuleDonutChart({ counts }: { counts: Record<string, number> }) {
  const modules = ['/ocr', '/gallery', '/detection', '/transcriber'] as const;
  const total = modules.reduce((sum, m) => sum + (counts[m] ?? 0), 0);

  const circumference = 2 * Math.PI * 50; // r=50
  let offset = 0;

  const segments = modules.map((mod) => {
    const fraction = total > 0 ? (counts[mod] ?? 0) / total : 0;
    const dash = fraction * circumference;
    const gap = circumference - dash;
    const startOffset = circumference - offset;
    offset += dash;
    return { mod, dash, gap, startOffset, count: counts[mod] ?? 0 };
  });

  return (
    <div className="dash-chart-donut-wrap">
      <svg width="140" height="140" viewBox="0 0 140 140" aria-label="Діаграма використання модулів">
        <circle
          cx="70"
          cy="70"
          r="50"
          fill="none"
          stroke="#374151"
          strokeWidth="18"
        />
        {total === 0 ? (
          <circle
            cx="70"
            cy="70"
            r="50"
            fill="none"
            stroke="#374151"
            strokeWidth="18"
            strokeDasharray={`${circumference} 0`}
          />
        ) : (
          segments.map(({ mod, dash, gap, startOffset }) => (
            <circle
              key={mod}
              cx="70"
              cy="70"
              r="50"
              fill="none"
              stroke={MODULE_COLORS[mod]}
              strokeWidth="18"
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={startOffset}
              className="dash-donut-segment"
              transform="rotate(-90 70 70)"
            />
          ))
        )}
        <text
          x="70"
          y="66"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="20"
          fontWeight="600"
          fill="var(--text-primary)"
        >
          {total}
        </text>
        <text
          x="70"
          y="82"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="9"
          fill="var(--text-secondary)"
        >
          total
        </text>
      </svg>
      <div className="dash-chart-legend">
        {modules.map((mod) => (
          <div key={mod} className="dash-chart-legend-item">
            <span
              className="dash-chart-legend-dot"
              style={{ background: MODULE_COLORS[mod] }}
            />
            <span className="dash-chart-legend-label">{MODULE_LABELS[mod]}</span>
            <span className="dash-chart-legend-value">{counts[mod] ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Стовпчастий SVG-графік активності за останні 7 днів.
 */
function ActivityBarChart({ data }: { data: Array<{ label: string; count: number }> }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  const svgHeight = 80;
  const barAreaHeight = 58;
  const barWidth = 28;
  const barSpacing = 42;
  const startX = 15;

  return (
    <div className="dash-chart-bars-wrap">
      <svg
        viewBox="0 0 300 80"
        width="300"
        height="80"
        aria-label="Графік активності за останні 7 днів"
        style={{ overflow: 'visible' }}
      >
        {data.map((d, i) => {
          const barH = maxCount > 0 ? (d.count / maxCount) * barAreaHeight : 0;
          const x = startX + i * barSpacing;
          const y = svgHeight - barH - 1;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barH > 0 ? barH : 2}
                rx="4"
                fill={barH > 0 ? 'url(#barGrad)' : '#374151'}
                className="dash-bar-rect"
                style={{ '--bar-target-y': y, '--bar-target-h': Math.max(barH, 2) } as React.CSSProperties}
              />
              <text
                x={x + barWidth / 2}
                y={svgHeight + 12}
                textAnchor="middle"
                fontSize="9"
                fill="var(--text-secondary)"
              >
                {d.label}
              </text>
              {d.count > 0 && (
                <text
                  x={x + barWidth / 2}
                  y={y - 3}
                  textAnchor="middle"
                  fontSize="8"
                  fill="var(--text-secondary)"
                >
                  {d.count}
                </text>
              )}
            </g>
          );
        })}
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.7" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

const MODULE_CARDS = [
  {
    to: '/ocr',
    icon: 'document' as const,
    title: 'OCR',
    subtitle: 'Extract text from images (laser scan + boxes).',
    tag: 'Tesseract.js · OCR',
    accentClass: 'accent-ocr-bg'
  },
  {
    to: '/gallery',
    icon: 'gallery' as const,
    title: 'Smart Gallery',
    subtitle: 'Auto-classify photos into categories.',
    tag: 'MobileNet v2 · Vision',
    accentClass: 'accent-gallery-bg'
  },
  {
    to: '/detection',
    icon: 'target' as const,
    title: 'Object Detection',
    subtitle: 'Detect objects with confidence and bbox overlays.',
    tag: 'COCO-SSD · Detection',
    accentClass: 'accent-detection-bg'
  },
  {
    to: '/transcriber',
    icon: 'mic' as const,
    title: 'Media Transcriber',
    subtitle: 'Transcribe speech and analyze sentiment.',
    tag: 'Web Speech · NLP',
    accentClass: 'accent-transcriber-bg'
  }
];

/**
 * Головна сторінка — дашборд з картками модулів.
 */
export function DashboardPage() {
  const { user } = useAuth();
  const location = useLocation();
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setStats(null);
      setStatsError(false);
      return;
    }
    let cancelled = false;
    setStatsLoading(true);
    setStatsError(false);
    void apiJson<StatsResponse>('/api/stats')
      .then((data) => {
        if (!cancelled) { setStats(data); setStatsLoading(false); }
      })
      .catch(() => {
        if (!cancelled) { setStatsError(true); setStatsLoading(false); }
      });
    return () => { cancelled = true; };
  }, [user, location.key]);

  useEffect(() => {
    if (!user) {
      setFavorites([]);
      return;
    }
    let cancelled = false;
    void fetchFavorites()
      .then((list) => {
        if (!cancelled) setFavorites(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  const moduleFavByPath = useMemo(() => {
    const m = new Map<string, FavoriteItem>();
    for (const f of favorites) {
      if (f.kind === 'result') continue;
      if (!m.has(f.path)) m.set(f.path, f);
    }
    return m;
  }, [favorites]);

  const toggleModuleFavorite = useCallback(
    async (card: (typeof MODULE_CARDS)[number]) => {
      if (!user) return;
      const existing = moduleFavByPath.get(card.to);
      try {
        if (existing) {
          await removeFavorite(existing.id);
        } else {
          await addFavorite({
            title: card.title,
            path: card.to,
            kind: 'module',
            previewImage: gradientDataUrlForModulePath(card.to)
          });
        }
        const list = await fetchFavorites();
        setFavorites(list);
      } catch {
        /* ignore */
      }
    },
    [user, moduleFavByPath]
  );

  const moduleCounts = stats?.moduleCounts ?? EMPTY_MODULE_COUNTS;
  const dailyData = useMemo(
    () => buildDailyData(stats?.dailyActivity ?? {}),
    [stats]
  );
  const analysesCount = stats?.total ?? 0;

  return (
    <div>
      <div className="dash-header">
        <h2>
          AI <span className="accent-gradient">Transparency</span> Lab
        </h2>
        <p className="dash-header-lead">Аналіз медіа в браузері</p>
      </div>

      <div className="dash-metrics-row">
        <div className="dash-metric-card">
          <div className="dash-metric-label">Analyses</div>
          <div className="dash-metric-value">{user ? analysesCount : '—'}</div>
        </div>
        <div className="dash-metric-card">
          <div className="dash-metric-label">Models</div>
          <div className="dash-metric-value">4</div>
        </div>
        <div className="dash-metric-card">
          <div className="dash-metric-label">Avg. time</div>
          <div className="dash-metric-value">&lt;5s</div>
        </div>
      </div>

      <div className="dash-grid">
        {MODULE_CARDS.map((card) => (
          <DashboardCard
            key={card.to}
            to={card.to}
            icon={card.icon}
            title={card.title}
            subtitle={card.subtitle}
            tag={card.tag}
            accentClass={card.accentClass}
            showFavorite={Boolean(user)}
            isFavorite={Boolean(moduleFavByPath.get(card.to))}
            onFavoriteToggle={() => void toggleModuleFavorite(card)}
          />
        ))}
      </div>

      <div className="dash-analytics-section">
        <h3 className="dash-analytics-title">Analytics</h3>
        {!user ? (
          <div className="dash-analytics-login-prompt">
            <span className="dash-analytics-login-icon">📊</span>
            <p>Увійдіть в акаунт, щоб переглянути статистику використання.</p>
          </div>
        ) : statsError ? (
          <div className="dash-analytics-login-prompt">
            <span className="dash-analytics-login-icon">⚠️</span>
            <p>Не вдалося завантажити статистику. Перевірте, чи запущений сервер.</p>
          </div>
        ) : statsLoading ? (
          <div className="dash-analytics-login-prompt">
            <span className="dash-analytics-login-icon">⏳</span>
            <p>Завантаження статистики…</p>
          </div>
        ) : (
          <div className="dash-analytics-row">
            <div className="dash-analytics-card">
              <div className="dash-analytics-card-label">Module Usage</div>
              <ModuleDonutChart counts={moduleCounts} />
            </div>
            <div className="dash-analytics-card dash-analytics-card--wide">
              <div className="dash-analytics-card-label">Activity — last 7 days</div>
              <ActivityBarChart data={dailyData} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Картка модуля на дашборді. */
type DashboardCardProps = {
  to: string;
  icon: 'document' | 'gallery' | 'target' | 'mic';
  title: string;
  subtitle: string;
  tag: string;
  accentClass: string;
  showFavorite?: boolean;
  isFavorite?: boolean;
  onFavoriteToggle?: () => void;
};

function DashboardCard(props: DashboardCardProps) {
  const {
    to,
    icon,
    title,
    subtitle,
    tag,
    accentClass,
    showFavorite,
    isFavorite,
    onFavoriteToggle
  } = props;
  return (
    <NavLink to={to} className={`dash-card ${accentClass}`}>
      {showFavorite && onFavoriteToggle ? (
        <button
          type="button"
          className={`dash-card-fav ${isFavorite ? 'dash-card-fav--filled' : 'dash-card-fav--outline'}`}
          aria-label={isFavorite ? 'Прибрати з обраного' : 'Додати в обране'}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onFavoriteToggle();
          }}
        >
          <StarIcon filled={Boolean(isFavorite)} />
        </button>
      ) : null}
      <div className="dash-card-body">
        <div className="dash-card-head">
          <div className="dash-card-icon">
            <CardIcon kind={icon} />
          </div>
        </div>
        <div className="dash-card-title-row">
          <h3>{title}</h3>
        </div>
        <p>{subtitle}</p>
        <span className="dash-card-tag">{tag}</span>
      </div>
      <span className="dash-card-arrow">→</span>
    </NavLink>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
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
  );
}

type CardIconProps = {
  kind: 'document' | 'gallery' | 'target' | 'mic';
};

function CardIcon({ kind }: CardIconProps) {
  if (kind === 'document') {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          d="M7 3.5h6.5L18 8v12.5H7V3.5z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M13.5 3.5V8H18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M9.5 11.5h5M9.5 14.5h3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (kind === 'gallery') {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <rect
          x="4"
          y="5"
          width="16"
          height="14"
          rx="2.2"
          ry="2.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <circle cx="9" cy="10" r="1.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path
          d="M7 16.2l3.2-3.1a1 1 0 0 1 1.4 0l2 2 1.1-1.1a1 1 0 0 1 1.4 0L18 15.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (kind === 'target') {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <circle cx="12" cy="12" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="2" fill="currentColor" />
        <path
          d="M12 4V2.5M20 12h1.5M12 20v1.5M4 12H2.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M8.5 6.5a3.5 3.5 0 1 1 7 0v1.6a7.5 7.5 0 1 1-7 0V6.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 3.5v10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
