import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  threadTransferExportGitResultSchema,
  threadTransferGitHavesResultSchema,
  threadTransferImportGitResultSchema,
  threadTransferInspectGitResultSchema,
  threadTransferRepoProbeResultSchema,
  type ProjectLocation,
} from "@/shared/contracts";
import { msg } from "@/shared/messages";
import {
  countPorcelainEntries,
  exportThreadTransferGit,
  importThreadTransferGit,
  inspectThreadTransferGit,
  probeThreadTransferRepositories,
  threadTransferGitHaves,
} from "./threadTransferGit";

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(
      () => undefined,
    );
  }
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Poracode Test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "Poracode Test",
      GIT_COMMITTER_EMAIL: "test@example.com",
    },
  }).trim();
}

function at(path: string): ProjectLocation {
  return { kind: "posix", path };
}

/** An origin with history, cloned into a source and a target that share it. */
function makeClones() {
  const origin = tempDir("poracode-transfer-origin-");
  git(origin, "init", "-b", "main");
  git(origin, "config", "core.autocrlf", "false");
  writeFileSync(join(origin, "readme.md"), "hello\n");
  writeFileSync(join(origin, "remove-me.txt"), "bye\n");
  writeFileSync(join(origin, ".gitignore"), ".env\n");
  git(origin, "add", "-A");
  git(origin, "commit", "-m", "initial");
  const source = join(tempDir("poracode-transfer-source-"), "repo");
  const target = join(tempDir("poracode-transfer-target-"), "repo");
  git(tmpdir(), "clone", "--quiet", origin, source);
  git(tmpdir(), "clone", "--quiet", origin, target);
  for (const repo of [source, target]) {
    git(repo, "config", "user.email", "test@example.com");
    git(repo, "config", "user.name", "Poracode Test");
    git(repo, "config", "core.autocrlf", "false");
  }
  return { origin, source, target };
}

/** A feature branch with one local commit and every kind of uncommitted change. */
function dirtyFeature(source: string): void {
  git(source, "checkout", "-q", "-b", "feature");
  writeFileSync(join(source, "feature.ts"), "export const x = 1;\n");
  git(source, "add", "feature.ts");
  git(source, "commit", "-q", "-m", "feature work");
  writeFileSync(join(source, "readme.md"), "hello\nunstaged edit\n");
  writeFileSync(join(source, "staged.ts"), "staged\n");
  git(source, "add", "staged.ts");
  writeFileSync(join(source, "untracked.ts"), "untracked\n");
  git(source, "rm", "-q", "--cached", "remove-me.txt");
  writeFileSync(join(source, ".env"), "SECRET=1\n");
}

