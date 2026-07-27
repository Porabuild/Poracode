/**
 * Tests for the worktree "copy ignored files" step: pattern parsing,
 * gitignore-style matching against `git ls-files` output, and the actual
 * copy into a freshly created worktree. The copy test uses a real git repo
 * in a temp directory so git decides which entries are actually ignored.
 */

import { mkdtemp, mkdir, readFile, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseCopyPatterns } from "@/shared/worktree";
import { copyIgnoredFilesIntoWorktree, matchIgnoredCopyEntries } from "./copyIgnoredFiles";

const execFileAsync = promisify(execFile);

describe("parseCopyPatterns", () => {
  it("splits lines, trims, and drops blanks and comments", () => {
    expect(parseCopyPatterns("  .env  \n\n# comment\n.env.*\r\n")).toEqual([".env", ".env.*"]);
  });

  it("returns empty array for empty input", () => {
    expect(parseCopyPatterns("")).toEqual([]);
    expect(parseCopyPatterns("\n# only a comment\n")).toEqual([]);
  });
});

describe("matchIgnoredCopyEntries", () => {
  it("matches files with gitignore-style wildcards", () => {
    expect(matchIgnoredCopyEntries([".env.local", "node_modules/"], [".env.*"])).toEqual([
      ".env.local",
    ]);
  });

  it("matches nested files for patterns without a slash", () => {
    expect(matchIgnoredCopyEntries(["packages/app/.env", "dist/"], [".env"])).toEqual([
      "packages/app/.env",
    ]);
  });

  it("matches collapsed directory entries", () => {
    expect(matchIgnoredCopyEntries(["secrets/", ".env"], ["secrets"])).toEqual(["secrets/"]);
  });

  it("matches collapsed directory entries with trailing-slash patterns", () => {
    expect(matchIgnoredCopyEntries(["secrets/", ".env"], ["secrets/"])).toEqual(["secrets/"]);
  });

  it("returns nothing when patterns are empty", () => {
    expect(matchIgnoredCopyEntries([".env"], [])).toEqual([]);
  });
});

describe("copyIgnoredFilesIntoWorktree", () => {
  let repoDir: string;
  let worktreeDir: string;

  beforeEach(async () => {
    repoDir = await mkdtemp(join(tmpdir(), "poracode-copy-src-"));
    worktreeDir = await mkdtemp(join(tmpdir(), "poracode-copy-dest-"));

    await execFileAsync("git", ["init"], { cwd: repoDir });
    await writeFile(join(repoDir, ".gitignore"), ".env*\nsecrets/\nnode_modules/\n");
    await writeFile(join(repoDir, ".env"), "ROOT=1\n");
    await writeFile(join(repoDir, ".env.local"), "LOCAL=1\n");
    await mkdir(join(repoDir, "packages", "app"), { recursive: true });
    await writeFile(join(repoDir, "packages", "app", ".env"), "NESTED=1\n");
    await mkdir(join(repoDir, "secrets"), { recursive: true });
    await writeFile(join(repoDir, "secrets", "key.pem"), "KEY\n");
    await mkdir(join(repoDir, "node_modules", "example"), { recursive: true });
    await writeFile(join(repoDir, "node_modules", "example", "index.js"), "module.exports = 1;\n");
    await writeFile(join(repoDir, "tracked.ts"), "export {};\n");
  });

  afterEach(async () => {
    await rm(repoDir, { recursive: true, force: true });
    await rm(worktreeDir, { recursive: true, force: true });
  });

  function location() {
    return { kind: "posix" as const, path: repoDir };
  }

  it("copies matching ignored files preserving relative paths", async () => {
    await copyIgnoredFilesIntoWorktree(location(), worktreeDir, [".env", ".env.*"]);

    expect(await readFile(join(worktreeDir, ".env"), "utf8")).toBe("ROOT=1\n");
    expect(await readFile(join(worktreeDir, ".env.local"), "utf8")).toBe("LOCAL=1\n");
    expect(await readFile(join(worktreeDir, "packages", "app", ".env"), "utf8")).toBe("NESTED=1\n");
    await expect(stat(join(worktreeDir, "secrets"))).rejects.toThrow(/ENOENT/);
    await expect(stat(join(worktreeDir, "tracked.ts"))).rejects.toThrow(/ENOENT/);
  });

  it("copies matched directories recursively", async () => {
    await copyIgnoredFilesIntoWorktree(location(), worktreeDir, ["secrets"]);

    expect(await readFile(join(worktreeDir, "secrets", "key.pem"), "utf8")).toBe("KEY\n");
    await expect(stat(join(worktreeDir, ".env"))).rejects.toThrow(/ENOENT/);
  });

  it("never overwrites files that already exist in the worktree", async () => {
    await writeFile(join(worktreeDir, ".env"), "EXISTING=1\n");

    await copyIgnoredFilesIntoWorktree(location(), worktreeDir, [".env", ".env.*"]);

    expect(await readFile(join(worktreeDir, ".env"), "utf8")).toBe("EXISTING=1\n");
    expect(await readFile(join(worktreeDir, ".env.local"), "utf8")).toBe("LOCAL=1\n");
  });

  it("is a no-op when patterns are empty", async () => {
    await copyIgnoredFilesIntoWorktree(location(), worktreeDir, []);

    await expect(stat(join(worktreeDir, ".env"))).rejects.toThrow(/ENOENT/);
  });

  it("never copies dependency installations", async () => {
    await copyIgnoredFilesIntoWorktree(location(), worktreeDir, ["node_modules"]);

    await expect(stat(join(worktreeDir, "node_modules"))).rejects.toThrow(/ENOENT/);
  });
});
