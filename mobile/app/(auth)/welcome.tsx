import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Logo } from '@/components/Logo';
import { Screen } from '@/components/Screen';
import { spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

export default function WelcomeScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <Screen testID="welcome-screen">
      <View style={styles.container}>
        <View style={styles.hero}>
          <Logo size="large" />
          <Text style={[styles.tagline, { color: colors.textSecondary }]}>
            Discover research worth reading. Swipe right to save a paper, left to skip.
          </Text>
        </View>

        <View style={styles.points}>
          <Point text="Pick the topics you care about" />
          <Point text="Get papers ranked by relevance, recency and impact" />
          <Point text="Keep everything you save in one place" />
        </View>

        <View style={styles.actions}>
          <Button
            testID="get-started-button"
            label="Get started"
            size="large"
            onPress={() => router.push('/(auth)/sign-up')}
          />
          <Button
            testID="sign-in-button"
            label="I already have an account"
            variant="ghost"
            onPress={() => router.push('/(auth)/sign-in')}
          />
        </View>
      </View>
    </Screen>
  );
}

function Point({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.point}>
      <Text
        style={[styles.bullet, { color: colors.primary }]}
        accessibilityElementsHidden
      >
        ●
      </Text>
      <Text style={[styles.pointText, { color: colors.textSecondary }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'space-between', paddingVertical: spacing.xxl },
  hero: { gap: spacing.lg, marginTop: spacing.xxl },
  tagline: { ...typography.body, maxWidth: 330 },
  points: { gap: spacing.md },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  bullet: { fontSize: 10, marginTop: 7 },
  pointText: { ...typography.subtle, flex: 1 },
  actions: { gap: spacing.sm },
});
