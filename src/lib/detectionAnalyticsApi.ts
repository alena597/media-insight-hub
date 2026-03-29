import { apiUrl } from './api';

/**
 * Надсилає агреговані підрахунки детекції на сервер (не блокує UI).
 *
 * @param classCounts - Кількість екземплярів на клас.
 * @param totalDetections - Загальна кількість bbox.
 * @param source - Короткий ідентифікатор джерела події.
 */
export function postDetectionAnalytics(
  classCounts: Record<string, number>,
  totalDetections: number,
  source = 'object-detection'
): void {
  void fetch(apiUrl('/api/analytics/detection'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ classCounts, totalDetections, source })
  }).catch(() => {
    /* ignore */
  });
}
