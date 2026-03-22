import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

type Props = {
  children: React.ReactNode;
};

/**
 * Захищає маршрут: неавторизованих перенаправляє на сторінку входу.
 *
 * @param root0 - Пропси.
 * @param root0.children - Вкладений контент.
 * @returns Дочірній вузол або `<Navigate />`.
 */
export function PrivateRoute({ children }: Props) {
  const { user, loading, authReady, configMessage } = useAuth();
  const location = useLocation();

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

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
