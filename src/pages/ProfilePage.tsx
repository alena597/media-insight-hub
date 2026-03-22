import { useAuth } from '../hooks/useAuth';

const formatDate = (iso: string | undefined): string => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('uk-UA', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  } catch {
    return '—';
  }
};

/**
 * Сторінка профілю з даними з бекенду.
 *
 * @returns Елемент сторінки профілю.
 */
export function ProfilePage() {
  const { user } = useAuth();

  if (!user) return null;

  const displayName = user.displayName?.trim() || null;
  const email = user.email ?? '—';
  const created = user.createdAt;

  return (
    <div>
      <div className="page-head">
        <h2 className="page-head-title">Профіль</h2>
        <p className="page-head-desc">Дані облікового запису з власного API.</p>
      </div>
      <div className="profile-card">
        <dl className="profile-dl">
          <div className="profile-row">
            <dt>Email</dt>
            <dd>{email}</dd>
          </div>
          <div className="profile-row">
            <dt>Ім’я</dt>
            <dd>{displayName ?? '—'}</dd>
          </div>
          <div className="profile-row">
            <dt>Дата реєстрації</dt>
            <dd>{formatDate(created)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
