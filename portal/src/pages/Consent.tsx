import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ApiError } from '../api/client';
import { Consent as ConsentType, DataRequest, Paginated } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { Banner, Row, SectionCard } from '../components/Feedback';
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
        api.get<Paginated<ConsentType>>('/api/employee/consent', undefined, token),
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
    setNotice(null);
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
        window.alert('Request failed: ' + err.message);
      } else {
        window.alert('Request failed: ' + errorMessage(err));
      }
    } finally {
      setRequesting(false);
    }
  };

  const confirmDeletion = () => {
    if (window.confirm('Request account data deletion? This cannot be undone and requires HR approval.')) {
      requestData('deletion');
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

      <div style={{ fontSize: fontSize.xl, fontWeight: '800', marginBottom: spacing.md, color: colors.ink }}>
        Consent & data
      </div>

      {error ? <Banner kind="error" title="Failed to load" detail={error} /> : null}
      {notice ? <Banner kind="success" title={notice} /> : null}

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

      <SectionCard title="Data requests">
        <div style={{ fontSize: fontSize.sm, color: colors.muted }}>
          Request a copy of your personal data (immediate) or request deletion of your account and data (requires HR
          approval).
        </div>
        <div style={{ display: 'flex', gap: spacing.md, marginTop: spacing.md }}>
          <Button title="Export my data" onClick={() => requestData('access')} disabled={requesting} style={{ flex: 1 }} />
          <Button title="Request deletion" variant="danger" onClick={confirmDeletion} disabled={requesting} style={{ flex: 1 }} />
        </div>

        {requests.length > 0 ? (
          <div style={{ marginTop: spacing.md, borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: colors.border, paddingTop: spacing.sm }}>
            {requests.map((r) => (
              <Row
                key={r.id}
                label={`${r.type === 'access' ? 'Access' : 'Deletion'} · ${formatDateTime(r.created_at)}`}
                value={r.status}
                valueColor={
                  r.status === 'completed' || r.status === 'approved'
                    ? colors.successText
                    : r.status === 'rejected'
                      ? colors.dangerText
                      : colors.warningText
                }
              />
            ))}
          </div>
        ) : null}
      </SectionCard>
    </Screen>
  );
}
