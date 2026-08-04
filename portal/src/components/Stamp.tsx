import { useEffect, useState } from 'react';
import { fontSize, radius, spacing, useThemeColors } from '../theme';

interface StampProps {
  kind: 'success' | 'error';
  title: string;
  detail?: string;
}

export function Stamp({ kind, title, detail }: StampProps) {
  const colors = useThemeColors();
  const [visible, setVisible] = useState(false);

  const text = kind === 'success' ? colors.successText : colors.dangerText;
  const plate = kind === 'success' ? colors.plates.success : colors.plates.error;

  useEffect(() => {
    // Trigger animation after mount
    const timer = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={detail ? `${title}. ${detail}` : title}
      style={{
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: radius.sm,
        padding: spacing.lg,
        marginTop: spacing.lg,
        backgroundColor: plate.bg,
        borderColor: plate.border,
        opacity: visible ? 1 : 0,
        transform: visible ? 'scale(1) rotate(0deg)' : 'scale(1.06) rotate(-3deg)',
        transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
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
