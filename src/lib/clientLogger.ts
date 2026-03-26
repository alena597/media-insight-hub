import { apiUrl } from './api';

/**
 * Надсилає діагностичну подію на бекенд (`POST /api/client-log`) для збору в загальних логах.
 * Виклики без await — помилки мережі ігноруються, щоб не зациклювати збої.
 *
 * @param level - Рівень події.
 * @param message - Короткий опис.
 * @param context - Додатковий контекст (без великих blob/base64).
 */
export function sendClientLog(
  level: 'error' | 'warn' | 'info',
  message: string,
  context?: Record<string, unknown>
): void {
  if (typeof window === 'undefined') {
    return;
  }
  const payload = {
    level,
    message: message.slice(0, 2000),
    context,
    url: window.location.href
  };
  void fetch(apiUrl('/api/client-log'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(() => {
    /* ignore */
  });
}

let globalHandlersInstalled = false;

/**
 * Реєструє глобальні обробники `error` та `unhandledrejection` (один раз).
 */
export function initGlobalClientLogging(): void {
  if (globalHandlersInstalled || typeof window === 'undefined') {
    return;
  }
  globalHandlersInstalled = true;

  window.addEventListener('error', (ev) => {
    sendClientLog('error', ev.message || 'window.onerror', {
      filename: ev.filename,
      lineno: ev.lineno,
      colno: ev.colno,
      error: ev.error instanceof Error ? ev.error.stack?.slice(0, 3000) : undefined
    });
  });

  window.addEventListener('unhandledrejection', (ev) => {
    const r = ev.reason;
    const msg = r instanceof Error ? r.message : String(r);
    sendClientLog('error', `unhandledrejection: ${msg}`, {
      stack: r instanceof Error ? r.stack?.slice(0, 3000) : undefined
    });
  });
}
