import { FormEvent, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiJson } from '../lib/api';
import { useAuth } from '../hooks/useAuth';

/**
 * Сторінка для надсилання повідомлень про проблеми.
 *
 * @returns Форма звіту про проблему.
 */
export function ReportProblemPage() {
  const [params] = useSearchParams();
  const prefilledClientRef = params.get('clientRef')?.trim() || '';
  const { user } = useAuth();

  const [whatHappened, setWhatHappened] = useState('');
  const [steps, setSteps] = useState('');
  const [requestId, setRequestId] = useState('');
  const [errorId, setErrorId] = useState('');
  const [contact, setContact] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const clientRef = useMemo(
    () => prefilledClientRef || undefined,
    [prefilledClientRef]
  );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError('');
    try {
      await apiJson('/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          whatHappened: whatHappened.trim(),
          steps: steps.trim() || undefined,
          contact: contact.trim() || undefined,
          clientRef: clientRef || requestId.trim() || errorId.trim() || undefined,
          userId: user?.id ?? undefined,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          language: navigator.language,
        }),
      });
      setSent(true);
    } catch {
      setSubmitError('Failed to send the report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dash-header" style={{ maxWidth: '36rem' }}>
      <h2>Report a problem</h2>
      <p className="dash-header-lead">
        Describe what was happening before the error. Include technical details (request codes) only
        if they appeared on screen — they help locate the server log entry.
      </p>
      {sent ? (
        <div className="auth-banner" style={{ marginTop: '1rem' }}>
          Thank you. Your report has been submitted. You can close this page or{' '}
          <Link to="/dashboard" style={{ color: '#67e8f9' }}>
            go back to the dashboard
          </Link>
          .
        </div>
      ) : (
        <form className="auth-form" style={{ marginTop: '1rem' }} onSubmit={onSubmit}>
          {clientRef ? (
            <p className="error-page-muted">
              Incident ID from the error message: <strong>{clientRef}</strong>
            </p>
          ) : null}
          <label className="auth-label">
            What happened?
            <textarea
              className="auth-input error-page-textarea"
              value={whatHappened}
              onChange={(ev) => setWhatHappened(ev.target.value)}
              required
              placeholder="For example: after clicking &quot;Save&quot; an error message appeared."
            />
          </label>
          <label className="auth-label">
            Steps to reproduce (optional)
            <textarea
              className="auth-input error-page-textarea"
              value={steps}
              onChange={(ev) => setSteps(ev.target.value)}
              placeholder="1. Opened the OCR module&#10;2. Uploaded an image&#10;3. …"
            />
          </label>
          <label className="auth-label">
            Request ID (requestId), if shown on screen
            <input
              className="auth-input"
              value={requestId}
              onChange={(ev) => setRequestId(ev.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="auth-label">
            Incident ID (errorId), if shown on screen
            <input
              className="auth-input"
              value={errorId}
              onChange={(ev) => setErrorId(ev.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="auth-label">
            Contact for follow-up (email, optional)
            <input
              className="auth-input"
              type="email"
              value={contact}
              onChange={(ev) => setContact(ev.target.value)}
              autoComplete="email"
            />
          </label>
          <p className="error-page-muted">
            Screenshots cannot be uploaded via the form; if needed, describe the screen contents in text.
          </p>
          {submitError && (
            <p className="auth-error">{submitError}</p>
          )}
          <button className="auth-submit" type="submit" disabled={submitting}>
            {submitting ? "Sending\u2026" : "Send"}
          </button>
        </form>
      )}
    </div>
  );
}
