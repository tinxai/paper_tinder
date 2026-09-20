/** Shared render helper + paper fixtures. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/hooks/useTheme';
import type { FeedPaper, SavedPaper } from '@/types/api';

/** Retry off: a test should surface the first failure, not wait through retries. */
function makeTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/**
 * NOTE: `render` is asynchronous in React Native Testing Library v14 (it awaits
 * React 19's concurrent commit), so every caller must await this.
 */
export async function renderWithProviders(ui: ReactElement, options?: RenderOptions) {
  const queryClient = makeTestQueryClient();

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>{children}</ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...options });
}

export function makeFeedPaper(overrides: Partial<FeedPaper> = {}): FeedPaper {
  return {
    id: 'paper-001',
    title: 'Attention Is All You Need',
    abstract: 'We propose the Transformer, a model architecture based on attention.',
    year: 2017,
    publication_date: '2017-06-12',
    venue: 'NeurIPS',
    citation_count: 100000,
    paper_url: 'https://www.semanticscholar.org/paper/paper-001',
    pdf_url: 'https://arxiv.org/pdf/1706.03762.pdf',
    authors: [
      { author_id: '1', name: 'Ashish Vaswani' },
      { author_id: '2', name: 'Noam Shazeer' },
    ],
    fields_of_study: ['Computer Science'],
    score: 0.91,
    matched_interests: ['Natural Language Processing'],
    ...overrides,
  };
}

export function makeSavedPaper(overrides: Partial<SavedPaper> = {}): SavedPaper {
  const { score, matched_interests, ...base } = makeFeedPaper();
  void score;
  void matched_interests;
  return { ...base, saved_at: '2026-01-15T10:30:00Z', ...overrides };
}
