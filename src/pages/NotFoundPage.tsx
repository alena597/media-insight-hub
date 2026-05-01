import { NavLink } from 'react-router-dom';

/**
 * Клієнтська сторінка 404: зрозуміле повідомлення та дії без технічних деталей.
 *
 * @returns Елемент сторінки.
 */
export function NotFoundPage() {
  return (
    <div className="dash-header" style={{ maxWidth: '40rem' }}>
      <h2>Page not found</h2>
      <p className="dash-header-lead">
        The address may have changed or contains a typo. Check the link or go back to the module
        dashboard.
      </p>
      <ul className="error-page-muted" style={{ margin: "1rem 0 1.25rem", paddingLeft: "1.2rem" }}>
        <li>Go to the main dashboard and select the module you need from the left menu.</li>
        <li>If you followed an external link, let the sender know the URL is incorrect.</li>
        <li>If the problem persists, use the feedback form.</li>
      </ul>
      <div className="error-page-actions-row">
        <NavLink to="/dashboard" className="error-page-link error-page-link--primary">
          Go to Dashboard
        </NavLink>
        <NavLink to="/report" className="error-page-link">
          Report a problem
        </NavLink>
      </div>
    </div>
  );
}
