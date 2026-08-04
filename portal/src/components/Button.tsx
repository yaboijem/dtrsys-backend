import { useThemeColors, fontSize, radius, spacing } from '../theme';

interface ButtonProps {
  title: string;
  onClick: () => void;
  type?: 'button' | 'submit' | 'reset';
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  size?: 'default' | 'large';
  disabled?: boolean;
  loading?: boolean;
  style?: React.CSSProperties;
}

export function Button({
  title,
  onClick,
  type = 'button',
  variant = 'primary',
  size = 'default',
  disabled,
  loading,
  style,
}: ButtonProps) {
  const colors = useThemeColors();
  const palette = {
    primary: { bg: colors.band, text: colors.bandText },
    secondary: { bg: colors.card, text: colors.ink, border: colors.border },
    danger: { bg: colors.danger, text: '#ffffff' },
    success: { bg: colors.successFill, text: '#ffffff' },
  }[variant];

  const baseStyles: React.CSSProperties = {
    minHeight: size === 'large' ? 60 : 48,
    paddingLeft: spacing.lg,
    paddingRight: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderRadius: radius.md,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.bg,
    color: palette.text,
    border: palette.border ? `1px solid ${palette.border}` : 'none',
    opacity: disabled || loading ? 0.45 : 1,
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    fontSize: fontSize.md,
    fontWeight: '700',
    ...style,
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={title}
      style={baseStyles}
    >
      {loading ? '...' : title}
    </button>
  );
}
