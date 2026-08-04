import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { Banner } from '../components/Feedback';
import { LabeledInput } from '../components/Inputs';
import { Screen } from '../components/Screen';
import { errorMessage } from '../lib/format';
import { fontSize, microLabel, spacing, useThemeColors } from '../theme';

export function Mfa() {
  const colors = useThemeColors();
  const { mfa, verifyMfa, fetchDevOtp, devOtpEnabled } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async () => {
    setError(null);
    setLoading(true);
    try {
      await verifyMfa(code.trim());
      navigate('/home');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDevOtp = async () => {
    setError(null);
    try {
      const otp = await fetchDevOtp();
      setCode(otp);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Screen
      contentContainerStyle={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        minHeight: '100vh',
        paddingTop: spacing.xxl,
        paddingBottom: spacing.xxl,
      }}
    >
      <div style={{ alignItems: 'center', marginBottom: spacing.xl }}>
        <div style={{ ...microLabel, color: colors.muted }}>Security</div>
        <div style={{ fontSize: fontSize.xl, fontWeight: '800', marginTop: spacing.sm, textAlign: 'center', color: colors.ink }}>
          Two-factor authentication
        </div>
        <div style={{ fontSize: fontSize.md, marginTop: spacing.sm, textAlign: 'center', color: colors.muted }}>
          {mfa?.setupRequired
            ? 'Set up your authenticator app, then enter the code it shows.'
            : `Enter the 6-digit code from your authenticator app for ${mfa?.employeeId ?? 'your account'}.`}
        </div>
      </div>

      {error ? <Banner kind="error" title="Verification failed" detail={error} /> : null}

      <LabeledInput
        label="Verification code"
        value={code}
        onChangeText={setCode}
        type="number"
        maxLength={6}
        placeholder="000000"
      />

      <Button title="Verify" onClick={handleVerify} loading={loading} />

      {devOtpEnabled ? (
        <div style={{ marginTop: spacing.lg }}>
          <Button title="Get code (dev)" onClick={handleDevOtp} variant="secondary" />
          <div style={{ marginTop: spacing.sm, textAlign: 'center', fontSize: fontSize.sm, color: colors.muted }}>
            Dev shortcut — fetches the current TOTP from the backend.
          </div>
        </div>
      ) : null}

      <Button title="Back to login" onClick={() => navigate('/login')} variant="secondary" style={{ marginTop: spacing.lg }} />
    </Screen>
  );
}
