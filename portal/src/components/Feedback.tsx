import { Camera } from 'lucide-react';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { BannerTone, fontSize, microLabel, radius, spacing, useThemeColors } from '../theme';

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
  onPickFile,
  onRemove,
}: {
  name?: string | null;
  size?: number;
  src?: string | null;
  editable?: boolean;
  onPickFile?: (file: File) => void;
  onRemove?: () => void;
}) {
  const colors = useThemeColors();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

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
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const openPicker = () => {
    setMenuOpen(false);
    inputRef.current?.click();
  };

  const onCameraClick = () => {
    if (src) setMenuOpen((v) => !v);
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

  return (
    <span
      ref={rootRef}
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
              if (file) onPickFile?.(file);
            }}
          />
          <button
            type="button"
            aria-label="Profile photo"
            aria-haspopup={src ? 'menu' : undefined}
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
          {menuOpen && src ? (
            <div
              role="menu"
              style={{
                position: 'absolute',
                top: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                marginTop: 8,
                minWidth: 160,
                zIndex: 20,
                background: colors.card,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.md,
                boxShadow: '0 8px 24px rgba(15, 23, 42, 0.14)',
                padding: 4,
              }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={openPicker}
                style={{
                  display: 'block',
                  width: '100%',
                  minHeight: 44,
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  borderRadius: radius.sm,
                  padding: '0 12px',
                  cursor: 'pointer',
                  fontSize: fontSize.sm,
                  fontWeight: 600,
                  color: colors.ink,
                }}
              >
                Change photo
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onRemove?.();
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  minHeight: 44,
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  borderRadius: radius.sm,
                  padding: '0 12px',
                  cursor: 'pointer',
                  fontSize: fontSize.sm,
                  fontWeight: 600,
                  color: colors.dangerText ?? colors.plates.error.text,
                }}
              >
                Remove photo
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </span>
  );
}
