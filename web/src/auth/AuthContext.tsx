import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, ApiError } from '../api/client';
import { fetchMe } from '../api/endpoints';
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
    const userRaw = localStorage.getItem(USER_KEY);
    return { token: null, user: userRaw ? (JSON.parse(userRaw) as User) : null };
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
      localStorage.removeItem(TOKEN_KEY);
      try {
        const me = await fetchMe('session');
        if (cancelled) return;
        localStorage.setItem(USER_KEY, JSON.stringify(me));
        setState({ token: 'session', user: me });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
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

  const signIn = useCallback((_nextToken: string, nextUser: User) => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setState({ token: 'session', user: nextUser });
  }, []);

  const signOut = useCallback(() => {
    api.post('/api/auth/logout', {}).catch(() => undefined);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setState({ token: null, user: null });
  }, []);

  const refreshUser = useCallback(async () => {
    const me = await fetchMe('session');
    localStorage.setItem(USER_KEY, JSON.stringify(me));
    setState({ token: 'session', user: me });
  }, []);

  const hasRole = useCallback(
    (...roles: string[]) => {
      if (!user) return false;
      const userRoles = user.roles ?? [];
      return roles.some((role) => userRoles.includes(role));
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
