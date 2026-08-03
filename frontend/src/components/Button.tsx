import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';

import { fontSize, radius, spacing, useThemeColors } from '../theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  size?: 'default' | 'large';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export function Button({
  title,
  onPress,
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

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={[
        styles.button,
        size === 'large' && styles.buttonLarge,
        { backgroundColor: palette.bg },
        palette.border ? { borderWidth: 1, borderColor: palette.border } : null,
        (disabled || loading) && { opacity: 0.45 },
        style,
      ]}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color={palette.text} />
      ) : (
        <Text style={[styles.label, { color: palette.text }]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLarge: {
    minHeight: 60,
  },
  label: {
    fontSize: fontSize.md,
    fontWeight: '700',
  },
});
