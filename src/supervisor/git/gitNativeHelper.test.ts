import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import {
  areSearchExcludePatternsNativeCompatible,
  disposeNativeGitHelper,
  nativeGitHelperBinaryPath,
  queryNativeGitStatusBatch,
  queryNativeSearchTree,
} from "./gitNativeHelperClient";
import { GitStatusService } from "./statusService";
import { GIT_ADMISSION_WAIT_TIMEOUT_CODE } from "@/shared/gitProcessAdmission";
import { ForgeRuntime } from "../forges/runtime";

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

const initialHelperBinEnv = process.env.PORACODE_GIT_HELPER_BIN;
const statusEnvironmentKeys = [
  "PATH",
  "GIT_CONFIG_COUNT",
  "GIT_CONFIG_PARAMETERS",
  "GIT_CONFIG_KEY_0",
  "GIT_CONFIG_VALUE_0",
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_SYSTEM",
  "GIT_CONFIG_NOSYSTEM",
  "XDG_CONFIG_HOME",
  "HOME",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "GIT_ATTR_SOURCE",
] as const;
const initialStatusEnvironment = Object.fromEntries(
  statusEnvironmentKeys.map((key) => [key, process.env[key]]),
);

beforeEach(() => {
  const config = join(makeTempDir("poracode-status-config-"), "empty.config");
  writeFileSync(config, "");
  process.env.GIT_CONFIG_GLOBAL = config;
  process.env.GIT_CONFIG_SYSTEM = config;
});

