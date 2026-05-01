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
  const m = label.match(/(\d+)\s*(?:слів|words)/i);
  if (m) return Number(m[1]);
  return null;
}

export type ArchiveCardStats = {
  /** Лівий верхній бейдж (тип медіа). */
  leftBadge: string;
  /** Правий верхній бейдж (категорія / тон). */
  rightBadge: string;
  /** Лічильник «об'єктів». */
  objects: number;
  /** Лічильник «ключових слів» (слова). */
  keywords: number;
};

/**
 * Ім'я файлу для відображення (стиль архіву).
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
  let rightBadge = 'NEUTRAL';
  let leftBadge = 'FILE';

  if (row.kind === 'page_view') {
    leftBadge = 'EVENT';
    rightBadge = 'NEUTRAL';
    return { leftBadge, rightBadge, objects: 0, keywords: 0 };
  }

  if (row.resumePayload) {
    try {
      const o = JSON.parse(row.resumePayload) as Record<string, unknown>;
      const mod = o.module;
      if (mod === 'detection') {
        leftBadge = 'IMAGE';
        rightBadge = 'NEUTRAL';
        if (o.mode === 'batch') {
          const meta = o.batchMeta as { batchCount?: unknown } | undefined;
          if (typeof meta?.batchCount === 'number' && Number.isFinite(meta.batchCount)) {
            objects = Math.max(0, Math.floor(meta.batchCount));
          } else if (Array.isArray(o.items)) {
            objects = o.items.length;
          } else {
            objects = 0;
          }
        } else if (Array.isArray(o.detections)) {
          objects = o.detections.length;
        } else if (Array.isArray(o.items)) {
          objects = o.items.reduce((sum, item) => {
            if (!item || typeof item !== 'object') return sum;
            const dets = (item as { detections?: unknown }).detections;
            return sum + (Array.isArray(dets) ? dets.length : 0);
          }, 0);
        } else if (o.sessionTotals && typeof o.sessionTotals === 'object') {
          objects = Object.values(o.sessionTotals as Record<string, number>)
            .reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
        }
        return { leftBadge, rightBadge, objects, keywords: 0 };
      }
      if (mod === 'ocr' && typeof o.text === 'string') {
        keywords = wordCount(o.text);
        leftBadge = 'IMAGE';
        rightBadge = 'NEUTRAL';
        return { leftBadge, rightBadge, objects: 0, keywords };
      }
      if (mod === 'gallery' && Array.isArray(o.items)) {
        objects = o.items.length;
        leftBadge = 'IMAGE';
        rightBadge = 'NEUTRAL';
        return { leftBadge, rightBadge, objects, keywords: 0 };
      }
      if (mod === 'transcriber' && typeof o.text === 'string') {
        keywords = wordCount(o.text);
        leftBadge = 'TEXT';
        rightBadge = 'NEUTRAL';
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
    rightBadge = 'NEUTRAL';
    return { leftBadge, rightBadge, objects: 0, keywords };
  }
  if (path.includes('detection')) {
    leftBadge = 'IMAGE';
    const m = row.label.match(/(\d+)\s*(?:об|objects)/i);
    objects = m ? Number(m[1]) : 0;
    rightBadge = 'NEUTRAL';
    return { leftBadge, rightBadge, objects, keywords: 0 };
  }
  if (path.includes('gallery')) {
    leftBadge = 'IMAGE';
    const m = row.label.match(/(\d+)/);
    objects = m ? Number(m[1]) : 0;
    rightBadge = 'NEUTRAL';
    return { leftBadge, rightBadge, objects, keywords: 0 };
  }
  if (path.includes('transcriber')) {
    leftBadge = 'TEXT';
    keywords = fromLabel ?? 0;
    rightBadge = 'NEUTRAL';
    return { leftBadge, rightBadge, objects: 0, keywords };
  }

  return { leftBadge, rightBadge, objects, keywords };
}
