/** Стан відновлення для детекції (image mode). */
export type MihResumeDetection = {
  v: 1;
  module: 'detection';
  mode: 'image';
  imageDataUrl: string;
  detections: Array<{
    bbox: [number, number, number, number];
    class: string;
    score: number;
  }>;
};

export type MihResumeOcr = {
  v: 1;
  module: 'ocr';
  lang: string;
  imageDataUrl: string;
  text: string;
  blocks: Array<{
    text: string;
    bbox: { x0: number; y0: number; x1: number; y1: number };
    confidence: number;
  }>;
  imageSize: { width: number; height: number };
};

export type MihResumeGalleryItem = {
  id: string;
  fileName: string;
  imageDataUrl: string;
  category: string;
  predictions: Array<{ className: string; probability: number }>;
};

export type MihResumeGallery = {
  v: 1;
  module: 'gallery';
  items: MihResumeGalleryItem[];
};

export type MihResumeTranscriber = {
  v: 1;
  module: 'transcriber';
  text: string;
};

export type MihResume = MihResumeDetection | MihResumeOcr | MihResumeGallery | MihResumeTranscriber;

/**
 * Перевіряє, чи значення схоже на збережений стан відновлення.
 *
 * @param x - Довільне значення.
 * @returns true, якщо це валідний MihResume.
 */
export function isMihResume(x: unknown): x is MihResume {
  return typeof x === 'object' && x !== null && (x as { v?: number }).v === 1 && typeof (x as { module?: string }).module === 'string';
}

/**
 * Відновлює масив детекцій для TF-моделі з серіалізованих даних.
 *
 * @param parts - Збережені bbox та класи.
 * @returns Масив об’єктів детекції.
 */
export function detectionsFromResume(parts: MihResumeDetection['detections']) {
  return parts.map((p) => ({
    bbox: p.bbox,
    class: p.class,
    score: p.score
  }));
}
