import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { Banner } from '../components/Feedback';
import { LabeledInput } from '../components/Inputs';
import { Screen } from '../components/Screen';
import { ThemeToggle } from '../components/ThemeToggle';
import { errorMessage } from '../lib/format';
import { cardShadow, fontSize, microLabel, radius, spacing, useIsDark, useThemeColors } from '../theme';

export function Login() {
  const colors = useThemeColors();
  const isDark = useIsDark();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const handleLogin = async () => {
    setError(null);
    if (!navigator.onLine) {
      setError(
        'Sign-in needs internet. Log in once while online — next time Offline Ready keeps you signed in without typing your password.',
      );
      return;
    }
    setLoading(true);
    try {
      await login(employeeId.trim(), password);
      navigate('/home');
    } catch (err) {
      if (err instanceof ApiError && (err.status === 0 || err.code === 'network_error')) {
        setError(
          'Cannot reach the server. Connect to the internet to sign in. After one online login, Offline Ready keeps your session.',
        );
      } else if (err instanceof ApiError && err.errors) {
        const messages = Object.values(err.errors).flat();
        setError(messages[0] ?? err.message);
      } else {
        setError(errorMessage(err));
      }
    } finally {
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
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <img
            src="/icons/logo-mark.png"
            alt="DTR"
            width={72}
            height={72}
            style={{ display: 'block' }}
          />
        </div>
        <div style={{ fontSize: fontSize.xxl, fontWeight: '800', marginTop: spacing.lg, textAlign: 'center', color: colors.ink }}>
          Daily Time Record
        </div>
        <div style={{ ...microLabel, marginTop: spacing.xs, textAlign: 'center', opacity: 0.8, color: colors.muted }}>
          Employee sign-in
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg, marginTop: spacing.xl }}>
          {!online ? (
            <Banner
              kind="warning"
              title="You're offline"
              detail="Password sign-in needs internet. If you already logged in on this device while online, reopen the app — Offline Ready restores that session automatically."
            />
          ) : null}

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

          <Button title="Login" onClick={handleLogin} loading={loading} disabled={!online} />
        </div>
      </div>

      {error ? <Banner kind="error" title="Login failed" detail={error} /> : null}
    </Screen>
  );
}
