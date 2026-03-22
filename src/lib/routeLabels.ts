export const ROUTE_LABELS: Readonly<Record<string, string>> = {
  '/': 'Головна',
  '/dashboard': 'Dashboard',
  '/ocr': 'OCR',
  '/gallery': 'Smart Gallery',
  '/detection': 'Object Detection',
  '/transcriber': 'Media Transcriber',
  '/profile': 'Профіль',
  '/history': 'Історія',
  '/favorites': 'Обране',
  '/login': 'Вхід',
  '/register': 'Реєстрація'
};

/**
 * Повертає підпис для шляху або сам шлях, якщо підпису немає.
 *
 * @param pathname - Поточний `location.pathname`.
 * @returns Текст для показу в історії.
 */
export function labelForPath(pathname: string): string {
  return ROUTE_LABELS[pathname] ?? pathname;
}
