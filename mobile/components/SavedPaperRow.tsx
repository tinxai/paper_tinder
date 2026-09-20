import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import {
  formatAuthors,
  formatCitationLabel,
  formatMeta,
  formatSavedDate,
} from '@/services/paperFormat';
import type { SavedPaper } from '@/types/api';
import { Button } from './Button';
import { Tag } from './Tag';

interface SavedPaperRowProps {
  paper: SavedPaper;
  onPress: () => void;
  onRemove: () => void;
}

export function SavedPaperRow({ paper, onPress, onRemove }: SavedPaperRowProps) {
  const { colors } = useTheme();
  const meta = formatMeta(paper);

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${paper.title}. ${formatAuthors(paper.authors)}.`}
        accessibilityHint="Opens the full paper details"
        style={styles.main}
      >
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={3}>
          {paper.title}
        </Text>
        <Text style={[styles.authors, { color: colors.textSecondary }]} numberOfLines={1}>
          {formatAuthors(paper.authors, 2)}
        </Text>

        <View style={styles.metaRow}>
          {meta ? (
            <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
          <Text style={[styles.meta, { color: colors.textMuted }]}>
            {formatCitationLabel(paper.citation_count)}
          </Text>
        </View>

        <View style={styles.tagRow}>
          {paper.pdf_url ? <Tag label="PDF" tone="positive" /> : null}
          <Text style={[styles.saved, { color: colors.textMuted }]}>
            Saved {formatSavedDate(paper.saved_at)}
          </Text>
        </View>
      </Pressable>

      <Button
        testID={`remove-${paper.id}`}
        label="Remove"
        variant="ghost"
        onPress={onRemove}
        style={styles.remove}
        accessibilityHint={`Removes ${paper.title} from your saved papers`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  main: { gap: spacing.xs },
  title: { ...typography.bodyStrong, fontSize: 17, lineHeight: 23 },
  authors: { ...typography.subtle },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  meta: { ...typography.caption },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  saved: { ...typography.tiny },
  remove: { alignSelf: 'flex-start', paddingHorizontal: 0 },
});
