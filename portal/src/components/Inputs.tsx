import { useState } from 'react';
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
  ...props
}: LabeledInputProps) {
  const colors = useThemeColors();
  const [focused, setFocused] = useState(false);

  const inputStyles: React.CSSProperties = {
    width: '100%',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.md,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: fontSize.md,
    backgroundColor: colors.card,
    borderColor: focused ? colors.band : colors.border,
    color: colors.ink,
    outline: 'none',
    ...(multiline ? { minHeight: 80, textAlignVertical: 'top' as const } : {}),
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onChangeText?.(e.target.value);
  };

  return (
    <div style={{ marginBottom: spacing.md }}>
      <label
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
          style={{
            ...inputStyles,
            // @ts-ignore - placeholder color via CSS
            '&::placeholder': { color: colors.muted },
          }}
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
        <input
          style={{
            ...inputStyles,
            // @ts-ignore - placeholder color via CSS
            '&::placeholder': { color: colors.muted },
          }}
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
      )}
    </div>
  );
}
