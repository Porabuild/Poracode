import {
  compareVersions,
  type ChangelogChange,
  type ChangelogChangeKind,
  type ChangelogRelease,
} from "@/shared/changelog";

/** One changelog point the news line can feature. */
export interface ChangelogHighlight {
  /** Stable across reorders: release version plus a hash of the change text. */
  id: string;
  version: string;
  change: ChangelogChange;
  /** 1-based position of this change within its release. */
  position: number;
  /** Number of changes in the release. */
  total: number;
}

/** Per-device rotation memory: how often each highlight was shown, and which are done. */
export interface HighlightHistory {
  shown: Record<string, number>;
  retired: string[];
}

/** Releases (at or below the running version) whose points rotate. */
export const HIGHLIGHT_RELEASE_WINDOW = 3;
/** A highlight retires after this many showings, or as soon as it is opened. */
export const HIGHLIGHT_MAX_SHOWINGS = 2;

const KIND_WEIGHT: Record<ChangelogChangeKind, number> = { added: 3, improved: 2, fixed: 1 };

/** FNV-1a, enough to key a sentence without storing it. */
function hashText(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function highlightId(version: string, change: ChangelogChange): string {
  return `${version}:${hashText(`${change.label ?? ""}\u0000${change.text}`)}`;
}

/** Every point from the newest releases the user can be running, newest first. */
export function changelogHighlightPool(
  releases: readonly ChangelogRelease[],
  currentVersion: string,
): ChangelogHighlight[] {
  const eligible = releases
    .filter((release) => compareVersions(release.version, currentVersion) <= 0)
    .toSorted((a, b) => compareVersions(b.version, a.version))
    .slice(0, HIGHLIGHT_RELEASE_WINDOW);
  return eligible.flatMap((release) =>
    release.changes.map((change, index) => ({
      id: highlightId(release.version, change),
      version: release.version,
      change,
      position: index + 1,
      total: release.changes.length,
    })),
  );
}

/**
 * Pick up to `count` different highlights: least-shown first, then the newest
 * release, then new features before improvements before fixes. `random`
 * breaks remaining ties so equal candidates rotate between visits. Retired
 * highlights, and ones already shown the maximum number of times, are skipped.
 */
export function pickChangelogHighlights(
  pool: readonly ChangelogHighlight[],
  history: HighlightHistory,
  count: number,
  random: () => number = Math.random,
): ChangelogHighlight[] {
  const retired = new Set(history.retired);
  const versionRank = new Map<string, number>();
  for (const highlight of pool) {
    if (!versionRank.has(highlight.version)) versionRank.set(highlight.version, versionRank.size);
  }
  return pool
    .filter(
      (highlight) =>
        !retired.has(highlight.id) && (history.shown[highlight.id] ?? 0) < HIGHLIGHT_MAX_SHOWINGS,
    )
    .map((highlight) => ({ highlight, tie: random() }))
    .toSorted(
      (a, b) =>
        (history.shown[a.highlight.id] ?? 0) - (history.shown[b.highlight.id] ?? 0) ||
        (versionRank.get(a.highlight.version) ?? 0) - (versionRank.get(b.highlight.version) ?? 0) ||
        KIND_WEIGHT[b.highlight.change.kind] - KIND_WEIGHT[a.highlight.change.kind] ||
        a.tie - b.tie,
    )
    .slice(0, Math.max(0, count))
    .map(({ highlight }) => highlight);
}

/** Record one showing. Ids no longer in the pool are pruned so storage stays bounded. */
export function recordHighlightShown(
  history: HighlightHistory,
  id: string,
  poolIds: ReadonlySet<string>,
): HighlightHistory {
  const shown: Record<string, number> = {};
  for (const [key, value] of Object.entries(history.shown)) {
    if (poolIds.has(key)) shown[key] = value;
  }
  shown[id] = (shown[id] ?? 0) + 1;
  return { shown, retired: history.retired.filter((key) => poolIds.has(key)) };
}

export function retireHighlight(history: HighlightHistory, id: string): HighlightHistory {
  if (history.retired.includes(id)) return history;
  return { ...history, retired: [...history.retired, id] };
}

/** Parse stored history defensively; anything malformed starts fresh. */
export function parseHighlightHistory(raw: string | null): HighlightHistory {
  if (!raw) return { shown: {}, retired: [] };
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return { shown: {}, retired: [] };
    const record = value as { shown?: unknown; retired?: unknown };
    const shown: Record<string, number> = {};
    if (typeof record.shown === "object" && record.shown !== null) {
      for (const [key, count] of Object.entries(record.shown)) {
        if (typeof count === "number" && Number.isFinite(count) && count > 0) shown[key] = count;
      }
    }
    const retired = Array.isArray(record.retired)
      ? record.retired.filter((key): key is string => typeof key === "string")
      : [];
    return { shown, retired };
  } catch {
    return { shown: {}, retired: [] };
  }
}

/** The short line to show: the authored headline, else the full sentence. */
export function highlightHeadline(change: ChangelogChange): string {
  return change.headline?.trim() || change.text;
}
