import { useNavigate } from 'react-router-dom';

import { fontSize, useThemeColors } from '../theme';

interface BackPillProps {
  to?: string;
  label?: string;
  ariaLabel?: string;
}

export function BackPill({
  to = '/more',
  label = '< Back',
  ariaLabel = 'Back',
}: BackPillProps) {
  const colors = useThemeColors();
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      aria-label={ariaLabel}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        alignSelf: 'flex-start',
        height: 28,
        padding: '0 10px',
        marginBottom: 10,
        borderRadius: 999,
        border: `1px solid ${colors.border}`,
        background: colors.card,
        color: colors.ink,
        fontSize: fontSize.sm,
        fontWeight: 600,
        lineHeight: 1,
        letterSpacing: '-0.01em',
        cursor: 'pointer',
        boxShadow: '0 1px 1px rgba(15,23,42,0.04)',
      }}
    >
      {label}
    </button>
  );
}
