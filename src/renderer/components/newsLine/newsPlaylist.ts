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
  /** Topic category used to keep consecutive batches varied. */
  category?: string;
  /** Subject key (e.g. a provider, model, or environment) to avoid repeating the same theme. */
  subject?: string;
  /** Relative selection bias (default 1). */
  weight?: number;
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

/** Later promotions follow this many other items, keeping promotions infrequent. */
export const PROMOTION_SPACING = 4;
/** Upper bound on non-promotional items in one bounded rotation (`buildNewsPlaylist`). */
export const MAX_PLAYLIST_ITEMS = 12;
/** Batch size for the infinite draft news stream: starts at 5, prepares 5 more on item 4. */
export const NEWS_BATCH_SIZE = 5;
/** Prepare the next batch once the cursor reaches this many items from the end (item 4 of 5). */
export const NEWS_PREFETCH_OFFSET = 2;

export function targetNewsCountForIndex(index: number): number {
  const safeIndex = Math.max(0, index);
  return (Math.floor((safeIndex + NEWS_PREFETCH_OFFSET) / NEWS_BATCH_SIZE) + 1) * NEWS_BATCH_SIZE;
}

export interface NewsStreamSlot {
  /** Unique slot identity in the infinite stream (safe when promotions or items repeat). */
  slotKey: string;
  /** Canonical source item id (for live lookups, dismissals, and once-per-visit counts). */
  itemId: string;
  kind: NewsItemKind;
  category?: string;
  subject?: string;
  batchIndex: number;
}

export interface NewsStreamState {
  slots: readonly NewsStreamSlot[];
  nextSeq: number;
  rngState: number;
  /** Which item kinds existed when the current stream was planned (triggers tail refresh on async load). */
  knownKinds: readonly NewsItemKind[];
}

export function createInitialNewsStream(seed: number): NewsStreamState {
  return {
    slots: [],
    nextSeq: 0,
    rngState: seed >>> 0 || 1,
    knownKinds: [],
  };
}

function nextRandom(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4_294_967_296, next];
}

/**
 * Order a bounded rotation (kept for direct playlist consumers/tests).
 * Urgent items lead; the rest alternate between sources so consecutive items differ.
 */
export function buildNewsPlaylist<T extends NewsPlaylistEntry>(
  sources: NewsPlaylistSources<T>,
  random: () => number,
): T[] {
  const urgent = sources.usage.filter((item) => item.urgent === true);
  // Draw one rank per source in a fixed order, including empty sources, so a
  // source appearing or emptying mid-visit does not reshuffle the others.
  const queues = [
    sources.insights,
    sources.changelog,
    sources.announcements ?? [],
    sources.discovery ?? [],
    sources.tips,
    sources.usage.filter((item) => item.urgent !== true),
  ]
    .map((items) => ({ items: [...items], rank: random() }))
    .filter(({ items }) => items.length > 0)
    .toSorted((a, b) => a.rank - b.rank)
    .map(({ items }) => items);
  const base: T[] = [...urgent];
  while (base.length < MAX_PLAYLIST_ITEMS && queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next && base.length < MAX_PLAYLIST_ITEMS) base.push(next);
    }
  }

  const promotions = shuffled(sources.promotions, random);
  if (base.length === 0) return promotions;

  const playlist: T[] = [];
  let sincePromotion = 0;
  base.forEach((item, index) => {
    playlist.push(item);
    sincePromotion += 1;
    if (promotions.length === 0) return;
    // The first promotion follows the opening item so it is seen early.
    if (index === 0 || sincePromotion >= PROMOTION_SPACING) {
      playlist.push(promotions.shift()!);
      sincePromotion = 0;
    }
  });
  return playlist;
}

function activeKindsOf<T extends NewsPlaylistEntry>(
  sources: NewsPlaylistSources<T>,
): NewsItemKind[] {
  const kinds: NewsItemKind[] = [];
  if (sources.insights.length > 0) kinds.push("insight");
  if (sources.changelog.length > 0) kinds.push("changelog");
  if ((sources.announcements?.length ?? 0) > 0) kinds.push("announcement");
  if ((sources.discovery?.length ?? 0) > 0) kinds.push("discovery");
  if (sources.usage.length > 0) kinds.push("usage");
  if (sources.tips.length > 0) kinds.push("tip");
  if (sources.promotions.length > 0) kinds.push("promotion");
  return kinds;
}

