import type { ApiError } from './api';
import { supportRefLine } from './api';

/** Коди, для яких показуємо стандартні формулювання форм входу/реєстрації. */
const AUTH_FORM_ERROR_CODES = new Set([
  'INVALID_EMAIL',
  'WEAK_PASSWORD',
  'EMAIL_IN_USE',
  'INVALID_CREDENTIALS',
  'INVALID_INPUT',
  'UNAUTHORIZED',
  'INVALID_TOKEN',
  'USER_NOT_FOUND'
]);

/**
 * Текст помилки для форм логіну/реєстрації: зрозуміле повідомлення + коди для підтримки з API.
 *
 * @param err - Помилка з `apiJson`.
 * @returns Рядок для поля помилки форми.
 */
export function messageForAuthFormError(err: ApiError): string {
  const base = AUTH_FORM_ERROR_CODES.has(err.code) ? mapAuthError(err.code) : err.message;
  const hint = supportRefLine(err);
  return hint ? `${base}\n\n${hint}` : base;
}

/**
 * Перетворює код помилки API на зрозуміле повідомлення українською.
 *
 * @param code - Код з бекенду (`INVALID_CREDENTIALS`, `EMAIL_IN_USE` тощо).
 * @returns Текст для відображення користувачу.
 */
export function mapAuthError(code: string): string {
  switch (code) {
    case 'INVALID_EMAIL':
      return 'Некоректна адреса електронної пошти.';
    case 'WEAK_PASSWORD':
      return 'Пароль занадто слабкий (мінімум 6 символів).';
    case 'EMAIL_IN_USE':
      return 'Цей email уже зареєстровано.';
    case 'INVALID_CREDENTIALS':
      return 'Невірний email або пароль.';
    case 'INVALID_INPUT':
      return 'Перевірте введені дані.';
    case 'UNAUTHORIZED':
    case 'INVALID_TOKEN':
    case 'USER_NOT_FOUND':
      return 'Сесію завершено. Увійдіть знову.';
    default:
      return 'Помилка авторизації. Спробуйте ще раз.';
  }
}
