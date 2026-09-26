/**
 * Lightweight lexical duplicate detection. Phase 3 can swap this for
 * embeddings; the service contract (findSimilarOpenTasks) stays the same.
 */
const STOP_WORDS = new Set([
  "a", "an", "the", "to", "for", "of", "and", "or", "on", "in", "at", "with",
  "my", "me", "about", "up", "i", "need", "should", "must", "please",
]);

export function normalizeTitle(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
    .map((w) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w));
}

/** 0..1 similarity between two task titles (Jaccard over content words). */
export function titleSimilarity(a: string, b: string): number {
  const wa = new Set(normalizeTitle(a));
  const wb = new Set(normalizeTitle(b));
  if (wa.size === 0 || wb.size === 0) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  const jaccard = shared / (wa.size + wb.size - shared);
  // A short title fully contained in a longer one ("Book doctor" vs
  // "Book doctor appointment") is still a strong duplicate signal.
  const containment = shared / Math.min(wa.size, wb.size);
  return Math.max(jaccard, containment >= 1 && Math.min(wa.size, wb.size) >= 2 ? 0.85 : 0);
}

export const DUPLICATE_THRESHOLD = 0.7;