afterEach(async () => {
  vi.restoreAllMocks();
  for (const key of statusEnvironmentKeys) {
    const value = initialStatusEnvironment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  delete process.env.PORACODE_DISABLE_GIT_HELPER;
  if (initialHelperBinEnv !== undefined) {
    process.env.PORACODE_GIT_HELPER_BIN = initialHelperBinEnv;
  } else {
    delete process.env.PORACODE_GIT_HELPER_BIN;
  }
  disposeNativeGitHelper();
  await disposeGitExecWorker();
  resetGitProcessAdmissionForTests();
  configureGitProcessAdmission({ ...GIT_PROCESS_ADMISSION_DEFAULT_POLICY });
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("poracode-git-helper parity & fallback", () => {
  it.each(["linked", "literal wildcard", "directory"])(
    "resolves relative gitdir conditions from a %s config path like Git",
    async (kind) => {
      if (!nativeGitHelperBinaryPath()) {
        if (initialHelperBinEnv !== undefined) throw new Error("Expected native helper");
        return;
      }
      const fixture = makeTempDir("poracode-relative-config-");
      const physical = join(
        fixture,
        kind === "literal wildcard" ? "physical [literal]" : "physical",
      );
      const root = join(physical, "repo");
      mkdirSync(root, { recursive: true });
      runGit(root, ["init", "-b", "feature/topic"]);
      runGit(root, ["remote", "add", "origin", "https://example.test/repo"]);
      let source = physical;
      if (kind === "linked") {
        source = join(fixture, "alias");
        symlinkSync(physical, source, process.platform === "win32" ? "junction" : "dir");
      }
      writeFileSync(
        join(physical, "global"),
        `[includeIf "gitdir/i:${kind === "directory" ? "./" : "./repo/.git"}"]\npath=selected\n` +
          '[includeIf "hasconfig:remote.*.url:https://example.test/**"]\npath=marker\n',
      );
      writeFileSync(join(physical, "selected"), '[includeIf "onbranch:feature/"]\npath=branch\n');
      writeFileSync(join(physical, "branch"), "[ssh]\nvariant=plink\n");
      writeFileSync(join(physical, "marker"), "[fixture]\nselected=true\n");
      process.env.GIT_CONFIG_GLOBAL = join(source, "global");
      expect(
        execFileSync("git", ["config", "--get", "ssh.variant"], {
          cwd: root,
          encoding: "utf8",
          windowsHide: true,
        }).trim(),
      ).toBe("plink");
      disposeNativeGitHelper();
      const native = await queryNativeGitStatusBatch({
        paths: [root],
        detail: "full",
        timeoutMs: 10_000,
        maxConcurrency: 1,
      });
      expect(native?.[root]?.isRepo).toBe(true);
      expect(native?.[root]?.hasSshOverrides).toBe(true);
    },
  );

  it("uses Git's home-directory precedence for conditional tilde includes", async () => {
    if (!nativeGitHelperBinaryPath()) {
      if (initialHelperBinEnv !== undefined) throw new Error("Expected native helper");
      return;
    }
    const root = makeTempDir("poracode-native-home-precedence-");
    runGit(root, ["init", "-b", "main"]);
    runGit(root, ["remote", "add", "origin", "https://example.test/repo"]);
    const home = makeTempDir("poracode-native-selected-home-");
    const profile = makeTempDir("poracode-native-ignored-profile-");
    writeFileSync(join(home, "selected"), '[core]\nsshCommand=""\n');
    writeFileSync(join(profile, "selected"), "[test]\nsource=profile\n");
    const global = join(makeTempDir("poracode-native-home-global-"), "config");
    writeFileSync(
      global,
      '[includeIf "hasconfig:remote.*.url:https://example.test/**"]\npath=~/selected\n',
    );
    process.env.GIT_CONFIG_GLOBAL = global;
    process.env.USERPROFILE = profile;
    if (process.platform === "win32") {
      delete process.env.HOME;
      process.env.HOMEDRIVE = home.slice(0, 2);
      process.env.HOMEPATH = home.slice(2);
    } else process.env.HOME = home;
    expect(() => runGit(root, ["config", "--get", "core.sshcommand"])).not.toThrow();
    disposeNativeGitHelper();
    expect(
      (
        await queryNativeGitStatusBatch({
          paths: [root],
          detail: "full",
          timeoutMs: 10_000,
          maxConcurrency: 1,
        })
      )?.[root]?.hasSshOverrides,
    ).toBe(true);
  });

  it.each(["info", "global", "xdg", "nested", "index", "index-case", "alternate-tree"] as const)(
    "preserves attribute fallback through the %s source fast check",
    async (source) => {
      if (!nativeGitHelperBinaryPath()) {
        if (initialHelperBinEnv !== undefined) throw new Error("Expected native helper");
        return;
      }
      const root = makeTempDir("poracode-native-attribute-sources-");
      runGit(root, ["init", "-b", "main"]);
      runGit(root, ["config", "user.name", "Test"]);
      runGit(root, ["config", "user.email", "test@poracode.dev"]);
      mkdirSync(join(root, "nested"));
      writeFileSync(join(root, "nested/file.txt"), "content\n");
      runGit(root, ["add", "."]);
      runGit(root, ["commit", "-qm", "seed"]);
      const external = makeTempDir("poracode-native-attribute-external-");
      let attributes: string;
      if (source === "global") {
        attributes = join(external, "attributes");
        runGit(root, ["config", "core.attributesfile", attributes]);
      } else if (source === "xdg") {
        process.env.XDG_CONFIG_HOME = external;
        mkdirSync(join(external, "git"));
        attributes = join(external, "git/attributes");
      } else if (source === "info") attributes = join(root, ".git/info/attributes");
      else
        attributes = join(
          root,
          source === "index-case" ? "nested/.GITATTRIBUTES" : "nested/.gitattributes",
        );
      if (source === "alternate-tree") process.env.GIT_ATTR_SOURCE = "HEAD";
      else writeFileSync(attributes, "*.txt filter=fixture\n");
      if (source === "index" || source === "index-case") {
        runGit(root, ["config", "core.ignorecase", "true"]);
        runGit(root, ["add", attributes]);
        unlinkSync(attributes);
      }
      disposeNativeGitHelper();
      for (const detail of ["summary", "full"] as const) {
        expect(
          await queryNativeGitStatusBatch({
            paths: [root],
            detail,
            timeoutMs: 10_000,
            maxConcurrency: 1,
          }),
        ).toBeNull();
      }
    },
  );

  it.each(["worktree", "index", "untracked", "head", "intent-to-add"] as const)(
    "preserves native full and summary parity for %s submodule/index changes",
    async (kind) => {
      if (!nativeGitHelperBinaryPath()) {
        if (initialHelperBinEnv !== undefined) throw new Error("Expected native helper");
        return;
      }
      const root = makeTempDir("poracode-native-submodule-");
      const main = join(root, "main");
      const source = join(root, "source");
      for (const repo of [main, source]) {
        mkdirSync(repo);
        runGit(repo, ["init", "-b", "main"]);
        runGit(repo, ["config", "user.name", "Test"]);
        runGit(repo, ["config", "user.email", "test@poracode.dev"]);
        writeFileSync(join(repo, "tracked.txt"), "before\n");
        runGit(repo, ["add", "."]);
        runGit(repo, ["commit", "-qm", "seed"]);
      }
      if (kind === "intent-to-add") {
        writeFileSync(join(main, "new.txt"), "new\ncontent\n");
        runGit(main, ["add", "-N", "new.txt"]);
      } else {
        runGit(main, ["-c", "protocol.file.allow=always", "submodule", "add", source, "sub"]);
        runGit(main, ["commit", "-qm", "submodule"]);
        const sub = join(main, "sub");
        writeFileSync(join(sub, kind === "untracked" ? "new.txt" : "tracked.txt"), "after\n");
        if (kind === "index" || kind === "head") runGit(sub, ["add", "."]);
        if (kind === "head") {
          runGit(sub, [
            "-c",
            "user.name=Test",
            "-c",
            "user.email=test@poracode.dev",
            "commit",
            "-qm",
            "advance",
          ]);
        }
      }
      const native = new GitService();
      const full = await native.getStatus(localLocation(main), "full");
      const summary = await native.getStatus(localLocation(main), "summary");
      const raw = await queryNativeGitStatusBatch({
        paths: [main, source],
        detail: "full",
        timeoutMs: 10_000,
        maxConcurrency: 2,
      });
      expect(raw === null ? null : raw?.[main]?.isRepo).toBe(
        kind === "intent-to-add" ? null : true,
      );
      delete process.env.PORACODE_GIT_HELPER_BIN;
      process.env.PORACODE_DISABLE_GIT_HELPER = "1";
      const fallback = new GitService();
      expect(full).toEqual(await fallback.getStatus(localLocation(main), "full"));
      expect(summary).toEqual(await fallback.getStatus(localLocation(main), "summary"));
    },
  );

  it("routes negated exclude globs to micromatch while keeping character classes native", () => {
    expect(areSearchExcludePatternsNativeCompatible(["!**/*.md"])).toBe(false);
    expect(areSearchExcludePatternsNativeCompatible(["!!**/*.md"])).toBe(false);
    expect(areSearchExcludePatternsNativeCompatible(["**/[!a]*.ts"])).toBe(true);
  });

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
      if (initialHelperBinEnv !== undefined) {
        throw new Error(`Expected PORACODE_GIT_HELPER_BIN to resolve, got: ${initialHelperBinEnv}`);
      }
      // Skip only on test-shard runners or architectures without a staged helper.
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

    const rawNative = await queryNativeGitStatusBatch({
      paths,
      detail: "full",
      timeoutMs: 10_000,
      maxConcurrency: 8,
    });
    expect(rawNative?.[repoMain]?.isRepo).toBe(true);
    expect(
      rawNative?.[wtDirty]?.unstaged.some((file) => file.path === "src/untracked/notes.md"),
    ).toBe(true);

    // 1. Capture native results
    delete process.env.PORACODE_DISABLE_GIT_HELPER;
    const nativeGit = new GitService();
    const nativeSummaryBatch = await nativeGit.getWorktreeStatusBatch(loc, paths, "summary");
    const nativeFullBatch = await nativeGit.getWorktreeStatusBatch(loc, paths, "full");

    // 2. Capture TypeScript fallback results on the exact same repositories
    delete process.env.PORACODE_GIT_HELPER_BIN;
    process.env.PORACODE_DISABLE_GIT_HELPER = "1";
    expect(nativeGitHelperBinaryPath()).toBeUndefined();
    const tsGit = new GitService();
    const tsSummaryBatch = await tsGit.getWorktreeStatusBatch(loc, paths, "summary");
    const tsFullBatch = await tsGit.getWorktreeStatusBatch(loc, paths, "full");

    expect(nativeSummaryBatch).toEqual(tsSummaryBatch);
    expect(nativeFullBatch).toEqual(tsFullBatch);
  });

  it("preserves unborn/detached, divergent tracking, ignored/EOL/symlink changes and merge conflicts", async () => {
    const bin = nativeGitHelperBinaryPath();
    if (!bin) {
      if (initialHelperBinEnv !== undefined) throw new Error("Expected native helper");
      return;
    }
    const root = makeTempDir("poracode-native-status-contract-");
    const main = join(root, "main");
    const detached = join(root, "detached");
    const merging = join(root, "merging");
    const unborn = join(root, "unborn");
    mkdirSync(main);
    mkdirSync(unborn);
    runGit(main, ["init", "-b", "main"]);
    runGit(main, ["config", "user.email", "test@poracode.dev"]);
    runGit(main, ["config", "user.name", "Test"]);
    runGit(main, ["config", "core.autocrlf", "false"]);
    runGit(main, ["config", "core.symlinks", "true"]);
    writeFileSync(join(main, ".gitignore"), "ignored/\n");
    writeFileSync(join(main, ".gitattributes"), "*.txt text eol=lf\n*.bin binary\n");
    writeFileSync(join(main, "keep.txt"), "one\ntwo\nthree\n");
    writeFileSync(join(main, "delete.txt"), "delete\n");
    writeFileSync(join(main, "rename.txt"), "rename\nunchanged\n");
    writeFileSync(join(main, "conflict.txt"), "base\n");
    writeFileSync(join(main, "binary.bin"), Buffer.from([0, 1, 2, 3]));
    symlinkSync("keep.txt", join(main, "link.txt"), "file");
    runGit(main, ["add", "."]);
    runGit(main, ["commit", "-m", "base"]);
    runGit(main, ["remote", "add", "origin", "https://github.com/poracode/status-parity.git"]);
    runGit(main, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
    runGit(main, ["branch", "--set-upstream-to=origin/main", "main"]);
    runGit(main, ["worktree", "add", "--detach", detached]);
    runGit(main, ["worktree", "add", "-b", "merge-side", merging]);
    writeFileSync(join(merging, "conflict.txt"), "theirs\n");
    runGit(merging, ["commit", "-am", "theirs"]);
    runGit(main, ["update-ref", "refs/remotes/origin/main", "merge-side"]);
    writeFileSync(join(main, "conflict.txt"), "ours\n");
    runGit(main, ["commit", "-am", "ours"]);
    expect(() => runGit(merging, ["merge", "main"])).toThrow(/git merge main/);
    writeFileSync(join(main, "keep.txt"), "one\r\ntwo\r\nthree\r\n");
    unlinkSync(join(main, "delete.txt"));
    runGit(main, ["mv", "rename.txt", "renamed.txt"]);
    writeFileSync(join(main, "renamed.txt"), "rename\nchanged\n");
    writeFileSync(join(main, "binary.bin"), Buffer.from([0, 4, 5, 6]));
    unlinkSync(join(main, "link.txt"));
    symlinkSync("renamed.txt", join(main, "link.txt"), "file");
    mkdirSync(join(main, "ignored"));
    writeFileSync(join(main, "ignored/generated.txt"), "ignored\n");
    writeFileSync(join(main, "unicode café.txt"), "last line");
    runGit(unborn, ["init", "-b", "new-branch"]);
    writeFileSync(join(unborn, "first.txt"), "first\n");
    runGit(unborn, ["add", "."]);
    const paths = [main, detached, merging, unborn];
    const rawNative = await queryNativeGitStatusBatch({
      paths,
      detail: "full",
      timeoutMs: 10_000,
      maxConcurrency: 8,
    });
    expect(Object.keys(rawNative ?? {})).toHaveLength(4);
    expect(rawNative?.[merging]?.mergeInProgress).toBe(true);
    const native = new GitService();
    const summary = await native.getWorktreeStatusBatch(localLocation(main), paths, "summary");
    const full = await native.getWorktreeStatusBatch(localLocation(main), paths, "full");
    expect(full[main]?.ahead).toBe(1);
    expect(full[main]?.behind).toBe(1);
    expect(summary[unborn]?.headSha).toBe("(initial)");
    expect(full[detached]?.branch).toBe("(detached)");
    expect(full[merging]?.mergeInProgress).toBe(true);
    expect(full[merging]?.mergeMessage).toContain("main");
    expect(full[main]?.unstaged.find((file) => file.path === "binary.bin")).toMatchObject({
      insertions: 0,
      deletions: 0,
    });
    delete process.env.PORACODE_GIT_HELPER_BIN;
    process.env.PORACODE_DISABLE_GIT_HELPER = "1";
    expect(nativeGitHelperBinaryPath()).toBeUndefined();
    const fallback = new GitService();
    expect(summary).toEqual(
      await fallback.getWorktreeStatusBatch(localLocation(main), paths, "summary"),
    );
    expect(full).toEqual(await fallback.getWorktreeStatusBatch(localLocation(main), paths, "full"));
    expect(
      full[main]?.unstaged.some(
        (file) => file.path.startsWith("ignored/") || file.path === "keep.txt",
      ),
    ).toBe(false);
  });

  it.each(["sha256", "split index", "sparse index"])(
    "falls back for a whole mixed batch with an unsupported %s repository",
    async (format) => {
      const bin = nativeGitHelperBinaryPath();
      if (!bin) {
        if (initialHelperBinEnv !== undefined) throw new Error("Expected native helper");
        return;
      }
      const root = makeTempDir("poracode-native-repository-format-");
      const healthy = join(root, "healthy");
      const unsupported = join(root, "unsupported");
      mkdirSync(healthy);
      mkdirSync(unsupported);
      runGit(healthy, ["init", "-b", "main"]);
      runGit(unsupported, [
        "init",
        "-b",
        "main",
        ...(format === "sha256" ? ["--object-format=sha256"] : []),
      ]);
      runGit(unsupported, ["config", "user.email", "test@poracode.dev"]);
      runGit(unsupported, ["config", "user.name", "Test"]);
      mkdirSync(join(unsupported, "keep"));
      mkdirSync(join(unsupported, "hidden"));
      writeFileSync(join(unsupported, "keep/base.txt"), "base\n");
      writeFileSync(join(unsupported, "hidden/base.txt"), "hidden\n");
      runGit(unsupported, ["add", "."]);
      runGit(unsupported, ["commit", "-m", "base"]);
      if (format === "split index") runGit(unsupported, ["update-index", "--split-index"]);
      if (format === "sparse index") {
        runGit(unsupported, ["sparse-checkout", "init", "--cone", "--sparse-index"]);
        runGit(unsupported, ["sparse-checkout", "set", "keep"]);
      }
      writeFileSync(join(healthy, "new.txt"), "healthy\n");
      writeFileSync(join(unsupported, "keep/base.txt"), "base\nextra\n");
      disposeNativeGitHelper();
      const paths = [healthy, unsupported];
      for (const detail of ["full", "summary"] as const) {
        expect(
          await queryNativeGitStatusBatch({ paths, detail, timeoutMs: 10_000, maxConcurrency: 2 }),
        ).toBeNull();
      }
      const service = new GitService();
      const summary = await service.getWorktreeStatusBatch(
        localLocation(healthy),
        paths,
        "summary",
      );
      const full = await service.getWorktreeStatusBatch(localLocation(healthy), paths, "full");
      expect(full[unsupported]?.unstaged).toEqual([
        { path: "keep/base.txt", status: "M", staged: false, insertions: 1, deletions: 0 },
      ]);
      expect(Object.keys(full)).toHaveLength(2);
      delete process.env.PORACODE_GIT_HELPER_BIN;
      process.env.PORACODE_DISABLE_GIT_HELPER = "1";
      expect(nativeGitHelperBinaryPath()).toBeUndefined();
      const fallback = new GitService();
      expect(summary).toEqual(
        await fallback.getWorktreeStatusBatch(localLocation(healthy), paths, "summary"),
      );
      expect(full).toEqual(
        await fallback.getWorktreeStatusBatch(localLocation(healthy), paths, "full"),
      );
    },
  );

  it.each(["status.renames", "diff.renames"])(
    "preserves valueless true and explicit empty false for %s",
    async (key) => {
      const bin = nativeGitHelperBinaryPath();
      if (!bin) {
        if (initialHelperBinEnv !== undefined) throw new Error("Expected native helper");
        return;
      }
      const root = makeTempDir("poracode-native-rename-boolean-");
      runGit(root, ["init", "-b", "main"]);
      runGit(root, ["config", "user.email", "test@poracode.dev"]);
      runGit(root, ["config", "user.name", "Test"]);
      writeFileSync(join(root, "old.txt"), "unchanged\n");
      runGit(root, ["add", "."]);
      runGit(root, ["commit", "-m", "base"]);
      runGit(root, ["mv", "old.txt", "new.txt"]);
      const path = join(root, ".git", "config");
      const base = readFileSync(path, "utf8");
      for (const value of ["", " ="] as const) {
        writeFileSync(path, `${base}\n[${key.split(".")[0]}]\nrenames${value}\n`);
        process.env.PORACODE_GIT_HELPER_BIN = bin;
        delete process.env.PORACODE_DISABLE_GIT_HELPER;
        disposeNativeGitHelper();
        const rawSummary = await queryNativeGitStatusBatch({
          paths: [root],
          detail: "summary",
          timeoutMs: 10_000,
          maxConcurrency: 1,
        });
        expect(rawSummary?.[root]?.staged.map((file) => file.status)).toEqual(
          value === "" ? ["R"] : ["A", "D"],
        );
        const raw = await queryNativeGitStatusBatch({
          paths: [root],
          detail: "full",
          timeoutMs: 10_000,
          maxConcurrency: 1,
        });
        // Full status mirrors TS numstat pruning when status disables renames
        // but diff still combines the add/delete into one destination row.
        expect(raw?.[root]?.staged.map((file) => file.status)).toEqual(
          value === "" ? ["R"] : key === "status.renames" ? ["A"] : ["A", "D"],
        );
        const native = new GitService();
        const summary = await native.getWorktreeStatusBatch(localLocation(root), [root], "summary");
        const full = await native.getWorktreeStatusBatch(localLocation(root), [root], "full");
        delete process.env.PORACODE_GIT_HELPER_BIN;
        process.env.PORACODE_DISABLE_GIT_HELPER = "1";
        expect(nativeGitHelperBinaryPath()).toBeUndefined();
        const fallback = new GitService();
        expect(summary).toEqual(
          await fallback.getWorktreeStatusBatch(localLocation(root), [root], "summary"),
        );
        expect(full).toEqual(
          await fallback.getWorktreeStatusBatch(localLocation(root), [root], "full"),
        );
        expect(readFileSync(path, "utf8")).toBe(
          `${base}\n[${key.split(".")[0]}]\nrenames${value}\n`,
        );
      }
    },
  );

  it.each(["multiple", "rewritten", "explicit push", "reset", "no URL", "partial clone"])(
    "preserves ordered remote URLs and rewrites: %s",
    async (scenario) => {
      const bin = nativeGitHelperBinaryPath();
      if (!bin) {
        if (initialHelperBinEnv !== undefined) throw new Error("Expected native helper");
        return;
      }
      const root = makeTempDir("poracode-native-remote-urls-");
      runGit(root, ["init", "-b", "main"]);
      const global = join(makeTempDir("poracode-native-remote-global-"), "config");
      writeFileSync(
        global,
        '[remote "origin"]\nurl=https://github.com/poracode/first.git\n' +
          '[url "https://github.com/"]\ninsteadOf=short:\n' +
          '[url "https://push.test/"]\npushInsteadOf=short:\n',
      );
      process.env.GIT_CONFIG_GLOBAL = global;
      runGit(root, [
        "config",
        "--add",
        "remote.origin.url",
        "https://github.com/poracode/second.git",
      ]);
      if (scenario !== "multiple") {
        runGit(root, ["config", "--add", "remote.origin.url", ""]);
        if (scenario !== "no URL") {
          runGit(root, ["config", "--add", "remote.origin.url", "short:poracode/first.git"]);
          runGit(root, ["config", "--add", "remote.origin.url", "https://other.test/second.git"]);
        }
      }
      if (scenario === "explicit push") {
        runGit(root, ["config", "--add", "remote.origin.pushurl", "https://discard.test/repo"]);
        runGit(root, ["config", "--add", "remote.origin.pushurl", ""]);
        runGit(root, ["config", "--add", "remote.origin.pushurl", "short:poracode/push-first.git"]);
        runGit(root, ["config", "--add", "remote.origin.pushurl", "https://push.test/second.git"]);
      }
      if (scenario === "reset") {
        runGit(root, ["config", "--add", "remote.origin.url", ""]);
        runGit(root, [
          "config",
          "--add",
          "remote.origin.url",
          "https://github.com/poracode/reset.git",
        ]);
      }
      if (scenario === "partial clone") {
        runGit(root, ["config", "remote.origin.partialclonefilter", "blob:none"]);
      }
      const expected = execFileSync("git", ["remote", "-v"], {
        cwd: root,
        encoding: "utf8",
        windowsHide: true,
      });
      disposeNativeGitHelper();
      const raw = await queryNativeGitStatusBatch({
        paths: [root],
        detail: "full",
        timeoutMs: 10_000,
        maxConcurrency: 1,
      });
      expect(raw?.[root]?.remoteOutput).toBe(expected);
      const native = await new GitStatusService().getStatus(localLocation(root));
      delete process.env.PORACODE_GIT_HELPER_BIN;
      process.env.PORACODE_DISABLE_GIT_HELPER = "1";
      expect(nativeGitHelperBinaryPath()).toBeUndefined();
      expect(native).toEqual(await new GitStatusService().getStatus(localLocation(root)));
    },
  );

  it.each(["clean filter", "working-tree-encoding"])(
    "falls back for an entire native status batch with unsupported %s attributes",
    async (feature) => {
      const bin = nativeGitHelperBinaryPath();
      if (!bin) {
        if (initialHelperBinEnv !== undefined) throw new Error("Expected native helper");
        return;
      }
      const root = makeTempDir("poracode-native-content-conversion-");
      const supported = join(root, "supported");
      const converted = join(root, "converted");
      mkdirSync(supported);
      mkdirSync(converted);
      for (const repo of [supported, converted]) {
        runGit(repo, ["init", "-b", "main"]);
        runGit(repo, ["config", "user.email", "test@poracode.dev"]);
        runGit(repo, ["config", "user.name", "Test"]);
      }
      const contents = "stored\n";
      let worktreeContents: string | Buffer;
      if (feature === "clean filter") {
        const script = join(root, "clean.cjs");
        writeFileSync(
          script,
          'process.stdout.write(require("node:fs").readFileSync(0,"utf8").replaceAll("SMUDGED", "stored"));',
        );
        runGit(converted, [
          "config",
          "filter.fixture.clean",
          `"${process.execPath.replaceAll("\\", "/")}" "${script.replaceAll("\\", "/")}"`,
        ]);
        writeFileSync(join(converted, ".gitattributes"), "converted.txt filter=fixture\n");
        worktreeContents = "SMUDGED\n";
      } else {
        writeFileSync(
          join(converted, ".gitattributes"),
          "converted.txt working-tree-encoding=UTF-16LE\n",
        );
        worktreeContents = Buffer.from(contents, "utf16le");
      }
      writeFileSync(join(converted, "converted.txt"), worktreeContents);
      runGit(converted, ["add", "."]);
      runGit(converted, ["commit", "-m", "normalized base"]);
      expect(
        execFileSync("git", ["show", "HEAD:converted.txt"], {
          cwd: converted,
          encoding: "utf8",
          windowsHide: true,
        }),
      ).toBe(contents);
      writeFileSync(
        join(converted, "converted.txt"),
        feature === "clean filter" ? "SMUDGED\nextra\n" : Buffer.from("stored\nextra\n", "utf16le"),
      );
      writeFileSync(join(supported, "new.txt"), "new\n");
      disposeNativeGitHelper();
      for (const detail of ["full", "summary"] as const) {
        expect(
          await queryNativeGitStatusBatch({
            paths: [supported, converted],
            detail,
            timeoutMs: 10_000,
            maxConcurrency: 2,
          }),
        ).toBeNull();
      }
      expect(
        (
          await queryNativeGitStatusBatch({
            paths: [supported],
            detail: "summary",
            timeoutMs: 10_000,
            maxConcurrency: 1,
          })
        )?.[supported]?.isRepo,
      ).toBe(true);
      const service = new GitService();
      const paths = [supported, converted];
      const summary = await service.getWorktreeStatusBatch(
        localLocation(supported),
        paths,
        "summary",
      );
      const full = await service.getWorktreeStatusBatch(localLocation(supported), paths, "full");
      expect(full[converted]?.unstaged).toEqual([
        { path: "converted.txt", status: "M", staged: false, insertions: 1, deletions: 0 },
      ]);
      expect(full[supported]?.totalInsertions).toBe(1);
      expect(await service.getStatus(localLocation(converted))).toEqual(full[converted]);
      delete process.env.PORACODE_GIT_HELPER_BIN;
      process.env.PORACODE_DISABLE_GIT_HELPER = "1";
      expect(nativeGitHelperBinaryPath()).toBeUndefined();
      const fallback = new GitService();
      expect(summary).toEqual(
        await fallback.getWorktreeStatusBatch(localLocation(supported), paths, "summary"),
      );
      expect(full).toEqual(
        await fallback.getWorktreeStatusBatch(localLocation(supported), paths, "full"),
      );
    },
  );

  it("completes native full/summary status with no Git in PATH, including SSH alias materialization", async () => {
    const bin = nativeGitHelperBinaryPath();
    if (!bin) {
      if (initialHelperBinEnv !== undefined) throw new Error("Expected native helper");
      return;
    }
    const root = makeTempDir("poracode-no-git-status-");
    runGit(root, ["init", "-b", "main"]);
    writeFileSync(join(root, "new.txt"), "one\ntwo\n");
    runGit(root, ["remote", "add", "origin", "git@github.com-work:poracode/status.git"]);
    // Exercise the host's normal configuration, including its real conditional
    // includes, without copying or printing private configuration values.
    for (const key of ["GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM"] as const) {
      const value = initialStatusEnvironment[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    process.env.PORACODE_GIT_HELPER_BIN = bin;
    process.env.PATH = makeTempDir("poracode-no-git-path-");
    disposeNativeGitHelper();
    const rawNative = await queryNativeGitStatusBatch({
      paths: [root],
      detail: "full",
      timeoutMs: 1_000,
      maxConcurrency: 1,
    });
    expect(rawNative?.[root]?.isRepo).toBe(true);
    const run = vi
      .spyOn(ForgeRuntime.prototype, "run")
      .mockImplementation(async (_location, command) => {
        if (command !== "ssh") throw new Error(`Unexpected subprocess: ${command}`);
        return "hostname github.com\nport 22\n";
      });
    vi.spyOn(ForgeRuntime.prototype, "environment").mockResolvedValue({});
    const service = new GitStatusService();
    const full = await service.getStatus(localLocation(root));
    const summary = await service.getStatusSummary(localLocation(root));
    const batch = await service.getWorktreeStatusBatchNative(localLocation(root), [root], "full");
    expect(full).toMatchObject({
      isRepo: true,
      branch: "main",
      totalInsertions: 2,
      remoteInfo: {
        url: rawNative?.[root]?.hasSshOverrides
          ? "git@github.com-work:poracode/status.git"
          : "https://github.com/poracode/status.git",
      },
    });
    expect(summary).toMatchObject({
      isRepo: true,
      detail: "summary",
      headSha: "(initial)",
      totalInsertions: 0,
    });
    expect(batch?.[root]).toEqual(full);
    expect(run.mock.calls.map(([, command]) => command)).toEqual(
      rawNative?.[root]?.hasSshOverrides ? [] : ["ssh", "ssh"],
    );
  });

  it.each(["GIT_CONFIG_COUNT", "GIT_CONFIG_PARAMETERS"])(
    "falls back before native single/batch status with inherited %s",
    async (key) => {
      const root = makeTempDir("poracode-native-command-config-");
      runGit(root, ["init", "-b", "main"]);
      writeFileSync(join(root, "hidden.txt"), "untracked\n");
      if (key === "GIT_CONFIG_COUNT") {
        process.env.GIT_CONFIG_COUNT = "1";
        process.env.GIT_CONFIG_KEY_0 = "status.showUntrackedFiles";
        process.env.GIT_CONFIG_VALUE_0 = "no";
      } else {
        process.env.GIT_CONFIG_PARAMETERS = "'status.showUntrackedFiles=no'";
      }
      await disposeGitExecWorker();
      const service = new GitStatusService();
      expect(
        await service.getWorktreeStatusBatchNative(localLocation(root), [root], "full"),
      ).toBeNull();
      expect((await service.getStatus(localLocation(root))).unstaged).toEqual([]);
      expect((await service.getStatusSummary(localLocation(root))).unstaged).toEqual([]);
    },
  );

  it("refuses an old protocol-2 helper and preserves the TypeScript status fallback", async () => {
    const old = process.env.PORACODE_OLD_GIT_HELPER_BIN;
    if (!old) return;
    process.env.PORACODE_GIT_HELPER_BIN = old;
    disposeNativeGitHelper();
    const root = makeTempDir("poracode-old-status-helper-");
    runGit(root, ["init", "-b", "main"]);
    writeFileSync(join(root, "new.txt"), "new\n");
    const service = new GitStatusService();
    expect(
      await service.getWorktreeStatusBatchNative(localLocation(root), [root], "full"),
    ).toBeNull();
    expect(await service.getStatus(localLocation(root))).toMatchObject({
      isRepo: true,
      branch: "main",
      totalInsertions: 1,
    });
  });

  it.each(["system", "global", "local-include", "gitdir-include", "onbranch-include"])(
    "preserves SSH override safety from %s configuration",
    async (layer) => {
      const bin = nativeGitHelperBinaryPath();
      if (!bin) {
        if (initialHelperBinEnv !== undefined) throw new Error("Expected native helper");
        return;
      }
      const root = makeTempDir("poracode-native-ssh-config-");
      runGit(root, ["init", "-b", "main"]);
      runGit(root, ["remote", "add", "origin", "git@github.com-work:poracode/status.git"]);
      const include = join(makeTempDir("poracode-native-ssh-include-"), "included.config");
      writeFileSync(include, '[core]\n\tsshCommand = ""\n');
      const localConfig = join(root, ".git", "config");
      const section =
        layer === "gitdir-include"
          ? `includeIf "gitdir/i:${root.replaceAll("\\", "/")}/.git"`
          : layer === "onbranch-include"
            ? 'includeIf "onbranch:main"'
            : "include";
      const contents = `[${section}]\n\tpath = ${include.replaceAll("\\", "/")}\n`;
      if (layer === "system" || layer === "global") {
        const config = join(makeTempDir("poracode-native-config-layer-"), "config");
        writeFileSync(config, contents);
        process.env[layer === "system" ? "GIT_CONFIG_SYSTEM" : "GIT_CONFIG_GLOBAL"] = config;
      } else {
        writeFileSync(localConfig, readFileSync(localConfig, "utf8") + contents);
      }
      disposeNativeGitHelper();
      const raw = await queryNativeGitStatusBatch({
        paths: [root],
        detail: "full",
        timeoutMs: 10_000,
        maxConcurrency: 1,
      });
      expect(raw?.[root]?.hasSshOverrides).toBe(true);
      const native = await new GitStatusService().getStatus(localLocation(root));
      expect(native.remoteInfo?.url).toBe("git@github.com-work:poracode/status.git");
      delete process.env.PORACODE_GIT_HELPER_BIN;
      process.env.PORACODE_DISABLE_GIT_HELPER = "1";
      expect(nativeGitHelperBinaryPath()).toBeUndefined();
      expect(native).toEqual(await new GitStatusService().getStatus(localLocation(root)));
    },
  );

  it.each(["selected hasconfig include", "ignored XDG configuration"])(
    "falls back when %s changes the repository layout loaded at open",
    async (source) => {
      const bin = nativeGitHelperBinaryPath();
      if (!bin) {
        if (initialHelperBinEnv !== undefined) throw new Error("Expected native helper");
        return;
      }
      const root = makeTempDir("poracode-native-config-layout-");
      const main = join(root, "main");
      const alternate = join(root, "alternate");
      mkdirSync(main);
      mkdirSync(alternate);
      runGit(main, ["init", "-b", "main"]);
      runGit(main, ["config", "user.email", "test@poracode.dev"]);
      runGit(main, ["config", "user.name", "Test"]);
      runGit(main, ["remote", "add", "origin", "https://example.test/layout.git"]);
      writeFileSync(join(main, "tracked.txt"), "base\n");
      runGit(main, ["add", "."]);
      runGit(main, ["commit", "-m", "base"]);
      writeFileSync(
        join(alternate, "tracked.txt"),
        source === "selected hasconfig include" ? "base\nchanged\n" : "base\n",
      );
      if (source === "ignored XDG configuration")
        writeFileSync(join(main, "tracked.txt"), "base\nchanged\n");
      const global = join(root, "global.config");
      const selected = join(root, "selected.config");
      writeFileSync(selected, `[core]\nworktree="${alternate.replaceAll("\\", "/")}"\n`);
      if (source === "selected hasconfig include") {
        writeFileSync(
          global,
          '[includeIf "hasconfig:remote.*.url:https://example.test/**"]\npath=selected.config\n',
        );
      } else {
        writeFileSync(global, "");
        process.env.XDG_CONFIG_HOME = join(root, "xdg");
        mkdirSync(join(root, "xdg", "git"), { recursive: true });
        writeFileSync(join(root, "xdg", "git", "config"), readFileSync(selected));
      }
      process.env.GIT_CONFIG_GLOBAL = global;
      const configPaths = [global, selected, join(main, ".git", "config")];
      const before = configPaths.map((path) => readFileSync(path, "utf8"));
      const canonicalNumstat = execFileSync("git", ["diff", "--numstat"], {
        cwd: main,
        encoding: "utf8",
        windowsHide: true,
      });
      expect(
        source === "ignored XDG configuration"
          ? ["1\t0\ttracked.txt\n"]
          : ["", "1\t0\ttracked.txt\n"],
      ).toContain(canonicalNumstat);
      disposeNativeGitHelper();
      for (const detail of ["full", "summary"] as const) {
        expect(
          await queryNativeGitStatusBatch({
            paths: [main],
            detail,
            timeoutMs: 10_000,
            maxConcurrency: 1,
          }),
        ).toBeNull();
      }
      const native = new GitService();
      const summary = await native.getWorktreeStatusBatch(localLocation(main), [main], "summary");
      const full = await native.getWorktreeStatusBatch(localLocation(main), [main], "full");
      expect(full[main]?.unstaged).toEqual(
        canonicalNumstat === ""
          ? []
          : [{ path: "tracked.txt", status: "M", staged: false, insertions: 1, deletions: 0 }],
      );
      expect(await native.getStatus(localLocation(main))).toEqual(full[main]);
      delete process.env.PORACODE_GIT_HELPER_BIN;
      process.env.PORACODE_DISABLE_GIT_HELPER = "1";
      expect(nativeGitHelperBinaryPath()).toBeUndefined();
      const fallback = new GitService();
      expect(summary).toEqual(
        await fallback.getWorktreeStatusBatch(localLocation(main), [main], "summary"),
      );
      expect(full).toEqual(
        await fallback.getWorktreeStatusBatch(localLocation(main), [main], "full"),
      );
      expect(configPaths.map((path) => readFileSync(path, "utf8"))).toEqual(before);
    },
  );

  it("does not read XDG configuration when GIT_CONFIG_GLOBAL replaces global configuration", async () => {
    const bin = nativeGitHelperBinaryPath();
    if (!bin) {
      if (initialHelperBinEnv !== undefined) throw new Error("Expected native helper");
      return;
    }
    const root = makeTempDir("poracode-native-config-global-replace-");
    runGit(root, ["init", "-b", "main"]);
    runGit(root, ["remote", "add", "origin", "https://github.com/poracode/status.git"]);
    const xdg = makeTempDir("poracode-native-config-xdg-");
    const home = makeTempDir("poracode-native-config-home-");
    writeFileSync(join(home, ".gitconfig"), "[core]\nsshCommand=ignored-home\n");
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    mkdirSync(join(xdg, "git"));
    writeFileSync(
      join(xdg, "git", "config"),
      "[core]\nsshCommand=ignored\n[status]\nshowUntrackedFiles=no\n",
    );
    process.env.XDG_CONFIG_HOME = xdg;
    writeFileSync(join(root, "new.txt"), "visible\n");
    disposeNativeGitHelper();
    const raw = await queryNativeGitStatusBatch({
      paths: [root],
      detail: "full",
      timeoutMs: 10_000,
      maxConcurrency: 1,
    });
    expect(raw?.[root]?.hasSshOverrides).toBe(false);
    expect(raw?.[root]?.unstaged.map((file) => file.path)).toEqual(["new.txt"]);
    const native = await new GitStatusService().getStatus(localLocation(root));
    delete process.env.PORACODE_GIT_HELPER_BIN;
    process.env.PORACODE_DISABLE_GIT_HELPER = "1";
    expect(nativeGitHelperBinaryPath()).toBeUndefined();
    expect(native).toEqual(await new GitStatusService().getStatus(localLocation(root)));
  });

  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])(
    "falls back for installation-prefix includes (hasconfig=%s, conditional=%s)",
    async (hasconfig, conditional) => {
      const bin = nativeGitHelperBinaryPath();
      if (!bin) {
        if (initialHelperBinEnv !== undefined) throw new Error("Expected native helper");
        return;
      }
      const root = makeTempDir("poracode-native-config-prefix-");
      runGit(root, ["init", "-b", "main"]);
      if (hasconfig) {
        runGit(root, ["remote", "add", "origin", "https://example.test/prefix.git"]);
        runGit(root, [
          "config",
          "includeIf.hasconfig:remote.*.url:https://example.test/**.path",
          "missing.config",
        ]);
      }
      runGit(root, [
        "config",
        conditional ? "includeIf.onbranch:main.path" : "include.path",
        "%(prefix)/poracode-missing-status-fixture/config",
      ]);
      writeFileSync(join(root, "new.txt"), "new\n");
      const before = readFileSync(join(root, ".git", "config"), "utf8");
      expect(
        await queryNativeGitStatusBatch({
          paths: [root],
          detail: "summary",
          timeoutMs: 10_000,
          maxConcurrency: 1,
        }),
      ).toBeNull();
      const native = await new GitStatusService().getStatus(localLocation(root));
      expect(native.totalInsertions).toBe(1);
      delete process.env.PORACODE_GIT_HELPER_BIN;
      process.env.PORACODE_DISABLE_GIT_HELPER = "1";
      expect(nativeGitHelperBinaryPath()).toBeUndefined();
      expect(native).toEqual(await new GitStatusService().getStatus(localLocation(root)));
      expect(readFileSync(join(root, ".git", "config"), "utf8")).toBe(before);
    },
  );

  it.each([false, true])(
    "keeps ./%%(prefix)/ include paths literal (hasconfig=%s)",
    async (hasconfig) => {
      const bin = nativeGitHelperBinaryPath();
      if (!bin) {
        if (initialHelperBinEnv !== undefined) throw new Error("Expected native helper");
        return;
      }
      const root = makeTempDir("poracode-native-config-literal-prefix-");
      runGit(root, ["init", "-b", "main"]);
      if (hasconfig) {
        runGit(root, ["remote", "add", "origin", "https://example.test/prefix.git"]);
        runGit(root, [
          "config",
          "includeIf.hasconfig:remote.*.url:https://example.test/**.path",
          "missing.config",
        ]);
      }
      mkdirSync(join(root, ".git", "%(prefix)"));
      const selected = join(root, ".git", "%(prefix)", "selected.config");
      writeFileSync(selected, '[core]\nsshCommand=""\n[status]\nshowUntrackedFiles=no\n');
      runGit(root, ["config", "include.path", "./%(prefix)/selected.config"]);
      writeFileSync(join(root, "hidden.txt"), "hidden\n");
      const before = readFileSync(selected, "utf8");
      const raw = await queryNativeGitStatusBatch({
        paths: [root],
        detail: "full",
        timeoutMs: 10_000,
        maxConcurrency: 1,
      });
      expect(raw?.[root]?.hasSshOverrides).toBe(true);
      expect(raw?.[root]?.unstaged).toEqual([]);
      const native = await new GitStatusService().getStatus(localLocation(root));
      delete process.env.PORACODE_GIT_HELPER_BIN;
      process.env.PORACODE_DISABLE_GIT_HELPER = "1";
      expect(nativeGitHelperBinaryPath()).toBeUndefined();
      expect(native).toEqual(await new GitStatusService().getStatus(localLocation(root)));
      expect(readFileSync(selected, "utf8")).toBe(before);
    },
  );

  it("resolves applicable global hasconfig includes natively without rewriting config", async () => {
    const bin = nativeGitHelperBinaryPath();
    if (!bin) {
      if (initialHelperBinEnv !== undefined) throw new Error("Expected native helper");
      return;
    }
    const root = makeTempDir("poracode-native-hasconfig-");
    runGit(root, ["init", "-b", "main"]);
    runGit(root, ["remote", "add", "origin", "git@github.com-work:poracode/status.git"]);
    const include = join(makeTempDir("poracode-native-hasconfig-include-"), "included.config");
    writeFileSync(include, "[ssh]\n\tvariant = plink\n[status]\n\tshowUntrackedFiles = no\n");
    writeFileSync(join(root, "hidden.txt"), "hidden by selected config\n");
    const global = join(makeTempDir("poracode-native-hasconfig-global-"), "config");
    writeFileSync(
      global,
      `[includeIf "hasconfig:remote.*.url:git@github.com-work:poracode/status.git"]\n\tpath = ${include.replaceAll("\\", "/")}\n`,
    );
    process.env.GIT_CONFIG_GLOBAL = global;
    expect(
      execFileSync("git", ["config", "--get", "ssh.variant"], {
        cwd: root,
        encoding: "utf8",
        windowsHide: true,
      }).trim(),
    ).toBe("plink");
    disposeNativeGitHelper();
    const before = [global, include, join(root, ".git", "config")].map((path) =>
      readFileSync(path, "utf8"),
    );
    const raw = await queryNativeGitStatusBatch({
      paths: [root],
      detail: "full",
      timeoutMs: 10_000,
      maxConcurrency: 1,
    });
    expect(raw?.[root]?.hasSshOverrides).toBe(true);
    expect(raw?.[root]?.unstaged).toEqual([]);
    const service = new GitStatusService();
    expect(
      (await service.getWorktreeStatusBatchNative(localLocation(root), [root], "full"))?.[root]
        ?.isRepo,
    ).toBe(true);
    expect((await service.getStatus(localLocation(root))).remoteInfo?.url).toBe(
      "git@github.com-work:poracode/status.git",
    );
    expect(
      [global, include, join(root, ".git", "config")].map((path) => readFileSync(path, "utf8")),
    ).toEqual(before);
    runGit(root, ["config", "status.showUntrackedFiles", "all"]);
    const higherPriority = await queryNativeGitStatusBatch({
      paths: [root],
      detail: "full",
      timeoutMs: 10_000,
      maxConcurrency: 1,
    });
    expect(higherPriority?.[root]?.unstaged.map((file) => file.path)).toEqual(["hidden.txt"]);
    const native = await new GitStatusService().getStatus(localLocation(root));
    delete process.env.PORACODE_GIT_HELPER_BIN;
    process.env.PORACODE_DISABLE_GIT_HELPER = "1";
    expect(nativeGitHelperBinaryPath()).toBeUndefined();
    expect(native).toEqual(await new GitStatusService().getStatus(localLocation(root)));
  });

  it.each([true, false])(
    "rejects forbidden remote URLs beneath hasconfig includes like Git (selected=%s)",
    async (selectedCondition) => {
      const bin = nativeGitHelperBinaryPath();
      if (!bin) {
        if (initialHelperBinEnv !== undefined) throw new Error("Expected native helper");
        return;
      }
      const root = makeTempDir("poracode-native-forbidden-include-");
      runGit(root, ["init", "-b", "main"]);
      runGit(root, [
        "remote",
        "add",
        "origin",
        selectedCondition ? "https://example.test/org/repo" : "https://unmatched.test/repo",
      ]);
      const configRoot = makeTempDir("poracode-native-forbidden-global-");
      const global = join(configRoot, "global");
      const selected = join(configRoot, "selected");
      const nested = join(configRoot, "nested");
      writeFileSync(
        global,
        '[includeIf "hasconfig:remote.*.url:https://example.test/**"]\npath=selected\n',
      );
      writeFileSync(selected, "[include]\npath=nested\n");
      writeFileSync(nested, '[remote "forbidden"]\nurl=https://other.test/repo\n');
      process.env.GIT_CONFIG_GLOBAL = global;
      const before = [global, selected, nested].map((path) => readFileSync(path, "utf8"));
      expect(() =>
        execFileSync("git", ["config", "--get", "remote.origin.url"], {
          cwd: root,
          stdio: "ignore",
          windowsHide: true,
        }),
      ).toThrow(/git config/);
      disposeNativeGitHelper();
      expect(
        await queryNativeGitStatusBatch({
          paths: [root],
          detail: "full",
          timeoutMs: 10_000,
          maxConcurrency: 1,
        }),
      ).toBeNull();
      expect([global, selected, nested].map((path) => readFileSync(path, "utf8"))).toEqual(before);
    },
  );

  it("keeps inherited-upstream repair local with resolved hasconfig and linked worktree config", async () => {
    const bin = nativeGitHelperBinaryPath();
    if (!bin) {
      if (initialHelperBinEnv !== undefined) throw new Error("Expected native helper");
      return;
    }
    const root = makeTempDir("poracode-native-config-repair-");
    const main = join(root, "main");
    const linked = join(root, "linked");
    mkdirSync(main);
    runGit(main, ["init", "-b", "main"]);
    runGit(main, ["config", "user.email", "test@poracode.dev"]);
    runGit(main, ["config", "user.name", "Test"]);
    writeFileSync(join(main, "base.txt"), "base\n");
    runGit(main, ["add", "."]);
    runGit(main, ["commit", "-m", "base"]);
    runGit(main, ["remote", "add", "origin", "https://example.test/org/repo"]);
    runGit(main, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
    runGit(main, ["worktree", "add", "-b", "feature", linked]);
    runGit(linked, ["branch", "--set-upstream-to=origin/main", "feature"]);
    runGit(linked, ["config", "branch.feature.poracodeSource", "origin/main"]);
    runGit(main, ["config", "extensions.worktreeConfig", "true"]);
    const worktreeConfig = execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-path", "config.worktree"],
      { cwd: linked, encoding: "utf8", windowsHide: true },
    ).trim();
    writeFileSync(worktreeConfig, "[status]\nshowUntrackedFiles=no\n");
    writeFileSync(join(linked, "hidden.txt"), "hidden\n");
    const global = join(root, "global.config");
    const include = join(root, "selected.config");
    writeFileSync(
      global,
      '[includeIf "hasconfig:remote.*.url:https://example.test/**"]\npath=selected.config\n',
    );
    writeFileSync(include, "[test]\nsource=kept\n");
    process.env.GIT_CONFIG_GLOBAL = global;
    const unchanged = [global, include, worktreeConfig].map((path) => readFileSync(path, "utf8"));
    disposeNativeGitHelper();
    const raw = await queryNativeGitStatusBatch({
      paths: [linked],
      detail: "full",
      timeoutMs: 10_000,
      maxConcurrency: 1,
    });
    expect(raw?.[linked]).toMatchObject({
      isRepo: true,
      branch: "feature",
      tracking: "",
      ahead: 0,
      behind: 0,
      unstaged: [],
    });
    expect(() =>
      execFileSync("git", ["config", "--local", "--get", "branch.feature.remote"], {
        cwd: linked,
        stdio: "ignore",
        windowsHide: true,
      }),
    ).toThrow(/git config/);
    expect(
      execFileSync("git", ["config", "--get", "branch.feature.poracodeSource"], {
        cwd: linked,
        encoding: "utf8",
        windowsHide: true,
      }).trim(),
    ).toBe("origin/main");
    expect([global, include, worktreeConfig].map((path) => readFileSync(path, "utf8"))).toEqual(
      unchanged,
    );
  });

  it("preserves GitProcessAdmissionError refusals on native batch calls", async () => {
    const bin = nativeGitHelperBinaryPath();
    if (!bin) {
      process.env.PORACODE_GIT_HELPER_BIN = process.execPath;
    }
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
    if (!bin) {
      if (initialHelperBinEnv !== undefined) {
        throw new Error(`Expected PORACODE_GIT_HELPER_BIN to resolve, got: ${initialHelperBinEnv}`);
      }
      return;
    }

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
    delete process.env.PORACODE_GIT_HELPER_BIN;
    process.env.PORACODE_DISABLE_GIT_HELPER = "1";
    expect(nativeGitHelperBinaryPath()).toBeUndefined();
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
    process.env.PORACODE_GIT_HELPER_BIN = bin;
    delete process.env.PORACODE_DISABLE_GIT_HELPER;
    expect(nativeGitHelperBinaryPath()).toBe(bin);
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

  it("matches full Unicode folding and contextual lowercase in native and TypeScript searches", async () => {
    const bin = nativeGitHelperBinaryPath();
    if (!bin) {
      if (initialHelperBinEnv !== undefined) {
        throw new Error(`Expected PORACODE_GIT_HELPER_BIN to resolve, got: ${initialHelperBinEnv}`);
      }
      return;
    }

    const root = makeTempDir("poracode-unicode-parity-");
    const cases = [
      { name: "ḃeta.ts", query: "beta" },
      { name: "가.ts", query: "\u1100\u1161" },
      { name: "क\u093e.ts", query: "क.ts" },
      { name: "ΟΣ.ts", query: "οσ.ts" },
      { name: "ΟΣΑ.ts", query: "οσα.ts" },
      { name: "ΟΣ-Α.ts", query: "ος-α.ts" },
      { name: "İstanbul.ts", query: "istanbul" },
      { name: "đelta.ts", query: "đelta" },
    ];
    for (const { name } of cases) writeFileSync(join(root, name), "test\n");

    const nativeResults = [];
    for (const { query } of cases) {
      nativeResults.push(
        await queryNativeSearchTree({
          rootPath: root,
          query,
          limit: 10,
          entryType: "file",
          useIgnoreFiles: false,
          excludePatterns: [],
          timeoutMs: 1_000,
        }),
      );
    }

    delete process.env.PORACODE_GIT_HELPER_BIN;
    process.env.PORACODE_DISABLE_GIT_HELPER = "1";
    expect(nativeGitHelperBinaryPath()).toBeUndefined();
    const tree = new ProjectSearchIndex(resolveProjectEntryPath);
    for (const [index, { name, query }] of cases.entries()) {
      const fallback = await tree.searchProjectTree({
        projectLocation: localLocation(root),
        query,
        limit: 10,
        entryType: "file",
        searchConfig: { useIgnoreFiles: false, excludePatterns: [] },
      });
      expect(nativeResults[index]).toEqual(fallback.entries);
      expect(fallback.entries.map((entry) => entry.path)).toContain(name);
    }
  });

  it("preserves negated exclusion behavior in both search services", async () => {
    const root = makeTempDir("poracode-negated-exclude-");
    runGit(root, ["init", "-b", "main"]);
    writeFileSync(join(root, "foo.ts"), "test\n");
    writeFileSync(join(root, "foo.md"), "test\n");
    const payload = {
      projectLocation: localLocation(root),
      query: "foo",
      limit: 10,
      searchConfig: { useIgnoreFiles: true, excludePatterns: ["!**/*.md"] },
    };
    const tree = await new ProjectSearchIndex(resolveProjectEntryPath).searchProjectTree(payload);
    const files = await new FileIndexService().searchProjectFiles(payload);

    delete process.env.PORACODE_GIT_HELPER_BIN;
    process.env.PORACODE_DISABLE_GIT_HELPER = "1";
    expect(nativeGitHelperBinaryPath()).toBeUndefined();
    expect(tree).toEqual(
      await new ProjectSearchIndex(resolveProjectEntryPath).searchProjectTree(payload),
    );
    expect(files).toEqual(await new FileIndexService().searchProjectFiles(payload));
    expect(tree.entries.some((entry) => entry.path === "foo.ts")).toBe(false);
    expect(files.entries.some((entry) => entry.path === "foo.ts")).toBe(false);
  });

  it("lists file and directory symlinks as files without traversing their targets", async () => {
    const bin = nativeGitHelperBinaryPath();
    if (!bin) {
      if (initialHelperBinEnv !== undefined) {
        throw new Error(`Expected PORACODE_GIT_HELPER_BIN to resolve, got: ${initialHelperBinEnv}`);
      }
      return;
    }

    const root = makeTempDir("poracode-symlink-parity-");
    const outside = makeTempDir("poracode-symlink-target-");
    writeFileSync(join(root, "target.txt"), "test\n");
    writeFileSync(join(outside, "linked-nested.txt"), "outside\n");
    symlinkSync(join(root, "target.txt"), join(root, "linked-file.txt"), "file");
    symlinkSync(join(root, "missing.txt"), join(root, "linked-missing.txt"), "file");
    symlinkSync(
      outside,
      join(root, "linked-directory"),
      process.platform === "win32" ? "junction" : "dir",
    );

    const native = await queryNativeSearchTree({
      rootPath: root,
      query: "linked",
      limit: 10,
      useIgnoreFiles: false,
      excludePatterns: [],
      timeoutMs: 1_000,
    });
    delete process.env.PORACODE_GIT_HELPER_BIN;
    process.env.PORACODE_DISABLE_GIT_HELPER = "1";
    expect(nativeGitHelperBinaryPath()).toBeUndefined();
    const fallback = await new ProjectSearchIndex(resolveProjectEntryPath).searchProjectTree({
      projectLocation: localLocation(root),
      query: "linked",
      limit: 10,
      searchConfig: { useIgnoreFiles: false, excludePatterns: [] },
    });
    expect(native).toEqual(fallback.entries);
    expect(fallback.entries.map((entry) => [entry.path, entry.type]).sort()).toEqual([
      ["linked-directory", "file"],
      ["linked-file.txt", "file"],
      ["linked-missing.txt", "file"],
    ]);
  });
});
