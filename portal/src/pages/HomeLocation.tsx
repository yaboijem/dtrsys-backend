import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { Banner, SectionCard } from '../components/Feedback';
import { Screen } from '../components/Screen';
import { errorMessage } from '../lib/format';
import { gpsFailureMessage, resolveGpsPosition } from '../lib/location';
import { fontSize, spacing, useThemeColors } from '../theme';

interface HomeLocationPayload {
  work_arrangement: string;
  status: 'none' | 'pending' | 'approved';
  primary: {
    id: number;
    label: string | null;
    latitude: number;
    longitude: number;
    radius_meters: number;
    status: string;
  } | null;
  pending: {
    id: number;
    label: string | null;
    latitude: number;
    longitude: number;
    status: string;
  } | null;
}

export function HomeLocationPage() {
  const colors = useThemeColors();
  const navigate = useNavigate();
  const { api, token, user, refreshMe } = useAuth();
  const [data, setData] = useState<HomeLocationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const arrangement =
    user?.employee?.work_arrangement ?? data?.work_arrangement ?? 'onsite';
  const needsHome = arrangement === 'wfh' || arrangement === 'hybrid';

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const res = await api.get<{ data: HomeLocationPayload }>('/api/home-location', undefined, token);
      setData(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [api, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitCurrentLocation = async () => {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const gps = await resolveGpsPosition();
      if (gps.status !== 'ok') {
        setError(gpsFailureMessage(gps.status));
        return;
      }
      await api.post(
        '/api/home-location',
        {
          latitude: gps.position.latitude,
          longitude: gps.position.longitude,
          accuracy_meters: gps.position.accuracy,
          label: 'My Home',
        },
        token,
      );
      setMessage('Submitted for HR approval.');
      await load();
      await refreshMe();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
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
          color: colors.teal,
          fontWeight: 700,
          fontSize: fontSize.sm,
          marginBottom: spacing.sm,
          padding: 0,
        }}
      >
        ← Back
      </button>

      <h1 className="portal-page-title">Home location</h1>

      {loading ? (
        <div style={{ color: colors.muted, fontSize: fontSize.sm }}>Loading…</div>
      ) : !needsHome ? (
        <Banner
          kind="info"
          title="Onsite employee"
          detail="Home location is only required for WFH or hybrid staff. Ask HR to update your work arrangement if needed."
        />
      ) : (
        <>
          {error && <Banner kind="error" title="Error" detail={error} />}
          {message && <Banner kind="success" title="Submitted" detail={message} />}

          <SectionCard title="Status">
            <div style={{ fontSize: fontSize.md, fontWeight: 700, color: colors.ink, marginBottom: 8 }}>
              {(data?.status ?? 'none').toUpperCase()}
            </div>
            {data?.primary && (
              <div style={{ fontSize: fontSize.sm, color: colors.muted }}>
                Approved pin: {data.primary.latitude.toFixed(5)}, {data.primary.longitude.toFixed(5)} (±{data.primary.radius_meters}m)
              </div>
            )}
            {data?.pending && (
              <div style={{ fontSize: fontSize.sm, color: colors.muted, marginTop: 6 }}>
                Pending pin: {data.pending.latitude.toFixed(5)}, {data.pending.longitude.toFixed(5)}
              </div>
            )}
            {data?.status === 'none' && (
              <div style={{ fontSize: fontSize.sm, color: colors.muted }}>
                Submit your home GPS while you are at home. HR must approve before you can punch.
              </div>
            )}
          </SectionCard>

          <Button
            title={data?.status === 'approved' ? 'Request new home location' : 'Use current location'}
            onClick={() => void submitCurrentLocation()}
            loading={submitting}
            style={{ marginTop: spacing.md }}
          />
        </>
      )}
    </Screen>
  );
}
