import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../lib/api';
import { messageForAuthFormError } from '../lib/authErrors';

/**
 * Сторінка входу email/пароль через API.
 *
 * @returns Елемент сторінки логіну.
 */
export function LoginPage() {
  const { signIn, authReady, configMessage } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!authReady) {
      setError(configMessage ?? 'API unavailable');
      return;
    }
    setSubmitting(true);
    try {
      await signIn(email, password);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(messageForAuthFormError(err));
      } else {
        setError('Could not connect to the server.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Log in</h1>
        <p className="auth-sub">Sign in to access your profile, history and favourites.</p>
        {configMessage ? <p className="auth-banner">{configMessage}</p> : null}
        <form className="auth-form" onSubmit={onSubmit}>
          <label className="auth-label">
            Email
            <input
              className="auth-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="auth-label">
            Password
            <input
              className="auth-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error ? <p className="auth-error">{error}</p> : null}
          <button className="auth-submit" type="submit" disabled={submitting || !authReady}>
            {submitting ? 'Signing in…' : 'Log in'}
          </button>
        </form>
        <p className="auth-footer">
          No account? <Link to="/register">Register</Link>
          <br />
          <Link to="/forgot-password">Forgot password?</Link>
          <br />
          <Link to="/dashboard">Continue without signing in</Link>
        </p>
      </div>
    </div>
  );
}
