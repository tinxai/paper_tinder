import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

interface ScreenProps {
  children: React.ReactNode;
  /** Adds the standard horizontal gutter. Off for full-bleed lists. */
  padded?: boolean;
  edges?: readonly Edge[];
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Screen container: background color plus safe-area insets, so no screen has
 * to remember notch and home-indicator handling itself.
 */
export function Screen({
  children,
  padded = true,
  edges = ['top', 'bottom'],
  style,
  testID,
}: ScreenProps) {
  const { colors } = useTheme();
  return (
    <SafeAreaView
      testID={testID}
      edges={edges}
      style={[styles.root, { backgroundColor: colors.background }]}
    >
      <View style={[styles.content, padded && styles.padded, style]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1 },
  padded: { paddingHorizontal: spacing.lg },
});
