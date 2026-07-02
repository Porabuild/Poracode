import changelogJson from "../../public/changelog.json";

/**
 * Changelog for the marketing site. The single source of truth is
 * `public/changelog.json` (also served at /changelog.json for the desktop app
 * to fetch). This module imports it at build time, validates the shape, and
 * sorts newest-first. Edit `public/changelog.json` to change the notes — Vercel
 * redeploys the site and the desktop app picks up the new file on its own.
 */

export type ChangelogChangeKind = "added" | "improved" | "fixed";

export interface ChangelogChange {
  kind: ChangelogChangeKind;
  text: string;
}

export interface ChangelogRelease {
  version: string;
  date: string;
  title: string;
  summary: string;
  changes: ChangelogChange[];
}

const VALID_KINDS: ReadonlySet<string> = new Set(["added", "improved", "fixed"]);

function isChange(value: unknown): value is ChangelogChange {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  return VALID_KINDS.has(c.kind as string) && typeof c.text === "string";
}

function isRelease(value: unknown): value is ChangelogRelease {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.version === "string" &&
    typeof r.date === "string" &&
    typeof r.title === "string" &&
    typeof r.summary === "string" &&
    Array.isArray(r.changes) &&
    r.changes.every(isChange)
  );
}

function compareVersions(a: string, b: string): number {
  const seg = (v: string) =>
    (v.replace(/^v/i, "").split(/[-+]/)[0] ?? "")
      .split(".")
      .map((n) => Number.parseInt(n, 10) || 0);
  const av = seg(a);
  const bv = seg(b);
  const len = Math.max(av.length, bv.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (av[i] ?? 0) - (bv[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

const rawReleases = Array.isArray((changelogJson as { releases?: unknown }).releases)
  ? (changelogJson as { releases: unknown[] }).releases
  : [];

export const CHANGELOG: readonly ChangelogRelease[] = rawReleases
  .filter(isRelease)
  .sort((a, b) => compareVersions(b.version, a.version));

const RELEASE_DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

/** Format an ISO date (YYYY-MM-DD) as a long, human-readable date. */
export function formatReleaseDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return RELEASE_DATE_FORMAT.format(date);
}
