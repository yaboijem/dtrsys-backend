import { ReactNode } from 'react';
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
      <div key={i} style={{ width, height: 26, backgroundColor: ink, marginRight: 2 }} />
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
    <div
      style={{
        borderRadius: radius.lg,
        borderWidth: 1,
        borderStyle: 'solid',
        overflow: 'hidden',
        marginBottom: spacing.xl,
        backgroundColor: colors.card,
        borderColor: colors.border,
        ...cardShadow(isDark),
      }}
      aria-label={`ID badge for ${name}, employee ${employeeId}`}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: spacing.lg,
          paddingRight: spacing.lg,
          paddingTop: spacing.sm,
          paddingBottom: spacing.sm,
          backgroundColor: colors.band,
        }}
      >
        <span style={{ fontSize: fontSize.lg, fontWeight: '800', letterSpacing: 3, color: colors.bandText }}>
          DTR
        </span>
        <span style={{ ...microLabel, opacity: 0.8, color: colors.bandText }}>Daily Time Record</span>
      </div>

      <div style={{ display: 'flex', padding: spacing.lg }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: radius.md,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.bandSoft,
          }}
        >
          <span style={{ fontSize: fontSize.xl, fontWeight: '800', letterSpacing: 1, color: colors.band }}>
            {initialsOf(name)}
          </span>
        </div>
        <div style={{ flex: 1, marginLeft: spacing.md }}>
          <div style={{ fontSize: fontSize.xl, fontWeight: '800', color: colors.ink }}>{name}</div>
          {position ? <div style={{ fontSize: fontSize.sm, marginTop: 2, color: colors.muted }}>{position}</div> : null}
          <div style={{ display: 'flex', alignItems: 'baseline', marginTop: spacing.sm }}>
            <span style={{ ...microLabel, color: colors.muted }}>Employee ID</span>
            <span style={{ fontSize: fontSize.md, fontWeight: '800', letterSpacing: 1, marginLeft: spacing.sm, color: colors.ink }}>
              {employeeId}
            </span>
          </div>
          {branch ? (
            <div style={{ display: 'flex', alignItems: 'baseline', marginTop: spacing.sm }}>
              <span style={{ ...microLabel, color: colors.muted }}>Branch</span>
              <span style={{ fontSize: fontSize.md, fontWeight: '800', letterSpacing: 1, marginLeft: spacing.sm, color: colors.ink }}>
                {branch}
              </span>
            </div>
          ) : null}
          {roles && roles.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm }}>
              {roles.map((role) => (
                <Tag key={role} label={role} tone={role === 'Employee' ? 'neutral' : 'success'} />
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div
        style={{
          borderTopWidth: 1,
          borderTopStyle: 'solid',
          borderTopColor: colors.border,
          paddingLeft: spacing.lg,
          paddingRight: spacing.lg,
          paddingTop: spacing.md,
          paddingBottom: spacing.lg,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          {barcodeBars(employeeId, colors.barcode)}
        </div>
        <div style={{ ...microLabel, marginTop: spacing.sm, letterSpacing: 2, color: colors.muted }}>
          {employeeId}
        </div>
      </div>
    </div>
  );
}
