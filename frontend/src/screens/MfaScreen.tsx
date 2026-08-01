import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { Banner } from '../components/Feedback';
import { LabeledInput } from '../components/Inputs';
import { Screen } from '../components/Screen';
import { errorMessage } from '../lib/format';
import { AuthStackParamList } from '../navigation/RootNavigator';
import { colors, fontSize, spacing } from '../theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'Mfa'>;

export function MfaScreen({ navigation }: Props) {
  const { mfa, verifyMfa, fetchDevOtp, devOtpEnabled } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async () => {
    setError(null);
    setLoading(true);
    try {
      await verifyMfa(code.trim());
      navigation.navigate('Login');
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
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Two-factor authentication</Text>
        <Text style={styles.subtitle}>
          {mfa?.setupRequired
            ? 'Set up your authenticator app, then enter the code it shows.'
            : `Enter the 6-digit code from your authenticator app for ${mfa?.employeeId ?? 'your account'}.`}
        </Text>
      </View>

      {error ? <Banner kind="error" title="Verification failed" detail={error} /> : null}

      <LabeledInput
        label="Verification code"
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        maxLength={6}
        placeholder="000000"
        autoFocus
      />

      <Button title="Verify" onPress={handleVerify} loading={loading} />

      {devOtpEnabled ? (
        <View style={styles.devBox}>
          <Button title="Get code (dev)" onPress={handleDevOtp} variant="secondary" />
          <Text style={styles.devHint}>Dev shortcut — fetches the current TOTP from the backend.</Text>
        </View>
      ) : null}

      <Button title="Back to login" onPress={() => navigation.goBack()} variant="secondary" style={styles.back} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    marginTop: spacing.xl,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.muted,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  devBox: {
    marginTop: spacing.lg,
  },
  devHint: {
    marginTop: spacing.sm,
    textAlign: 'center',
    fontSize: fontSize.sm,
    color: colors.muted,
  },
  back: {
    marginTop: spacing.lg,
  },
});
