import { fontSize, spacing, ThemeColors, useThemeColors } from '../theme';

export type GateTone = 'success' | 'danger' | 'warning' | 'muted';

interface GateLampProps {
  tone: GateTone;
  label: string;
  sub?: string;
}

function lampFill(tone: GateTone, colors: ThemeColors): string {
  switch (tone) {
    case 'success':
      return colors.success;
    case 'danger':
      return colors.danger;
    case 'warning':
      return colors.warningFill;
    case 'muted':
      return colors.muted;
  }
}

export function GateLamp({ tone, label, sub }: GateLampProps) {
  const colors = useThemeColors();
  const fill = lampFill(tone, colors);

  return (
    <div
      style={{ display: 'flex', alignItems: 'center' }}
      aria-label={sub ? `${label}. ${sub}` : label}
    >
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: 8,
          borderWidth: 2,
          borderStyle: 'solid',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: spacing.sm,
          borderColor: fill,
        }}
      >
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: fill,
          }}
        />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: fontSize.md, fontWeight: '700', color: colors.ink }}>{label}</div>
        {sub ? <div style={{ fontSize: fontSize.sm, marginTop: 2, color: colors.muted }}>{sub}</div> : null}
      </div>
    </div>
  );
}
