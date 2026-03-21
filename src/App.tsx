import { NavLink, Route, Routes, Navigate } from 'react-router-dom';
import { DashboardPage } from './pages/DashboardPage';
import { OcrLabPage } from './pages/OcrLabPage';
import { SmartGalleryPage } from './pages/SmartGalleryPage';
import { ObjectDetectionPage } from './pages/ObjectDetectionPage';
import { MediaTranscriberPage } from './pages/MediaTranscriberPage';

type NavIconKind = 'home' | 'document' | 'gallery' | 'target' | 'mic';


/**
 * Рендерить SVG іконку для навігаційного меню.
 *
 * @description
 * Компонент повертає відповідну SVG іконку залежно від типу.
 * Використовується у бічній панелі навігації для візуального
 * позначення кожного модуля системи.
 *
 * @param {object} props - Пропси компонента
 * @param {NavIconKind} props.kind - Тип іконки
 * @returns {JSX.Element} SVG іконка
 *
 * @example
 * <NavIcon kind="home" />
 * <NavIcon kind="document" />
 */
function NavIcon({ kind }: { kind: NavIconKind }) {
  if (kind === 'document') {
    return (
      <svg viewBox='0 0 24 24' width='18' height='18' aria-hidden='true'>
        <path
          d='M7 3.5h6.5L18 8v12.5H7V3.5z'
          fill='none'
          stroke='currentColor'
          strokeWidth='1.5'
          strokeLinecap='round'
          strokeLinejoin='round'
        />
        <path
          d='M13.5 3.5V8H18'
          fill='none'
          stroke='currentColor'
          strokeWidth='1.5'
          strokeLinecap='round'
          strokeLinejoin='round'
        />
        <path
          d='M9.5 11.5h5M9.5 14.5h3.5'
          fill='none'
          stroke='currentColor'
          strokeWidth='1.4'
          strokeLinecap='round'
        />
      </svg>
    );
  }

  if (kind === 'gallery') {
    return (
      <svg viewBox='0 0 24 24' width='18' height='18' aria-hidden='true'>
        <rect
          x='4'
          y='5'
          width='16'
          height='14'
          rx='2.2'
          ry='2.2'
          fill='none'
          stroke='currentColor'
          strokeWidth='1.5'
        />
        <circle cx='9' cy='10' r='1.4' fill='none' stroke='currentColor' strokeWidth='1.4' />
        <path
          d='M7 16.2l3.2-3.1a1 1 0 0 1 1.4 0l2 2 1.1-1.1a1 1 0 0 1 1.4 0L18 15.4'
          fill='none'
          stroke='currentColor'
          strokeWidth='1.5'
          strokeLinecap='round'
          strokeLinejoin='round'
        />
      </svg>
    );
  }

  if (kind === 'target') {
    return (
      <svg viewBox='0 0 24 24' width='18' height='18' aria-hidden='true'>
        <circle cx='12' cy='12' r='5.5' fill='none' stroke='currentColor' strokeWidth='1.5' />
        <circle cx='12' cy='12' r='2' fill='currentColor' />
        <path
          d='M12 4V2.5M20 12h1.5M12 20v1.5M4 12H2.5'
          fill='none'
          stroke='currentColor'
          strokeWidth='1.5'
          strokeLinecap='round'
        />
      </svg>
    );
  }

  if (kind === 'mic') {
    return (
      <svg viewBox='0 0 24 24' width='18' height='18' aria-hidden='true'>
        <path
          d='M8.5 6.5a3.5 3.5 0 1 1 7 0v1.6a7.5 7.5 0 1 1-7 0V6.5z'
          fill='none'
          stroke='currentColor'
          strokeWidth='1.5'
          strokeLinecap='round'
          strokeLinejoin='round'
        />
        <path d='M12 3.5v10' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' />
      </svg>
    );
  }

  // home (dashboard)
  return (
    <svg viewBox='0 0 24 24' width='18' height='18' aria-hidden='true'>
      <path
        d='M4 11.5L12 4.5l8 7V20h-5v-5.5H9V20H4v-8.5z'
        fill='none'
        stroke='currentColor'
        strokeWidth='1.5'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  );
}

/**
 * Кореневий компонент застосунку.
 *
 * @description
 * Визначає загальну структуру застосунку — бічна панель навігації
 * та основна область контенту з маршрутизацією між чотирма
 * AI-модулями: OCR, Smart Gallery, Object Detection, Media Transcriber.
 *
 * Архітектурне рішення: SPA з клієнтською маршрутизацією через
 * React Router. Всі AI-моделі завантажуються на стороні клієнта.
 *
 * @returns {JSX.Element} Кореневий елемент застосунку
 */
export function App() {
  return (
    <div className='app-root'>
      <aside className='sidebar'>
        <div className='logo'>
          <div className='logo-mark'>AI</div>
          <div>
            <div className='logo-text-main'>Transparency</div>
            <div className='logo-text-sub'>Media Lab</div>
          </div>
        </div>
        <nav className='nav'>
          <div className='nav-section-label'>Modules</div>
          <NavLink to='/dashboard' className='nav-link'>
            <span className='nav-link-icon' aria-hidden='true'>
              <NavIcon kind='home' />
            </span>
            Dashboard
          </NavLink>
          <NavLink to='/ocr' className='nav-link'>
            <span className='nav-link-icon' aria-hidden='true'>
              <NavIcon kind='document' />
            </span>
            OCR
          </NavLink>
          <NavLink to='/gallery' className='nav-link'>
            <span className='nav-link-icon' aria-hidden='true'>
              <NavIcon kind='gallery' />
            </span>
            Smart Gallery
          </NavLink>
          <NavLink to='/detection' className='nav-link'>
            <span className='nav-link-icon' aria-hidden='true'>
              <NavIcon kind='target' />
            </span>
            Object Detection
          </NavLink>
          <NavLink to='/transcriber' className='nav-link'>
            <span className='nav-link-icon' aria-hidden='true'>
              <NavIcon kind='mic' />
            </span>
            Media Transcriber
          </NavLink>
        </nav>
        <div className='sidebar-footer'>
          <div className='sidebar-footer-line'>
            <span className='sidebar-footer-dot' />
            <span>All processing runs on-device</span>
          </div>
          <div className='sidebar-footer-models'>Tesseract · TF.js · COCO-SSD</div>
        </div>
      </aside>
      <main className='main'>
        <section className='content'>
          <Routes>
            <Route path='/' element={<Navigate to='/dashboard' replace />} />
            <Route path='/dashboard' element={<DashboardPage />} />
            <Route path='/ocr' element={<OcrLabPage />} />
            <Route path='/gallery' element={<SmartGalleryPage />} />
            <Route path='/detection' element={<ObjectDetectionPage />} />
            <Route path='/transcriber' element={<MediaTranscriberPage />} />
          </Routes>
        </section>
      </main>
    </div>
  );
}