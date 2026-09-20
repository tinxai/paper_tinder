import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { MIN_TOUCH_TARGET, radius, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'medium' | 'large';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  /** Rendered before the label — an icon glyph, for instance. */
  leading?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityHint?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  leading,
  style,
  testID,
  accessibilityHint,
}: ButtonProps) {
  const { colors } = useTheme();
  const isInactive = disabled || loading;

  const palette: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: colors.primary, fg: colors.textInverse, border: colors.primary },
    secondary: { bg: colors.surfaceSunken, fg: colors.text, border: colors.border },
    ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
    danger: { bg: colors.dangerSubtle, fg: colors.danger, border: colors.dangerSubtle },
  };
  const tone = palette[variant];

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={isInactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isInactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        size === 'large' && styles.large,
        {
          backgroundColor: tone.bg,
          borderColor: tone.border,
          // Dim on press and when inactive, rather than changing hue.
          opacity: isInactive ? 0.55 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tone.fg} size="small" />
      ) : (
        <View style={styles.content}>
          {leading ? <View style={styles.leading}>{leading}</View> : null}
          <Text
            style={[
              styles.label,
              size === 'large' && styles.labelLarge,
              { color: tone.fg },
            ]}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  large: { minHeight: 52, borderRadius: radius.lg },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  leading: { alignItems: 'center', justifyContent: 'center' },
  label: { ...typography.bodyStrong, textAlign: 'center' },
  labelLarge: { fontSize: 17 },
});
