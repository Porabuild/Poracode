import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  changelogDocumentSchema,
  compareVersions,
  hasUnseenChangelog,
  latestChangelogVersion,
  parseChangelogDocument,
  releasesSince,
} from "./changelog";

// The single source of truth lives in the website (served at /changelog.json).
const rawDocument = JSON.parse(readFileSync("website/public/changelog.json", "utf8")) as unknown;
const releases = parseChangelogDocument(rawDocument) ?? [];

describe("compareVersions", () => {
  it("orders by major, minor, then patch", () => {
    expect(compareVersions("1.3.0", "1.2.9")).toBe(1);
    expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
    expect(compareVersions("1.2.3", "1.2.4")).toBe(-1);
  });

  it("treats missing segments and a leading v as zero / ignorable", () => {
    expect(compareVersions("1.3", "1.3.0")).toBe(0);
    expect(compareVersions("v1.3.0", "1.3.0")).toBe(0);
  });

  it("ignores pre-release suffixes when comparing the core version", () => {
    expect(compareVersions("1.3.0-nightly.4", "1.3.0")).toBe(0);
  });
});

describe("parseChangelogDocument", () => {
  it("rejects malformed payloads", () => {
    expect(parseChangelogDocument(null)).toBeNull();
    expect(parseChangelogDocument({ releases: [{ version: 1 }] })).toBeNull();
    expect(parseChangelogDocument({})).toBeNull();
  });

  it("preserves release taglines while accepting older cached documents without them", () => {
    const legacy = { version: "1.0.0", date: "2026-01-01", title: "a", summary: "s", changes: [] };
    expect(parseChangelogDocument({ releases: [legacy] })).toEqual([legacy]);
    const release = { ...legacy, tagline: "First Stable" };
    expect(parseChangelogDocument({ releases: [release] })).toEqual([release]);
    for (const tagline of ["", "One", "Too Many Words", " First Stable", 42]) {
      expect(parseChangelogDocument({ releases: [{ ...legacy, tagline }] })).toBeNull();
    }
  });

  it("returns releases sorted newest-first regardless of input order", () => {
    const parsed = parseChangelogDocument({
      releases: [
        { version: "1.0.0", date: "2026-01-01", title: "a", summary: "s", changes: [] },
        { version: "1.2.0", date: "2026-03-01", title: "c", summary: "s", changes: [] },
        { version: "1.1.0", date: "2026-02-01", title: "b", summary: "s", changes: [] },
      ],
    });
    expect(parsed?.map((r) => r.version)).toEqual(["1.2.0", "1.1.0", "1.0.0"]);
  });
});

describe("releasesSince", () => {
  it("returns nothing for a fresh install (no last-seen version)", () => {
    expect(releasesSince(releases, null)).toEqual([]);
  });

  it("returns only releases strictly newer than the given version", () => {
    expect(releases.length).toBeGreaterThanOrEqual(2);
    // Everything newer than the second-newest release is exactly the newest one.
    const since = releasesSince(releases, releases[1]!.version);
    expect(since.map((r) => r.version)).toEqual([releases[0]!.version]);
  });

  it("returns an empty list when already on the newest version", () => {
    expect(releasesSince(releases, latestChangelogVersion(releases))).toEqual([]);
  });
});

describe("hasUnseenChangelog", () => {
  const newest = () => releases[0]!.version;
  const prior = () => releases[1]!.version;

  it("never fires on a not-yet-initialized profile", () => {
    expect(hasUnseenChangelog(releases, newest(), null, null)).toBe(false);
    expect(hasUnseenChangelog(releases, newest(), newest(), null)).toBe(false);
    expect(hasUnseenChangelog(releases, newest(), null, newest())).toBe(false);
  });

  it("fires when the current version moved past the acknowledged version", () => {
    expect(hasUnseenChangelog(releases, newest(), prior(), prior())).toBe(true);
  });

  it("fires on a version bump even when no changelog entry for it has landed yet", () => {
    // The binary updated ahead of its notes — the badge still appears.
    expect(hasUnseenChangelog(releases, "999.0.0", prior(), prior())).toBe(true);
  });

  it("does not fire when the user is caught up to the current version", () => {
    expect(hasUnseenChangelog(releases, newest(), newest(), newest())).toBe(false);
  });

  it("re-fires when notes land after the version was already acknowledged", () => {
    // Acknowledged at the current version, but `seen` lagged because the notes
    // for it had not been published yet; now that the entry is present (≤
    // current and newer than seen), the badge returns.
    expect(hasUnseenChangelog(releases, newest(), prior(), newest())).toBe(true);
  });

  it("ignores notes for versions newer than the running version", () => {
    // Running `prior` and caught up; the newer `newest` entry is a release
    // announced ahead of its build and must not light the badge.
    expect(hasUnseenChangelog(releases, prior(), prior(), prior())).toBe(false);
  });
});

describe("changelog.json data integrity", () => {
  it("matches the schema and is non-empty", () => {
    expect(changelogDocumentSchema.safeParse(rawDocument).success).toBe(true);
    expect(releases.length).toBeGreaterThan(0);
  });

  it("has unique versions and every required field", () => {
    const versions = new Set<string>();
    for (const release of releases) {
      expect(versions.has(release.version)).toBe(false);
      versions.add(release.version);
      expect(release.title.length).toBeGreaterThan(0);
      expect(release.tagline).toMatch(/^\S+ \S+$/u);
      expect(release.summary.length).toBeGreaterThan(0);
      expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(release.changes.length).toBeGreaterThan(0);
    }
  });
});
