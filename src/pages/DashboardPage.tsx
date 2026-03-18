import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';

export function DashboardPage() {
  const [analysesCount, setAnalysesCount] = useState(0);

  useEffect(() => {
    try {
      const key = "mih_analyses_count";
      const v = Number(localStorage.getItem(key) || "0");
      setAnalysesCount(Number.isFinite(v) ? v : 0);
    } catch {
      setAnalysesCount(0);
    }
  }, []);

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

      <div className="dash-grid">
        <DashboardCard
          to="/ocr"
          icon="document"
          title="OCR"
          subtitle="Extract text from images (laser scan + boxes)."
          tag="Tesseract.js · OCR"
          accentClass="accent-ocr-bg"
        />
        <DashboardCard
          to="/gallery"
          icon="gallery"
          title="Smart Gallery"
          subtitle="Auto-classify photos into categories."
          tag="MobileNet v2 · Vision"
          accentClass="accent-gallery-bg"
        />
        <DashboardCard
          to="/detection"
          icon="target"
          title="Object Detection"
          subtitle="Detect objects with confidence and bbox overlays."
          tag="COCO-SSD · Detection"
          accentClass="accent-detection-bg"
        />
        <DashboardCard
          to="/transcriber"
          icon="mic"
          title="Media Transcriber"
          subtitle="Transcribe speech and analyze sentiment."
          tag="Web Speech · NLP"
          accentClass="accent-transcriber-bg"
        />
      </div>
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
};

function DashboardCard({ to, icon, title, subtitle, tag, accentClass }: DashboardCardProps) {
  return (
    <NavLink to={to} className={`dash-card ${accentClass}`}>
      <div className="dash-card-body">
        <div className="dash-card-icon">
          <CardIcon kind={icon} />
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

