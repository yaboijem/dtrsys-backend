import { useCallback, useEffect, useState } from 'react';

import { Consent as ConsentType, Paginated } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { BackPill } from '../components/BackPill';
import { Banner, SectionCard } from '../components/Feedback';
import { Screen } from '../components/Screen';
import { Switch } from '../components/Switch';
import { errorMessage, formatDateTime } from '../lib/format';
import { disableDevicePush, enableDevicePush, pushErrorMessage, pushSupported } from '../lib/push';
import { fontSize, spacing, useThemeColors } from '../theme';

const CONSENT_TYPES = [
  { key: 'biometric_photos', label: 'Biometric photos', description: 'Allow capture and storage of selfies on time-in/out.' },
  { key: 'gps_location', label: 'GPS location', description: 'Allow capture and storage of your location when punching in or out.' },
  { key: 'device_alerts', label: 'Device alerts', description: 'Allow this phone to show break and alert notifications.' },
] as const;

export function Consent() {
  const colors = useThemeColors();
  const { api, token } = useAuth();

  const [consents, setConsents] = useState<ConsentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      return;
    }
    setError(null);
    try {
      const consentRes = await api.get<Paginated<ConsentType>>('/api/employee/consent', undefined, token);
      setConsents(consentRes.data ?? []);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [api, token]);

  useEffect(() => {
    load();
  }, [load]);

  const grantedFor = (key: string): boolean => {
    const entry = consents.find((c) => c.type === key);
    return entry ? entry.granted : false;
  };

  const toggleConsent = async (key: string, granted: boolean) => {
    if (!token) {
      return;
    }
    setSaving(key);
    try {
      const updated = await api.post<{ data: ConsentType }>('/api/employee/consent', { type: key, granted }, token);
      setConsents((prev) => {
        const others = prev.filter((c) => c.type !== key);
        return [...others, updated.data];
      });
    } catch (err) {
      window.alert('Update failed: ' + errorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  const toggleDeviceAlerts = async (granted: boolean) => {
    if (!token) {
      return;
    }
    setSaving('device_alerts');
    try {
      if (granted) {
        await enableDevicePush(api, token);
      } else {
        await disableDevicePush(api, token);
      }
      const updated = await api.post<{ data: ConsentType }>('/api/employee/consent', { type: 'device_alerts', granted }, token);
      setConsents((prev) => {
        const others = prev.filter((c) => c.type !== 'device_alerts');
        return [...others, updated.data];
      });
    } catch (err) {
      window.alert(`${granted ? 'Could not enable' : 'Could not disable'} device alerts: ${pushErrorMessage(err)}`);
    } finally {
      setSaving(null);
    }
  };

  return (
    <Screen>
      <BackPill to="/more" label="Back" ariaLabel="Back to More" />

      <h1 className="portal-page-title" style={{ color: colors.ink, marginBottom: spacing.lg }}>
        Consent
      </h1>


      {error ? <Banner kind="error" title="Failed to load" detail={error} /> : null}

      <SectionCard title="Consents">
        {loading ? <div style={{ fontSize: fontSize.sm, color: colors.muted }}>Loading…</div> : null}
        {CONSENT_TYPES.map(({ key, label, description }) => {
          const entry = consents.find((c) => c.type === key);
          const unsupported = key === 'device_alerts' && !pushSupported();
          return (
            <div
              key={key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: spacing.sm,
                paddingBottom: spacing.sm,
                borderBottomWidth: 1,
                borderBottomStyle: 'solid',
                borderBottomColor: colors.border,
              }}
            >
              <div style={{ flex: 1, marginRight: spacing.md }}>
                <div style={{ fontSize: fontSize.md, fontWeight: '700', color: colors.ink }}>{label}</div>
                <div style={{ fontSize: fontSize.sm, color: colors.muted }}>
                  {unsupported ? 'This browser cannot show device alerts.' : description}
                </div>
                {entry ? (
                  <div style={{ fontSize: fontSize.sm, marginTop: spacing.xs, color: colors.muted }}>
                    {entry.granted
                      ? `Granted ${formatDateTime(entry.granted_at)}`
                      : entry.revoked_at
                        ? `Revoked ${formatDateTime(entry.revoked_at)}`
                        : 'Not set'}
                  </div>
                ) : null}
              </div>
              <Switch
                checked={grantedFor(key)}
                onChange={(next) =>
                  key === 'device_alerts' ? toggleDeviceAlerts(next) : toggleConsent(key, next)
                }
                disabled={saving === key || unsupported}
                label={label}
              />
            </div>
          );
        })}
      </SectionCard>
    </Screen>
  );
}
