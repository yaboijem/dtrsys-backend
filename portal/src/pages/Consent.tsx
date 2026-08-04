import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Consent as ConsentType, Paginated } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Banner, SectionCard } from '../components/Feedback';
import { Screen } from '../components/Screen';
import { errorMessage, formatDateTime } from '../lib/format';
import { fontSize, spacing, useThemeColors } from '../theme';

const CONSENT_TYPES = [
  { key: 'biometric_photos', label: 'Biometric photos', description: 'Allow capture and storage of selfies for face verification on time-in/out.' },
  { key: 'gps_location', label: 'GPS location', description: 'Allow capture and storage of your location when punching in or out.' },
] as const;

export function Consent() {
  const colors = useThemeColors();
  const navigate = useNavigate();
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

  return (
    <Screen>
      <button
        onClick={() => navigate('/more')}
        aria-label="Back to More"
        style={{
          display: 'flex',
          alignItems: 'center',
          minHeight: 44,
          alignSelf: 'flex-start',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        <span style={{ fontSize: fontSize.md, fontWeight: '600', color: colors.band }}>← More</span>
      </button>

      <h1 className="portal-page-title" style={{ color: colors.ink, marginBottom: spacing.lg }}>
        Consent
      </h1>


      {error ? <Banner kind="error" title="Failed to load" detail={error} /> : null}

      <SectionCard title="Consents">
        {loading ? <div style={{ fontSize: fontSize.sm, color: colors.muted }}>Loading…</div> : null}
        {CONSENT_TYPES.map(({ key, label, description }) => {
          const entry = consents.find((c) => c.type === key);
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
                <div style={{ fontSize: fontSize.sm, color: colors.muted }}>{description}</div>
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
              <input
                type="checkbox"
                checked={grantedFor(key)}
                onChange={(e) => toggleConsent(key, e.target.checked)}
                disabled={saving === key}
                aria-label={label}
                style={{
                  width: 20,
                  height: 20,
                  cursor: saving === key ? 'not-allowed' : 'pointer',
                }}
              />
            </div>
          );
        })}
      </SectionCard>
    </Screen>
  );
}
