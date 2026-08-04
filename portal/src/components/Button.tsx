import type { CSSProperties, ReactNode } from 'react';
import { useThemeColors, fontSize, radius, spacing } from '../theme';

interface ButtonProps {
  title: string;
  onClick: () => void;
  type?: 'button' | 'submit' | 'reset';
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'outline-danger';
  size?: 'default' | 'large';
  disabled?: boolean;
  loading?: boolean;
  style?: CSSProperties;
  icon?: ReactNode;
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
  icon,
}: ButtonProps) {
  const colors = useThemeColors();
  const palette = {
    primary: { bg: colors.primary, text: '#ffffff', border: 'none' },
    secondary: { bg: colors.card, text: colors.ink, border: `1px solid ${colors.border}` },
    danger: { bg: colors.danger, text: '#ffffff', border: 'none' },
    success: { bg: colors.successFill, text: '#ffffff', border: 'none' },
    'outline-danger': { bg: 'transparent', text: colors.dangerText, border: `1.5px solid ${colors.danger}` },
  }[variant];

  const baseStyles: CSSProperties = {
    width: '100%',
    minHeight: size === 'large' ? 56 : 48,
    paddingLeft: spacing.lg,
    paddingRight: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderRadius: radius.md,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: palette.bg,
    color: palette.text,
    border: palette.border,
    opacity: disabled || loading ? 0.5 : 1,
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    fontSize: fontSize.md,
    fontWeight: 700,
    boxShadow: variant === 'secondary' || variant === 'outline-danger' ? 'none' : '0 1px 2px rgba(15,23,42,0.08)',
    ...style,
  };

  return (
    <button type={type} onClick={onClick} disabled={disabled || loading} aria-label={title} style={baseStyles}>
      {loading ? '…' : icon}
      {loading ? 'Please wait…' : title}
    </button>
  );
}
