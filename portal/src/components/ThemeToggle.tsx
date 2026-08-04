import { Monitor, Moon, Sun } from 'lucide-react';

import { useTheme, type ThemePreference } from '../theme/ThemeContext';
import { fontSize, radius, spacing, useThemeColors } from '../theme';

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const colors = useThemeColors();
  const { preference, setPreference, toggleLightDark, isDark } = useTheme();

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggleLightDark}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 40,
          height: 40,
          borderRadius: radius.md,
          border: `1px solid ${colors.border}`,
          background: colors.card,
          color: colors.ink,
          cursor: 'pointer',
        }}
      >
        {isDark ? <Sun size={18} /> : <Moon size={18} />}
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Color theme"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 6,
        padding: 4,
        borderRadius: radius.md,
        border: `1px solid ${colors.border}`,
        background: 'color-mix(in srgb, var(--muted) 10%, var(--card))',
      }}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setPreference(value)}
            aria-pressed={active}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              minHeight: 52,
              border: 'none',
              borderRadius: radius.sm,
              cursor: 'pointer',
              background: active ? colors.card : 'transparent',
              color: active ? colors.primary : colors.muted,
              boxShadow: active ? 'var(--shadow-sm)' : 'none',
              fontSize: fontSize.micro,
              fontWeight: 700,
              padding: spacing.sm,
            }}
          >
            <Icon size={16} strokeWidth={2.25} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
