import { z } from "zod";

/**
 * Changelog types, validation, and version helpers.
 *
 * The actual release data is NOT bundled here. It lives in a single source of
 * truth — `website/public/changelog.json` on master — served by the marketing
 * site and fetched at runtime:
 *
 *   https://poracode.com/changelog.json
 *
 * so the notes can be edited, reworded, or extended by committing to master
 * (Vercel redeploys the site) without shipping a new app build. The desktop app
 * fetches + caches it (see `src/renderer/state/changelogStore.ts`); the site's
 * own /changelog page imports the same file at build time. This module only
 * carries the shape + the pure helpers.
 */

export const CHANGELOG_URL = "https://poracode.com/changelog.json";

export type ChangelogChangeKind = "added" | "improved" | "fixed";

export const changelogChangeSchema = z.object({
  /** Bucket the change renders under: a new capability, a refinement, or a fix. */
  kind: z.enum(["added", "improved", "fixed"]),
  /** Optional short feature name rendered as a bold prefix, e.g. "Crossagents". */
  label: z.string().optional(),
  /** One complete, user-facing sentence describing the change. */
  text: z.string(),
});

export const changelogReleaseSchema = z.object({
  /** Semver string, e.g. "1.3.1" — no leading "v". */
  version: z.string(),
  /** ISO date (YYYY-MM-DD) the release shipped. */
  date: z.string(),
  /** Short human headline (no version number). */
  title: z.string(),
  /** Two-word release name; optional for cached documents from older releases. */
  tagline: z
    .string()
    .regex(/^\S+ \S+$/u)
    .optional(),
  /** One or two sentences describing the release overall, shown under the title. */
  summary: z.string(),
  /** Grouped, detailed changes. */
  changes: z.array(changelogChangeSchema),
});

export const changelogDocumentSchema = z.object({
  releases: z.array(changelogReleaseSchema),
});

export type ChangelogChange = z.infer<typeof changelogChangeSchema>;
export type ChangelogRelease = z.infer<typeof changelogReleaseSchema>;
export type ChangelogDocument = z.infer<typeof changelogDocumentSchema>;

/**
 * Validate an untrusted changelog document (remote fetch or cache) and return
 * its releases sorted newest-first, or `null` when the payload is malformed.
 */
export function parseChangelogDocument(raw: unknown): ChangelogRelease[] | null {
  const result = changelogDocumentSchema.safeParse(raw);
  if (!result.success) return null;
  return [...result.data.releases].sort((a, b) => compareVersions(b.version, a.version));
}

/** Parse a "1.2.3" string into numeric segments, ignoring any pre-release suffix. */
function parseVersion(version: string): number[] {
  const core = version.trim().replace(/^v/i, "").split(/[-+]/, 1)[0] ?? "";
  return core.split(".").map((part) => {
    const n = Number.parseInt(part, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

/**
 * Compare two semver-ish strings. Returns -1 when `a` < `b`, 1 when `a` > `b`,
 * and 0 when they are equal. Missing segments are treated as 0, so "1.3" and
 * "1.3.0" compare equal.
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const av = parseVersion(a);
  const bv = parseVersion(b);
  const len = Math.max(av.length, bv.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (av[i] ?? 0) - (bv[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

/** The version string of the most recent release, or null when the list is empty. */
export function latestChangelogVersion(releases: readonly ChangelogRelease[]): string | null {
  return releases[0]?.version ?? null;
}

/**
 * Releases strictly newer than `version`, newest first. Pass the user's
 * last-seen version to get everything they haven't read yet. When `version` is
 * null (a fresh install with nothing seen) this returns an empty list, so the
 * post-update dialog never fires on first launch.
 */
export function releasesSince(
  releases: readonly ChangelogRelease[],
  version: string | null,
): ChangelogRelease[] {
  if (!version) return [];
  return releases.filter((release) => compareVersions(release.version, version) > 0);
}

/**
 * Whether to flag an unread changelog on the sidebar.
 *
 * Decoupled from the changelog *content* on purpose, so the badge is correct no
 * matter when the notes for a release land on the marketing site relative to the
 * binary reaching users (the two ship through independent pipelines):
 *
 *  - **Version bump** — `current` moved past the version the user last
 *    acknowledged. The badge lights up the moment they update, even before the
 *    notes for `current` have been published. This is the common case.
 *  - **Late content** — the user already acknowledged `current`, but a release
 *    note at or below `current` is newer than anything they have actually seen
 *    (its publish lagged the binary). The badge returns so they do not miss it.
 *
 * Notes for versions newer than `current` (a release announced before its build
 * ships) are intentionally ignored, so pushing the changelog early is harmless.
 *
 * `lastSeen` tracks the newest content seen; `acknowledged` tracks the version
 * the user last dismissed at. Both are null only on a not-yet-initialized
 * profile, where there is nothing to announce.
 */
export function hasUnseenChangelog(
  releases: readonly ChangelogRelease[],
  current: string,
  lastSeen: string | null,
  acknowledged: string | null,
): boolean {
  if (lastSeen === null || acknowledged === null) return false;
  if (compareVersions(current, acknowledged) > 0) return true;
  return releases.some(
    (release) =>
      compareVersions(release.version, lastSeen) > 0 &&
      compareVersions(release.version, current) <= 0,
  );
}
