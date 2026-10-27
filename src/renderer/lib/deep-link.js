/**
 * Deep links of the form
 *
 *   bookreader://open?book=<bookId>&file=<path>&page=42&x=72&y=640[&x2=..&y2=..][&end=45]
 *
 * point at an exact spot (or passage, or page range) in a book. `book` is a
 * content hash, so the link still resolves if the file has moved, as long as
 * the book has been opened once on this machine.
 *
 * @typedef {object} DeepLink
 * @property {string|null} bookId
 * @property {string|null} file
 * @property {number} page
 * @property {number|null} endPage
 * @property {number|null} x
 * @property {number|null} y
 * @property {number|null} x2
 * @property {number|null} y2
 */

export const SCHEME = 'bookreader';

/** @param {Partial<DeepLink> & { page: number }} link */
export function buildDeepLink({ bookId, file, page, endPage, x, y, x2, y2 }) {
  const params = new URLSearchParams();
  if (bookId) params.set('book', bookId);
  if (file) params.set('file', file);
  params.set('page', String(page));
  if (endPage && endPage !== page) params.set('end', String(endPage));
  for (const [key, value] of Object.entries({ x, y, x2, y2 })) {
    if (Number.isFinite(value)) params.set(key, String(Math.round(value)));
  }
  return `${SCHEME}://open?${params}`;
}

/** @returns {DeepLink|null} */
export function parseDeepLink(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${SCHEME}:`) return null;
  const q = parsed.searchParams;
  const num = (key) => (q.has(key) && Number.isFinite(Number(q.get(key))) ? Number(q.get(key)) : null);
  return {
    bookId: q.get('book'),
    file: q.get('file'),
    page: num('page') ?? 1,
    endPage: num('end'),
    x: num('x'),
    y: num('y'),
    x2: num('x2'),
    y2: num('y2'),
  };
}
