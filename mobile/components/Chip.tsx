import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MIN_TOUCH_TARGET, radius, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  onRemove?: () => void;
  testID?: string;
}

/** A selectable topic pill. Used for interests and paper field tags. */
export function Chip({ label, selected = false, onPress, onRemove, testID }: ChipProps) {
  const { colors } = useTheme();

  const content = (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.primarySubtle : colors.surfaceSunken,
          borderColor: selected ? colors.primary : colors.border,
          // Selection is carried by a checkmark and border weight, not color alone.
          borderWidth: selected ? 2 : 1,
        },
      ]}
    >
      {selected ? (
        <Text
          style={[styles.check, { color: colors.primary }]}
          accessibilityElementsHidden
        >
          ✓
        </Text>
      ) : null}
      <Text
        style={[
          styles.label,
          { color: selected ? colors.primary : colors.textSecondary },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {onRemove ? (
        <Text
          style={[styles.remove, { color: colors.textMuted }]}
          accessibilityElementsHidden
        >
          ✕
        </Text>
      ) : null}
    </View>
  );

  if (!onPress && !onRemove) return content;

  return (
    <Pressable
      testID={testID}
      onPress={onRemove ?? onPress}
      accessibilityRole={onRemove ? 'button' : 'checkbox'}
      accessibilityState={onRemove ? undefined : { checked: selected }}
      accessibilityLabel={onRemove ? `Remove ${label}` : label}
      hitSlop={6}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    minHeight: MIN_TOUCH_TARGET - 6,
  },
  label: { ...typography.caption, flexShrink: 1 },
  check: { fontSize: 13, fontWeight: '700' },
  remove: { fontSize: 12, fontWeight: '700' },
});
