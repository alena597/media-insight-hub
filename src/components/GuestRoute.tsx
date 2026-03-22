import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

type Props = {
  children: React.ReactNode;
};

/**
 * Для сторінок входу/реєстрації: авторизованих перенаправляє на дашборд.
 *
 * @param root0 - Пропси.
 * @param root0.children - Вкладений контент.
 * @returns Дочірній вузол або `<Navigate />`.
 */
export function GuestRoute({ children }: Props) {
  const { user, loading, authReady, configMessage } = useAuth();

  if (!authReady) {
    return (
      <div className="auth-gate">
        <p className="auth-gate-text">{configMessage ?? 'Завантаження…'}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="auth-gate">
        <p className="auth-gate-text">Завантаження сесії…</p>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
