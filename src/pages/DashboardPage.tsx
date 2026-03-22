import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { addFavorite, addHistoryEntry } from '../lib/userDataApi';

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
 * Головна сторінка застосунку — дашборд з оглядом модулів.
 *
 * @description
 * Відображає статистику використання (кількість аналізів з localStorage),
 * список доступних AI-модулів у вигляді карток з навігацією.
 * Лічильник аналізів зберігається у localStorage під ключем
 * `mih_analyses_count` і оновлюється кожним модулем після обробки.
 *
 * @returns {JSX.Element} Сторінка дашборду
 */
export function DashboardPage() {
  const [analysesCount, setAnalysesCount] = useState(0);
  const [filter, setFilter] = useState('');
  const { user, authReady } = useAuth();
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (!user || !authReady) return;
    const q = filter.trim();
    if (!q) return;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      void addHistoryEntry({
        kind: 'search',
        label: `Пошук модулів: ${q}`,
        path: '/dashboard'
      }).catch(() => {});
    }, 900);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [filter, user, authReady]);

  const filteredCards = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return MODULE_CARDS;
    return MODULE_CARDS.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.subtitle.toLowerCase().includes(q) ||
        c.tag.toLowerCase().includes(q)
    );
  }, [filter]);

  const addModuleToFavorites = async (card: (typeof MODULE_CARDS)[number]) => {
    if (!user) return;
    try {
      await addFavorite({ title: card.title, path: card.to });
    } catch {
      /* ignore */
    }
  };

  return (
    <div>
      <div className="dash-header">
        <h2>
          AI <span className="accent-gradient">Transparency</span> Lab
        </h2>
        <p>
          Watch every step of AI analysis unfold in real time. Upload media, observe the models
          think, and explore the results with interactive visualizations.
        </p>
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

      <div className="dash-search-wrap">
        <label className="dash-search-label" htmlFor="dash-module-search">
          Пошук модулів
        </label>
        <input
          id="dash-module-search"
          className="dash-search-input"
          type="search"
          placeholder="Назва, тег або опис…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="dash-grid">
        {filteredCards.map((card) => (
          <DashboardCard
            key={card.to}
            to={card.to}
            icon={card.icon}
            title={card.title}
            subtitle={card.subtitle}
            tag={card.tag}
            accentClass={card.accentClass}
            showFavorite={Boolean(user)}
            onFavorite={() => void addModuleToFavorites(card)}
          />
        ))}
      </div>
      {filteredCards.length === 0 ? (
        <p className="dash-empty-filter">Нічого не знайдено. Спробуйте інший запит.</p>
      ) : null}
    </div>
  );
}


type DashboardCardProps = {
  to: string;
  icon: 'document' | 'gallery' | 'target' | 'mic';
  title: string;
  subtitle: string;
  tag: string;
  accentClass: string;
  showFavorite?: boolean;
  onFavorite?: () => void;
};

/**
 * Картка модуля на дашборді з навігацією.
 *
 * @description
 * Клікабельна картка яка веде до відповідного AI-модуля.
 * Відображає іконку, назву, короткий опис та технологічний тег.
 *
 * @param {DashboardCardProps} props - Пропси картки
 * @param {string} props.to - Шлях маршруту
 * @param {string} props.icon - Тип іконки
 * @param {string} props.title - Назва модуля
 * @param {string} props.subtitle - Короткий опис
 * @param {string} props.tag - Технологічний тег
 * @param {string} props.accentClass - CSS клас акцентного кольору
 * @returns {JSX.Element} Картка модуля
 */
function DashboardCard({
  to,
  icon,
  title,
  subtitle,
  tag,
  accentClass,
  showFavorite,
  onFavorite
}: DashboardCardProps) {
  return (
    <NavLink to={to} className={`dash-card ${accentClass}`}>
      <div className="dash-card-body">
        <div className="dash-card-head">
          <div className="dash-card-icon">
            <CardIcon kind={icon} />
          </div>
          {showFavorite && onFavorite ? (
            <button
              type="button"
              className="dash-card-fav"
              aria-label="Додати в обране"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onFavorite();
              }}
            >
              ★
            </button>
          ) : null}
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

type CardIconProps = {
  kind: 'document' | 'gallery' | 'target' | 'mic';
};

/**
 * SVG іконка для картки модуля на дашборді.
 *
 * @param {CardIconProps} props - Пропси компонента
 * @param {string} props.kind - Тип іконки
 * @returns {JSX.Element} SVG іконка
 *
 * @example
 * <CardIcon kind="document" />
 * <CardIcon kind="gallery" />
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
        <circle
          cx="12"
          cy="12"
          r="5.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
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
      <path
        d="M12 3.5v10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

