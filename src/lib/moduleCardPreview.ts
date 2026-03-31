/**
 * Прев’ю карток історії/обраного: градієнт за маршрутом (без canvas) + витяг кадру з resume JSON.
 */

const PALETTES: Record<string, [string, string, string]> = {
  '/ocr':         ['#06b6d4', '#6366f1', '#0ea5e9'],
  '/gallery':     ['#a855f7', '#ec4899', '#8b5cf6'],
  '/detection':   ['#10b981', '#06b6d4', '#3b82f6'],
  '/transcriber': ['#f59e0b', '#ef4444', '#f97316'],
  '/dashboard':   ['#475569', '#6366f1', '#334155'],
  '/profile':     ['#64748b', '#475569', '#94a3b8'],
  '/history':     ['#3b82f6', '#6366f1', '#1d4ed8'],
  '/favorites':   ['#ec4899', '#a855f7', '#f43f5e']
};

/**
 * SVG data URL — завжди валідний рядок (canvas інколи повертає порожньо в обмежених середовищах).
 *
 * @param path - Маршрут модуля.
 * @returns data:image/svg+xml URL.
 */
export function gradientDataUrlForModulePath(path: string): string {
  const [a, b, c] = PALETTES[path] ?? ['#334155', '#1e293b', '#475569'];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${a}"/><stop offset="50%" stop-color="${b}"/><stop offset="100%" stop-color="${c}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Дістає data URL зображення з JSON відновлення (OCR / детекція / перший кадр галереї).
 *
 * @param resumePayload - Рядок JSON.
 * @returns data URL або null.
 */
export function extractImageDataUrlFromResumePayload(resumePayload?: string): string | null {
  if (!resumePayload) return null;
  try {
    const o = JSON.parse(resumePayload) as Record<string, unknown>;
    const mod = o.module;
    if (typeof o.imageDataUrl === 'string' && o.imageDataUrl.startsWith('data:')) {
      return o.imageDataUrl;
    }
    if (mod === 'gallery' && Array.isArray(o.items) && o.items.length > 0) {
      const first = o.items[0] as Record<string, unknown>;
      if (typeof first.imageDataUrl === 'string' && first.imageDataUrl.startsWith('data:')) {
        return first.imageDataUrl;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Підбирає URL для зображення на картці: збережене прев’ю → кадр з resume → градієнт модуля.
 *
 * @param row - Запис з API або локальної черги.
 * @param row.path - Маршрут модуля.
 * @param row.previewImage - Data URL прев’ю.
 * @param row.resumePayload - JSON відновлення (може містити imageDataUrl).
 * @returns URL для атрибута `src` у `<img>`.
 */
export function getCardPreviewUrl(row: {
  path?: string;
  previewImage?: string;
  resumePayload?: string;
}): string {
  const p = row.previewImage?.trim();
  if (p && p.startsWith('data:')) return p;
  const fromResume = extractImageDataUrlFromResumePayload(row.resumePayload);
  if (fromResume) return fromResume;
  return gradientDataUrlForModulePath(row.path || '/dashboard');
}