function collectNonPromos<T extends NewsPlaylistEntry>(sources: NewsPlaylistSources<T>): T[] {
  return [
    ...(sources.usage ?? []),
    ...sources.insights,
    ...(sources.announcements ?? []),
    ...(sources.discovery ?? []),
    ...sources.changelog,
    ...sources.tips,
  ];
}

function makeSlot(entry: NewsPlaylistEntry, seq: number, batchIndex: number): NewsStreamSlot {
  return {
    slotKey: `${entry.id}#${seq}`,
    itemId: entry.id,
    kind: entry.kind,
    ...(entry.category !== undefined ? { category: entry.category } : {}),
    ...(entry.subject !== undefined ? { subject: entry.subject } : {}),
    batchIndex,
  };
}

function pickPromotion<T extends NewsPlaylistEntry>(
  promotions: readonly T[],
  previousSlots: readonly NewsStreamSlot[],
  rng: () => number,
): T {
  const shownCounts = new Map<string, number>();
  const lastSeen = new Map<string, number>();
  previousSlots.forEach((slot, idx) => {
    if (slot.kind !== "promotion") return;
    shownCounts.set(slot.itemId, (shownCounts.get(slot.itemId) ?? 0) + 1);
    lastSeen.set(slot.itemId, idx);
  });
  const lastPromoId = previousSlots.findLast((slot) => slot.kind === "promotion")?.itemId;

  const ranked = promotions.map((promo) => ({
    promo,
    count: shownCounts.get(promo.id) ?? 0,
    last: lastSeen.get(promo.id) ?? -1,
    isLastPromo: promotions.length > 1 && promo.id === lastPromoId ? 1 : 0,
    tie: rng(),
  }));
  ranked.sort(
    (a, b) =>
      a.isLastPromo - b.isLastPromo || a.count - b.count || a.last - b.last || a.tie - b.tie,
  );
  return ranked[0]!.promo;
}

function pickNextNonPromo<T extends NewsPlaylistEntry>(
  candidates: readonly T[],
  previousSlots: readonly NewsStreamSlot[],
  batchSlots: readonly NewsStreamSlot[],
  rng: () => number,
): T {
  const allPrior = [...previousSlots, ...batchSlots];
  const shownCounts = new Map<string, number>();
  const lastSeen = new Map<string, number>();
  allPrior.forEach((slot, idx) => {
    shownCounts.set(slot.itemId, (shownCounts.get(slot.itemId) ?? 0) + 1);
    lastSeen.set(slot.itemId, idx);
  });

  const recentWindow = allPrior.slice(-NEWS_BATCH_SIZE * 2);
  const recentIds = new Set(recentWindow.map((s) => s.itemId));
  const lastSlot = allPrior.at(-1);
  const batchKindCounts = new Map<NewsItemKind, number>();
  const recentKindCounts = new Map<NewsItemKind, number>();
  const recentCategoryCounts = new Map<string, number>();
  const recentSubjectCounts = new Map<string, number>();

  for (const s of batchSlots) {
    batchKindCounts.set(s.kind, (batchKindCounts.get(s.kind) ?? 0) + 1);
    if (s.category)
      recentCategoryCounts.set(s.category, (recentCategoryCounts.get(s.category) ?? 0) + 2);
    if (s.subject)
      recentSubjectCounts.set(s.subject, (recentSubjectCounts.get(s.subject) ?? 0) + 2);
  }
  for (const s of previousSlots.slice(-NEWS_BATCH_SIZE)) {
    recentKindCounts.set(s.kind, (recentKindCounts.get(s.kind) ?? 0) + 1);
    if (s.category)
      recentCategoryCounts.set(s.category, (recentCategoryCounts.get(s.category) ?? 0) + 1);
    if (s.subject)
      recentSubjectCounts.set(s.subject, (recentSubjectCounts.get(s.subject) ?? 0) + 1);
  }

  // Urgent usage limits lead immediately on first appearance.
  const urgentUnshown = candidates.find(
    (item) => item.urgent === true && (shownCounts.get(item.id) ?? 0) === 0,
  );
  if (urgentUnshown && allPrior.length === 0) return urgentUnshown;

  // Strongly prefer items never shown yet in this visit; when the pool cycles,
  // prefer the least-shown and oldest-seen items.
  const scored = candidates.map((item) => {
    const shownCount = shownCounts.get(item.id) ?? 0;
    const lastIdx = lastSeen.get(item.id) ?? -1;
    const inBatch = batchSlots.some((s) => s.itemId === item.id) ? 1 : 0;
    const inRecent = recentIds.has(item.id) ? 1 : 0;

    let penalty = 0;
    if (lastSlot && lastSlot.kind === item.kind) penalty += 6;
    penalty += (batchKindCounts.get(item.kind) ?? 0) * 4.5;
    penalty += (recentKindCounts.get(item.kind) ?? 0) * 1.4;
    if (item.category) penalty += (recentCategoryCounts.get(item.category) ?? 0) * 2.4;
    if (item.subject) penalty += (recentSubjectCounts.get(item.subject) ?? 0) * 3.0;
    const weightBias = Math.min(2, Math.max(0.5, item.weight ?? 1)) * 0.6;
    const jitter = rng() * 3.2;

    return {
      item,
      inBatch,
      shownCount,
      inRecent,
      lastIdx,
      score: penalty - weightBias + jitter,
    };
  });

  scored.sort(
    (a, b) =>
      a.inBatch - b.inBatch ||
      a.shownCount - b.shownCount ||
      a.inRecent - b.inRecent ||
      a.score - b.score ||
      a.lastIdx - b.lastIdx,
  );

  return scored[0]!.item;
}

