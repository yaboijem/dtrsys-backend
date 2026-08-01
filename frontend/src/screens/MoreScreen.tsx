import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../api/client';
import { MfaStatus } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { Banner, Row, SectionCard, Tag } from '../components/Feedback';
import { LabeledInput } from '../components/Inputs';
import { Screen } from '../components/Screen';
import { errorMessage } from '../lib/format';
import { colors, fontSize, spacing } from '../theme';

export function MoreScreen() {
  const { api, token, user, deviceId, setDeviceId, serverUrl, setServerUrl, logout } = useAuth();

  const [serverUrlInput, setServerUrlInput] = useState(serverUrl);
  const [deviceIdInput, setDeviceIdInput] = useState(deviceId);
  const [savingUrl, setSavingUrl] = useState(false);
  const [savingDevice, setSavingDevice] = useState(false);
  const [mfaStatus, setMfaStatus] = useState<MfaStatus | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [newDeviceId, setNewDeviceId] = useState('');
  const [reason, setReason] = useState('');
  const [requestingDeviceChange, setRequestingDeviceChange] = useState(false);

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
      setNotice(
        `Device ID updated to ${deviceIdInput.trim()}. If it is not registered for your account, punches will be blocked until HR approves a device change request.`,
      );
    } finally {
      setSavingDevice(false);
    }
  };

  const requestDeviceChange = async () => {
    if (!token) {
      return;
    }
    setRequestingDeviceChange(true);
    setNotice(null);
    try {
      await api.post<{ message: string }>(
        '/api/device/change-requests',
        {
          new_device_id: newDeviceId.trim(),
          reason: reason.trim(),
        },
        token,
      );
      setNotice('Device change request submitted. HR will review it.');
      setNewDeviceId('');
      setReason('');
    } catch (err) {
      if (err instanceof ApiError && err.errors) {
        Alert.alert('Request failed', Object.values(err.errors).flat()[0] ?? err.message);
      } else {
        Alert.alert('Request failed', errorMessage(err));
      }
    } finally {
      setRequestingDeviceChange(false);
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
      <Text style={styles.title}>More</Text>

      {notice ? <Banner kind="info" title={notice} /> : null}

      <SectionCard title="Account">
        <Row label="Name" value={user?.employee?.full_name ?? user?.name ?? '—'} />
        <Row label="Employee ID" value={user?.employee_id ?? '—'} />
        <Row label="Roles" value={(user?.roles ?? []).join(', ') || '—'} />
        <Row label="Branch" value={user?.employee?.branch?.name ?? '—'} />
        <Row label="Department" value={user?.employee?.department ?? '—'} />
        <Row label="Position" value={user?.employee?.position ?? '—'} />
      </SectionCard>

      <SectionCard title="Server">
        <LabeledInput label="API base URL" value={serverUrlInput} onChangeText={setServerUrlInput} autoCapitalize="none" autoCorrect={false} placeholder="http://192.168.x.x:8000" />
        <Button title="Save server URL" onPress={saveServerUrl} loading={savingUrl} variant="secondary" />
      </SectionCard>

      <SectionCard title="Device">
        <LabeledInput label="Device ID" value={deviceIdInput} onChangeText={setDeviceIdInput} autoCapitalize="none" autoCorrect={false} placeholder="device-id" />
        <Button title="Save device ID" onPress={saveDeviceId} loading={savingDevice} variant="secondary" />

        <View style={styles.divider} />
        <Text style={styles.sectionNote}>Registered a new phone? Request approval so punches are accepted on it.</Text>
        <LabeledInput label="New device ID" value={newDeviceId} onChangeText={setNewDeviceId} autoCapitalize="none" autoCorrect={false} placeholder="new-device-id" />
        <LabeledInput label="Reason" value={reason} onChangeText={setReason} multiline placeholder="e.g. Replaced old phone" />
        <Button
          title="Submit device change request"
          onPress={requestDeviceChange}
          loading={requestingDeviceChange}
          variant="secondary"
          disabled={!newDeviceId.trim() || !reason.trim()}
        />
      </SectionCard>

      <SectionCard title="Security">
        {mfaStatus ? (
          <>
            <View style={styles.tagRow}>
              <Tag label={mfaStatus.mfa_enabled ? 'MFA enabled' : 'MFA not enabled'} tone={mfaStatus.mfa_enabled ? 'success' : 'warning'} />
              {mfaStatus.mfa_required_by_role ? <Tag label="Required by role" tone="neutral" /> : null}
            </View>
            <Text style={styles.sectionNote}>
              {mfaStatus.mfa_required_by_role && !mfaStatus.mfa_enabled
                ? 'Your role requires two-factor authentication. HR can help you set it up.'
                : 'Two-factor authentication protects privileged accounts.'}
            </Text>
          </>
        ) : (
          <Text style={styles.sectionNote}>Checking security settings…</Text>
        )}
      </SectionCard>

      <Button title="Log out" variant="danger" onPress={confirmLogout} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },
  sectionNote: {
    fontSize: fontSize.sm,
    color: colors.muted,
    marginBottom: spacing.md,
  },
  tagRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
});
