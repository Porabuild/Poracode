import { compareVersions, type ChangelogChange, type ChangelogRelease } from "@/shared/changelog";
import { isDiscoverableFeatureId, type DiscoverableFeatureId } from "@/shared/featureDiscovery";
import type { DiscoverableFeature, FeatureContext } from "./featureCatalog";
import type { DiscoveryHistory } from "@/renderer/state/newsLineStore";
import { shuffled } from "./newsPlaylist";

/** A feature stops being suggested after this many showings. */
export const DISCOVERY_MAX_SHOWINGS = 3;
/** The same suggestion waits this long before it can come back. */
export const DISCOVERY_COOLDOWN_MS = 7 * 24 * 60 * 60_000;
/** A feature named by a release note is promoted as new for this long. */
const NEW_FEATURE_WINDOW_MS = 30 * 24 * 60 * 60_000;

export interface NewFeatureNote {
  version: string;
  change: ChangelogChange;
}

/**
 * Features introduced by recent releases the user can run: changes that carry
 * a known `feature` id, from releases at or below the running version dated
 * within {@link NEW_FEATURE_WINDOW_MS}. The newest release wins per feature.
 */
export function newFeaturesFromChangelog(
  releases: readonly ChangelogRelease[],
  currentVersion: string,
  now: number,
): Map<DiscoverableFeatureId, NewFeatureNote> {
  const notes = new Map<DiscoverableFeatureId, NewFeatureNote>();
  const eligible = releases
    .filter((release) => compareVersions(release.version, currentVersion) <= 0)
    .filter((release) => {
      const date = Date.parse(release.date);
      return Number.isFinite(date) && now - date <= NEW_FEATURE_WINDOW_MS && date <= now;
    })
    .toSorted((a, b) => compareVersions(b.version, a.version));
  for (const release of eligible) {
    for (const change of release.changes) {
      if (!change.feature || !isDiscoverableFeatureId(change.feature)) continue;
      if (!notes.has(change.feature))
        notes.set(change.feature, { version: release.version, change });
    }
  }
  return notes;
}

export interface DiscoveryPick {
  feature: DiscoverableFeature;
  /** Set when a recent release introduced the feature. */
  newIn?: NewFeatureNote;
}

/**
 * Choose up to `count` features to suggest: relevant, not used yet, not
 * hidden, under the showing cap and out of cooldown. Newly released features
 * come first; the rest rotate in random order between visits.
 */
export function pickDiscoveries(
  catalog: readonly DiscoverableFeature[],
  context: FeatureContext,
  options: {
    history: DiscoveryHistory;
    hidden: ReadonlySet<string>;
    newFeatures: ReadonlyMap<DiscoverableFeatureId, NewFeatureNote>;
    now: number;
    count: number;
    random: () => number;
  },
): DiscoveryPick[] {
  const { history, hidden, newFeatures, now, count, random } = options;
  const eligible = catalog.filter((feature) => {
    if (hidden.has(`discover:${feature.id}`)) return false;
    if (feature.isRelevant && !feature.isRelevant(context)) return false;
    if (feature.isUsed(context)) return false;
    const shown = history[feature.id];
    if (shown && shown.count >= DISCOVERY_MAX_SHOWINGS) return false;
    if (shown && now - shown.lastShownAt < DISCOVERY_COOLDOWN_MS) return false;
    return true;
  });
  const fresh = eligible.filter((feature) => newFeatures.has(feature.id));
  const rest = shuffled(
    eligible.filter((feature) => !newFeatures.has(feature.id)),
    random,
  );
  return [...fresh, ...rest].slice(0, Math.max(0, count)).map((feature) => {
    const newIn = newFeatures.get(feature.id);
    return newIn ? { feature, newIn } : { feature };
  });
}
