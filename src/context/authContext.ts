import { createContext } from 'react';

/** Користувач з власного бекенду (JWT + SQLite). */
export type AppUser = {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
};

/** Стан авторизації в React-контексті. */
export type AuthContextValue = {
  user: AppUser | null;
  loading: boolean;
  authReady: boolean;
  configMessage: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
