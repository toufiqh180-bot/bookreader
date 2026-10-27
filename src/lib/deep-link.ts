/**
 * Deep links to an exact spot, passage or page range in a book.
 *
 *   desktop:  bookreader://open?book=<id>&file=<path>&page=42&x=72&y=640[&x2=..&y2=..][&end=45]
 *   web:      https://<app>/#open?book=<id>&page=42&…
 *
 * `book` is a content hash, so a link still resolves after the file moves,
 * as long as the book is in this device's library.
 */

export const SCHEME = 'bookreader';

export interface DeepLink {
  bookId: string | null;
  file: string | null;
  page: number;
  endPage: number | null;
  x: number | null;
  y: number | null;
  x2: number | null;
  y2: number | null;
}

export type DeepLinkInput = Partial<Omit<DeepLink, 'page'>> & { page: number };

function toParams({ bookId, file, page, endPage, x, y, x2, y2 }: DeepLinkInput): URLSearchParams {
  const params = new URLSearchParams();
  if (bookId) params.set('book', bookId);
  if (file) params.set('file', file);
  params.set('page', String(page));
  if (endPage && endPage !== page) params.set('end', String(endPage));
  for (const [key, value] of Object.entries({ x, y, x2, y2 })) {
    if (typeof value === 'number' && Number.isFinite(value)) params.set(key, String(Math.round(value)));
  }
  return params;
}

/** `bookreader://` link for the desktop app. */
export function buildDeepLink(link: DeepLinkInput): string {
  return `${SCHEME}://open?${toParams(link)}`;
}

/** Link into the web app at `baseUrl` (no file path — it would mean nothing elsewhere). */
export function buildWebLink(link: DeepLinkInput, baseUrl: string): string {
  return `${baseUrl.split('#')[0]}#open?${toParams({ ...link, file: null })}`;
}

/** Parses either form; null for anything else. */
export function parseDeepLink(url: string): DeepLink | null {
  let query: string;
  if (url.startsWith(`${SCHEME}://`)) {
    try {
      query = new URL(url).search;
    } catch {
      return null;
    }
  } else {
    const hash = url.indexOf('#open?');
    if (hash < 0) return null;
    query = url.slice(hash + '#open'.length);
  }
  const q = new URLSearchParams(query);
  const num = (key: string) => (q.has(key) && Number.isFinite(Number(q.get(key))) ? Number(q.get(key)) : null);
  return { bookId: q.get('book'), file: q.get('file'), page: num('page') ?? 1, endPage: num('end'), x: num('x'), y: num('y'), x2: num('x2'), y2: num('y2') };
}
