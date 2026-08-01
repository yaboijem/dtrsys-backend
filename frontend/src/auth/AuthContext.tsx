import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { ApiClient, ApiError } from '../api/client';
import { LoginResult, LoginSuccess, User } from '../api/types';
import { APP_VERSION, DEFAULT_API_URL, DEV_OTP_ENABLED, DEFAULT_DEVICE_ID, STORAGE_KEYS } from '../config';

type AuthStatus = 'restoring' | 'guest' | 'authed';

export interface MfaPending {
  mfaToken: string;
  employeeId: string;
  setupRequired: boolean;
}

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  token: string | null;
  deviceId: string;
  serverUrl: string;
  mfa: MfaPending | null;
  api: ApiClient;
  devOtpEnabled: boolean;
  login: (employeeId: string, password: string) => Promise<'authed' | 'mfa_required'>;
  verifyMfa: (code: string) => Promise<void>;
  fetchDevOtp: () => Promise<string>;
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
  const [mfa, setMfa] = useState<MfaPending | null>(null);

  const apiRef = useRef(new ApiClient(DEFAULT_API_URL));
  const deviceIdRef = useRef(deviceId);

  useEffect(() => {
    deviceIdRef.current = deviceId;
  }, [deviceId]);

  useEffect(() => {
    (async () => {
      try {
        const [storedToken, storedUser, storedUrl, storedDevice] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.token),
          AsyncStorage.getItem(STORAGE_KEYS.user),
          AsyncStorage.getItem(STORAGE_KEYS.serverUrl),
          AsyncStorage.getItem(STORAGE_KEYS.deviceId),
        ]);

        const url = storedUrl || DEFAULT_API_URL;
        apiRef.current.setBaseUrl(url);
        setServerUrlState(url);

        const dev = storedDevice || DEFAULT_DEVICE_ID;
        setDeviceIdState(dev);
        deviceIdRef.current = dev;

        if (storedToken && storedUser) {
          try {
            const me = await apiRef.current.get<User>('/api/auth/me', undefined, storedToken);
            setToken(storedToken);
            setUser(me);
            setStatus('authed');
            return;
          } catch {
            await AsyncStorage.multiRemove([STORAGE_KEYS.token, STORAGE_KEYS.user]);
          }
        }
      } catch {
        // storage unavailable -> fresh guest session
      }
      setStatus('guest');
    })();
  }, []);

  const login = useCallback(async (employeeId: string, password: string): Promise<'authed' | 'mfa_required'> => {
    const result = await apiRef.current.post<LoginResult>('/api/auth/login', {
      employee_id: employeeId,
      password,
      device_id: deviceIdRef.current,
      platform: 'android',
      app_version: APP_VERSION,
    });

    if (typeof result !== 'object' || result === null) {
      throw new ApiError(
        'The server returned an unexpected response. Check that the backend is running and the server URL is correct.',
        0,
        'invalid_response',
      );
    }

    if ('mfa_required' in result) {
      setMfa({
        mfaToken: result.mfa_token,
        employeeId,
        setupRequired: result.mfa_setup_required,
      });
      return 'mfa_required';
    }

    await completeLogin(result.token, result.user);
    return 'authed';
  }, []);

  const completeLogin = useCallback(async (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    setMfa(null);
    setStatus('authed');
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.token, newToken],
      [STORAGE_KEYS.user, JSON.stringify(newUser)],
    ]);
  }, []);

  const verifyMfa = useCallback(
    async (code: string) => {
      if (!mfa) {
        throw new ApiError('No pending MFA challenge.', 400);
      }
      const result = await apiRef.current.post<LoginSuccess>(
        '/api/auth/mfa/verify',
        { mfa_token: mfa.mfaToken, code },
      );
      if (typeof result !== 'object' || result === null) {
        throw new ApiError(
          'The server returned an unexpected response. Check that the backend is running and the server URL is correct.',
          0,
          'invalid_response',
        );
      }
      await completeLogin(result.token, result.user);
    },
    [mfa, completeLogin],
  );

  const fetchDevOtp = useCallback(async () => {
    if (!mfa) {
      throw new ApiError('No pending MFA challenge.', 400);
    }
    const result = await apiRef.current.get<{ code: string | null }>(`/dev/otp/${encodeURIComponent(mfa.employeeId)}`);
    if (!result.code) {
      throw new ApiError('No TOTP secret configured for this account.', 404);
    }
    return result.code;
  }, [mfa]);

  const logout = useCallback(async () => {
    if (token) {
      await apiRef.current.post('/api/auth/logout', {}, token).catch(() => undefined);
    }
    setToken(null);
    setUser(null);
    setMfa(null);
    setStatus('guest');
    await AsyncStorage.multiRemove([STORAGE_KEYS.token, STORAGE_KEYS.user]);
  }, [token]);

  const refreshMe = useCallback(async () => {
    if (!token) {
      return;
    }
    const me = await apiRef.current.get<User>('/api/auth/me', undefined, token);
    setUser(me);
    await AsyncStorage.setItem(STORAGE_KEYS.user, JSON.stringify(me));
  }, [token]);

  const setDeviceId = useCallback(async (id: string) => {
    const trimmed = id.trim();
    setDeviceIdState(trimmed);
    deviceIdRef.current = trimmed;
    await AsyncStorage.setItem(STORAGE_KEYS.deviceId, trimmed);
  }, []);

  const setServerUrl = useCallback(async (url: string) => {
    const trimmed = url.trim().replace(/\/+$/, '');
    apiRef.current.setBaseUrl(trimmed);
    setServerUrlState(trimmed);
    await AsyncStorage.setItem(STORAGE_KEYS.serverUrl, trimmed);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      token,
      deviceId,
      serverUrl,
      mfa,
      api: apiRef.current,
      devOtpEnabled: DEV_OTP_ENABLED,
      login,
      verifyMfa,
      fetchDevOtp,
      logout,
      refreshMe,
      setDeviceId,
      setServerUrl,
    }),
    [status, user, deviceId, serverUrl, mfa, login, verifyMfa, fetchDevOtp, logout, refreshMe, setDeviceId, setServerUrl],
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
