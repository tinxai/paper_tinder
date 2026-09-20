import { StyleSheet, Text, View } from 'react-native';
import { radius, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

interface TagProps {
  label: string;
  tone?: 'neutral' | 'positive' | 'info';
  testID?: string;
}

/** A small non-interactive label: topic tags, "PDF available", and similar. */
export function Tag({ label, tone = 'neutral', testID }: TagProps) {
  const { colors } = useTheme();

  const tones = {
    neutral: {
      bg: colors.surfaceSunken,
      fg: colors.textSecondary,
      border: colors.border,
    },
    positive: { bg: colors.saveSubtle, fg: colors.save, border: colors.save },
    info: { bg: colors.primarySubtle, fg: colors.primary, border: colors.primary },
  } as const;
  const palette = tones[tone];

  return (
    <View
      testID={testID}
      style={[styles.tag, { backgroundColor: palette.bg, borderColor: palette.border }]}
    >
      <Text style={[styles.label, { color: palette.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  label: { ...typography.tiny },
});
