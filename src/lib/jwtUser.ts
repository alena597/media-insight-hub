import { getToken } from './api';

/**
 * Дістає `sub` (id користувача) з JWT без перевірки підпису (лише для клієнтського кешу).
 *
 * @returns userId або null.
 */
export function getUserIdFromToken(): string | null {
  const t = getToken();
  if (!t) return null;
  const parts = t.split('.');
  if (parts.length < 2) return null;
  try {
    const payloadB64 = parts[1];
    const pad = payloadB64.length % 4 === 0 ? '' : '='.repeat(4 - (payloadB64.length % 4));
    const json = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/') + pad);
    const payload = JSON.parse(json) as { sub?: unknown };
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}
