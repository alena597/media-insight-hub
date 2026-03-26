import type { HistoryEntry } from './userDataTypes';

/**
 * Кількість слів у рядку.
 *
 * @param text - Текст.
 * @returns Кількість.
 */
function wordCount(text: string): number {
  return text
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean).length;
}

/**
 * Парсить кількість слів з підпису на кшталт «OCR · 110 слів».
 *
 * @param label - Текст запису.
 * @returns Число або null.
 */
function wordsFromLabel(label: string): number | null {
  const m = label.match(/(\d+)\s*слів/i);
  if (m) return Number(m[1]);
  return null;
}

export type ArchiveCardStats = {
  /** Лівий верхній бейдж (тип медіа). */
  leftBadge: string;
  /** Правий верхній бейдж (категорія / тон). */
  rightBadge: string;
  /** Лічильник «об’єктів». */
  objects: number;
  /** Лічильник «ключових слів» (слова). */
  keywords: number;
};

/**
 * Ім’я файлу для відображення (стиль архіву).
 *
 * @param row - Запис історії.
 * @returns Рядок на кшталт `ANALYSIS.JPG`.
 */
export function archiveDisplayFileName(row: HistoryEntry): string {
  const raw = row.label
    .replace(/[·•]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Zа-яА-ЯіІїЇєЄґҐ0-9._-]/g, '')
    .slice(0, 42);
  const base = raw.length > 0 ? raw : 'FILE';
  const ext =
    row.path === '/transcriber'
      ? 'TXT'
      : row.path === '/ocr' || row.path === '/detection' || row.path === '/gallery'
        ? 'JPG'
        : 'DAT';
  return `${base}.${ext}`.toUpperCase();
}

/**
 * Лічильники та бейджі для картки архіву з урахуванням resume JSON.
 *
 * @param row - Запис історії.
 * @returns Статистика для UI.
 */
export function getArchiveCardStats(row: HistoryEntry): ArchiveCardStats {
  const path = row.path || '';
  let objects = 0;
  let keywords = 0;
  let rightBadge = 'НЕЙТРАЛЬНИЙ';
  let leftBadge = 'ФАЙЛ';

  if (row.kind === 'page_view') {
    leftBadge = 'ПОДІЯ';
    rightBadge = 'НЕЙТРАЛЬНИЙ';
    return { leftBadge, rightBadge, objects: 0, keywords: 0 };
  }

  if (row.resumePayload) {
    try {
      const o = JSON.parse(row.resumePayload) as Record<string, unknown>;
      const mod = o.module;
      if (mod === 'detection' && Array.isArray(o.detections)) {
        objects = o.detections.length;
        leftBadge = 'IMAGE';
        rightBadge = 'НЕЙТРАЛЬНИЙ';
        return { leftBadge, rightBadge, objects, keywords: 0 };
      }
      if (mod === 'ocr' && typeof o.text === 'string') {
        keywords = wordCount(o.text);
        leftBadge = 'IMAGE';
        rightBadge = 'НЕЙТРАЛЬНИЙ';
        return { leftBadge, rightBadge, objects: 0, keywords };
      }
      if (mod === 'gallery' && Array.isArray(o.items)) {
        objects = o.items.length;
        leftBadge = 'IMAGE';
        rightBadge = 'НЕЙТРАЛЬНИЙ';
        return { leftBadge, rightBadge, objects, keywords: 0 };
      }
      if (mod === 'transcriber' && typeof o.text === 'string') {
        keywords = wordCount(o.text);
        leftBadge = 'TEXT';
        rightBadge = 'НЕЙТРАЛЬНИЙ';
        return { leftBadge, rightBadge, objects: 0, keywords };
      }
    } catch {
      /* ignore */
    }
  }

  const fromLabel = wordsFromLabel(row.label);
  if (path.includes('ocr') || row.label.toLowerCase().includes('ocr')) {
    leftBadge = 'IMAGE';
    keywords = fromLabel ?? 0;
    rightBadge = 'НЕЙТРАЛЬНИЙ';
    return { leftBadge, rightBadge, objects: 0, keywords };
  }
  if (path.includes('detection')) {
    leftBadge = 'IMAGE';
    const m = row.label.match(/(\d+)\s*об/i);
    objects = m ? Number(m[1]) : 0;
    rightBadge = 'НЕЙТРАЛЬНИЙ';
    return { leftBadge, rightBadge, objects, keywords: 0 };
  }
  if (path.includes('gallery')) {
    leftBadge = 'IMAGE';
    const m = row.label.match(/(\d+)/);
    objects = m ? Number(m[1]) : 0;
    rightBadge = 'НЕЙТРАЛЬНИЙ';
    return { leftBadge, rightBadge, objects, keywords: 0 };
  }
  if (path.includes('transcriber')) {
    leftBadge = 'TEXT';
    keywords = fromLabel ?? 0;
    rightBadge = 'НЕЙТРАЛЬНИЙ';
    return { leftBadge, rightBadge, objects: 0, keywords };
  }

  return { leftBadge, rightBadge, objects, keywords };
}
