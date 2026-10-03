import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { ConfirmModal } from '../components/ConfirmModal';
import { Avatar, Banner, SectionCard } from '../components/Feedback';
import { Screen } from '../components/Screen';
import { ThemeToggle } from '../components/ThemeToggle';
import { useProfilePhoto } from '../lib/useProfilePhoto';
import { fontSize, spacing, useThemeColors } from '../theme';

export function More() {
  const colors = useThemeColors();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { src: photoSrc, error: photoError, clearError, setFromDataUrl, remove } = useProfilePhoto(
    user?.employee_id,
  );

  const [logoutOpen, setLogoutOpen] = useState(false);

  const displayName = user?.employee?.full_name ?? user?.name ?? '—';

  return (
    <Screen>
      <h1 className="portal-page-title">More</h1>

      <SectionCard title="User profile">
        {photoError ? (
          <div style={{ marginBottom: spacing.md }}>
            <Banner kind="warning" title={photoError} detail="Try a different JPG or PNG." />
          </div>
        ) : null}
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
          <Avatar
            name={displayName}
            size={52}
            src={photoSrc}
            editable
            onSavePhoto={(dataUrl) => {
              clearError();
              void setFromDataUrl(dataUrl);
            }}
            onRemove={remove}
          />
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

        <button
          type="button"
          onClick={() => navigate('/more/home-location')}
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
            <div style={{ fontSize: fontSize.md, fontWeight: 700, color: colors.ink }}>Home location</div>
            <div style={{ fontSize: fontSize.sm, marginTop: 2, color: colors.muted }}>
              WFH geofence — submit and track HR approval
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
