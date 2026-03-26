import { NavLink } from 'react-router-dom';

/**
 * Клієнтська сторінка 404: зрозуміле повідомлення та дії без технічних деталей.
 *
 * @returns Елемент сторінки.
 */
export function NotFoundPage() {
  return (
    <div className="dash-header" style={{ maxWidth: '40rem' }}>
      <h2>Сторінку не знайдено</h2>
      <p className="dash-header-lead">
        Адреса могла змінитися або містить друкарську помилку. Перевірте посилання або поверніться до
        панелі модулів.
      </p>
      <ul className="error-page-muted" style={{ margin: '1rem 0 1.25rem', paddingLeft: '1.2rem' }}>
        <li>Перейдіть на головну панель і оберіть потрібний модуль у меню зліва.</li>
        <li>Якщо ви перейшли з зовнішнього посилання — повідомте відправника про некоректну URL.</li>
        <li>Якщо проблема повторюється, скористайтеся формою зворотного зв’язку.</li>
      </ul>
      <div className="error-page-actions-row">
        <NavLink to="/dashboard" className="error-page-link error-page-link--primary">
          На головну панель
        </NavLink>
        <NavLink to="/report" className="error-page-link">
          Повідомити про проблему
        </NavLink>
      </div>
    </div>
  );
}
