/**
 * Six uppercase hex digits derived from a string (FNV-1a), used as a short
 * "commit hash" for résumé entries. Shared by the Experience floor graph,
 * the billboard log and the terminal's `experience` command, so the same
 * role always shows the same hash.
 */
export function shortHash(source: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    h ^= source.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 8).toString(16).toUpperCase().padStart(6, "0");
}
