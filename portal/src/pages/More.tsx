import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ShieldAlert } from 'lucide-react';

import { MfaStatus } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { ConfirmModal } from '../components/ConfirmModal';
import { Avatar, Banner, SectionCard } from '../components/Feedback';
import { Screen } from '../components/Screen';
import { ThemeToggle } from '../components/ThemeToggle';
import { getSwStatus, onSwStatus, type SwStatus } from '../pwa/register';
import { fontSize, spacing, useThemeColors } from '../theme';

function swStatusLabel(status: SwStatus): string {
  switch (status) {
    case 'ready':
      return 'Offline Ready';
    case 'registered':
    case 'registering':
      return 'Preparing offline…';
    case 'dev':
      return 'Offline unavailable (dev)';
    case 'unsupported':
      return 'Offline unavailable';
    case 'error':
      return 'Offline unavailable';
    default:
      return 'Offline unavailable';
  }
}

export function More() {
  const colors = useThemeColors();
  const navigate = useNavigate();
  const { api, token, user, logout } = useAuth();

  const [mfaStatus, setMfaStatus] = useState<MfaStatus | null>(null);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [swStatus, setSwStatus] = useState<SwStatus>(() => getSwStatus().status);

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

  useEffect(() => {
    return onSwStatus((status) => {
      setSwStatus(status);
    });
  }, []);

  const displayName = user?.employee?.full_name ?? user?.name ?? '—';

  return (
    <Screen>
      <h1 className="portal-page-title">More</h1>

      <SectionCard title="User profile">
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
          <Avatar name={displayName} size={52} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: fontSize.lg, fontWeight: 800, color: colors.ink, letterSpacing: '-0.02em' }}>
              {displayName}
            </div>
            <div className="tnum" style={{ fontSize: fontSize.sm, color: colors.muted, fontWeight: 600, marginTop: 2 }}>
              {user?.employee_id ?? '—'}
            </div>
          </div>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: `${spacing.md}px ${spacing.lg}px`,
            marginTop: spacing.lg,
            paddingTop: spacing.lg,
            borderTop: `1px solid ${colors.border}`,
          }}
        >
          {(
            [
              ['Department', user?.employee?.department ?? '—'],
              ['Branch', user?.employee?.branch?.name ?? '—'],
              ['Position', user?.employee?.position ?? '—'],
              ['Roles', (user?.roles ?? []).join(', ') || '—'],
            ] as const
          ).map(([label, value]) => (
            <div key={label} style={{ minWidth: 0 }}>
              <div style={{ fontSize: fontSize.sm, color: colors.muted, marginBottom: 4 }}>{label}</div>
              <div
                style={{
                  fontSize: fontSize.sm,
                  fontWeight: 600,
                  color: colors.ink,
                  wordBreak: 'break-word',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {value}
              </div>
            </div>
          ))}
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

      <SectionCard title="Offline">
        <div
          style={{
            fontSize: fontSize.md,
            fontWeight: 700,
            color: swStatus === 'ready' ? colors.successText : colors.ink,
          }}
        >
          {swStatusLabel(swStatus)}
        </div>
      </SectionCard>

      <Button
        title="Log out"
        variant="outline-danger"
        onClick={() => setLogoutOpen(true)}
        style={{ marginTop: spacing.sm }}
      />

      <ConfirmModal
        open={logoutOpen}
        title="Log out?"
        message="You will need to log in again on this device."
        confirmLabel="Log out"
        danger
        onCancel={() => setLogoutOpen(false)}
        onConfirm={() => {
          setLogoutOpen(false);
          logout();
        }}
      />
    </Screen>
  );
}
