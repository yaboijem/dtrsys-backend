import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BannerTone, fontSize, microLabel, radius, spacing, useThemeColors } from '../theme';

export function Banner({
  kind = 'info',
  title,
  detail,
}: {
  kind?: BannerTone;
  title: string;
  detail?: string;
}) {
  const colors = useThemeColors();
  const plate = colors.plates[kind];
  return (
    <View style={[styles.banner, { backgroundColor: plate.bg, borderColor: plate.border }]}>
      <Text style={[styles.title, { color: plate.text }]}>{title}</Text>
      {detail ? <Text style={[styles.detail, { color: colors.ink }]}>{detail}</Text> : null}
    </View>
  );
}

interface SectionCardProps {
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function SectionCard({ title, children, footer }: SectionCardProps) {
  const colors = useThemeColors();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      {title ? (
        <View style={[styles.cardTitleRow, { borderBottomColor: colors.border }]}>
          <Text style={[microLabel, { color: colors.muted }]}>{title}</Text>
        </View>
      ) : null}
      <View>{children}</View>
      {footer ? <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>{footer}</View> : null}
    </View>
  );
}

export function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  const colors = useThemeColors();
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.ink }, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

export type TagTone = 'neutral' | 'success' | 'warning' | 'danger';

export function Tag({ label, tone = 'neutral' }: { label: string; tone?: TagTone }) {
  const colors = useThemeColors();
  const plateKey: BannerTone = tone === 'neutral' ? 'info' : tone === 'danger' ? 'error' : tone;
  const plate = colors.plates[plateKey];
  return (
    <View style={[styles.tag, { backgroundColor: plate.bg, borderColor: plate.border }]}>
      <Text style={[styles.tagText, { color: plate.text }]}>{label}</Text>
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
    fontWeight: '700',
  },
  detail: {
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
    lineHeight: 19,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  cardTitleRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
  },
  cardTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: '#000',
  },
  cardFooter: {
    marginTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
  },
  rowLabel: {
    fontSize: fontSize.md,
  },
  rowValue: {
    fontSize: fontSize.md,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: spacing.md,
  },
  tag: {
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  tagText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
