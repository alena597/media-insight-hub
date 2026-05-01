import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../lib/api';
import { messageForAuthFormError } from '../lib/authErrors';

/**
 * Сторінка реєстрації нового користувача.
 *
 * @returns Елемент сторінки реєстрації.
 */
export function RegisterPage() {
  const { signUp, authReady, configMessage } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
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
      await signUp(email, password, displayName || undefined);
      navigate('/dashboard', { replace: true });
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
        <h1 className="auth-title">Register</h1>
        <p className="auth-sub">Create an account to save your history and favourites.</p>
        {configMessage ? <p className="auth-banner">{configMessage}</p> : null}
        <form className="auth-form" onSubmit={onSubmit}>
          <label className="auth-label">
            Name (optional)
            <input
              className="auth-input"
              type="text"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
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
            Password (min. 8 characters + digit)
            <input
              className="auth-input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          {error ? <p className="auth-error">{error}</p> : null}
          <button className="auth-submit" type="submit" disabled={submitting || !authReady}>
            {submitting ? 'Creating…' : 'Create account'}
          </button>
        </form>
        <p className="auth-footer">
          Already have an account? <Link to="/login">Log in</Link>
          <br />
          <Link to="/dashboard">Home</Link>
        </p>
      </div>
    </div>
  );
}
