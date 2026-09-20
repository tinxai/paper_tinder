/** Presentation helpers for paper metadata. Pure functions — easy to test. */
import type { Author, Paper } from '@/types/api';

/**
 * "Vaswani et al." for long lists, the full list when it is short.
 * Screen-reader users get the full list in the detail screen.
 */
export function formatAuthors(authors: Author[], maxNames = 3): string {
  if (!authors || authors.length === 0) return 'Unknown authors';

  const names = authors.map((a) => a.name).filter(Boolean);
  if (names.length === 0) return 'Unknown authors';
  if (names.length <= maxNames) return names.join(', ');
  return `${names.slice(0, maxNames).join(', ')} +${names.length - maxNames} more`;
}

export function formatFullAuthorList(authors: Author[]): string {
  if (!authors || authors.length === 0) return 'Unknown authors';
  const names = authors.map((a) => a.name).filter(Boolean);
  return names.length > 0 ? names.join(', ') : 'Unknown authors';
}

/** "2,481" — thousands separators keep large counts readable. */
export function formatCitations(count: number): string {
  const safe = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return safe.toLocaleString('en-US');
}

export function formatCitationLabel(count: number): string {
  const safe = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return `${formatCitations(safe)} ${safe === 1 ? 'citation' : 'citations'}`;
}

/** "2024 · NeurIPS", dropping whichever half is missing. */
export function formatMeta(paper: Pick<Paper, 'year' | 'venue'>): string {
  const parts: string[] = [];
  if (paper.year) parts.push(String(paper.year));
  if (paper.venue?.trim()) parts.push(paper.venue.trim());
  return parts.join(' · ');
}

/** Abstract trimmed to a card-sized preview, cut on a word boundary. */
export function abstractPreview(abstract: string | null, maxLength = 240): string {
  if (!abstract?.trim()) return 'No abstract available for this paper.';

  const clean = abstract.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;

  const truncated = clean.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  return `${(lastSpace > maxLength * 0.6 ? truncated.slice(0, lastSpace) : truncated).trimEnd()}…`;
}

export function formatSavedDate(isoDate: string): string {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Only http(s) URLs are ever handed to Linking.openURL. The backend already
 * filters these, but the app must not trust that blindly — a `javascript:` or
 * `file:` URL reaching openURL would be a real bug.
 */
export function isSafeExternalUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  const trimmed = url.trim().toLowerCase();
  return trimmed.startsWith('http://') || trimmed.startsWith('https://');
}
