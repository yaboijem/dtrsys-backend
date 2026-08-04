import { ReactNode } from 'react';
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

export function Avatar({ name, size = 44 }: { name?: string | null; size?: number }) {
  const initials = (name ?? '?')
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
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `hsl(${hue} 42% 42%)`,
        color: '#fff',
        fontSize: size * 0.34,
        fontWeight: 700,
        flexShrink: 0,
        boxShadow: '0 0 0 3px color-mix(in srgb, var(--primary) 25%, transparent)',
      }}
    >
      {initials}
    </span>
  );
}
