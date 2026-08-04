import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ShieldAlert } from 'lucide-react';

import { MfaStatus } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { Avatar, Banner, Row, SectionCard } from '../components/Feedback';
import { LabeledInput } from '../components/Inputs';
import { Screen } from '../components/Screen';
import { ThemeToggle } from '../components/ThemeToggle';
import { fontSize, spacing, useThemeColors } from '../theme';

export function More() {
  const colors = useThemeColors();
  const navigate = useNavigate();
  const { api, token, user, deviceId, setDeviceId, serverUrl, setServerUrl, logout } = useAuth();

  const [serverUrlInput, setServerUrlInput] = useState(serverUrl);
  const [deviceIdInput, setDeviceIdInput] = useState(deviceId);
  const [savingUrl, setSavingUrl] = useState(false);
  const [savingDevice, setSavingDevice] = useState(false);
  const [mfaStatus, setMfaStatus] = useState<MfaStatus | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadMfaStatus = useCallback(async () => {
    if (!token) return;
    try {
      setMfaStatus(await api.get<MfaStatus>('/api/auth/mfa/status', undefined, token));
    } catch {
      // non-fatal
    }
  }, [api, token]);

  useEffect(() => {
    loadMfaStatus();
  }, [loadMfaStatus]);

  const saveServerUrl = async () => {
    setSavingUrl(true);
    setNotice(null);
    try {
      await setServerUrl(serverUrlInput);
      setNotice(`Server URL updated to ${serverUrlInput.trim()}.`);
    } finally {
      setSavingUrl(false);
    }
  };

  const saveDeviceId = async () => {
    setSavingDevice(true);
    setNotice(null);
    try {
      await setDeviceId(deviceIdInput);
      setNotice(`Device ID updated to ${deviceIdInput.trim()}.`);
    } finally {
      setSavingDevice(false);
    }
  };

  const displayName = user?.employee?.full_name ?? user?.name ?? '—';

  return (
    <Screen>
      <h1 className="portal-page-title">More</h1>

      {notice ? <Banner kind="success" title={notice} /> : null}

      <SectionCard title="User profile">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <Avatar name={displayName} size={52} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: fontSize.lg, fontWeight: 800, color: colors.ink }}>{displayName}</div>
            <div className="tnum" style={{ fontSize: 13, color: colors.muted, fontWeight: 600 }}>
              {user?.employee_id ?? '—'}
            </div>
          </div>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '4px 12px',
            marginTop: 4,
          }}
        >
          <Row label="Department" value={user?.employee?.department ?? '—'} />
          <Row label="Branch" value={user?.employee?.branch?.name ?? '—'} />
          <Row label="Position" value={user?.employee?.position ?? '—'} />
          <Row label="Roles" value={(user?.roles ?? []).join(', ') || '—'} />
        </div>
      </SectionCard>

      <SectionCard title="Security & privacy">
        {mfaStatus && !mfaStatus.mfa_enabled ? (
          <Banner
            kind="warning"
            title="MFA not enabled"
            detail={
              mfaStatus.mfa_required_by_role
                ? 'Your role requires two-factor authentication. Contact HR to finish setup.'
                : 'Add an extra layer of protection for your account.'
            }
            action={
              <button
                type="button"
                onClick={() => window.alert('MFA setup is managed by HR for privileged roles.')}
                style={{
                  flexShrink: 0,
                  border: 'none',
                  borderRadius: 10,
                  minHeight: 36,
                  padding: '0 12px',
                  background: colors.warningFill,
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Setup now
              </button>
            }
          />
        ) : mfaStatus?.mfa_enabled ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 12,
              background: 'color-mix(in srgb, var(--success) 10%, transparent)',
              color: colors.successText,
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            <ShieldAlert size={16} />
            MFA enabled
          </div>
        ) : (
          <div style={{ fontSize: fontSize.sm, color: colors.muted, marginBottom: 8 }}>Checking security…</div>
        )}

        <button
          type="button"
          onClick={() => navigate('/more/consent')}
          style={{
            display: 'flex',
            alignItems: 'center',
            minHeight: 48,
            width: '100%',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
            padding: '8px 0',
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: fontSize.md, fontWeight: 700, color: colors.ink }}>Consent preferences</div>
            <div style={{ fontSize: fontSize.sm, marginTop: 2, color: colors.muted }}>
              Biometric photos and GPS location
            </div>
          </div>
          <ChevronRight size={18} color={colors.muted} />
        </button>
      </SectionCard>

      <SectionCard title="Appearance">
        <div style={{ fontSize: fontSize.sm, color: colors.muted, marginBottom: spacing.md }}>
          Choose light, dark, or match your device setting.
        </div>
        <ThemeToggle />
      </SectionCard>

      <SectionCard title="App configuration">
        <LabeledInput
          label="API base URL"
          value={serverUrlInput}
          onChangeText={setServerUrlInput}
          placeholder="http://192.168.x.x:8000"
        />
        <div style={{ fontSize: 12, color: colors.muted, marginTop: -4, marginBottom: 10 }}>
          Leave blank to use the same origin as this portal.
        </div>
        <Button title="Save server URL" onClick={saveServerUrl} loading={savingUrl} variant="secondary" />

        <div style={{ height: 1, background: colors.border, margin: '16px 0' }} />

        <LabeledInput label="Device ID" value={deviceIdInput} onChangeText={setDeviceIdInput} placeholder="device-id" />
        <div style={{ fontSize: 12, color: colors.muted, marginTop: -4, marginBottom: 10 }}>
          Optional label sent with login and punches. Multiple devices are allowed.
        </div>
        <Button title="Save device ID" onClick={saveDeviceId} loading={savingDevice} variant="secondary" />
      </SectionCard>

      <Button
        title="Log out"
        variant="outline-danger"
        onClick={() => {
          if (window.confirm('Log out? You will need to log in again on this device.')) logout();
        }}
        style={{ marginTop: spacing.sm }}
      />
    </Screen>
  );
}
