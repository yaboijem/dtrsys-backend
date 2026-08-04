import { useEffect, useState, type CSSProperties } from 'react';

import { onNeedRefresh, onOfflineReady } from '../pwa/register';
import { fontSize, radius, spacing, useThemeColors } from '../theme';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function PwaChrome() {
  const colors = useThemeColors();
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installDismissed, setInstallDismissed] = useState(false);
  const [updateAction, setUpdateAction] = useState<(() => void) | null>(null);
  const [offlineReady, setOfflineReady] = useState(false);

  useEffect(() => {
    const onBip = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBip);
    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, []);

  useEffect(() => {
    const offRefresh = onNeedRefresh((update) => {
      setUpdateAction(() => update);
    });
    const offOffline = onOfflineReady(() => {
      setOfflineReady(true);
      window.setTimeout(() => setOfflineReady(false), 4000);
    });
    return () => {
      offRefresh();
      offOffline();
    };
  }, []);

  const showInstall = Boolean(installEvent) && !installDismissed && !updateAction;
  const showUpdate = Boolean(updateAction);
  const showOffline = offlineReady && !showUpdate && !showInstall;

  if (!showInstall && !showUpdate && !showOffline) {
    return null;
  }

  const barStyle: CSSProperties = {
    position: 'fixed',
    left: spacing.md,
    right: spacing.md,
    bottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))',
    zIndex: 60,
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `${spacing.sm}px ${spacing.md}px`,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors.border,
    backgroundColor: colors.card,
    boxShadow: '0 8px 24px rgba(12, 27, 42, 0.12)',
    color: colors.ink,
    fontSize: fontSize.sm,
  };

  const btnPrimary: CSSProperties = {
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.xs}px ${spacing.md}px`,
    backgroundColor: colors.band,
    color: colors.bandText,
    fontSize: fontSize.sm,
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: 36,
    whiteSpace: 'nowrap',
  };

  const btnGhost: CSSProperties = {
    border: 'none',
    background: 'transparent',
    color: colors.muted,
    fontSize: fontSize.sm,
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: 36,
    padding: `${spacing.xs}px ${spacing.sm}px`,
  };

  if (showUpdate) {
    return (
      <div role="status" style={barStyle}>
        <span style={{ flex: 1 }}>Update available</span>
        <button type="button" style={btnGhost} onClick={() => setUpdateAction(null)}>
          Later
        </button>
        <button
          type="button"
          style={btnPrimary}
          onClick={() => {
            updateAction?.();
            setUpdateAction(null);
          }}
        >
          Reload
        </button>
      </div>
    );
  }

  if (showInstall && installEvent) {
    return (
      <div role="dialog" aria-label="Install app" style={barStyle}>
        <span style={{ flex: 1 }}>Install DTR on this device</span>
        <button
          type="button"
          style={btnGhost}
          onClick={() => {
            setInstallDismissed(true);
            setInstallEvent(null);
          }}
        >
          Not now
        </button>
        <button
          type="button"
          style={btnPrimary}
          onClick={async () => {
            await installEvent.prompt();
            setInstallEvent(null);
            setInstallDismissed(true);
          }}
        >
          Install
        </button>
      </div>
    );
  }

  return (
    <div role="status" style={barStyle}>
      <span style={{ flex: 1 }}>Ready for offline use</span>
    </div>
  );
}
