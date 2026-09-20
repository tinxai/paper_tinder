/** Presentation helpers — pure functions, including the URL safety guard. */
import {
  abstractPreview,
  formatAuthors,
  formatCitationLabel,
  formatCitations,
  formatFullAuthorList,
  formatMeta,
  isSafeExternalUrl,
} from '@/services/paperFormat';
import type { Author } from '@/types/api';

const author = (name: string): Author => ({ author_id: null, name });

describe('formatAuthors', () => {
  it('lists every author when the list is short', () => {
    expect(formatAuthors([author('Ada Lovelace'), author('Grace Hopper')])).toBe(
      'Ada Lovelace, Grace Hopper',
    );
  });

  it('summarises a long author list', () => {
    const authors = ['A', 'B', 'C', 'D', 'E'].map(author);
    expect(formatAuthors(authors)).toBe('A, B, C +2 more');
  });

  it('falls back when there are no authors', () => {
    expect(formatAuthors([])).toBe('Unknown authors');
    expect(formatAuthors([author('')])).toBe('Unknown authors');
  });

  it('keeps every name in the full list', () => {
    const authors = ['A', 'B', 'C', 'D', 'E'].map(author);
    expect(formatFullAuthorList(authors)).toBe('A, B, C, D, E');
  });
});

describe('formatCitations', () => {
  it('adds thousands separators', () => {
    expect(formatCitations(12345)).toBe('12,345');
  });

  it('singularises one citation', () => {
    expect(formatCitationLabel(1)).toBe('1 citation');
    expect(formatCitationLabel(2)).toBe('2 citations');
  });

  it('treats missing or negative counts as zero', () => {
    expect(formatCitationLabel(0)).toBe('0 citations');
    expect(formatCitationLabel(-5)).toBe('0 citations');
    expect(formatCitationLabel(Number.NaN)).toBe('0 citations');
  });
});

describe('formatMeta', () => {
  it('joins year and venue', () => {
    expect(formatMeta({ year: 2024, venue: 'NeurIPS' })).toBe('2024 · NeurIPS');
  });

  it('drops whichever half is missing', () => {
    expect(formatMeta({ year: 2024, venue: null })).toBe('2024');
    expect(formatMeta({ year: null, venue: 'ICML' })).toBe('ICML');
    expect(formatMeta({ year: null, venue: null })).toBe('');
    expect(formatMeta({ year: 2024, venue: '   ' })).toBe('2024');
  });
});

describe('abstractPreview', () => {
  it('returns a short abstract unchanged', () => {
    expect(abstractPreview('A short abstract.')).toBe('A short abstract.');
  });

  it('explains a missing abstract instead of rendering empty space', () => {
    expect(abstractPreview(null)).toBe('No abstract available for this paper.');
    expect(abstractPreview('   ')).toBe('No abstract available for this paper.');
  });

  it('truncates on a word boundary with an ellipsis', () => {
    const long = `${'word '.repeat(100)}end`;
    const preview = abstractPreview(long, 50);

    expect(preview.length).toBeLessThanOrEqual(51);
    expect(preview.endsWith('…')).toBe(true);
    expect(preview).not.toContain('  ');
  });

  it('collapses runaway whitespace', () => {
    expect(abstractPreview('a\n\n  b\t\tc')).toBe('a b c');
  });
});

describe('isSafeExternalUrl', () => {
  it('accepts http and https', () => {
    expect(isSafeExternalUrl('https://arxiv.org/pdf/1706.03762')).toBe(true);
    expect(isSafeExternalUrl('http://example.com')).toBe(true);
  });

  it('rejects every other scheme', () => {
    // These would otherwise reach Linking.openURL.
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeExternalUrl('data:text/html,<b>x</b>')).toBe(false);
    expect(isSafeExternalUrl('ftp://example.com')).toBe(false);
  });

  it('rejects empty values', () => {
    expect(isSafeExternalUrl(null)).toBe(false);
    expect(isSafeExternalUrl(undefined)).toBe(false);
    expect(isSafeExternalUrl('')).toBe(false);
  });
});
