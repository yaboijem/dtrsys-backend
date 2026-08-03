import { useState } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

import { fontSize, microLabel, radius, spacing, useThemeColors } from '../theme';

interface LabeledInputProps extends TextInputProps {
  label: string;
}

export function LabeledInput({ label, onFocus, onBlur, ...props }: LabeledInputProps) {
  const colors = useThemeColors();
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={[microLabel, styles.label, { color: focused ? colors.ink : colors.muted }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: colors.card,
            borderColor: focused ? colors.band : colors.border,
            color: colors.ink,
          },
          props.multiline && styles.multiline,
        ]}
        placeholderTextColor={colors.muted}
        accessibilityLabel={label}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    marginBottom: spacing.md,
  },
  label: {
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: fontSize.md,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
