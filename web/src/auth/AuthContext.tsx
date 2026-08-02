import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, ApiError } from '../api/client';
import type { User } from '../api/types';

const TOKEN_KEY = 'dtr_admin_token';
const USER_KEY = 'dtr_admin_user';

export interface AuthState {
  token: string | null;
  user: User | null;
  loading: boolean;
  signIn: (token: string, user: User) => void;
  signOut: () => void;
  refreshUser: () => Promise<void>;
  hasRole: (...roles: string[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

function readStored(): { token: string | null; user: User | null } {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const userRaw = localStorage.getItem(USER_KEY);
    return { token, user: userRaw ? (JSON.parse(userRaw) as User) : null };
  } catch {
    return { token: null, user: null };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [{ token, user }, setState] = useState(readStored);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function validate() {
      const stored = readStored();
      if (!stored.token) {
        setLoading(false);
        return;
      }
      try {
        const me = await api.get<User>('/api/auth/me', undefined, stored.token);
        if (cancelled) return;
        setState({ token: stored.token, user: me });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
          if (!cancelled) setState({ token: null, user: null });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void validate();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback((nextToken: string, nextUser: User) => {
    localStorage.setItem(TOKEN_KEY, nextToken);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setState({ token: nextToken, user: nextUser });
  }, []);

  const signOut = useCallback(() => {
    const stored = readStored();
    if (stored.token) {
      api.post('/api/auth/logout', {}, stored.token).catch(() => undefined);
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setState({ token: null, user: null });
  }, []);

  const refreshUser = useCallback(async () => {
    const stored = readStored();
    if (!stored.token) return;
    const me = await api.get<User>('/api/auth/me', undefined, stored.token);
    localStorage.setItem(USER_KEY, JSON.stringify(me));
    setState({ token: stored.token, user: me });
  }, []);

  const hasRole = useCallback(
    (...roles: string[]) => {
      if (!user) return false;
      return roles.some((role) => user.roles.includes(role));
    },
    [user],
  );

  const value = useMemo<AuthState>(
    () => ({ token, user, loading, signIn, signOut, refreshUser, hasRole }),
    [token, user, loading, signIn, signOut, refreshUser, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
