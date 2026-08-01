import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';

import { ApiError } from '../api/client';
import { Consent, DataRequest, Paginated } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { Banner, Row, SectionCard, Tag } from '../components/Feedback';
import { Screen } from '../components/Screen';
import { errorMessage, formatDateTime } from '../lib/format';
import { colors, fontSize, spacing } from '../theme';

const CONSENT_TYPES = [
  { key: 'biometric_photos', label: 'Biometric photos', description: 'Allow capture and storage of selfies for face verification on time-in/out.' },
  { key: 'gps_location', label: 'GPS location', description: 'Allow capture and storage of your location when punching in or out.' },
] as const;

export function ConsentScreen() {
  const { api, token } = useAuth();

  const [consents, setConsents] = useState<Consent[]>([]);
  const [requests, setRequests] = useState<DataRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      return;
    }
    setError(null);
    try {
      const [consentRes, requestRes] = await Promise.all([
        api.get<Paginated<Consent>>('/api/employee/consent', undefined, token),
        api.get<Paginated<DataRequest>>('/api/employee/data-requests', { per_page: 10 }, token),
      ]);
      setConsents(consentRes.data ?? []);
      setRequests(requestRes.data ?? []);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [api, token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const grantedFor = (key: string): boolean => {
    const entry = consents.find((c) => c.type === key);
    return entry ? entry.granted : false;
  };

  const toggleConsent = async (key: string, granted: boolean) => {
    if (!token) {
      return;
    }
    setSaving(key);
    setNotice(null);
    try {
      const updated = await api.post<Consent>('/api/employee/consent', { type: key, granted }, token);
      setConsents((prev) => {
        const others = prev.filter((c) => c.type !== key);
        return [...others, updated];
      });
    } catch (err) {
      Alert.alert('Update failed', errorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  const requestData = async (type: 'access' | 'deletion') => {
    if (!token) {
      return;
    }
    setRequesting(true);
    setNotice(null);
    try {
      const res = await api.post<{ data: DataRequest; export?: Record<string, unknown> }>(
        '/api/employee/data-requests',
        { type },
        token,
      );
      const exportPayload = res.export;
      setNotice(
        type === 'access'
          ? `Your data export is ready (${Object.keys(exportPayload ?? {}).length} sections). It is also saved as a completed request in your history.`
          : 'Deletion request submitted. HR will review it.',
      );
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        Alert.alert('Request failed', err.message);
      } else {
        Alert.alert('Request failed', errorMessage(err));
      }
    } finally {
      setRequesting(false);
    }
  };

  const confirmDeletion = () => {
    Alert.alert('Request account data deletion?', 'This cannot be undone and requires HR approval.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Request deletion', style: 'destructive', onPress: () => requestData('deletion') },
    ]);
  };

  return (
    <Screen>
      <Text style={styles.title}>Consent & data</Text>

      {error ? <Banner kind="error" title="Failed to load" detail={error} /> : null}
      {notice ? <Banner kind="success" title={notice} /> : null}

      <SectionCard title="Consents">
        {loading ? <Text style={styles.muted}>Loading…</Text> : null}
        {CONSENT_TYPES.map(({ key, label, description }) => {
          const entry = consents.find((c) => c.type === key);
          return (
            <View key={key} style={styles.consentRow}>
              <View style={styles.consentText}>
                <Text style={styles.consentLabel}>{label}</Text>
                <Text style={styles.muted}>{description}</Text>
                {entry ? (
                  <Text style={styles.consentMeta}>
                    {entry.granted
                      ? `Granted ${formatDateTime(entry.granted_at)}`
                      : entry.revoked_at
                        ? `Revoked ${formatDateTime(entry.revoked_at)}`
                        : 'Not set'}
                  </Text>
                ) : null}
              </View>
              <Switch
                value={grantedFor(key)}
                onValueChange={(value) => toggleConsent(key, value)}
                disabled={saving === key}
                trackColor={{ true: colors.success, false: colors.border }}
              />
            </View>
          );
        })}
      </SectionCard>

      <SectionCard title="Data requests">
        <Text style={styles.muted}>
          Request a copy of your personal data (immediate) or request deletion of your account and data (requires HR
          approval).
        </Text>
        <View style={styles.requestButtons}>
          <Button title="Export my data" onPress={() => requestData('access')} disabled={requesting} style={styles.flexButton} />
          <Button title="Request deletion" variant="danger" onPress={confirmDeletion} disabled={requesting} style={styles.flexButton} />
        </View>

        {requests.length > 0 ? (
          <View style={styles.requestsList}>
            {requests.map((r) => (
              <Row
                key={r.id}
                label={`${r.type === 'access' ? 'Access' : 'Deletion'} · ${formatDateTime(r.created_at)}`}
                value={r.status}
                valueColor={
                  r.status === 'completed' || r.status === 'approved'
                    ? colors.success
                    : r.status === 'rejected'
                      ? colors.danger
                      : colors.warning
                }
              />
            ))}
          </View>
        ) : null}
      </SectionCard>
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
  muted: {
    fontSize: fontSize.sm,
    color: colors.muted,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  consentText: {
    flex: 1,
    marginRight: spacing.md,
  },
  consentLabel: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  consentMeta: {
    fontSize: fontSize.sm,
    color: colors.muted,
    marginTop: spacing.xs,
  },
  requestButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  flexButton: {
    flex: 1,
  },
  requestsList: {
    marginTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
});
