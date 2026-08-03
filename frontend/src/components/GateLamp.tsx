import { StyleSheet, Text, View } from 'react-native';

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
    <View style={styles.row} accessible accessibilityLabel={sub ? `${label}. ${sub}` : label}>
      <View style={[styles.lampRing, { borderColor: fill }]}>
        <View style={[styles.lampCore, { backgroundColor: fill }]} />
      </View>
      <View style={styles.textCol}>
        <Text style={[styles.label, { color: colors.ink }]}>{label}</Text>
        {sub ? <Text style={[styles.sub, { color: colors.muted }]}>{sub}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lampRing: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  lampCore: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  textCol: {
    flex: 1,
  },
  label: {
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  sub: {
    fontSize: fontSize.sm,
    marginTop: 2,
  },
});
