import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { addHistoryEntry } from '../lib/userDataApi';
import { labelForPath } from '../lib/routeLabels';

/**
 * Записує перегляд сторінки на бекенд (лише для авторизованого користувача).
 * Пропускає `/login` та `/register`.
 *
 * @returns null.
 */
export function RouteHistoryLogger() {
  const { user, authReady } = useAuth();
  const location = useLocation();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!authReady || !user) return;
    const path = location.pathname;
    const SKIP = new Set([
      '/login', '/register', '/forgot-password', '/reset-password',
      '/dashboard', '/ocr', '/gallery', '/detection', '/transcriber',
      '/history', '/favorites', '/profile',
    ]);
    if (SKIP.has(path)) {
      lastPath.current = path;
      return;
    }
    if (lastPath.current === path) return;
    lastPath.current = path;

    const label = labelForPath(path);
    void addHistoryEntry({ kind: 'page_view', label, path }).catch(() => {
      /* ignore network */
    });
  }, [user, authReady, location.pathname]);

  return null;
}