/**
 * Plan the next batch of up to `batchSize` (default 5) items for the infinite
 * stream. Analyzes `previousSlots` to avoid repeating recently shown facts,
 * kinds, categories, and subjects while repeating non-dismissed promotions so a
 * promotion always appears in every batch.
 */
export function planNextNewsBatch<T extends NewsPlaylistEntry>(
  sources: NewsPlaylistSources<T>,
  previousSlots: readonly NewsStreamSlot[],
  options: {
    batchSize?: number;
    batchIndex: number;
    nextSeq: number;
    rngState: number;
  },
): { batch: NewsStreamSlot[]; nextSeq: number; rngState: number } {
  const batchSize = options.batchSize ?? NEWS_BATCH_SIZE;
  let rngState = options.rngState >>> 0;
  const rng = () => {
    const [val, next] = nextRandom(rngState);
    rngState = next;
    return val;
  };

  const nonPromos = collectNonPromos(sources);
  const promos = sources.promotions;
  if (nonPromos.length === 0 && promos.length === 0) {
    return { batch: [], nextSeq: options.nextSeq, rngState };
  }

  let seq = options.nextSeq;
  const batch: NewsStreamSlot[] = [];

  // Only promotions exist: return them without duplicating a single lonely promo.
  if (nonPromos.length === 0) {
    const count = promos.length === 1 ? (previousSlots.length === 0 ? 1 : 0) : batchSize;
    for (let i = 0; i < count; i++) {
      const promo = pickPromotion(promos, [...previousSlots, ...batch], rng);
      batch.push(makeSlot(promo, seq++, options.batchIndex));
    }
    return { batch, nextSeq: seq, rngState };
  }

  // Decide where a promotion lands in this 5-item batch.
  let promoSlotOffset = -1;
  if (promos.length > 0) {
    if (previousSlots.length === 0) {
      // First batch always puts the first promotion in slot 1 (second slot).
      promoSlotOffset = batchSize > 1 ? 1 : 0;
    } else {
      const lastPromoGlobalIdx = previousSlots.findLastIndex((s) => s.kind === "promotion");
      const sincePromo =
        lastPromoGlobalIdx === -1
          ? PROMOTION_SPACING
          : previousSlots.length - 1 - lastPromoGlobalIdx;
      const minOffset = Math.max(0, PROMOTION_SPACING - 1 - sincePromo);
      if (minOffset < batchSize) {
        const maxOffset = Math.min(batchSize - 1, minOffset + 2);
        promoSlotOffset = minOffset + Math.floor(rng() * (maxOffset - minOffset + 1));
      }
    }
  }

  for (let offset = 0; offset < batchSize; offset++) {
    if (offset === promoSlotOffset && promos.length > 0) {
      const promo = pickPromotion(promos, [...previousSlots, ...batch], rng);
      batch.push(makeSlot(promo, seq++, options.batchIndex));
      continue;
    }
    const picked = pickNextNonPromo(nonPromos, previousSlots, batch, rng);
    batch.push(makeSlot(picked, seq++, options.batchIndex));
  }

  return { batch, nextSeq: seq, rngState };
}

