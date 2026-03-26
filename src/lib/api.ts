/** Ключ localStorage для JWT. */
export const AUTH_TOKEN_KEY = 'mih_auth_token';

/**
 * Базовий URL API.
 *
 * У режимі `vite` (`import.meta.env.DEV`) завжди порожньо — запити йдуть на той самий origin,
 * щоб спрацював проксі `/api` → `127.0.0.1:4000`. Інакше типова помилка: у `.env` вказано
 * `VITE_API_URL` на інший/застарілий бекенд без потрібних маршрутів — історія «не зберігається».
 *
 * У production збірці використовується `VITE_API_URL`, якщо задано.
 *
 * @returns Префікс URL або порожній рядок.
 */
export function getApiBase(): string {
  if (import.meta.env.DEV) {
    return '';
  }
  const v = import.meta.env.VITE_API_URL;
  return typeof v === 'string' ? v.replace(/\/$/, '') : '';
}

/**
 * Читає JWT з `localStorage`.
 *
 * @returns Токен або `null`.
 */
export function getToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Зберігає JWT у `localStorage`.
 *
 * @param token - Рядок токена.
 */
export function setToken(token: string): void {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

/** Видаляє JWT зі сховища. */
export function clearToken(): void {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** Помилка від API з HTTP-статусом, кодом і (за наявності) ідентифікаторами для підтримки. */
export class ApiError extends Error {
  /** Ідентифікатор запиту на сервері (трасування). */
  public readonly requestId?: string;
  /** Унікальний ідентифікатор інциденту в логах. */
  public readonly errorId?: string;

  constructor(
    public status: number,
    public code: string,
    message: string,
    opts?: { requestId?: string; errorId?: string }
  ) {
    super(message);
    this.name = 'ApiError';
    this.requestId = opts?.requestId;
    this.errorId = opts?.errorId;
  }
}

/**
 * Рядок для користувача з кодами звернення (без технічних деталей стеку).
 *
 * @param err - Помилка API.
 * @returns Текст або `null`, якщо немає ідентифікаторів.
 */
export function supportRefLine(err: ApiError): string | null {
  if (!err.errorId && !err.requestId) {
    return null;
  }
  const parts: string[] = [];
  if (err.errorId) {
    parts.push(`інцидент: ${err.errorId}`);
  }
  if (err.requestId) {
    parts.push(`запит: ${err.requestId}`);
  }
  return `Код для підтримки: ${parts.join('; ')}.`;
}

/**
 * Повний URL шляху API з урахуванням `VITE_API_URL` у production.
 *
 * @param path - Шлях, наприклад `/api/health`.
 * @returns Абсолютний або відносний URL.
 */
export function apiUrl(path: string): string {
  const base = getApiBase();
  return path.startsWith('http') ? path : `${base}${path}`;
}

/**
 * HTTP-запит до API з підстановкою Bearer-токена.
 *
 * @param path - Шлях, наприклад `/api/auth/login`.
 * @param init - Параметри `fetch`.
 * @returns Відповідь `fetch`.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (init?.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const base = getApiBase();
  const url = path.startsWith('http') ? path : `${base}${path}`;
  return fetch(url, { ...init, headers });
}

type JsonErrorBody = { error?: string; code?: string; requestId?: string; errorId?: string };

/**
 * Виконує запит і парсить JSON; при помилці HTTP кидає `ApiError`.
 *
 * @param path - Шлях API.
 * @param init - Параметри `fetch`.
 * @returns Розпарсений JSON успішної відповіді.
 */
export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  const headerRid = res.headers.get('X-Request-Id')?.trim() || undefined;
  const data = (await res.json().catch(() => ({}))) as T & JsonErrorBody;
  if (!res.ok) {
    const msg = typeof data.error === 'string' ? data.error : 'Помилка запиту';
    const code = typeof data.code === 'string' ? data.code : 'UNKNOWN';
    const bodyRid = typeof data.requestId === 'string' ? data.requestId : undefined;
    const errorId = typeof data.errorId === 'string' ? data.errorId : undefined;
    throw new ApiError(res.status, code, msg, {
      requestId: bodyRid || headerRid,
      errorId
    });
  }
  return data as T;
}
