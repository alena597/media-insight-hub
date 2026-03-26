import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { sendClientLog } from '../lib/clientLogger';

type Props = { children: ReactNode };

type State = {
  hasError: boolean;
  clientIncidentId: string | null;
};

/**
 * Перехоплює необроблені помилки React, показує зрозуміле повідомлення та надсилає подію в лог сервера.
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, clientIncidentId: null };

  public static getDerivedStateFromError(): Partial<State> {
    return {
      hasError: true,
      clientIncidentId: crypto.randomUUID()
    };
  }

  public componentDidCatch(error: Error, info: ErrorInfo): void {
    const id = this.state.clientIncidentId;
    sendClientLog('error', error.message || 'react_error_boundary', {
      clientIncidentId: id,
      componentStack: info.componentStack?.slice(0, 2000),
      stack: error.stack?.slice(0, 4000)
    });
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      const ref = this.state.clientIncidentId;
      const reportTo = ref ? `/report?clientRef=${encodeURIComponent(ref)}` : '/report';
      return (
        <div className="auth-page">
          <div className="auth-card error-page-card error-page-card--wide">
            <h1 className="auth-title">Щось пішло не так</h1>
            <p className="auth-sub">
              Інтерфейс зупинився через неочікувану помилку. Ваші дані в браузері зазвичай у безпеці;
              спробуйте оновити сторінку або повернутися до панелі.
            </p>
            {ref ? (
              <p className="auth-banner" role="status">
                Код інциденту в браузері: <strong>{ref}</strong>
                <span className="error-page-muted" style={{ display: 'block', marginTop: '0.5rem' }}>
                  Вкажіть його у формі зворотного зв’язку — так простіше знайти запис у логах.
                </span>
              </p>
            ) : null}
            <div className="error-page-actions-row">
              <button type="button" className="auth-submit" onClick={() => window.location.reload()}>
                Оновити сторінку
              </button>
              <Link to="/dashboard" className="error-page-link">
                На панель
              </Link>
              <Link to={reportTo} className="error-page-link error-page-link--primary">
                Повідомити про проблему
              </Link>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
