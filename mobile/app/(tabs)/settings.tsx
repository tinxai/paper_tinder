/** Profile, interest editing, theme, sign out, and account deletion. */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { InterestPicker } from '@/components/InterestPicker';
import { Screen } from '@/components/Screen';
import { ErrorState, LoadingState } from '@/components/StateViews';
import { radius, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import {
  useMyInterests,
  useSuggestedInterests,
  useUpdateInterests,
} from '@/hooks/useInterests';
import { useTheme, useThemeContext } from '@/hooks/useTheme';
import { toErrorMessage } from '@/services/errors';
import type { ThemePreference } from '@/services/preferences';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function SettingsScreen() {
  const { colors } = useTheme();
  const { preference, setPreference } = useThemeContext();
  const { user, signOut, deleteAccount } = useAuth();

  const myInterests = useMyInterests();
  const suggestions = useSuggestedInterests();
  const updateInterests = useUpdateInterests();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const currentNames = React.useMemo(
    () => (myInterests.data?.items ?? []).map((item) => item.name),
    [myInterests.data],
  );

  const saveInterests = async () => {
    setSaveError(null);
    try {
      await updateInterests.mutateAsync(draft);
      setEditing(false);
    } catch (error) {
      setSaveError(toErrorMessage(error));
    }
  };

  const confirmDelete = () => {
    // Two-step confirmation: this is irreversible.
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account, your saved papers and your swipe history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setDeleting(true);
            void deleteAccount()
              .catch((error) =>
                Alert.alert('Could not delete account', toErrorMessage(error)),
              )
              .finally(() => setDeleting(false));
          },
        },
      ],
    );
  };

  if (myInterests.isLoading) {
    return (
      <Screen testID="settings-screen">
        <LoadingState />
      </Screen>
    );
  }

  return (
    <Screen testID="settings-screen" padded={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Section title="Account">
          <View
            style={[
              styles.card,
              { backgroundColor: colors.surfaceSunken, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.label, { color: colors.textMuted }]}>Signed in as</Text>
            <Text testID="settings-email" style={[styles.value, { color: colors.text }]}>
              {user?.email ?? 'Unknown'}
            </Text>
          </View>
        </Section>

        <Section title="Research interests">
          {myInterests.isError ? (
            <ErrorState
              error={myInterests.error}
              onRetry={() => void myInterests.refetch()}
            />
          ) : editing ? (
            <View style={styles.editor}>
              <InterestPicker
                suggestions={(suggestions.data?.items ?? []).map((item) => item.name)}
                selected={draft}
                onChange={setDraft}
              />
              {saveError ? (
                <Text
                  accessibilityRole="alert"
                  style={[styles.error, { color: colors.danger }]}
                >
                  {saveError}
                </Text>
              ) : null}
              <View style={styles.editorActions}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  style={styles.flex}
                  onPress={() => {
                    setEditing(false);
                    setDraft(currentNames);
                    setSaveError(null);
                  }}
                />
                <Button
                  testID="save-interests-button"
                  label="Save"
                  style={styles.flex}
                  onPress={() => void saveInterests()}
                  loading={updateInterests.isPending}
                  disabled={draft.length === 0}
                />
              </View>
            </View>
          ) : (
            <View style={styles.interestsView}>
              {currentNames.length > 0 ? (
                <View style={styles.chipRow}>
                  {currentNames.map((name) => (
                    <Chip key={name} label={name} selected />
                  ))}
                </View>
              ) : (
                <Text style={[styles.value, { color: colors.textMuted }]}>
                  No interests selected yet.
                </Text>
              )}
              <Button
                testID="edit-interests-button"
                label="Edit interests"
                variant="secondary"
                onPress={() => {
                  // Seed the draft here rather than syncing it in an effect.
                  setDraft(currentNames);
                  setEditing(true);
                }}
              />
            </View>
          )}
        </Section>

        <Section title="Appearance">
          <View style={styles.chipRow}>
            {THEME_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={preference === option.value}
                onPress={() => setPreference(option.value)}
                testID={`theme-${option.value}`}
              />
            ))}
          </View>
        </Section>

        <Section title="Session">
          <Button
            testID="sign-out-button"
            label="Sign out"
            variant="secondary"
            onPress={() => void signOut()}
          />
        </Section>

        <Section title="Danger zone">
          <Text style={[styles.helper, { color: colors.textMuted }]}>
            Deleting your account removes your saved papers and swipe history permanently.
          </Text>
          <Button
            testID="delete-account-button"
            label="Delete account"
            variant="danger"
            onPress={confirmDelete}
            loading={deleting}
          />
        </Section>

        <Text style={[styles.version, { color: colors.textMuted }]}>
          PaperSwipe v1.0.0
        </Text>
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <Text
        style={[styles.sectionTitle, { color: colors.text }]}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.xxl, paddingBottom: spacing.xxxl },
  section: { gap: spacing.md },
  sectionTitle: { ...typography.heading },
  card: { padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, gap: spacing.xs },
  label: { ...typography.caption },
  value: { ...typography.body },
  helper: { ...typography.subtle },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  interestsView: { gap: spacing.lg },
  editor: { gap: spacing.md, minHeight: 360 },
  editorActions: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  error: { ...typography.caption },
  version: { ...typography.caption, textAlign: 'center' },
});
