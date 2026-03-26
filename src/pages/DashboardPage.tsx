import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { gradientDataUrlForModulePath } from '../lib/moduleCardPreview';
import { addFavorite, fetchFavorites, removeFavorite, type FavoriteItem } from '../lib/userDataApi';

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
 *
 * @returns Картки модулів та метрики.
 */
export function DashboardPage() {
  const [analysesCount, setAnalysesCount] = useState(0);
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);

  useEffect(() => {
    try {
      const key = 'mih_analyses_count';
      const v = Number(localStorage.getItem(key) || '0');
      setAnalysesCount(Number.isFinite(v) ? v : 0);
    } catch {
      setAnalysesCount(0);
    }
  }, []);

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

  return (
    <div>
      <div className="dash-header">
        <h2>
          AI <span className="accent-gradient">Transparency</span> Lab
        </h2>
        <p className="dash-header-lead">Модулі аналізу медіа в браузері.</p>
      </div>

      <div className="dash-metrics-row">
        <div className="dash-metric-card">
          <div className="dash-metric-label">Analyses</div>
          <div className="dash-metric-value">{analysesCount}</div>
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

/**
 * Картка з навігацією та зіркою обраного.
 *
 * @param props - Пропси картки модуля.
 * @returns Картка-посилання.
 */
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

/**
 * Іконка зірки (контур / заливка).
 *
 * @param props - Прапор заливки.
 * @param props.filled - Чи зафарбована зірка.
 * @returns SVG.
 */
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

/**
 * Піктограма модуля.
 *
 * @param props - Тип іконки.
 * @param props.kind - Ключ іконки.
 * @returns SVG.
 */
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
