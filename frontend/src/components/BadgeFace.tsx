import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { cardShadow, fontSize, microLabel, radius, spacing, useIsDark, useThemeColors } from '../theme';
import { Tag } from './Feedback';

interface BadgeFaceProps {
  name: string;
  employeeId: string;
  position?: string;
  branch?: string;
  roles?: string[];
}

function barcodeBars(text: string, ink: string): ReactNode[] {
  const seed = text.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const bars: ReactNode[] = [];
  for (let i = 0; i < Math.max(text.length * 3, 18); i++) {
    const width = 1 + ((seed + i * 7 + text.charCodeAt(i % text.length)) % 3);
    bars.push(
      <View key={i} style={{ width, height: 26, backgroundColor: ink, marginRight: 2 }} />,
    );
  }
  return bars;
}

function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function BadgeFace({ name, employeeId, position, branch, roles }: BadgeFaceProps) {
  const colors = useThemeColors();
  const isDark = useIsDark();

  return (
    <View
      style={[styles.badge, cardShadow(isDark), { backgroundColor: colors.card, borderColor: colors.border }]}
      accessible
      accessibilityLabel={`ID badge for ${name}, employee ${employeeId}`}
    >
      <View style={[styles.band, { backgroundColor: colors.band }]}>
        <Text style={[styles.bandName, { color: colors.bandText }]}>DTR</Text>
        <Text style={[microLabel, styles.bandSub, { color: colors.bandText }]}>Daily Time Record</Text>
      </View>

      <View style={styles.body}>
        <View style={[styles.photo, { backgroundColor: colors.bandSoft }]}>
          <Text style={[styles.photoInitials, { color: colors.band }]}>{initialsOf(name)}</Text>
        </View>
        <View style={styles.identity}>
          <Text style={[styles.name, { color: colors.ink }]}>{name}</Text>
          {position ? <Text style={[styles.position, { color: colors.muted }]}>{position}</Text> : null}
          <View style={styles.idRow}>
            <Text style={[microLabel, { color: colors.muted }]}>Employee ID</Text>
            <Text style={[styles.idValue, { color: colors.ink }]}>{employeeId}</Text>
          </View>
          {branch ? (
            <View style={styles.idRow}>
              <Text style={[microLabel, { color: colors.muted }]}>Branch</Text>
              <Text style={[styles.idValue, { color: colors.ink }]}>{branch}</Text>
            </View>
          ) : null}
          {roles && roles.length > 0 ? (
            <View style={styles.roles}>
              {roles.map((role) => (
                <Tag key={role} label={role} tone={role === 'Employee' ? 'neutral' : 'success'} />
              ))}
            </View>
          ) : null}
        </View>
      </View>

      <View style={[styles.barcode, { borderTopColor: colors.border }]}>
        <View style={styles.bars}>{barcodeBars(employeeId, colors.barcode)}</View>
        <Text style={[microLabel, styles.barcodeId, { color: colors.muted }]}>{employeeId}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  bandName: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    letterSpacing: 3,
  },
  bandSub: {
    opacity: 0.8,
  },
  body: {
    flexDirection: 'row',
    padding: spacing.lg,
  },
  photo: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoInitials: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    letterSpacing: 1,
  },
  identity: {
    flex: 1,
    marginLeft: spacing.md,
  },
  name: {
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  position: {
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  idRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: spacing.sm,
  },
  idValue: {
    fontSize: fontSize.md,
    fontWeight: '800',
    letterSpacing: 1,
    marginLeft: spacing.sm,
  },
  roles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  barcode: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  barcodeId: {
    marginTop: spacing.sm,
    letterSpacing: 2,
  },
});
