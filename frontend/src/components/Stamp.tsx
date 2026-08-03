import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { fontSize, radius, spacing, useThemeColors } from '../theme';

interface StampProps {
  kind: 'success' | 'error';
  title: string;
  detail?: string;
}

export function Stamp({ kind, title, detail }: StampProps) {
  const colors = useThemeColors();
  const anim = useRef(new Animated.Value(0)).current;

  const text = kind === 'success' ? colors.successText : colors.dangerText;
  const plate = kind === 'success' ? colors.plates.success : colors.plates.error;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      friction: 7,
      tension: 120,
      useNativeDriver: true,
    }).start();
  }, [anim]);

  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1.06, 1] });
  const opacity = anim.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0.6, 1] });
  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['-3deg', '0deg'] });

  return (
    <Animated.View
      style={[styles.stamp, { backgroundColor: plate.bg, borderColor: plate.border, opacity, transform: [{ scale }, { rotate }] }]}
      accessibilityLiveRegion="polite"
      accessible
      accessibilityLabel={detail ? `${title}. ${detail}` : title}
    >
      <Text style={[styles.title, { color: text }]}>{title}</Text>
      {detail ? <Text style={[styles.detail, { color: colors.ink }]}>{detail}</Text> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stamp: {
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  detail: {
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
    lineHeight: 19,
  },
});
