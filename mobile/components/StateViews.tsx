/**
 * Loading / empty / error / offline states.
 *
 * Centralized so every screen presents failures the same way, and so every
 * error state offers a retry where one makes sense.
 */
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { ApiError } from '@/services/errors';
import { Button } from './Button';

export function LoadingState({ message = 'Loading…' }: { message?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.container} testID="loading-state">
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.body, { color: colors.textMuted }]}>{message}</Text>
    </View>
  );
}

interface EmptyStateProps {
  title: string;
  message: string;
  /** Large glyph above the title. Decorative — hidden from screen readers. */
  icon?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}

export function EmptyState({
  title,
  message,
  icon = '📄',
  actionLabel,
  onAction,
  testID = 'empty-state',
}: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.container} testID={testID}>
      <Text
        style={styles.icon}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {icon}
      </Text>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>{message}</Text>
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          onPress={onAction}
          variant="secondary"
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  title?: string;
  testID?: string;
}

export function ErrorState({
  error,
  onRetry,
  title,
  testID = 'error-state',
}: ErrorStateProps) {
  const { colors } = useTheme();

  const isOffline = error instanceof ApiError && error.isNetworkError;
  const message =
    error instanceof ApiError
      ? error.message
      : error instanceof Error && error.message
        ? error.message
        : 'Something went wrong. Please try again.';

  const heading = title ?? (isOffline ? "You're offline" : 'Something went wrong');

  return (
    <View style={styles.container} testID={testID}>
      <Text
        style={styles.icon}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {isOffline ? '📡' : '⚠️'}
      </Text>
      <Text accessibilityRole="alert" style={[styles.title, { color: colors.text }]}>
        {heading}
      </Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>{message}</Text>
      {onRetry ? (
        <Button
          testID="retry-button"
          label="Try again"
          onPress={onRetry}
          variant="primary"
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

/** Inline banner, e.g. "showing cached results". Not a full-screen takeover. */
export function NoticeBanner({
  message,
  tone = 'info',
}: {
  message: string;
  tone?: 'info' | 'warning';
}) {
  const { colors } = useTheme();
  const background = tone === 'warning' ? colors.dismissSubtle : colors.primarySubtle;
  const foreground = tone === 'warning' ? colors.dismiss : colors.primary;

  return (
    <View
      style={[styles.banner, { backgroundColor: background }]}
      accessibilityRole="alert"
    >
      <Text style={[styles.bannerText, { color: foreground }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  icon: { fontSize: 44 },
  title: { ...typography.heading, textAlign: 'center' },
  body: { ...typography.body, textAlign: 'center', maxWidth: 320 },
  action: { marginTop: spacing.sm, minWidth: 160 },
  banner: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 10,
  },
  bannerText: { ...typography.caption, textAlign: 'center' },
});
