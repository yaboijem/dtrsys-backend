import { Eye, EyeOff } from 'lucide-react';
import { useId, useState } from 'react';
import { fontSize, microLabel, radius, spacing, useThemeColors } from '../theme';

interface LabeledInputProps extends React.InputHTMLAttributes<HTMLInputElement | HTMLTextAreaElement> {
  label: string;
  onChangeText?: (text: string) => void;
  multiline?: boolean;
}

export function LabeledInput({
  label,
  onChangeText,
  onFocus,
  onBlur,
  multiline,
  id,
  type,
  ...props
}: LabeledInputProps) {
  const colors = useThemeColors();
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const isPassword = type === 'password';

  const inputStyles: React.CSSProperties = {
    width: '100%',
    borderWidth: 1,
    borderStyle: 'solid',
    borderRadius: radius.md,
    paddingLeft: spacing.md,
    paddingRight: isPassword ? 48 : spacing.md,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: fontSize.md,
    backgroundColor: colors.card,
    borderColor: focused ? colors.primary : colors.border,
    boxShadow: focused ? `0 0 0 3px color-mix(in srgb, ${colors.primary} 18%, transparent)` : undefined,
    color: colors.ink,
    outline: 'none',
    boxSizing: 'border-box',
    ...(multiline ? { minHeight: 80 } : {}),
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onChangeText?.(e.target.value);
  };

  return (
    <div style={{ marginBottom: spacing.md }}>
      <label
        htmlFor={inputId}
        style={{
          ...microLabel,
          color: focused ? colors.ink : colors.muted,
          display: 'block',
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      {multiline ? (
        <textarea
          id={inputId}
          style={inputStyles}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          onChange={handleChange}
          {...(props as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      ) : (
        <div style={{ position: 'relative' }}>
          <input
            id={inputId}
            type={isPassword ? (visible ? 'text' : 'password') : type}
            style={inputStyles}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
            onChange={handleChange}
            {...(props as React.InputHTMLAttributes<HTMLInputElement>)}
          />
          {isPassword ? (
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              aria-label={visible ? 'Hide password' : 'Show password'}
              style={{
                position: 'absolute',
                right: 0,
                top: 0,
                bottom: 0,
                width: 44,
                minHeight: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                background: 'transparent',
                color: colors.muted,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {visible ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
