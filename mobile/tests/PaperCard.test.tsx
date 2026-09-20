/** Card rendering, including papers with missing metadata. */
import { fireEvent, screen } from '@testing-library/react-native';
import { PaperCard } from '@/components/PaperCard';
import { makeFeedPaper, renderWithProviders } from './testUtils';

describe('PaperCard', () => {
  it('renders the title, authors, venue/year and citation count', async () => {
    await renderWithProviders(<PaperCard paper={makeFeedPaper()} />);

    expect(screen.getByText('Attention Is All You Need')).toBeTruthy();
    expect(screen.getByText('Ashish Vaswani, Noam Shazeer')).toBeTruthy();
    expect(screen.getByText('2017 · NeurIPS')).toBeTruthy();
    expect(screen.getByText('100,000 citations')).toBeTruthy();
  });

  it('shows an abstract preview', async () => {
    await renderWithProviders(<PaperCard paper={makeFeedPaper()} />);
    expect(screen.getByText(/We propose the Transformer/)).toBeTruthy();
  });

  it('renders topic tags', async () => {
    await renderWithProviders(
      <PaperCard
        paper={makeFeedPaper({ fields_of_study: ['Computer Science', 'Linguistics'] })}
      />,
    );
    expect(screen.getByText('Computer Science')).toBeTruthy();
    expect(screen.getByText('Linguistics')).toBeTruthy();
  });

  it('indicates when an open-access PDF is available', async () => {
    await renderWithProviders(<PaperCard paper={makeFeedPaper()} />);
    expect(screen.getByTestId('pdf-badge')).toBeTruthy();
  });

  it('omits the PDF badge when there is no PDF', async () => {
    await renderWithProviders(<PaperCard paper={makeFeedPaper({ pdf_url: null })} />);
    expect(screen.queryByTestId('pdf-badge')).toBeNull();
  });

  it('renders a paper with no abstract, venue or year', async () => {
    // Semantic Scholar returns partial records routinely; the card must not crash.
    await renderWithProviders(
      <PaperCard
        paper={makeFeedPaper({ abstract: null, venue: null, year: null, authors: [] })}
      />,
    );

    expect(screen.getByText('Attention Is All You Need')).toBeTruthy();
    expect(screen.getByText('No abstract available for this paper.')).toBeTruthy();
    expect(screen.getByText('Unknown authors')).toBeTruthy();
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await renderWithProviders(<PaperCard paper={makeFeedPaper()} onPress={onPress} />);

    await fireEvent.press(screen.getByTestId('paper-card'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('exposes one combined accessibility label', async () => {
    await renderWithProviders(<PaperCard paper={makeFeedPaper()} onPress={jest.fn()} />);

    const card = screen.getByTestId('paper-card');
    expect(card.props.accessibilityLabel).toContain('Attention Is All You Need');
    expect(card.props.accessibilityLabel).toContain('Ashish Vaswani');
    expect(card.props.accessibilityLabel).toContain('100,000 citations');
  });

  it('truncates a very long field list', async () => {
    await renderWithProviders(
      <PaperCard paper={makeFeedPaper({ fields_of_study: ['A', 'B', 'C', 'D', 'E'] })} />,
    );
    expect(screen.getByText('+2')).toBeTruthy();
  });
});
