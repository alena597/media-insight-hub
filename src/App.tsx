import { NavLink, Outlet, Route, Routes, Navigate } from 'react-router-dom';
import { DashboardPage } from './pages/DashboardPage';
import { OcrLabPage } from './pages/OcrLabPage';
import { SmartGalleryPage } from './pages/SmartGalleryPage';
import { ObjectDetectionPage } from './pages/ObjectDetectionPage';
import { MediaTranscriberPage } from './pages/MediaTranscriberPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ProfilePage } from './pages/ProfilePage';
import { HistoryPage } from './pages/HistoryPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { PrivateRoute } from './components/PrivateRoute';
import { GuestRoute } from './components/GuestRoute';
import { RouteHistoryLogger } from './components/RouteHistoryLogger';
import { useAuth } from './hooks/useAuth';

type NavIconKind =
  | 'home'
  | 'document'
  | 'gallery'
  | 'target'
  | 'mic'
  | 'user'
  | 'clock'
  | 'star';

/**
 * Рендерить SVG іконку для навігаційного меню.
 *
 * @param root0 - Пропси.
 * @param root0.kind - Тип піктограми.
 * @returns SVG-елемент.
 */
function NavIcon({ kind }: { kind: NavIconKind }) {
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

  if (kind === 'mic') {
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

  if (kind === 'user') {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <circle cx="12" cy="9" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M6 19.5c0-3.3 2.7-6 6-6s6 2.7 6 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (kind === 'clock') {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 8v4l3 2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (kind === 'star') {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          d="M12 4.2l1.8 4.5 4.9.4-3.8 3.2 1.2 4.8L12 14.9 7.9 17l1.2-4.8-3.8-3.2 4.9-.4L12 4.2z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M4 11.5L12 4.5l8 7V20h-5v-5.5H9V20H4v-8.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Верхня панель з брендом та кнопками входу / виходу.
 *
 * @returns Елемент хедера.
 */
function AppHeaderBar() {
  const { user, signOut, loading } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch {
      /* ignore */
    }
  };

  return (
    <header className="app-header">
      <span className="app-header-brand">Media Insight Hub</span>
      <div className="app-header-actions">
        {loading ? (
          <span className="app-header-user">…</span>
        ) : user ? (
          <>
            <span className="app-header-user" title={user.email ?? ''}>
              {user.displayName?.trim() || user.email || 'Користувач'}
            </span>
            <button type="button" className="app-header-btn" onClick={() => void handleSignOut()}>
              Вийти
            </button>
          </>
        ) : (
          <>
            <NavLink to="/login" className="app-header-btn app-header-btn--primary">
              Увійти
            </NavLink>
            <NavLink to="/register" className="app-header-btn">
              Реєстрація
            </NavLink>
          </>
        )}
      </div>
    </header>
  );
}

/**
 * Основний макет: бічна навігація, хедер і вкладені маршрути.
 *
 * @returns Кореневий елемент з `<Outlet />`.
 */
function MainLayout() {
  const { user } = useAuth();

  return (
    <div className="app-root">
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-mark">AI</div>
          <div>
            <div className="logo-text-main">Transparency</div>
            <div className="logo-text-sub">Media Lab</div>
          </div>
        </div>
        <nav className="nav">
          <div className="nav-section-label">Modules</div>
          <NavLink to="/dashboard" className="nav-link">
            <span className="nav-link-icon" aria-hidden="true">
              <NavIcon kind="home" />
            </span>
            Dashboard
          </NavLink>
          <NavLink to="/ocr" className="nav-link">
            <span className="nav-link-icon" aria-hidden="true">
              <NavIcon kind="document" />
            </span>
            OCR
          </NavLink>
          <NavLink to="/gallery" className="nav-link">
            <span className="nav-link-icon" aria-hidden="true">
              <NavIcon kind="gallery" />
            </span>
            Smart Gallery
          </NavLink>
          <NavLink to="/detection" className="nav-link">
            <span className="nav-link-icon" aria-hidden="true">
              <NavIcon kind="target" />
            </span>
            Object Detection
          </NavLink>
          <NavLink to="/transcriber" className="nav-link">
            <span className="nav-link-icon" aria-hidden="true">
              <NavIcon kind="mic" />
            </span>
            Media Transcriber
          </NavLink>
          {user ? (
            <>
              <div className="nav-section-label" style={{ marginTop: '0.75rem' }}>
                Акаунт
              </div>
              <NavLink to="/profile" className="nav-link">
                <span className="nav-link-icon" aria-hidden="true">
                  <NavIcon kind="user" />
                </span>
                Профіль
              </NavLink>
              <NavLink to="/history" className="nav-link">
                <span className="nav-link-icon" aria-hidden="true">
                  <NavIcon kind="clock" />
                </span>
                Історія
              </NavLink>
              <NavLink to="/favorites" className="nav-link">
                <span className="nav-link-icon" aria-hidden="true">
                  <NavIcon kind="star" />
                </span>
                Обране
              </NavLink>
            </>
          ) : null}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-footer-line">
            <span className="sidebar-footer-dot" />
            <span>All processing runs on-device</span>
          </div>
          <div className="sidebar-footer-models">Tesseract · TF.js · COCO-SSD</div>
        </div>
      </aside>
      <main className="main">
        <RouteHistoryLogger />
        <AppHeaderBar />
        <section className="content">
          <Outlet />
        </section>
      </main>
    </div>
  );
}

/**
 * Кореневий компонент застосунку з маршрутизацією та авторизацією.
 *
 * @returns Дерево маршрутів React Router.
 */
export function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <GuestRoute>
            <LoginPage />
          </GuestRoute>
        }
      />
      <Route
        path="/register"
        element={
          <GuestRoute>
            <RegisterPage />
          </GuestRoute>
        }
      />
      <Route element={<MainLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/ocr" element={<OcrLabPage />} />
        <Route path="/gallery" element={<SmartGalleryPage />} />
        <Route path="/detection" element={<ObjectDetectionPage />} />
        <Route path="/transcriber" element={<MediaTranscriberPage />} />
        <Route
          path="/profile"
          element={
            <PrivateRoute>
              <ProfilePage />
            </PrivateRoute>
          }
        />
        <Route
          path="/history"
          element={
            <PrivateRoute>
              <HistoryPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/favorites"
          element={
            <PrivateRoute>
              <FavoritesPage />
            </PrivateRoute>
          }
        />
      </Route>
    </Routes>
  );
}
