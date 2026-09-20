/**
 * The paper card itself — presentation only, no gesture logic.
 *
 * Kept separate from SwipeableCard so it can be rendered (and tested) without
 * a gesture context, and reused for the static cards stacked behind the top one.
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { radius, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import {
  abstractPreview,
  formatAuthors,
  formatCitationLabel,
  formatMeta,
} from '@/services/paperFormat';
import type { FeedPaper, Paper } from '@/types/api';
import { Tag } from './Tag';

interface PaperCardProps {
  paper: Paper | FeedPaper;
  onPress?: () => void;
  testID?: string;
}

const MAX_VISIBLE_TAGS = 3;

export function PaperCard({ paper, onPress, testID = 'paper-card' }: PaperCardProps) {
  const { colors } = useTheme();

  const meta = formatMeta(paper);
  const authors = formatAuthors(paper.authors);
  const citations = formatCitationLabel(paper.citation_count);
  const tags = (paper.fields_of_study ?? []).slice(0, MAX_VISIBLE_TAGS);
  const extraTagCount = (paper.fields_of_study?.length ?? 0) - tags.length;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      // One combined label so VoiceOver reads the card as a unit.
      accessibilityLabel={`${paper.title}. ${authors}. ${meta || 'Year unknown'}. ${citations}.`}
      accessibilityHint={onPress ? 'Opens the full paper details' : undefined}
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          shadowColor: colors.shadow,
        },
      ]}
    >
      <View style={styles.header}>
        {meta ? (
          <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}

        <Text
          testID="paper-card-title"
          style={[styles.title, { color: colors.text }]}
          numberOfLines={4}
        >
          {paper.title}
        </Text>

        <Text style={[styles.authors, { color: colors.textSecondary }]} numberOfLines={2}>
          {authors}
        </Text>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <ScrollView
        style={styles.abstractScroll}
        contentContainerStyle={styles.abstractContent}
        showsVerticalScrollIndicator={false}
        // The parent gesture owns the drag; let it win over this scroll view.
        scrollEnabled={false}
      >
        <Text style={[styles.abstract, { color: colors.textSecondary }]}>
          {abstractPreview(paper.abstract)}
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.tagRow}>
          {tags.map((field) => (
            <Tag key={field} label={field} />
          ))}
          {extraTagCount > 0 ? <Tag label={`+${extraTagCount}`} /> : null}
          {paper.pdf_url ? (
            <Tag label="PDF AVAILABLE" tone="positive" testID="pdf-badge" />
          ) : null}
        </View>

        <Text style={[styles.citations, { color: colors.textMuted }]}>{citations}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.xl,
    justifyContent: 'space-between',
    // A restrained lift, so the top card reads as above the stack.
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  header: { gap: spacing.sm },
  meta: { ...typography.caption, textTransform: 'uppercase', letterSpacing: 0.6 },
  title: { ...typography.cardTitle },
  authors: { ...typography.subtle },
  divider: { height: 1, marginVertical: spacing.lg },
  abstractScroll: { flex: 1 },
  abstractContent: { paddingBottom: spacing.sm },
  abstract: { ...typography.body },
  footer: { gap: spacing.md, marginTop: spacing.lg },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  citations: { ...typography.caption },
});
