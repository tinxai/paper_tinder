/**
 * Mandatory first-run step: choose at least one research interest.
 * The feed cannot rank anything without them.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { InterestPicker } from '@/components/InterestPicker';
import { Screen } from '@/components/Screen';
import { ErrorState, LoadingState } from '@/components/StateViews';
import { spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { useSuggestedInterests, useUpdateInterests } from '@/hooks/useInterests';
import { useTheme } from '@/hooks/useTheme';
import { toErrorMessage } from '@/services/errors';

export default function OnboardingScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { refreshUser, signOut } = useAuth();

  const [selected, setSelected] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const suggestionsQuery = useSuggestedInterests();
  const updateInterests = useUpdateInterests();

  const handleContinue = async () => {
    setSubmitError(null);
    try {
      await updateInterests.mutateAsync(selected);
      // The user object carries has_completed_onboarding, which gates routing.
      await refreshUser();
      router.replace('/(tabs)/discover');
    } catch (error) {
      setSubmitError(toErrorMessage(error));
    }
  };

  if (suggestionsQuery.isLoading) {
    return (
      <Screen testID="onboarding-screen">
        <LoadingState message="Loading topics…" />
      </Screen>
    );
  }

  // A failed catalogue fetch is recoverable: InterestPicker falls back to a
  // built-in list, so onboarding still works offline.
  const suggestions = (suggestionsQuery.data?.items ?? []).map((item) => item.name);

  return (
    <Screen testID="onboarding-screen">
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>What do you research?</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Pick at least one topic. We use these to find and rank papers for you — you can
          change them any time in Settings.
        </Text>
      </View>

      <InterestPicker
        suggestions={suggestions}
        selected={selected}
        onChange={setSelected}
      />

      {submitError ? (
        <ErrorState
          error={new Error(submitError)}
          onRetry={() => void handleContinue()}
          title="Could not save your interests"
        />
      ) : null}

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Button
          testID="continue-button"
          label={selected.length === 0 ? 'Select at least one topic' : 'Start swiping'}
          size="large"
          onPress={() => void handleContinue()}
          disabled={selected.length === 0}
          loading={updateInterests.isPending}
        />
        <Button label="Sign out" variant="ghost" onPress={() => void signOut()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  title: { ...typography.title },
  subtitle: { ...typography.subtle },
  footer: { gap: spacing.xs, paddingTop: spacing.lg, borderTopWidth: 1 },
});