describe("thread transfer git", () => {
  it("moves commits and every uncommitted change into a new worktree, without touching the source", async () => {
    const { source, target } = makeClones();
    dirtyFeature(source);
    const statusBefore = git(source, "status", "--porcelain");
    const bundleDir = tempDir("poracode-transfer-bundle-");
    const bundlePath = join(bundleDir, "repo.bundle");

    const haves = await threadTransferGitHaves(at(target));
    expect(haves.repository).toBe(true);
    const exported = await exportThreadTransferGit({
      projectLocation: at(source),
      transferId: "transfer-0001",
      haves: haves.haves,
      bundlePath,
    });

    expect(exported.branch).toBe("feature");
    expect(exported.head).toBe(git(source, "rev-parse", "HEAD"));
    expect(exported.worktreeCommit).toBeDefined();
    expect(exported.indexCommit).toBeDefined();
    expect(exported.basis.length).toBeGreaterThan(0);
    expect(exported.bundleBytes).toBeGreaterThan(0);
    // The checkout, its index and its refs are exactly as they were.
    expect(git(source, "status", "--porcelain")).toBe(statusBefore);
    expect(git(source, "for-each-ref", "refs/poracode/transfers")).toBe("");

    const worktreeRoot = tempDir("poracode-transfer-worktrees-");
    const { bundleBytes: _bundleBytes, ...state } = exported;
    const imported = await importThreadTransferGit({
      projectLocation: at(target),
      transferId: "transfer-0001",
      bundlePath,
      git: state,
      worktreeRoot,
      worktreeOmitRepoDir: true,
    });

    expect(imported).toMatchObject({
      branch: "feature",
      branchRenamed: false,
      branchCreated: true,
    });
    // The supervisor IPC boundary validates results against the procedure schemas.
    expect(() => threadTransferGitHavesResultSchema.parse(haves)).not.toThrow();
    expect(() => threadTransferExportGitResultSchema.parse(exported)).not.toThrow();
    expect(() => threadTransferImportGitResultSchema.parse(imported)).not.toThrow();
    const worktree = imported.worktreePath;
    expect(git(worktree, "rev-parse", "HEAD")).toBe(exported.head);
    expect(readFileSync(join(worktree, "readme.md"), "utf8")).toBe("hello\nunstaged edit\n");
    expect(readFileSync(join(worktree, "untracked.ts"), "utf8")).toBe("untracked\n");
    expect(existsSync(join(worktree, ".env"))).toBe(false);
    expect(git(worktree, "diff", "--cached", "--name-only").split("\n").sort()).toEqual([
      "remove-me.txt",
      "staged.ts",
    ]);
    expect(git(worktree, "diff", "--name-only")).toBe("readme.md");
    // `git rm --cached` kept the file on disk, so it is untracked on both sides.
    expect(git(worktree, "ls-files", "--others", "--exclude-standard").split("\n").sort()).toEqual(
      git(source, "ls-files", "--others", "--exclude-standard").split("\n").sort(),
    );
    expect(git(worktree, "status", "--porcelain")).toBe(statusBefore);
    expect(git(target, "for-each-ref", "refs/poracode/transfers")).toBe("");
    // The target's own checkout is untouched.
    expect(git(target, "status", "--porcelain")).toBe("");
    expect(git(target, "rev-parse", "--abbrev-ref", "HEAD")).toBe("main");
  });

  it("lands on a new branch name when the incoming one is taken", async () => {
    const { source, target } = makeClones();
    dirtyFeature(source);
    git(target, "branch", "feature");
    const bundlePath = join(tempDir("poracode-transfer-bundle-"), "repo.bundle");
    const { bundleBytes: _bytes, ...state } = await exportThreadTransferGit({
      projectLocation: at(source),
      transferId: "transfer-0002",
      haves: (await threadTransferGitHaves(at(target))).haves,
      bundlePath,
    });
    const imported = await importThreadTransferGit({
      projectLocation: at(target),
      transferId: "transfer-0002",
      bundlePath,
      git: state,
      worktreeRoot: tempDir("poracode-transfer-worktrees-"),
    });
    expect(imported).toMatchObject({ branch: "feature-moved", branchRenamed: true });
    // The renamed branch records its origin so merge-to-source targets it.
    expect(git(target, "config", "--get", "branch.feature-moved.poracodeSource")).toBe("feature");
    expect(git(target, "rev-parse", "feature")).toBe(git(target, "rev-parse", "main"));
  });

  it("ignores a source branch name that is not a valid branch", async () => {
    const { source, target } = makeClones();
    dirtyFeature(source);
    const bundlePath = join(tempDir("poracode-transfer-bundle-"), "repo.bundle");
    const { bundleBytes: _bytes, ...state } = await exportThreadTransferGit({
      projectLocation: at(source),
      transferId: "transfer-source-branch",
      haves: (await threadTransferGitHaves(at(target))).haves,
      bundlePath,
    });
    // A crafted package can carry any string; it is optional lineage only.
    const imported = await importThreadTransferGit({
      projectLocation: at(target),
      transferId: "transfer-source-branch",
      bundlePath,
      git: { ...state, sourceBranch: "--all" },
      worktreeRoot: tempDir("poracode-transfer-worktrees-"),
    });
    expect(imported).toMatchObject({ branch: "feature", branchCreated: true });
    let recorded: string | undefined;
    try {
      recorded = git(target, "config", "--get", "branch.feature.poracodeSource");
    } catch {
      // The key is unset.
    }
    expect(recorded).toBeUndefined();
  });

  it("writes no bundle when the target already has everything and the tree is clean", async () => {
    const { source, target } = makeClones();
    const bundlePath = join(tempDir("poracode-transfer-bundle-"), "repo.bundle");
    const exported = await exportThreadTransferGit({
      projectLocation: at(source),
      transferId: "transfer-0003",
      haves: (await threadTransferGitHaves(at(target))).haves,
      bundlePath,
    });
    expect(exported.bundleBytes).toBe(0);
    expect(exported.worktreeCommit).toBeUndefined();
    expect(existsSync(bundlePath)).toBe(false);
    const { bundleBytes: _bytes, ...state } = exported;
    const imported = await importThreadTransferGit({
      projectLocation: at(target),
      transferId: "transfer-0003",
      git: state,
      worktreeRoot: tempDir("poracode-transfer-worktrees-"),
    });
    // `main` is checked out in the target's own checkout, so a new name is used.
    expect(imported).toMatchObject({ branch: "main-moved", branchRenamed: true });
  });

  it("refuses an unrelated repository and leaves no worktree behind", async () => {
    const { source } = makeClones();
    dirtyFeature(source);
    const unrelated = tempDir("poracode-transfer-unrelated-");
    git(unrelated, "init", "-b", "main");
    writeFileSync(join(unrelated, "other.txt"), "other\n");
    git(unrelated, "add", "-A");
    git(unrelated, "-c", "user.email=t@e.com", "-c", "user.name=T", "commit", "-q", "-m", "x");
    const bundlePath = join(tempDir("poracode-transfer-bundle-"), "repo.bundle");
    const { bundleBytes: _bytes, ...state } = await exportThreadTransferGit({
      projectLocation: at(source),
      transferId: "transfer-0004",
      haves: (await threadTransferGitHaves(at(unrelated))).haves,
      bundlePath,
    });
    expect(state.basis).toEqual([]);
    // A full-history bundle still applies; history that is genuinely absent does not.
    const worktreeRoot = tempDir("poracode-transfer-worktrees-");
    await expect(
      importThreadTransferGit({
        projectLocation: at(unrelated),
        transferId: "transfer-0004",
        git: state,
        worktreeRoot,
      }),
    ).rejects.toThrow(msg("thread.transferHistoryMissing"));
    expect(git(unrelated, "worktree", "list").split("\n")).toHaveLength(1);
  });

  it("reports repository facts and remote identities without credentials", async () => {
    const { source } = makeClones();
    dirtyFeature(source);
    git(source, "remote", "add", "upstream", "https://user:token@github.com/Acme/Widgets.git");
    const inspection = await inspectThreadTransferGit(at(source));
    expect(inspection).toMatchObject({ repository: true, branch: "feature" });
    // Unstaged edit, staged file, staged deletion, and two untracked paths.
    expect(inspection.changedFiles).toBe(5);
    expect(inspection.repoIdentities).toEqual(["github.com/acme/widgets"]);
    const plain = tempDir("poracode-transfer-plain-");
    mkdirSync(join(plain, "dir"));
    expect(await inspectThreadTransferGit(at(join(plain, "dir")))).toEqual({
      repository: false,
      changedFiles: 0,
      repoIdentities: [],
    });
    const probe = await probeThreadTransferRepositories([at(source), at(plain)]);
    expect(probe.repositories.map((entry) => entry.repository)).toEqual([true, false]);
    expect(() => threadTransferInspectGitResultSchema.parse(inspection)).not.toThrow();
    expect(() => threadTransferRepoProbeResultSchema.parse(probe)).not.toThrow();
  });

  it("counts porcelain entries, including renames carrying an old path", () => {
    expect(countPorcelainEntries("")).toBe(0);
    expect(countPorcelainEntries(" M a.ts\0?? b.ts\0")).toBe(2);
    expect(countPorcelainEntries("R  new.ts\0old.ts\0 D gone.ts\0")).toBe(2);
  });
});