/**
 * Synchronize the visit's stream with live source availability and current
 * scroll depth:
 * - Drops dismissed/expired slots whose `itemId` is no longer active.
 * - If a new source kind loaded asynchronously (e.g. profile stats arrived),
 *   preserves already-viewed slots `0..viewedThroughIndex` and refreshes the
 *   unviewed tail so new sources enter right away without jumping what is on screen.
 * - Appends 5-item batches whenever `slots.length < targetCount`.
 */
export interface NewsResolvedSlot<T extends NewsPlaylistEntry> {
  slotKey: string;
  item: T;
}

export function syncNewsStream<T extends NewsPlaylistEntry>(
  current: NewsStreamState,
  sources: NewsPlaylistSources<T>,
  options: {
    targetCount: number;
    viewedThroughIndex: number;
  },
): { stream: NewsStreamState; entries: NewsResolvedSlot<T>[]; items: T[] } {
  const allById = new Map<string, T>();
  for (const item of [...collectNonPromos(sources), ...sources.promotions]) {
    allById.set(item.id, item);
  }

  if (allById.size === 0) {
    const stream =
      current.slots.length === 0 && current.knownKinds.length === 0
        ? current
        : { ...current, slots: [], knownKinds: [] };
    return {
      stream,
      entries: [],
      items: [],
    };
  }

  const activeKinds = activeKindsOf(sources);
  const prevKnown = new Set(current.knownKinds);
  const hasNewSourceKind =
    current.slots.length > 0 && activeKinds.some((kind) => !prevKnown.has(kind));

  const filteredSlots = current.slots.filter((slot) => allById.has(slot.itemId));
  let slotsChanged = filteredSlots.length !== current.slots.length;
  let slots = filteredSlots;

  if (hasNewSourceKind) {
    const keepCount = Math.min(slots.length, Math.max(1, options.viewedThroughIndex + 1));
    if (keepCount < slots.length) {
      slots = slots.slice(0, keepCount);
      slotsChanged = true;
    }
  }

  let nextSeq = current.nextSeq;
  let rngState = current.rngState;
  const nonPromos = collectNonPromos(sources);
  const maxAllowed =
    nonPromos.length === 0 && sources.promotions.length === 1 ? 1 : options.targetCount;

  let guard = 0;
  while (slots.length < maxAllowed && guard < 16) {
    guard += 1;
    const batchIndex = Math.floor(slots.length / NEWS_BATCH_SIZE);
    const {
      batch,
      nextSeq: updatedSeq,
      rngState: updatedRng,
    } = planNextNewsBatch(sources, slots, {
      batchSize: Math.min(NEWS_BATCH_SIZE, maxAllowed - slots.length),
      batchIndex,
      nextSeq,
      rngState,
    });
    nextSeq = updatedSeq;
    rngState = updatedRng;
    if (batch.length === 0) break;
    slots = [...slots, ...batch];
    slotsChanged = true;
  }

  const kindsChanged =
    activeKinds.length !== current.knownKinds.length ||
    activeKinds.some((k, i) => k !== current.knownKinds[i]);

  const nextStream: NewsStreamState =
    slotsChanged || kindsChanged
      ? {
          slots,
          nextSeq,
          rngState,
          knownKinds: activeKinds,
        }
      : current;
  const entries = slots.flatMap((slot) => {
    const item = allById.get(slot.itemId);
    return item ? [{ slotKey: slot.slotKey, item }] : [];
  });
  return { stream: nextStream, entries, items: entries.map((entry) => entry.item) };
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
