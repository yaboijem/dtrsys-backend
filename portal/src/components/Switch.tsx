import { useThemeColors } from '../theme';

export function Switch({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  const colors = useThemeColors();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="portal-switch"
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        width: 44,
        height: 26,
        flexShrink: 0,
        padding: 0,
        border: `1px solid ${colors.border}`,
        borderRadius: 999,
        background: checked ? colors.primary : 'color-mix(in srgb, var(--muted) 22%, var(--card))',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background-color 160ms ease',
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: 2,
          left: 0,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: 'var(--shadow-sm)',
          transform: checked ? 'translateX(20px)' : 'translateX(2px)',
          transition: 'transform 160ms ease',
        }}
      />
    </button>
  );
}
