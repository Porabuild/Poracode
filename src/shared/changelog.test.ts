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
  it("never fires on a fresh install", () => {
    expect(hasUnseenChangelog(releases, releases[0]!.version, null)).toBe(false);
  });

  it("fires when the current version moved past the last-seen version", () => {
    expect(hasUnseenChangelog(releases, releases[0]!.version, releases[1]!.version)).toBe(true);
  });

  it("does not fire when the user has already seen the current version", () => {
    const latest = releases[0]!.version;
    expect(hasUnseenChangelog(releases, latest, latest)).toBe(false);
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
      expect(release.summary.length).toBeGreaterThan(0);
      expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(release.changes.length).toBeGreaterThan(0);
    }
  });
});
