/** Saved papers, with search, year filter, and sorting. */
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { SavedPaperRow } from '@/components/SavedPaperRow';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { TextField } from '@/components/TextField';
import { spacing, typography } from '@/constants/theme';
import { useRemoveSwipe, useSavedPapers } from '@/hooks/usePapers';
import { useTheme } from '@/hooks/useTheme';
import type { SavedPaper, SavedSortOption } from '@/types/api';

const SORT_OPTIONS: { value: SavedSortOption; label: string }[] = [
  { value: 'newest', label: 'Newest saved' },
  { value: 'oldest', label: 'Oldest saved' },
  { value: 'citations', label: 'Most cited' },
];

/** Debounce so a search does not fire a request on every keystroke. */
function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function SavedScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SavedSortOption>('newest');
  const [year, setYear] = useState<number | undefined>();

  const debouncedSearch = useDebounced(search);

  const query = useMemo(
    () => ({ q: debouncedSearch.trim() || undefined, sort, year }),
    [debouncedSearch, sort, year],
  );

  const saved = useSavedPapers(query);
  const removeSwipe = useRemoveSwipe();

  const papers: SavedPaper[] = useMemo(
    () => saved.data?.pages.flatMap((page) => page.items) ?? [],
    [saved.data],
  );

  // Year options come from what is actually saved, so the filter never offers
  // a year with no results.
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const paper of papers) if (paper.year) years.add(paper.year);
    return [...years].sort((a, b) => b - a).slice(0, 12);
  }, [papers]);

  const hasFilters = Boolean(query.q) || year !== undefined;

  const renderHeader = () => (
    <View style={styles.header}>
      <TextField
        testID="saved-search-input"
        label="Search"
        value={search}
        onChangeText={setSearch}
        placeholder="Search by title or author"
        autoCapitalize="none"
      />

      <View style={styles.filterGroup}>
        <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>Sort by</Text>
        <View style={styles.chipRow}>
          {SORT_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={sort === option.value}
              onPress={() => setSort(option.value)}
              testID={`sort-${option.value}`}
            />
          ))}
        </View>
      </View>

      {availableYears.length > 0 || year !== undefined ? (
        <View style={styles.filterGroup}>
          <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>Year</Text>
          <View style={styles.chipRow}>
            <Chip
              label="All years"
              selected={year === undefined}
              onPress={() => setYear(undefined)}
            />
            {availableYears.map((value) => (
              <Chip
                key={value}
                label={String(value)}
                selected={year === value}
                onPress={() => setYear(year === value ? undefined : value)}
                testID={`year-${value}`}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );

  if (saved.isLoading) {
    return (
      <Screen testID="saved-screen">
        <LoadingState message="Loading your saved papers…" />
      </Screen>
    );
  }

  if (saved.isError && papers.length === 0) {
    return (
      <Screen testID="saved-screen">
        <ErrorState error={saved.error} onRetry={() => void saved.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen testID="saved-screen" padded={false}>
      <FlatList
        data={papers}
        keyExtractor={(paper) => paper.id}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <SavedPaperRow
            paper={item}
            onPress={() => router.push(`/paper/${item.id}`)}
            onRemove={() => removeSwipe.mutate(item.id)}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon={hasFilters ? '🔎' : '🔖'}
            title={hasFilters ? 'No matches' : 'Nothing saved yet'}
            message={
              hasFilters
                ? 'No saved papers match those filters. Try a different search or year.'
                : 'Swipe right on a paper in Discover and it will show up here.'
            }
            actionLabel={hasFilters ? 'Clear filters' : undefined}
            onAction={
              hasFilters
                ? () => {
                    setSearch('');
                    setYear(undefined);
                  }
                : undefined
            }
            testID="saved-empty-state"
          />
        }
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (saved.hasNextPage && !saved.isFetchingNextPage) void saved.fetchNextPage();
        }}
        ListFooterComponent={
          saved.isFetchingNextPage ? (
            <ActivityIndicator style={styles.footer} color={colors.primary} />
          ) : null
        }
        refreshing={saved.isRefetching && !saved.isFetchingNextPage}
        onRefresh={() => void saved.refetch()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  header: { gap: spacing.lg, marginBottom: spacing.sm },
  filterGroup: { gap: spacing.sm },
  filterLabel: { ...typography.caption },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  footer: { paddingVertical: spacing.lg },
});
