import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { MfaStatus } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { Banner, Row, SectionCard, Tag } from '../components/Feedback';
import { LabeledInput } from '../components/Inputs';
import { Screen } from '../components/Screen';
import { MoreStackParamList } from '../navigation/RootNavigator';
import { fontSize, spacing, useThemeColors } from '../theme';

export function MoreScreen() {
  const colors = useThemeColors();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const { api, token, user, deviceId, setDeviceId, serverUrl, setServerUrl, logout } = useAuth();

  const [serverUrlInput, setServerUrlInput] = useState(serverUrl);
  const [deviceIdInput, setDeviceIdInput] = useState(deviceId);
  const [savingUrl, setSavingUrl] = useState(false);
  const [savingDevice, setSavingDevice] = useState(false);
  const [mfaStatus, setMfaStatus] = useState<MfaStatus | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadMfaStatus = useCallback(async () => {
    if (!token) {
      return;
    }
    try {
      const res = await api.get<MfaStatus>('/api/auth/mfa/status', undefined, token);
      setMfaStatus(res);
    } catch {
      // non-fatal
    }
  }, [api, token]);

  useFocusEffect(
    useCallback(() => {
      loadMfaStatus();
    }, [loadMfaStatus]),
  );

  const saveServerUrl = async () => {
    setSavingUrl(true);
    setNotice(null);
    try {
      await setServerUrl(serverUrlInput);
      setNotice(`Server URL updated to ${serverUrlInput.trim()}.`);
    } catch {
      // storage errors are unlikely; ignore
    } finally {
      setSavingUrl(false);
    }
  };

  const saveDeviceId = async () => {
    setSavingDevice(true);
    setNotice(null);
    try {
      await setDeviceId(deviceIdInput);
      setNotice(`Device ID updated to ${deviceIdInput.trim()}. It will be used on the next login and punch.`);
    } finally {
      setSavingDevice(false);
    }
  };

  const confirmLogout = () => {
    Alert.alert('Log out?', 'You will need to log in again on this device.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => logout() },
    ]);
  };

  return (
    <Screen>
      <Text style={[styles.title, { color: colors.ink }]}>More</Text>

      {notice ? <Banner kind="info" title={notice} /> : null}

      <SectionCard title="Account">
        <Row label="Name" value={user?.employee?.full_name ?? user?.name ?? '—'} />
        <Row label="Employee ID" value={user?.employee_id ?? '—'} />
        <Row label="Roles" value={(user?.roles ?? []).join(', ') || '—'} />
        <Row label="Branch" value={user?.employee?.branch?.name ?? '—'} />
        <Row label="Department" value={user?.employee?.department ?? '—'} />
        <Row label="Position" value={user?.employee?.position ?? '—'} />
      </SectionCard>

      <SectionCard title="Privacy">
        <TouchableOpacity
          style={styles.navRow}
          onPress={() => navigation.navigate('Consent')}
          accessibilityRole="button"
          accessibilityLabel="Consent and data"
        >
          <View style={styles.navText}>
            <Text style={[styles.navTitle, { color: colors.ink }]}>Consent</Text>
            <Text style={[styles.navSub, { color: colors.muted }]}>
              Manage biometric and GPS consent preferences.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </TouchableOpacity>
      </SectionCard>

      <SectionCard title="Security">
        {mfaStatus ? (
          <>
            <View style={styles.tagRow}>
              <Tag label={mfaStatus.mfa_enabled ? 'MFA enabled' : 'MFA not enabled'} tone={mfaStatus.mfa_enabled ? 'success' : 'warning'} />
              {mfaStatus.mfa_required_by_role ? <Tag label="Required by role" tone="neutral" /> : null}
            </View>
            <Text style={[styles.sectionNote, { color: colors.muted }]}>
              {mfaStatus.mfa_required_by_role && !mfaStatus.mfa_enabled
                ? 'Your role requires two-factor authentication. HR can help you set it up.'
                : 'Two-factor authentication protects privileged accounts.'}
            </Text>
          </>
        ) : (
          <Text style={[styles.sectionNote, { color: colors.muted }]}>Checking security settings…</Text>
        )}
      </SectionCard>

      <SectionCard title="Server">
        <LabeledInput label="API base URL" value={serverUrlInput} onChangeText={setServerUrlInput} autoCapitalize="none" autoCorrect={false} placeholder="http://192.168.x.x:8000" />
        <Button title="Save server URL" onPress={saveServerUrl} loading={savingUrl} variant="secondary" />
      </SectionCard>

      <SectionCard title="Device">
        <Text style={[styles.sectionNote, { color: colors.muted }]}>
          Optional label sent with login and punches. You can use multiple devices freely.
        </Text>
        <LabeledInput label="Device ID" value={deviceIdInput} onChangeText={setDeviceIdInput} autoCapitalize="none" autoCorrect={false} placeholder="device-id" />
        <Button title="Save device ID" onPress={saveDeviceId} loading={savingDevice} variant="secondary" />
      </SectionCard>

      <Button title="Log out" variant="danger" onPress={confirmLogout} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    marginBottom: spacing.md,
  },
  sectionNote: {
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
  },
  navText: {
    flex: 1,
    marginRight: spacing.md,
  },
  navTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  navSub: {
    fontSize: fontSize.sm,
    marginTop: 2,
  },
});
