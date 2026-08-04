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
      className="animate-stamp"
      style={{
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: radius.sm,
        padding: spacing.lg,
        marginTop: spacing.lg,
        backgroundColor: plate.bg,
        borderColor: plate.border,
      }}
    >
      <div
        style={{
          fontSize: fontSize.lg,
          fontWeight: '800',
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          color: text,
        }}
      >
        {title}
      </div>
      {detail ? (
        <div style={{ fontSize: fontSize.sm, marginTop: spacing.sm, lineHeight: 19, color: colors.ink }}>
          {detail}
        </div>
      ) : null}
    </div>
  );
}
