import { getUserIdFromToken } from './jwtUser';
import { isMihResume, type MihResume } from './mihResume';

const PREFIX = 'mih_last_workbench_v1:';

/**
 * Ключ localStorage для шляху модуля.
 *
 * @param path - Маршрут.
 * @returns Ключ або null без користувача.
 */
function storageKey(path: string): string | null {
  const uid = getUserIdFromToken();
  if (!uid) return null;
  return PREFIX + uid + ':' + path;
}

/**
 * Зберігає останній успішний стан модуля (для «Продовжити» з обраного без resume на сервері).
 *
 * @param path - Маршрут, наприклад `/detection`.
 * @param resumeJson - Серіалізований MihResume.
 */
export function saveLastWorkbenchResume(path: string, resumeJson: string): void {
  const k = storageKey(path);
  if (!k) return;
  try {
    if (resumeJson.length > 2_000_000) return;
    localStorage.setItem(k, resumeJson);
  } catch {
    /* quota / приватний режим */
  }
}

/**
 * Читає останній збережений стан для маршруту.
 *
 * @param path - Шлях модуля.
 * @returns MihResume або null.
 */
export function loadLastWorkbenchResume(path: string): MihResume | null {
  const k = storageKey(path);
  if (!k) return null;
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return null;
    const o = JSON.parse(raw) as unknown;
    return isMihResume(o) ? o : null;
  } catch {
    return null;
  }
}

/**
 * Видаляє всі збережені останні сесії користувача (після очищення історії).
 */
export function clearLastWorkbenchForCurrentUser(): void {
  const uid = getUserIdFromToken();
  if (!uid) return;
  const needle = PREFIX + uid + ':';
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(needle)) localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}
