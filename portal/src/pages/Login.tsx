import { useEffect, useRef, useState } from 'react';
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

export function Login() {
  const colors = useThemeColors();
  const isDark = useIsDark();
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [error, setError] = useState<string | null>(null);
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

  const fail = (err: unknown) => {
    if (err instanceof ApiError && (err.status === 0 || err.code === 'network_error')) {
      setError('Connect to the internet and try again.');
    } else if (err instanceof ApiError && err.errors) {
      const messages = Object.values(err.errors).flat();
      setError(messages[0] ?? err.message);
    } else {
      setError(errorMessage(err));
    }
  };

  const handleLogin = async () => {
    setError(null);
    if (!navigator.onLine) {
      setError('Connect to the internet and try again.');
      return;
    }
    if (busy.current) {
      return;
    }
    busy.current = true;
    setLoading(true);
    try {
      await login(employeeId.trim(), password);
      navigate('/home');
    } catch (err) {
      fail(err);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  };

  const handleGoogle = async (idToken: string) => {
    if (busy.current) {
      return;
    }
    setError(null);
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
      fail(err);
    } finally {
      busy.current = false;
      setLoading(false);
    }
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
          marginBottom: spacing.xl,
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg, marginTop: spacing.xl }}>
          <LabeledInput
            label="Employee ID"
            value={employeeId}
            onChangeText={setEmployeeId}
            placeholder="Enter your employee ID"
          />
          <LabeledInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            type="password"
            placeholder="Enter your password"
          />
          <Button title="Login" onClick={handleLogin} loading={loading} disabled={loading} />
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
                  onOffline={() => setError('Connect to the internet and try again.')}
                  onError={setError}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {error ? <Banner kind="error" title="Login failed" detail={error} /> : null}
    </Screen>
  );
}
