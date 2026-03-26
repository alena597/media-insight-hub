/**
 * Прев’ю карток історії/обраного: градієнт за маршрутом (без canvas) + витяг кадру з resume JSON.
 */

const PALETTES: Record<string, [string, string]> = {
  '/ocr': ['#0e7490', '#155e75'],
  '/gallery': ['#6d28d9', '#4c1d95'],
  '/detection': ['#059669', '#047857'],
  '/transcriber': ['#d97706', '#b45309'],
  '/dashboard': ['#334155', '#1e293b'],
  '/profile': ['#475569', '#334155'],
  '/history': ['#1d4ed8', '#1e3a8a'],
  '/favorites': ['#a855f7', '#6b21a8']
};

/**
 * SVG data URL — завжди валідний рядок (canvas інколи повертає порожньо в обмежених середовищах).
 *
 * @param path - Маршрут модуля.
 * @returns data:image/svg+xml URL.
 */
export function gradientDataUrlForModulePath(path: string): string {
  const [a, b] = PALETTES[path] ?? ['#334155', '#1e293b'];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${a}"/><stop offset="100%" stop-color="${b}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
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
