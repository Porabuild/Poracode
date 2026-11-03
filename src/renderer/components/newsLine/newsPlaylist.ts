export type NewsItemKind =
  | "insight"
  | "changelog"
  | "announcement"
  | "discovery"
  | "usage"
  | "tip"
  | "promotion";

export interface NewsPlaylistEntry {
  id: string;
  kind: NewsItemKind;
  /** Jumps to the front of the rotation (for example a nearly exhausted limit). */
  urgent?: boolean;
}

export interface NewsPlaylistSources<T extends NewsPlaylistEntry> {
  insights: readonly T[];
  changelog: readonly T[];
  /** Remote feed items (announcements and community news). */
  announcements?: readonly T[];
  /** Features the user has not tried yet. */
  discovery?: readonly T[];
  usage: readonly T[];
  tips: readonly T[];
  promotions: readonly T[];
}

/** One promotion follows this many other items, so at most one in five is a promotion. */
export const PROMOTION_SPACING = 4;
/** Upper bound on non-promotional items in one rotation. */
export const MAX_PLAYLIST_ITEMS = 12;

/**
 * Order the news line's rotation. Urgent items lead; the rest alternate
 * between sources (insight, changelog, announcement, discovery, tip, usage)
 * so consecutive items differ.
 * Promotions sit between other items — never first, at most one per
 * {@link PROMOTION_SPACING} others. With nothing else to show, the line shows
 * only the promotions.
 */
export function buildNewsPlaylist<T extends NewsPlaylistEntry>(
  sources: NewsPlaylistSources<T>,
): T[] {
  const urgent = sources.usage.filter((item) => item.urgent === true);
  const queues = [
    [...sources.insights],
    [...sources.changelog],
    [...(sources.announcements ?? [])],
    [...(sources.discovery ?? [])],
    [...sources.tips],
    sources.usage.filter((item) => item.urgent !== true),
  ];
  const base: T[] = [...urgent];
  while (base.length < MAX_PLAYLIST_ITEMS && queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next && base.length < MAX_PLAYLIST_ITEMS) base.push(next);
    }
  }
  if (base.length === 0) return [...sources.promotions];

  const promotions = [...sources.promotions];
  const playlist: T[] = [];
  base.forEach((item, index) => {
    playlist.push(item);
    if (
      (index + 1) % PROMOTION_SPACING === 0 ||
      (index === base.length - 1 && index < PROMOTION_SPACING)
    ) {
      const promotion = promotions.shift();
      if (promotion) playlist.push(promotion);
    }
  });
  return playlist;
}

/** Small deterministic PRNG (mulberry32) so one visit's choices stay stable across renders. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Fisher–Yates over a copy. */
export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}
