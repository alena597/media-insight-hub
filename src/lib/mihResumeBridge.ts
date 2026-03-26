import type { MihResume } from './mihResume';

const STORAGE_KEY = 'mih_resume_bridge_v1';

/**
 * Зберігає стан відновлення в sessionStorage перед переходом (запас, якщо location.state загубиться).
 *
 * @param path - Маршрут модуля.
 * @param resume - Об’єкт MihResume.
 */
export function stashResumeForPath(path: string, resume: MihResume): void {
  try {
    const payload: { path: string; resume: MihResume } = { path, resume };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / приватний режим */
  }
}

/**
 * Знімає збережений стан для маршруту (один раз після читання).
 *
 * @param path - Очікуваний path.
 * @returns MihResume або null.
 */
export function consumeResumeForPath(path: string): MihResume | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as { path: string; resume: MihResume };
    if (o.path !== path || !o.resume) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    return o.resume;
  } catch {
    return null;
  }
}

/**
 * Читає стан без видалення (якщо потрібно злити з location.state).
 *
 * @param path - Маршрут.
 * @returns MihResume або null, якщо запису немає або path не збігається.
 */
export function peekResumeForPath(path: string): MihResume | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as { path: string; resume: MihResume };
    if (o.path !== path || !o.resume) return null;
    return o.resume;
  } catch {
    return null;
  }
}
