import { ReactNode } from 'react';
import { BannerTone, fontSize, microLabel, radius, spacing, useThemeColors } from '../theme';

export function Banner({
  kind = 'info',
  title,
  detail,
}: {
  kind?: BannerTone;
  title: string;
  detail?: string;
}) {
  const colors = useThemeColors();
  const plate = colors.plates[kind];
  return (
    <div
      style={{
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: radius.md,
        padding: spacing.md,
        marginBottom: spacing.md,
        backgroundColor: plate.bg,
        borderColor: plate.border,
      }}
    >
      <div style={{ fontSize: fontSize.md, fontWeight: '700', color: plate.text }}>{title}</div>
      {detail ? (
        <div style={{ fontSize: fontSize.sm, marginTop: spacing.xs, lineHeight: 19, color: colors.ink }}>
          {detail}
        </div>
      ) : null}
    </div>
  );
}

interface SectionCardProps {
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function SectionCard({ title, children, footer }: SectionCardProps) {
  const colors = useThemeColors();
  return (
    <div
      style={{
        borderRadius: radius.lg,
        borderWidth: 1,
        borderStyle: 'solid',
        padding: spacing.lg,
        marginBottom: spacing.lg,
        backgroundColor: colors.card,
        borderColor: colors.border,
      }}
    >
      {title ? (
        <div
          style={{
            borderBottomWidth: 1,
            borderBottomStyle: 'solid',
            borderBottomColor: colors.border,
            marginBottom: spacing.md,
            paddingBottom: spacing.sm,
          }}
        >
          <div style={{ ...microLabel, color: colors.muted }}>{title}</div>
        </div>
      ) : null}
      <div>{children}</div>
      {footer ? (
        <div
          style={{
            marginTop: spacing.md,
            borderTopWidth: 1,
            borderTopStyle: 'solid',
            borderTopColor: colors.border,
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
        paddingTop: 7,
        paddingBottom: 7,
      }}
    >
      <div style={{ fontSize: fontSize.md, color: colors.muted }}>{label}</div>
      <div
        style={{
          fontSize: fontSize.md,
          fontWeight: '600',
          flexShrink: 1,
          textAlign: 'right',
          marginLeft: spacing.md,
          color: valueColor || colors.ink,
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
    <div
      style={{
        borderRadius: radius.sm,
        borderWidth: 1,
        borderStyle: 'solid',
        paddingLeft: 8,
        paddingRight: 8,
        paddingTop: 4,
        paddingBottom: 4,
        alignSelf: 'flex-start',
        backgroundColor: plate.bg,
        borderColor: plate.border,
      }}
    >
      <span style={{ fontSize: 12, fontWeight: '600', color: plate.text }}>{label}</span>
    </div>
  );
}
