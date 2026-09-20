import { StyleSheet, Text, View } from 'react-native';
import { typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

/** A simple two-tone wordmark — deliberately not a full branding system. */
export function Logo({ size = 'medium' }: { size?: 'medium' | 'large' }) {
  const { colors } = useTheme();
  const textStyle = size === 'large' ? typography.display : typography.title;

  return (
    <View style={styles.row} accessibilityRole="header">
      <Text style={[textStyle, { color: colors.text }]}>Paper</Text>
      <Text style={[textStyle, { color: colors.primary }]}>Swipe</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline' },
});
