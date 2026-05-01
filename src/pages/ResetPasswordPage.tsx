import { FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiJson } from '../lib/api';

/**
 * Сторінка встановлення нового паролю за токеном з email.
 *
 * @returns Форма введення нового паролю.
 */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await apiJson('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword: password }),
      });
      setDone(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Link is invalid or has expired.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <p className="auth-error">Invalid reset link.</p>
          <p className="auth-switch"><Link to="/forgot-password">Request a new one</Link></p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Set new password</h1>
        {done ? (
          <>
            <div className="auth-banner">Password updated successfully.</div>
            <p className="auth-switch"><Link to="/login">Sign in</Link></p>
          </>
        ) : (
          <form className="auth-form" onSubmit={onSubmit}>
            <label className="auth-label">
              New password
              <input
                className="auth-input"
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="auth-label">
              Confirm password
              <input
                className="auth-input"
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            {error && <p className="auth-error">{error}</p>}
            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Set new password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
