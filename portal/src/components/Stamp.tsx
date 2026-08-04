import { fontSize, radius, spacing, useThemeColors } from '../theme';

interface StampProps {
  kind: 'success' | 'error';
  title: string;
  detail?: string;
}

export function Stamp({ kind, title, detail }: StampProps) {
  const colors = useThemeColors();
  const text = kind === 'success' ? colors.successText : colors.dangerText;
  const plate = kind === 'success' ? colors.plates.success : colors.plates.error;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={detail ? `${title}. ${detail}` : title}
      className="animate-stamp portal-card"
      style={{
        borderColor: plate.border,
        backgroundColor: plate.bg,
        padding: `${spacing.sm}px ${spacing.md}px`,
        borderRadius: radius.md,
      }}
    >
      <div
        style={{
          fontSize: fontSize.sm,
          fontWeight: 800,
          letterSpacing: 0.4,
          color: text,
        }}
      >
        {title}
      </div>
      {detail ? (
        <div
          style={{
            fontSize: 12,
            marginTop: 4,
            lineHeight: 1.4,
            color: colors.ink,
          }}
        >
          {detail}
        </div>
      ) : null}
    </div>
  );
}
