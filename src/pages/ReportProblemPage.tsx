import { FormEvent, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { sendClientLog } from '../lib/clientLogger';

/**
 * Форма зворотного зв’язку при збоях: кроки відтворення та опційні коди з API / клієнта.
 *
 * @returns Елемент сторінки.
 */
export function ReportProblemPage() {
  const [params] = useSearchParams();
  const prefilledClientRef = params.get('clientRef')?.trim() || '';

  const [whatHappened, setWhatHappened] = useState('');
  const [steps, setSteps] = useState('');
  const [requestId, setRequestId] = useState('');
  const [errorId, setErrorId] = useState('');
  const [contact, setContact] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const clientRef = useMemo(
    () => prefilledClientRef || undefined,
    [prefilledClientRef]
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    sendClientLog('info', 'user_support_report', {
      whatHappened: whatHappened.slice(0, 4000),
      steps: steps.slice(0, 4000),
      requestId: requestId.trim() || undefined,
      errorId: errorId.trim() || undefined,
      clientRef,
      contact: contact.trim() || undefined,
      viewport: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : undefined,
      language: typeof navigator !== 'undefined' ? navigator.language : undefined
    });
    setSent(true);
    setSubmitting(false);
  };

  return (
    <div className="dash-header" style={{ maxWidth: '36rem' }}>
      <h2>Повідомити про проблему</h2>
      <p className="dash-header-lead">
        Опишіть, що відбувалося перед помилкою. Технічні деталі (коди запиту) вказуйте лише якщо вони
        з’явилися на екрані — вони допомагають знайти запис у журналі сервера.
      </p>
      {sent ? (
        <div className="auth-banner" style={{ marginTop: '1rem' }}>
          Дякуємо. Повідомлення передано. Можна закрити сторінку або{' '}
          <Link to="/dashboard" style={{ color: '#67e8f9' }}>
            повернутися на панель
          </Link>
          .
        </div>
      ) : (
        <form className="auth-form" style={{ marginTop: '1rem' }} onSubmit={onSubmit}>
          {clientRef ? (
            <p className="error-page-muted">
              Код інциденту з повідомлення про помилку: <strong>{clientRef}</strong>
            </p>
          ) : null}
          <label className="auth-label">
            Що сталося?
            <textarea
              className="auth-input error-page-textarea"
              value={whatHappened}
              onChange={(ev) => setWhatHappened(ev.target.value)}
              required
              placeholder="Наприклад: після натискання «Зберегти» з’явилося повідомлення про помилку."
            />
          </label>
          <label className="auth-label">
            Кроки для відтворення (за бажанням)
            <textarea
              className="auth-input error-page-textarea"
              value={steps}
              onChange={(ev) => setSteps(ev.target.value)}
              placeholder="1. Відкрив модуль OCR&#10;2. Завантажив зображення&#10;3. …"
            />
          </label>
          <label className="auth-label">
            Код запиту (requestId), якщо був показаний
            <input
              className="auth-input"
              value={requestId}
              onChange={(ev) => setRequestId(ev.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="auth-label">
            Код інциденту (errorId), якщо був показаний
            <input
              className="auth-input"
              value={errorId}
              onChange={(ev) => setErrorId(ev.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="auth-label">
            Контакт для уточнення (email, за бажанням)
            <input
              className="auth-input"
              type="email"
              value={contact}
              onChange={(ev) => setContact(ev.target.value)}
              autoComplete="email"
            />
          </label>
          <p className="error-page-muted">
            Скріншоти зараз не завантажуються через форму; за потреби опишіть вміст екрана текстом.
          </p>
          <button className="auth-submit" type="submit" disabled={submitting}>
            {submitting ? 'Надсилання…' : 'Надіслати'}
          </button>
        </form>
      )}
    </div>
  );
}
