import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { Banner } from '../components/Feedback';
import { LabeledInput } from '../components/Inputs';
import { Screen } from '../components/Screen';
import { errorMessage } from '../lib/format';
import { AuthStackParamList } from '../navigation/RootNavigator';
import { colors, fontSize, spacing } from '../theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { login, deviceId, serverUrl } = useAuth();
  const [employeeId, setEmployeeId] = useState('EMP001');
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
      if (err instanceof ApiError && err.code === 'device_not_registered') {
        setError('This device is not registered for this account. Use the device ID linked to the account, or contact HR.');
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
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>DTR</Text>
        <Text style={styles.subtitle}>Daily Time Record</Text>
      </View>

      {error ? <Banner kind="error" title="Login failed" detail={error} /> : null}

      <LabeledInput
        label="Employee ID"
        value={employeeId}
        onChangeText={setEmployeeId}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="e.g. EMP001"
      />
      <LabeledInput
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="••••••••"
      />

      <Button title="Login" onPress={handleLogin} loading={loading} />

      <Text style={styles.hint}>
        Device: {deviceId} · Server: {serverUrl}
      </Text>
      <Text style={styles.hint}>Device ID and server URL can be changed after login, or via app config.</Text>
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
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.muted,
    marginTop: 4,
  },
  hint: {
    marginTop: spacing.lg,
    textAlign: 'center',
    fontSize: fontSize.sm,
    color: colors.muted,
  },
});
