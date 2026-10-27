/**
 * A book's id: a SHA-256 of its bytes. Notes follow the content, so renaming
 * or moving the file — or opening the same book on the web — finds them.
 * The format matches records created by earlier versions.
 */
export async function contentId(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return `sha256-${hex.slice(0, 24)}`;
}
