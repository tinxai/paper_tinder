/** Full paper detail, opened by tapping a card or a saved row. */
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { ErrorState, LoadingState } from '@/components/StateViews';
import { Tag } from '@/components/Tag';
import { radius, spacing, typography } from '@/constants/theme';
import { useOpenUrl } from '@/hooks/useOpenUrl';
import { usePaper, useRemoveSwipe, useSavedPapers, useSwipe } from '@/hooks/usePapers';
import { useTheme } from '@/hooks/useTheme';
import {
  formatCitationLabel,
  formatFullAuthorList,
  formatMeta,
  isSafeExternalUrl,
} from '@/services/paperFormat';

export default function PaperDetailScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const openUrl = useOpenUrl();

  const paperQuery = usePaper(id);
  const swipe = useSwipe();
  const removeSwipe = useRemoveSwipe();

  // Is this paper already saved? The saved list is already cached, so this
  // needs no extra request in the common case.
  const saved = useSavedPapers({ limit: 100 });
  const isSaved = React.useMemo(
    () => (saved.data?.pages ?? []).some((page) => page.items.some((p) => p.id === id)),
    [saved.data, id],
  );

  if (paperQuery.isLoading) {
    return (
      <Screen testID="paper-detail-screen">
        <LoadingState message="Loading paper…" />
      </Screen>
    );
  }

  if (paperQuery.isError || !paperQuery.data) {
    return (
      <Screen testID="paper-detail-screen">
        <ErrorState
          error={paperQuery.error ?? new Error('Paper not found.')}
          onRetry={() => void paperQuery.refetch()}
        />
      </Screen>
    );
  }

  const paper = paperQuery.data;
  const meta = formatMeta(paper);

  return (
    <Screen testID="paper-detail-screen" padded={false} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {meta ? (
          <Text style={[styles.meta, { color: colors.textMuted }]}>{meta}</Text>
        ) : null}

        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
          {paper.title}
        </Text>

        <Text style={[styles.authors, { color: colors.textSecondary }]}>
          {formatFullAuthorList(paper.authors)}
        </Text>

        <View style={styles.badges}>
          <Tag label={formatCitationLabel(paper.citation_count)} tone="info" />
          {isSaved ? <Tag label="SAVED" tone="positive" testID="saved-badge" /> : null}
          {paper.pdf_url ? <Tag label="OPEN ACCESS" tone="positive" /> : null}
        </View>

        {paper.fields_of_study.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Fields of study
            </Text>
            <View style={styles.tagRow}>
              {paper.fields_of_study.map((field) => (
                <Tag key={field} label={field} />
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Abstract</Text>
          <Text style={[styles.abstract, { color: colors.textSecondary }]}>
            {paper.abstract?.trim() || 'No abstract is available for this paper.'}
          </Text>
        </View>

        <View style={[styles.linkCard, { borderColor: colors.border }]}>
          {isSafeExternalUrl(paper.pdf_url) ? (
            <Button
              testID="open-pdf-button"
              label="Open PDF"
              size="large"
              onPress={() => void openUrl(paper.pdf_url, 'PDF')}
              accessibilityHint="Opens the open-access PDF in your browser"
            />
          ) : null}

          {isSafeExternalUrl(paper.paper_url) ? (
            <Button
              testID="open-semantic-scholar-button"
              label="View on Semantic Scholar"
              variant="secondary"
              onPress={() => void openUrl(paper.paper_url, 'paper page')}
            />
          ) : null}

          {!isSafeExternalUrl(paper.pdf_url) && !isSafeExternalUrl(paper.paper_url) ? (
            <Text style={[styles.noLinks, { color: colors.textMuted }]}>
              No external links are available for this paper.
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          {isSaved ? (
            <Button
              testID="detail-remove-button"
              label="Remove from saved"
              variant="danger"
              onPress={() => removeSwipe.mutate(paper.id)}
              loading={removeSwipe.isPending}
            />
          ) : (
            <Button
              testID="detail-save-button"
              label="Save this paper"
              onPress={() => swipe.mutate({ paperId: paper.id, direction: 'right' })}
              loading={swipe.isPending}
            />
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  meta: { ...typography.caption, textTransform: 'uppercase', letterSpacing: 0.6 },
  title: { ...typography.title },
  authors: { ...typography.subtle },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  section: { gap: spacing.sm },
  sectionTitle: { ...typography.heading },
  abstract: { ...typography.body },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  linkCard: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  noLinks: { ...typography.subtle, textAlign: 'center' },
});
