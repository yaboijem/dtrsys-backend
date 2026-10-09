import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { Banner } from '../components/Feedback';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { LabeledInput } from '../components/Inputs';
import { Screen } from '../components/Screen';
import { ThemeToggle } from '../components/ThemeToggle';
import { GOOGLE_CLIENT_ID } from '../config';
import { errorMessage } from '../lib/format';
import { cardShadow, fontSize, microLabel, radius, spacing, useIsDark, useThemeColors } from '../theme';

function loginFailure(err: unknown): { alert: string | null; fields: Record<string, string>; credentials: boolean } {
  if (err instanceof ApiError && (err.status === 0 || err.code === 'network_error')) {
    return { alert: 'Connect to the internet and try again.', fields: {}, credentials: false };
  }
  if (!(err instanceof ApiError)) {
    return { alert: errorMessage(err), fields: {}, credentials: false };
  }
  const fields: Record<string, string> = {};
  const idMsg = err.errors?.employee_id?.[0] ?? '';
  const passwordMsg = err.errors?.password?.[0] ?? '';
  if (/required/i.test(idMsg)) fields.employee_id = 'Enter your employee ID.';
  if (/required/i.test(passwordMsg)) fields.password = 'Enter your password.';
  if (Object.keys(fields).length > 0) {
    return { alert: null, fields, credentials: false };
  }
  const raw = idMsg || passwordMsg || err.message;
  if (/credentials are incorrect|do(?:es)? not match/i.test(raw)) {
    return {
      alert: 'That employee ID and password do not match. Check both and try again.',
      fields: {},
      credentials: true,
    };
  }
  return { alert: raw || 'Could not sign in. Try again.', fields: {}, credentials: false };
}

export function Login() {
  const colors = useThemeColors();
  const isDark = useIsDark();
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const employeeIdRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [credentialsFailed, setCredentialsFailed] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    const markOnline = () => setOnline(true);
    const markOffline = () => setOnline(false);
    window.addEventListener('online', markOnline);
    window.addEventListener('offline', markOffline);
    return () => {
      window.removeEventListener('online', markOnline);
      window.removeEventListener('offline', markOffline);
    };
  }, []);

  const clearFailure = () => {
    setError(null);
    setFieldErrors({});
    setCredentialsFailed(false);
  };

  const focusField = (field: 'employee_id' | 'password', select = false) => {
    const el = field === 'employee_id' ? employeeIdRef.current : passwordRef.current;
    el?.focus();
    if (select) el?.select();
  };

  const handleLogin = async () => {
    const id = employeeId.trim();
    const nextFields: Record<string, string> = {};
    if (!id) nextFields.employee_id = 'Enter your employee ID.';
    if (!password) nextFields.password = 'Enter your password.';
    if (Object.keys(nextFields).length > 0) {
      setError(null);
      setCredentialsFailed(false);
      setFieldErrors(nextFields);
      focusField(nextFields.employee_id ? 'employee_id' : 'password');
      return;
    }
    if (!navigator.onLine) {
      clearFailure();
      setError('Connect to the internet and try again.');
      return;
    }
    if (busy.current) {
      return;
    }
    busy.current = true;
    clearFailure();
    setLoading(true);
    try {
      await login(id, password);
      navigate('/home');
    } catch (err) {
      const failure = loginFailure(err);
      setError(failure.alert);
      setFieldErrors(failure.fields);
      setCredentialsFailed(failure.credentials);
      if (failure.fields.employee_id) focusField('employee_id');
      else if (failure.fields.password) focusField('password');
      else if (failure.credentials) focusField('employee_id', true);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  };

  const handleGoogle = async (idToken: string) => {
    if (busy.current) {
      return;
    }
    clearFailure();
    if (!navigator.onLine) {
      setError('Connect to the internet and try again.');
      return;
    }
    busy.current = true;
    setLoading(true);
    try {
      await loginWithGoogle(idToken);
      navigate('/home');
    } catch (err) {
      if (err instanceof ApiError && (err.status === 0 || err.code === 'network_error')) {
        setError('Connect to the internet and try again.');
      } else if (err instanceof ApiError && err.errors) {
        const messages = Object.values(err.errors).flat();
        setError(messages[0] ?? err.message);
      } else {
        setError(errorMessage(err));
      }
    } finally {
      busy.current = false;
      setLoading(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void handleLogin();
  };

  return (
    <Screen
      contentContainerStyle={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        minHeight: '100dvh',
        paddingTop: spacing.xl,
        paddingBottom: spacing.xl,
        position: 'relative',
      }}
    >
      <div style={{ position: 'absolute', top: spacing.md, right: spacing.md, zIndex: 2 }}>
        <ThemeToggle compact />
      </div>
      <div
        style={{
          borderRadius: radius.lg,
          borderWidth: 1,
          borderStyle: 'solid',
          paddingLeft: spacing.xl,
          paddingRight: spacing.xl,
          paddingTop: spacing.xxl,
          paddingBottom: spacing.xxl,
          backgroundColor: colors.card,
          borderColor: colors.border,
          ...cardShadow(isDark),
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <img src="/icons/logo-mark.png" alt="DTR" width={72} height={72} style={{ display: 'block' }} />
        </div>
        <div style={{ fontSize: fontSize.xxl, fontWeight: '800', marginTop: spacing.lg, textAlign: 'center', color: colors.ink }}>
          Daily Time Record
        </div>
        <div style={{ ...microLabel, marginTop: spacing.xs, textAlign: 'center', opacity: 0.8, color: colors.muted }}>
          Employee sign-in
        </div>

        <form onSubmit={onSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg, marginTop: spacing.xl }}>
          <LabeledInput
            label="Employee ID"
            value={employeeId}
            inputRef={employeeIdRef}
            onChangeText={(value) => {
              setEmployeeId(value);
              clearFailure();
            }}
            placeholder="Enter your employee ID"
            autoComplete="username"
            error={fieldErrors.employee_id}
            invalid={credentialsFailed}
          />
          <LabeledInput
            label="Password"
            value={password}
            inputRef={passwordRef}
            onChangeText={(value) => {
              setPassword(value);
              clearFailure();
            }}
            type="password"
            placeholder="Enter your password"
            autoComplete="current-password"
            error={fieldErrors.password}
            invalid={credentialsFailed}
          />
          {error ? <Banner kind="error" title="Could not sign in" detail={error} /> : null}
          <Button title="Login" type="submit" onClick={() => {}} loading={loading} disabled={loading} />
          {GOOGLE_CLIENT_ID ? (
            <div>
              <div style={{ textAlign: 'center', color: colors.muted, fontSize: fontSize.sm }}>or</div>
              <div style={{ marginTop: spacing.lg }}>
                <GoogleSignInButton
                  clientId={GOOGLE_CLIENT_ID}
                  blocked={loading || !online}
                  blockMode={loading ? 'loading' : !online ? 'offline' : null}
                  onCredential={(idToken) => {
                    void handleGoogle(idToken);
                  }}
                  onOffline={() => {
                    setCredentialsFailed(false);
                    setFieldErrors({});
                    setError('Connect to the internet and try again.');
                  }}
                  onError={(message) => {
                    setCredentialsFailed(false);
                    setFieldErrors({});
                    setError(message);
                  }}
                />
              </div>
            </div>
          ) : null}
        </form>
      </div>
    </Screen>
  );
}
