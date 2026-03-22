import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiJson, clearToken, getApiBase, getToken, setToken } from '../lib/api';
import { AuthContext, type AppUser, type AuthContextValue } from './authContext';

/**
 * Провайдер авторизації через JWT та REST API.
 *
 * @param root0 - Пропси.
 * @param root0.children - Дочірні елементи.
 * @returns Елемент провайдера контексту.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [configMessage, setConfigMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const base = getApiBase();
      try {
        const healthUrl = `${base}/api/health`;
        const h = await fetch(healthUrl);
        if (!h.ok) throw new Error('health');
        if (cancelled) return;
        setConfigMessage(null);
      } catch {
        if (!cancelled) {
          setConfigMessage(
            'Бекенд недоступний. У іншому терміналі: cd server → npm install → npm run dev'
          );
        }
        if (!cancelled) setLoading(false);
        return;
      }

      const token = getToken();
      if (!token) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const { user: me } = await apiJson<{ user: AppUser }>('/api/auth/me');
        if (!cancelled) setUser(me);
      } catch {
        clearToken();
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const data = await apiJson<{ token: string; user: AppUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim(), password })
    });
    setToken(data.token);
    setUser(data.user);
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName?: string) => {
    const data = await apiJson<{ token: string; user: AppUser }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: email.trim(),
        password,
        displayName: displayName?.trim() || undefined
      })
    });
    setToken(data.token);
    setUser(data.user);
  }, []);

  const signOut = useCallback(async () => {
    clearToken();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      authReady: !configMessage,
      configMessage,
      signIn,
      signUp,
      signOut
    }),
    [user, loading, configMessage, signIn, signUp, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
