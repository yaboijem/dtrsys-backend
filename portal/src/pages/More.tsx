import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ApiError } from '../api/client';
import { MfaStatus } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { Banner, Row, SectionCard, Tag } from '../components/Feedback';
import { LabeledInput } from '../components/Inputs';
import { Screen } from '../components/Screen';
import { errorMessage } from '../lib/format';
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

  useEffect(() => {
    loadMfaStatus();
  }, [loadMfaStatus]);

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
        window.alert('Request failed: ' + (Object.values(err.errors).flat()[0] ?? err.message));
      } else {
        window.alert('Request failed: ' + errorMessage(err));
      }
    } finally {
      setRequestingDeviceChange(false);
    }
  };

  const confirmLogout = () => {
    if (window.confirm('Log out? You will need to log in again on this device.')) {
      logout();
    }
  };

  return (
    <Screen>
      <div style={{ fontSize: fontSize.xl, fontWeight: '800', marginBottom: spacing.md, color: colors.ink }}>More</div>

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
        <button
          onClick={() => navigate('/more/consent')}
          aria-label="Consent and data"
          style={{
            display: 'flex',
            alignItems: 'center',
            minHeight: 48,
            width: '100%',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <div style={{ flex: 1, marginRight: spacing.md }}>
            <div style={{ fontSize: fontSize.md, fontWeight: '700', color: colors.ink }}>Consent & data</div>
            <div style={{ fontSize: fontSize.sm, marginTop: 2, color: colors.muted }}>
              Manage consent, export a copy of your data, or request deletion.
            </div>
          </div>
          <span style={{ color: colors.muted }}>›</span>
        </button>
      </SectionCard>

      <SectionCard title="Security">
        {mfaStatus ? (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm }}>
              <Tag label={mfaStatus.mfa_enabled ? 'MFA enabled' : 'MFA not enabled'} tone={mfaStatus.mfa_enabled ? 'success' : 'warning'} />
              {mfaStatus.mfa_required_by_role ? <Tag label="Required by role" tone="neutral" /> : null}
            </div>
            <div style={{ fontSize: fontSize.sm, marginBottom: spacing.md, color: colors.muted }}>
              {mfaStatus.mfa_required_by_role && !mfaStatus.mfa_enabled
                ? 'Your role requires two-factor authentication. HR can help you set it up.'
                : 'Two-factor authentication protects privileged accounts.'}
            </div>
          </>
        ) : (
          <div style={{ fontSize: fontSize.sm, color: colors.muted }}>Checking security settings…</div>
        )}
      </SectionCard>

      <SectionCard title="Server">
        <LabeledInput label="API base URL" value={serverUrlInput} onChangeText={setServerUrlInput} placeholder="http://192.168.x.x:8000" />
        <Button title="Save server URL" onClick={saveServerUrl} loading={savingUrl} variant="secondary" />
      </SectionCard>

      <SectionCard title="Device">
        <LabeledInput label="Device ID" value={deviceIdInput} onChangeText={setDeviceIdInput} placeholder="device-id" />
        <Button title="Save device ID" onClick={saveDeviceId} loading={savingDevice} variant="secondary" />

        <div style={{ height: 1, marginTop: spacing.lg, marginBottom: spacing.lg, backgroundColor: colors.border }} />
        <div style={{ fontSize: fontSize.sm, marginBottom: spacing.md, color: colors.muted }}>
          Registered a new phone? Request approval so punches are accepted on it.
        </div>
        <LabeledInput label="New device ID" value={newDeviceId} onChangeText={setNewDeviceId} placeholder="new-device-id" />
        <LabeledInput label="Reason" value={reason} onChangeText={setReason} multiline placeholder="e.g. Replaced old phone" />
        <Button
          title="Submit device change request"
          onClick={requestDeviceChange}
          loading={requestingDeviceChange}
          variant="secondary"
          disabled={!newDeviceId.trim() || !reason.trim()}
        />
      </SectionCard>

      <Button title="Log out" variant="danger" onClick={confirmLogout} />
    </Screen>
  );
}
