import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { Banner } from '../components/Feedback';
import { LabeledInput } from '../components/Inputs';
import { Screen } from '../components/Screen';
import { DEV_OTP_ENABLED } from '../config';
import { errorMessage } from '../lib/format';
import { AuthStackParamList } from '../navigation/RootNavigator';
import { cardShadow, fontSize, microLabel, radius, spacing, useIsDark, useThemeColors } from '../theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const isDark = useIsDark();
  const { login, deviceId, serverUrl } = useAuth();
  const [employeeId, setEmployeeId] = useState(DEV_OTP_ENABLED ? 'EMP001' : '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const outcome = await login(employeeId.trim(), password);
      if (outcome === 'mfa_required') {
        navigation.navigate('Mfa');
      }
    } catch (err) {
      if (err instanceof ApiError && err.errors) {
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
    <Screen contentContainerStyle={styles.page}>
      <View style={[styles.brand, cardShadow(isDark), { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.mark, { backgroundColor: colors.band }]}>
          <Text style={[styles.markText, { color: colors.bandText }]}>DTR</Text>
        </View>
        <Text style={[styles.title, { color: colors.ink }]}>Daily Time Record</Text>
        <Text style={[microLabel, styles.subtitle, { color: colors.muted, opacity: 0.8 }]}>Employee sign-in</Text>

        <View style={styles.fields}>
          <LabeledInput
            label="Employee ID"
            value={employeeId}
            onChangeText={setEmployeeId}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="Enter your employee ID"
          />
          <LabeledInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Enter your password"
          />

          <Button title="Login" onPress={handleLogin} loading={loading} />
        </View>
      </View>

      {error ? <Banner kind="error" title="Login failed" detail={error} /> : null}

      {DEV_OTP_ENABLED ? (
        <View>
          <Text style={[styles.hint, { color: colors.muted }]}>Device: {deviceId} · Server: {serverUrl}</Text>
          <Text style={[styles.hint, { color: colors.muted }]}>Device ID and server URL can be changed after login, or via app config.</Text>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  brand: {
    alignItems: 'stretch',
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  mark: {
    alignSelf: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  markText: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    letterSpacing: 3,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  fields: {
    gap: spacing.lg,
    marginTop: spacing.xl,
  },
  hint: {
    marginTop: spacing.sm,
    textAlign: 'center',
    fontSize: fontSize.sm,
  },
});
