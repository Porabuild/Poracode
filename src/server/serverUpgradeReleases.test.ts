import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  canonicalPath,
  isCurrentRelease,
  isDirectReleaseDirectory,
  previousReleasePath,
  readCurrentTarget,
} from "./serverUpgradeReleases";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makePrefix(): { prefix: string; alias: string } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "poracode-releases-")));
  tempDirs.push(root);
  const prefix = join(root, "real");
  mkdirSync(join(prefix, "releases", "r1"), { recursive: true });
  mkdirSync(join(prefix, "releases", "r2"), { recursive: true });
  // A second spelling of the same directory (macOS /tmp, Windows 8.3 names).
  const alias = join(root, "alias");
  symlinkSync(prefix, alias, "dir");
  return { prefix, alias };
}

describe("release path identity", () => {
  it("treats an absolute recorded target as absolute and a relative one as prefix-relative", () => {
    expect(previousReleasePath("/p", "/elsewhere/releases/r1")).toBe("/elsewhere/releases/r1");
    expect(previousReleasePath("/p", "releases/r1")).toBe(join("/p", "releases/r1"));
  });

  it("canonicalizes symlinked spellings and not-yet-existing tails", () => {
    const { prefix, alias } = makePrefix();
    expect(canonicalPath(join(alias, "releases", "r1"))).toBe(join(prefix, "releases", "r1"));
    expect(canonicalPath(join(alias, "releases", "future"))).toBe(
      join(prefix, "releases", "future"),
    );
  });

  it("recognizes the current release through a relative link and an aliased spelling", () => {
    const { prefix, alias } = makePrefix();
    symlinkSync(join("releases", "r1"), join(prefix, "current"), "dir");
    expect(readCurrentTarget(prefix)).toBe(join("releases", "r1"));
    expect(isCurrentRelease(prefix, join(prefix, "releases", "r1"))).toBe(true);
    expect(isCurrentRelease(prefix, join(alias, "releases", "r1"))).toBe(true);
    expect(isCurrentRelease(alias, join(prefix, "releases", "r1"))).toBe(true);
    expect(isCurrentRelease(prefix, join(prefix, "releases", "r2"))).toBe(false);
  });

  it("recognizes the current release when the link target is absolute (Windows junction shape)", () => {
    const { prefix, alias } = makePrefix();
    symlinkSync(join(alias, "releases", "r2"), join(prefix, "current"), "dir");
    expect(isCurrentRelease(prefix, join(prefix, "releases", "r2"))).toBe(true);
    expect(isCurrentRelease(prefix, join(prefix, "releases", "r1"))).toBe(false);
  });

  it("reports no current release when the link is absent", () => {
    const { prefix } = makePrefix();
    expect(isCurrentRelease(prefix, join(prefix, "releases", "r1"))).toBe(false);
  });

  it("compares direct release directories by canonical path", () => {
    const { prefix, alias } = makePrefix();
    expect(isDirectReleaseDirectory(prefix, join(alias, "releases", "r1"))).toBe(true);
    expect(isDirectReleaseDirectory(alias, join(prefix, "releases", "r1"))).toBe(true);
    expect(isDirectReleaseDirectory(prefix, join(prefix, "releases", "r1", "nested"))).toBe(false);
    expect(isDirectReleaseDirectory(prefix, join(prefix, "other", "r1"))).toBe(false);
  });
});
