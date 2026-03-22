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
