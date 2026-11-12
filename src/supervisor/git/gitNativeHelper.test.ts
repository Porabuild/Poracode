import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { GitService } from "../git";
import { FileIndexService } from "../fileIndex";
import { ProjectSearchIndex } from "../ProjectSearchIndex";
import { resolveProjectEntryPath } from "../projectPaths";
import { disposeGitExecWorker } from "./exec";
import {
  GIT_PROCESS_ADMISSION_DEFAULT_POLICY,
  admitGitProcess,
  configureGitProcessAdmission,
  resetGitProcessAdmissionForTests,
} from "./gitProcessAdmission";
import { disposeNativeGitHelper, nativeGitHelperBinaryPath } from "./gitNativeHelperClient";
import { GitStatusService } from "./statusService";
import { GIT_ADMISSION_WAIT_TIMEOUT_CODE } from "@/shared/gitProcessAdmission";

const temps: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

function runGit(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore", windowsHide: true });
}

function localLocation(path: string): ProjectLocation & { kind: "posix" | "windows" } {
  return process.platform === "win32" ? { kind: "windows", path } : { kind: "posix", path };
}

afterEach(async () => {
  delete process.env.PORACODE_DISABLE_GIT_HELPER;
  delete process.env.PORACODE_GIT_HELPER_BIN;
  disposeNativeGitHelper();
  await disposeGitExecWorker();
  resetGitProcessAdmissionForTests();
  configureGitProcessAdmission({ ...GIT_PROCESS_ADMISSION_DEFAULT_POLICY });
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("poracode-git-helper parity & fallback", () => {
  it("falls back cleanly to TypeScript when the native helper binary is absent", async () => {
    process.env.PORACODE_GIT_HELPER_BIN = join(tmpdir(), "does-not-exist-poracode-git-helper");
    expect(nativeGitHelperBinaryPath()).toBeUndefined();

    const root = makeTempDir("poracode-git-fallback-");
    runGit(root, ["init", "-b", "main"]);
    runGit(root, ["config", "user.email", "test@poracode.dev"]);
    runGit(root, ["config", "user.name", "Test"]);
    writeFileSync(join(root, "a.txt"), "hello\n");
    runGit(root, ["add", "a.txt"]);
    runGit(root, ["commit", "-m", "init"]);
    writeFileSync(join(root, "b.txt"), "untracked\nline2\n");

    const git = new GitService();
    const loc = localLocation(root);
    const full = await git.getStatus(loc, "full");
    expect(full.isRepo).toBe(true);
    expect(full.branch).toBe("main");
    expect(full.unstaged.map((u) => u.path)).toEqual(["b.txt"]);
    expect(full.totalInsertions).toBe(2);
  });

  it("matches TypeScript GitStatusService field-for-field across dirty, renamed, untracked, binary, and non-repo worktrees", async () => {
    const bin = nativeGitHelperBinaryPath();
    if (!bin) {
      // Skip only on architectures without a staged helper (e.g. linux-arm64).
      return;
    }

    const root = makeTempDir("poracode-git-parity-");
    const repoMain = join(root, "main-repo");
    const wtDirty = join(root, "wt-dirty");
    const wtStaged = join(root, "wt-staged");
    const nonRepo = join(root, "non-repo");
    mkdirSync(repoMain, { recursive: true });
    mkdirSync(nonRepo, { recursive: true });

    runGit(repoMain, ["init", "-b", "main"]);
    runGit(repoMain, ["config", "user.email", "test@poracode.dev"]);
    runGit(repoMain, ["config", "user.name", "Test"]);
    runGit(repoMain, ["remote", "add", "origin", "https://github.com/poracode/parity-test.git"]);
    mkdirSync(join(repoMain, "src"), { recursive: true });
    writeFileSync(join(repoMain, "src/old.ts"), "export const x = 1;\nexport const y = 2;\n");
    writeFileSync(join(repoMain, "src/keep.ts"), "line1\nline2\nline3\n");
    runGit(repoMain, ["add", "."]);
    runGit(repoMain, ["commit", "-m", "initial"]);

    runGit(repoMain, ["worktree", "add", "-b", "feat/dirty", wtDirty]);
    runGit(repoMain, ["worktree", "add", "-b", "feat/staged", wtStaged]);

    // Dirty worktree: modified tracked file + nested untracked text & binary files
    writeFileSync(join(wtDirty, "src/keep.ts"), "line1\nchanged\nline3\nextra\n");
    mkdirSync(join(wtDirty, "src/untracked"), { recursive: true });
    writeFileSync(join(wtDirty, "src/untracked/notes.md"), "one\ntwo\nthree\n");
    writeFileSync(join(wtDirty, "src/untracked/blob.bin"), Buffer.from([0, 1, 2, 3, 255]));

    // Staged worktree: staged rename + unstaged modification
    runGit(wtStaged, ["mv", "src/old.ts", "src/new.ts"]);
    writeFileSync(join(wtStaged, "src/new.ts"), "export const x = 10;\nexport const y = 2;\n");

    const paths = [repoMain, wtDirty, wtStaged, nonRepo];
    const loc = localLocation(repoMain);

    // 1. Capture native results
    delete process.env.PORACODE_DISABLE_GIT_HELPER;
    const nativeGit = new GitService();
    const nativeSummaryBatch = await nativeGit.getWorktreeStatusBatch(loc, paths, "summary");
    const nativeFullBatch = await nativeGit.getWorktreeStatusBatch(loc, paths, "full");

    // 2. Capture TypeScript fallback results on the exact same repositories
    process.env.PORACODE_DISABLE_GIT_HELPER = "1";
    const tsGit = new GitService();
    const tsSummaryBatch = await tsGit.getWorktreeStatusBatch(loc, paths, "summary");
    const tsFullBatch = await tsGit.getWorktreeStatusBatch(loc, paths, "full");

    expect(nativeSummaryBatch).toEqual(tsSummaryBatch);
    expect(nativeFullBatch).toEqual(tsFullBatch);
  });

  it("preserves GitProcessAdmissionError refusals on native batch calls", async () => {
    configureGitProcessAdmission({ shortPermits: 1, admissionWaitTimeoutMs: 20 });
    const holder = await admitGitProcess("short");
    const service = new GitStatusService();
    const loc = localLocation(process.cwd());
    try {
      await expect(
        service.getWorktreeStatusBatchNative(loc, [process.cwd()], "summary"),
      ).rejects.toMatchObject({
        code: GIT_ADMISSION_WAIT_TIMEOUT_CODE,
      });
    } finally {
      holder.release();
    }
  });

  it("matches ProjectSearchIndex and FileIndexService rankings, diacritics, walk mode, and invalidation", async () => {
    const bin = nativeGitHelperBinaryPath();
    if (!bin) return;

    const repo = makeTempDir("poracode-search-parity-");
    runGit(repo, ["init", "-b", "main"]);
    runGit(repo, ["config", "user.email", "test@poracode.dev"]);
    runGit(repo, ["config", "user.name", "Test"]);

    writeFileSync(join(repo, ".gitignore"), "ignored_dir/\n");
    mkdirSync(join(repo, "src/components/search"), { recursive: true });
    mkdirSync(join(repo, "ignored_dir"), { recursive: true });
    mkdirSync(join(repo, "node_modules/pkg"), { recursive: true });

    writeFileSync(join(repo, "src/CommandPalette.tsx"), "export {};\n");
    writeFileSync(join(repo, "src/cmdplt.ts"), "export {};\n");
    writeFileSync(join(repo, "src/Café.ts"), "export {};\n");
    writeFileSync(join(repo, "src/components/search/CommandPalette.tsx"), "export {};\n");
    writeFileSync(join(repo, "src/components/search/Other.tsx"), "export {};\n");
    writeFileSync(join(repo, "ignored_dir/generated.ts"), "export {};\n");
    writeFileSync(join(repo, "node_modules/pkg/index.js"), "export {};\n");
    runGit(repo, ["add", "."]);
    runGit(repo, ["commit", "-m", "initial"]);

    const loc = localLocation(repo);

    // Native ProjectSearchIndex & FileIndexService
    delete process.env.PORACODE_DISABLE_GIT_HELPER;
    const nativeTree = new ProjectSearchIndex(resolveProjectEntryPath);
    const nativeFiles = new FileIndexService();

    const nativeQueries = [
      await nativeTree.searchProjectTree({
        projectLocation: loc,
        query: "cmdplt",
        limit: 10,
        entryType: "file",
        searchConfig: { useIgnoreFiles: true, excludePatterns: ["**/node_modules"] },
      }),
      await nativeTree.searchProjectTree({
        projectLocation: loc,
        query: "cafe",
        limit: 10,
        entryType: "file",
      }),
      await nativeTree.searchProjectTree({
        projectLocation: loc,
        query: "palette components",
        limit: 10,
        entryType: "file",
      }),
      await nativeTree.searchProjectTree({
        projectLocation: loc,
        query: "generated",
        limit: 10,
        searchConfig: { useIgnoreFiles: false, excludePatterns: ["**/node_modules"] },
      }),
      await nativeFiles.searchProjectFiles({
        projectLocation: loc,
        query: "CommandPalette",
        limit: 10,
        searchConfig: { useIgnoreFiles: true, excludePatterns: ["**/node_modules"] },
      }),
    ];

    // TypeScript fallback on the exact same repository
    process.env.PORACODE_DISABLE_GIT_HELPER = "1";
    const tsTree = new ProjectSearchIndex(resolveProjectEntryPath);
    const tsFiles = new FileIndexService();

    const tsQueries = [
      await tsTree.searchProjectTree({
        projectLocation: loc,
        query: "cmdplt",
        limit: 10,
        entryType: "file",
        searchConfig: { useIgnoreFiles: true, excludePatterns: ["**/node_modules"] },
      }),
      await tsTree.searchProjectTree({
        projectLocation: loc,
        query: "cafe",
        limit: 10,
        entryType: "file",
      }),
      await tsTree.searchProjectTree({
        projectLocation: loc,
        query: "palette components",
        limit: 10,
        entryType: "file",
      }),
      await tsTree.searchProjectTree({
        projectLocation: loc,
        query: "generated",
        limit: 10,
        searchConfig: { useIgnoreFiles: false, excludePatterns: ["**/node_modules"] },
      }),
      await tsFiles.searchProjectFiles({
        projectLocation: loc,
        query: "CommandPalette",
        limit: 10,
        searchConfig: { useIgnoreFiles: true, excludePatterns: ["**/node_modules"] },
      }),
    ];

    expect(nativeQueries).toEqual(tsQueries);

    // Verify native cache invalidation picks up newly created files immediately
    delete process.env.PORACODE_DISABLE_GIT_HELPER;
    writeFileSync(join(repo, "src/BrandNewFeature.tsx"), "export {};\n");
    nativeTree.invalidateCaches(loc);
    nativeFiles.invalidateCacheForLocation(loc);

    const refreshedTree = await nativeTree.searchProjectTree({
      projectLocation: loc,
      query: "brandnew",
      limit: 5,
      entryType: "file",
    });
    expect(refreshedTree.entries.map((e) => e.path)).toEqual(["src/BrandNewFeature.tsx"]);

    const refreshedFiles = await nativeFiles.searchProjectFiles({
      projectLocation: loc,
      query: "brandnew",
      limit: 5,
    });
    expect(refreshedFiles.entries.map((e) => e.path)).toEqual(["src/BrandNewFeature.tsx"]);
  });
});
