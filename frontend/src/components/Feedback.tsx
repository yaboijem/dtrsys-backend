import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, radius, spacing } from '../theme';

type BannerKind = 'error' | 'info' | 'success' | 'warning';

const kindPalette: Record<BannerKind, { bg: string; border: string; text: string }> = {
  error: { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c' },
  warning: { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
  info: { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
  success: { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d' },
};

export function Banner({ kind = 'info', title, detail }: { kind?: BannerKind; title: string; detail?: string }) {
  const palette = kindPalette[kind];
  return (
    <View style={[styles.banner, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
      {detail ? <Text style={[styles.detail, { color: palette.text }]}>{detail}</Text> : null}
    </View>
  );
}

interface SectionCardProps {
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function SectionCard({ title, children, footer }: SectionCardProps) {
  return (
    <View style={styles.card}>
      {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
      <View>{children}</View>
      {footer ? <View style={styles.cardFooter}>{footer}</View> : null}
    </View>
  );
}

export function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

export function Tag({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  const toneMap = {
    neutral: { bg: colors.border, text: colors.text },
    success: { bg: '#dcfce7', text: '#15803d' },
    warning: { bg: '#fef9c3', text: '#854d0e' },
    danger: { bg: '#fee2e2', text: '#b91c1c' },
  }[tone];
  return (
    <View style={[styles.tag, { backgroundColor: toneMap.bg }]}>
      <Text style={[styles.tagText, { color: toneMap.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  detail: {
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
    opacity: 0.9,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  cardTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  cardFooter: {
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  rowLabel: {
    fontSize: fontSize.md,
    color: colors.muted,
  },
  rowValue: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: spacing.md,
  },
  tag: {
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  tagText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
