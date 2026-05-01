import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiJson } from '../lib/api';
import type { ApiError } from '../lib/api';

const AVATAR_KEY = (id: string) => `mih_avatar_${id}`;

const formatDate = (iso: string | undefined): string => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '—';
  }
};

const accountAge = (iso: string | undefined): string => {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  return `${days} days`;
};

/**
 * Сторінка профілю користувача з редагуванням імені, зміною пароля та аватаркою.
 *
 * @returns Елемент сторінки профілю.
 */
export function ProfilePage() {
  const { user, updateProfile, changePassword } = useAuth();

  const [avatar, setAvatar] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [nameValue, setNameValue] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [stats, setStats] = useState<{ history: number; favorites: number } | null>(null);

  useEffect(() => {
    if (!user) return;
    setNameValue(user.displayName ?? '');
    const saved = localStorage.getItem(AVATAR_KEY(user.id));
    setAvatar(saved);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([
      apiJson<{ items: unknown[] }>('/api/history?limit=1'),
      apiJson<{ items: unknown[] }>('/api/favorites?limit=1')
    ])
      .then(([h, f]) => {
        if (!cancelled) {
          const hCount = Array.isArray((h as { total?: number }).total !== undefined ? [(h as { total?: number }).total] : (h as { items: unknown[] }).items)
            ? ((h as { total?: number }).total ?? (h as { items: unknown[] }).items.length)
            : 0;
          const fCount = (f as { total?: number }).total ?? (f as { items: unknown[] }).items.length;
          setStats({ history: hCount, favorites: fCount });
        }
      })
      .catch(() => { /* ігноруємо */ });
    return () => { cancelled = true; };
  }, [user]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      localStorage.setItem(AVATAR_KEY(user.id), dataUrl);
      setAvatar(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = () => {
    if (!user) return;
    localStorage.removeItem(AVATAR_KEY(user.id));
    setAvatar(null);
  };

  const handleSaveName = async () => {
    setNameSaving(true);
    setNameMsg(null);
    try {
      await updateProfile(nameValue.trim());
      setNameMsg({ ok: true, text: 'Name saved' });
    } catch (e) {
      setNameMsg({ ok: false, text: (e as ApiError).message ?? 'Failed to save' });
    } finally {
      setNameSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setPwdMsg(null);
    if (newPwd !== confirmPwd) {
      setPwdMsg({ ok: false, text: 'Passwords do not match' });
      return;
    }
    setPwdSaving(true);
    try {
      await changePassword(curPwd, newPwd);
      setPwdMsg({ ok: true, text: 'Password changed' });
      setCurPwd('');
      setNewPwd('');
      setConfirmPwd('');
    } catch (e) {
      setPwdMsg({ ok: false, text: (e as ApiError).message ?? 'Failed to change password' });
    } finally {
      setPwdSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div>
      <div className="page-head">
        <h2 className="page-head-title">Profile</h2>
        <p className="page-head-desc">Manage your account.</p>
      </div>

      <div className="profile-layout">
        {/* Аватарка + інфо */}
        <div className="profile-card profile-card--info">
          <div className="profile-avatar-wrap">
            <div
              className="profile-avatar"
              role="button"
              tabIndex={0}
              onClick={() => avatarInputRef.current?.click()}
              onKeyDown={(e) => e.key === 'Enter' && avatarInputRef.current?.click()}
              title="Change avatar"
            >
              {avatar
                ? <img src={avatar} alt="avatar" className="profile-avatar-img" />
                : <span className="profile-avatar-initials">{(user.displayName || user.email)[0].toUpperCase()}</span>
              }
              <div className="profile-avatar-overlay">Change</div>
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleAvatarChange}
            />
            {avatar && (
              <button type="button" className="profile-avatar-remove" onClick={handleRemoveAvatar}>
                Remove photo
              </button>
            )}
          </div>

          <dl className="profile-dl">
            <div className="profile-row">
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </div>
            <div className="profile-row">
              <dt>Registered</dt>
              <dd>{formatDate(user.createdAt)}</dd>
            </div>
            <div className="profile-row">
              <dt>Account age</dt>
              <dd>{accountAge(user.createdAt)}</dd>
            </div>
          </dl>

          {stats && (
            <div className="profile-stats">
              <div className="profile-stat">
                <span className="profile-stat-value">{stats.history}</span>
                <span className="profile-stat-label">Analyses</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-value">{stats.favorites}</span>
                <span className="profile-stat-label">Favourites</span>
              </div>
            </div>
          )}
        </div>

        <div className="profile-forms">
          {/* Редагування імені */}
          <div className="profile-card">
            <h3 className="profile-section-title">Display name</h3>
            <div className="profile-field-row">
              <input
                className="profile-input"
                type="text"
                value={nameValue}
                onChange={(e) => { setNameValue(e.target.value); setNameMsg(null); }}
                placeholder="Your name"
                maxLength={60}
              />
              <button
                type="button"
                className="primary-button"
                onClick={handleSaveName}
                disabled={nameSaving || nameValue.trim() === (user.displayName ?? '')}
              >
                {nameSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
            {nameMsg && (
              <p className={`profile-msg ${nameMsg.ok ? 'profile-msg--ok' : 'profile-msg--err'}`}>
                {nameMsg.text}
              </p>
            )}
          </div>

          {/* Зміна пароля */}
          <div className="profile-card">
            <h3 className="profile-section-title">Change password</h3>
            <div className="profile-field-col">
              <input
                className="profile-input"
                type="password"
                value={curPwd}
                onChange={(e) => { setCurPwd(e.target.value); setPwdMsg(null); }}
                placeholder="Current password"
                autoComplete="current-password"
              />
              <input
                className="profile-input"
                type="password"
                value={newPwd}
                onChange={(e) => { setNewPwd(e.target.value); setPwdMsg(null); }}
                placeholder="New password (min. 8 chars + digit)"
                autoComplete="new-password"
              />
              <input
                className="profile-input"
                type="password"
                value={confirmPwd}
                onChange={(e) => { setConfirmPwd(e.target.value); setPwdMsg(null); }}
                placeholder="Confirm new password"
                autoComplete="new-password"
              />
              <button
                type="button"
                className="primary-button"
                onClick={handleChangePassword}
                disabled={pwdSaving || !curPwd || !newPwd || !confirmPwd}
              >
                {pwdSaving ? 'Saving…' : 'Change password'}
              </button>
            </div>
            {pwdMsg && (
              <p className={`profile-msg ${pwdMsg.ok ? 'profile-msg--ok' : 'profile-msg--err'}`}>
                {pwdMsg.text}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
