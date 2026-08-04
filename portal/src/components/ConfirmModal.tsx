import { useEffect } from 'react';
import { createPortal } from 'react-dom';

import { fontSize, radius, spacing, useThemeColors } from '../theme';
import { Button } from './Button';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const colors = useThemeColors();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return createPortal(
    <div
      role="presentation"
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.lg,
        background: colors.overlay,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-desc"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 360,
          borderRadius: radius.lg,
          background: colors.card,
          border: `1px solid ${colors.border}`,
          boxShadow: '0 16px 40px rgba(15,23,42,0.22)',
          padding: spacing.lg,
        }}
      >
        <div
          id="confirm-modal-title"
          style={{ fontSize: fontSize.lg, fontWeight: 800, color: colors.ink, letterSpacing: '-0.02em' }}
        >
          {title}
        </div>
        <div
          id="confirm-modal-desc"
          style={{ fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.sm, lineHeight: 1.45 }}
        >
          {message}
        </div>
        <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.lg }}>
          <Button title={cancelLabel} variant="secondary" onClick={onCancel} style={{ flex: 1, width: 'auto' }} />
          <Button
            title={confirmLabel}
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            style={{ flex: 1, width: 'auto' }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
