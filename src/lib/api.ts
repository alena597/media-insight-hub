/** Ключ localStorage для JWT. */
export const AUTH_TOKEN_KEY = 'mih_auth_token';

/**
 * Базовий URL API (порожньо = відносні шляхи `/api`, зручно з Vite proxy).
 *
 * @returns Префікс URL або порожній рядок.
 */
export function getApiBase(): string {
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

/** Помилка від API з HTTP-статусом і кодом з тіла відповіді. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
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

type JsonErrorBody = { error?: string; code?: string };

/**
 * Виконує запит і парсить JSON; при помилці HTTP кидає `ApiError`.
 *
 * @param path - Шлях API.
 * @param init - Параметри `fetch`.
 * @returns Розпарсений JSON успішної відповіді.
 */
export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  const data = (await res.json().catch(() => ({}))) as T & JsonErrorBody;
  if (!res.ok) {
    const msg = typeof data.error === 'string' ? data.error : 'Помилка запиту';
    const code = typeof data.code === 'string' ? data.code : 'UNKNOWN';
    throw new ApiError(res.status, code, msg);
  }
  return data as T;
}
