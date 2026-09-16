import { Camera } from 'lucide-react';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { readFileAsDataUrl } from '../lib/profilePhoto';
import { BannerTone, fontSize, microLabel, radius, spacing, useThemeColors } from '../theme';
import { ProfilePhotoEditor } from './ProfilePhotoEditor';

export function Banner({
  kind = 'info',
  title,
  detail,
  action,
}: {
  kind?: BannerTone;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  const colors = useThemeColors();
  const plate = colors.plates[kind];
  return (
    <div
      className="portal-card"
      style={{
        padding: `${spacing.md}px ${spacing.lg}px`,
        backgroundColor: plate.bg,
        borderColor: plate.border,
        display: 'flex',
        alignItems: 'flex-start',
        gap: spacing.md,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: fontSize.md, fontWeight: 700, color: plate.text, lineHeight: 1.3 }}>{title}</div>
        {detail ? (
          <div style={{ fontSize: fontSize.sm, marginTop: spacing.xs, lineHeight: 1.45, color: colors.ink }}>{detail}</div>
        ) : null}
      </div>
      {action}
    </div>
  );
}

interface SectionCardProps {
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function SectionCard({ title, children, footer, className }: SectionCardProps) {
  const colors = useThemeColors();
  return (
    <div className={`portal-card portal-card-pad${className ? ` ${className}` : ''}`}>
      {title ? (
        <div
          style={{
            marginBottom: spacing.md,
            paddingBottom: spacing.sm,
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          <div style={{ ...microLabel, color: colors.muted }}>{title}</div>
        </div>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>{children}</div>
      {footer ? (
        <div
          style={{
            marginTop: spacing.md,
            borderTop: `1px solid ${colors.border}`,
            paddingTop: spacing.md,
          }}
        >
          {footer}
        </div>
      ) : null}
    </div>
  );
}

export function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  const colors = useThemeColors();
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: spacing.sm,
        paddingBottom: spacing.sm,
        gap: spacing.md,
      }}
    >
      <div style={{ fontSize: fontSize.sm, color: colors.muted, flexShrink: 0 }}>{label}</div>
      <div
        style={{
          fontSize: fontSize.sm,
          fontWeight: 600,
          flex: 1,
          minWidth: 0,
          textAlign: 'right',
          wordBreak: 'break-word',
          color: valueColor || colors.ink,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
    </div>
  );
}

export type TagTone = 'neutral' | 'success' | 'warning' | 'danger';

export function Tag({ label, tone = 'neutral' }: { label: string; tone?: TagTone }) {
  const colors = useThemeColors();
  const plateKey: BannerTone = tone === 'neutral' ? 'info' : tone === 'danger' ? 'error' : tone;
  const plate = colors.plates[plateKey];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 999,
        border: `1px solid ${plate.border}`,
        padding: '3px 8px',
        backgroundColor: plate.bg,
        fontSize: 11,
        fontWeight: 700,
        color: plate.text,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

export function Avatar({
  name,
  size = 44,
  src = null,
  editable = false,
  onSavePhoto,
  onRemove,
}: {
  name?: string | null;
  size?: number;
  src?: string | null;
  editable?: boolean;
  onSavePhoto?: (dataUrl: string) => void;
  onRemove?: () => void;
}) {
  const colors = useThemeColors();
  const inputRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editorSrc, setEditorSrc] = useState<string | null>(null);

  const initials =
    (name ?? '?')
      .trim()
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?';
  let h = 0;
  for (let i = 0; i < (name ?? '').length; i++) h += (name ?? '').charCodeAt(i);
  const hue = [168, 199, 220, 262, 48, 142][h % 6];
  const badge = Math.max(22, Math.round(size * 0.3));
  const iconSize = Math.max(12, Math.round(badge * 0.55));

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const openPicker = () => {
    setMenuOpen(false);
    inputRef.current?.click();
  };

  const onCameraClick = () => {
    if (src) setMenuOpen(true);
    else openPicker();
  };

  const faceStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: 999,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: src ? colors.card : `hsl(${hue} 42% 42%)`,
    color: '#fff',
    fontSize: size * 0.34,
    fontWeight: 700,
    flexShrink: 0,
    boxShadow: '0 0 0 3px color-mix(in srgb, var(--primary) 25%, transparent)',
    overflow: 'hidden',
    position: 'relative',
  };

  const sheetBtn: React.CSSProperties = {
    display: 'block',
    width: '100%',
    minHeight: 48,
    textAlign: 'center',
    background: colors.card,
    border: 'none',
    borderRadius: radius.md,
    padding: '0 16px',
    cursor: 'pointer',
    fontSize: fontSize.md,
    fontWeight: 700,
  };

  return (
    <span
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'inline-block',
        flexShrink: 0,
      }}
    >
      <span aria-hidden={!editable} style={faceStyle}>
        {src ? (
          <img
            src={src}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          initials
        )}
      </span>

      {editable ? (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              void readFileAsDataUrl(file)
                .then((dataUrl) => setEditorSrc(dataUrl))
                .catch(() => {
                  /* parent can show error if save fails later */
                });
            }}
          />
          <button
            type="button"
            aria-label="Profile photo"
            aria-haspopup={src ? 'dialog' : undefined}
            aria-expanded={src ? menuOpen : undefined}
            onClick={onCameraClick}
            style={{
              position: 'absolute',
              right: -2,
              bottom: -2,
              width: badge,
              height: badge,
              borderRadius: 999,
              border: '2px solid #fff',
              background: 'var(--primary)',
              color: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.25)',
              zIndex: 1,
            }}
          >
            <Camera size={iconSize} strokeWidth={2.25} aria-hidden />
          </button>

          {menuOpen && src
            ? createPortal(
                <div
                  role="presentation"
                  onClick={() => setMenuOpen(false)}
                  style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 85,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                    background: colors.overlay,
                    padding: spacing.md,
                    paddingBottom: `max(${spacing.md}px, env(safe-area-inset-bottom))`,
                  }}
                >
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Profile photo actions"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: '100%',
                      maxWidth: 420,
                      margin: '0 auto',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: spacing.sm,
                    }}
                  >
                    <div
                      style={{
                        background: colors.card,
                        borderRadius: radius.lg,
                        border: `1px solid ${colors.border}`,
                        overflow: 'hidden',
                        boxShadow: '0 8px 28px rgba(15,23,42,0.18)',
                      }}
                    >
                      <button
                        type="button"
                        onClick={openPicker}
                        style={{
                          ...sheetBtn,
                          borderRadius: 0,
                          borderBottom: `1px solid ${colors.border}`,
                          color: colors.ink,
                        }}
                      >
                        Change photo
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          onRemove?.();
                        }}
                        style={{
                          ...sheetBtn,
                          borderRadius: 0,
                          color: colors.dangerText,
                        }}
                      >
                        Remove photo
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMenuOpen(false)}
                      style={{
                        ...sheetBtn,
                        border: `1px solid ${colors.border}`,
                        boxShadow: '0 4px 16px rgba(15,23,42,0.12)',
                        color: colors.ink,
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>,
                document.body,
              )
            : null}

          <ProfilePhotoEditor
            open={!!editorSrc}
            imageSrc={editorSrc}
            onCancel={() => setEditorSrc(null)}
            onConfirm={(dataUrl) => {
              setEditorSrc(null);
              onSavePhoto?.(dataUrl);
            }}
          />
        </>
      ) : null}
    </span>
  );
}
