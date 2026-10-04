import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { ApiClient, ApiError } from '../api/client';
import { LoginSuccess, User } from '../api/types';
import { APP_VERSION, DEFAULT_API_URL, DEFAULT_DEVICE_ID, STORAGE_KEYS } from '../config';

type AuthStatus = 'restoring' | 'guest' | 'authed';

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  token: string | null;
  deviceId: string;
  serverUrl: string;
  api: ApiClient;
  login: (employeeId: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  setDeviceId: (id: string) => Promise<void>;
  setServerUrl: (url: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('restoring');
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [deviceId, setDeviceIdState] = useState(DEFAULT_DEVICE_ID);
  const [serverUrl, setServerUrlState] = useState(DEFAULT_API_URL);

  const apiRef = useRef(new ApiClient(DEFAULT_API_URL));
  const deviceIdRef = useRef(deviceId);

  useEffect(() => {
    deviceIdRef.current = deviceId;
  }, [deviceId]);

  useEffect(() => {
    (async () => {
      try {
        const storedToken = localStorage.getItem(STORAGE_KEYS.token);
        const storedUser = localStorage.getItem(STORAGE_KEYS.user);
        const storedUrl = localStorage.getItem(STORAGE_KEYS.serverUrl);
        const storedDevice = localStorage.getItem(STORAGE_KEYS.deviceId);

        const url = storedUrl || DEFAULT_API_URL;
        apiRef.current.setBaseUrl(url);
        setServerUrlState(url);

        const dev = storedDevice || DEFAULT_DEVICE_ID;
        setDeviceIdState(dev);
        deviceIdRef.current = dev;

        if (storedToken && storedUser) {
          try {
            const me = await apiRef.current.get<{ data: User }>('/api/auth/me', undefined, storedToken);
            setToken(storedToken);
            setUser(me.data);
            localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(me.data));
            setStatus('authed');
            return;
          } catch (err) {
            if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
              localStorage.removeItem(STORAGE_KEYS.token);
              localStorage.removeItem(STORAGE_KEYS.user);
            }
          }
        }
      } catch {
        // storage unavailable -> fresh guest session
      }
      setStatus('guest');
    })();
  }, []);

  const completeLogin = useCallback(async (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    setStatus('authed');
    localStorage.setItem(STORAGE_KEYS.token, newToken);
    localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(newUser));
  }, []);

  const login = useCallback(
    async (employeeId: string, password: string): Promise<void> => {
      const result = await apiRef.current.post<LoginSuccess>('/api/auth/login', {
        employee_id: employeeId,
        password,
        device_id: deviceIdRef.current,
        platform: 'web',
        app_version: APP_VERSION,
      });

      if (typeof result !== 'object' || result === null) {
        throw new ApiError(
          'The server returned an unexpected response. Check that the backend is running and the server URL is correct.',
          0,
          'invalid_response',
        );
      }

      if (!('token' in result) || !result.token || !result.user) {
        throw new ApiError(
          'The server returned an unexpected response. Check that the backend is running and the server URL is correct.',
          0,
          'invalid_response',
        );
      }

      await completeLogin(result.token, result.user);
    },
    [completeLogin],
  );

  const logout = useCallback(async () => {
    if (token) {
      await apiRef.current.post('/api/auth/logout', {}, token).catch(() => undefined);
    }
    setToken(null);
    setUser(null);
    setStatus('guest');
    localStorage.removeItem(STORAGE_KEYS.token);
    localStorage.removeItem(STORAGE_KEYS.user);
  }, [token, user]);

  const refreshMe = useCallback(async () => {
    if (!token) {
      return;
    }
    const me = await apiRef.current.get<{ data: User }>('/api/auth/me', undefined, token);
    setUser(me.data);
    localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(me.data));
  }, [token]);

  const setDeviceId = useCallback(async (id: string) => {
    const trimmed = id.trim();
    setDeviceIdState(trimmed);
    deviceIdRef.current = trimmed;
    localStorage.setItem(STORAGE_KEYS.deviceId, trimmed);
  }, []);

  const setServerUrl = useCallback(async (url: string) => {
    const trimmed = url.trim().replace(/\/+$/, '');
    apiRef.current.setBaseUrl(trimmed);
    setServerUrlState(trimmed);
    localStorage.setItem(STORAGE_KEYS.serverUrl, trimmed);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      token,
      deviceId,
      serverUrl,
      api: apiRef.current,
      login,
      logout,
      refreshMe,
      setDeviceId,
      setServerUrl,
    }),
    [status, user, token, deviceId, serverUrl, login, logout, refreshMe, setDeviceId, setServerUrl],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
