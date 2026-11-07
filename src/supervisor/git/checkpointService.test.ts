import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { GitCheckpointService } from "./checkpointService";
import { execGit } from "./exec";
import { GitProcessAdmissionError } from "./gitProcessAdmission";

// Pass-through spy so a test can count the git processes a service call spawns.
vi.mock("./exec", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./exec")>();
  return { ...actual, execGit: vi.fn<typeof actual.execGit>(actual.execGit) };
});

function hasGit(): boolean {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const tempDirs: string[] = [];

beforeEach(() => {
  // Git's environment identity overrides repository config. Each fixture must
  // exercise its own configured or missing identity, not the test runner's.
  for (const key of [
    "GIT_AUTHOR_NAME",
    "GIT_AUTHOR_EMAIL",
    "GIT_COMMITTER_NAME",
    "GIT_COMMITTER_EMAIL",
    "EMAIL",
  ]) {
    vi.stubEnv(key, undefined);
  }
});

afterEach(async () => {
  vi.unstubAllEnvs();
  for (const dir of tempDirs.splice(0)) {
    try {
      await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Windows can briefly lock temp git repos while subprocesses exit.
    }
  }
});

function makeRepo(): { dir: string; location: ProjectLocation } {
  const dir = mkdtempSync(join(tmpdir(), "poracode-checkpoints-"));
  tempDirs.push(dir);
  git(dir, "init");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Poracode Test");
  git(dir, "config", "core.autocrlf", "false");
  writeFileSync(join(dir, "README.md"), "before\n");
  git(dir, "add", "README.md");
  git(dir, "commit", "-m", "init");
  const location: ProjectLocation =
    process.platform === "win32" ? { kind: "windows", path: dir } : { kind: "posix", path: dir };
  return { dir, location };
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

/**
 * Hide the developer's own global/system git identity so the repository really
 * has none, mirroring a fresh machine. Returns a restore callback.
 */
function hideGitIdentityConfig(dir: string): () => void {
  const previous = {
    GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL,
    GIT_CONFIG_SYSTEM: process.env.GIT_CONFIG_SYSTEM,
    GIT_CONFIG_NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM,
  };
  process.env.GIT_CONFIG_GLOBAL = join(dir, "absent-global-config");
  process.env.GIT_CONFIG_SYSTEM = join(dir, "absent-system-config");
  process.env.GIT_CONFIG_NOSYSTEM = "1";
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

describe.skipIf(!hasGit())("GitCheckpointService", () => {
  it("captures turn snapshots and restores tracked plus untracked files", async () => {
    const { dir, location } = makeRepo();
    const service = new GitCheckpointService();

    const before = await service.create({
      threadId: "thread-1",
      checkpointItemId: "user-1",
      projectLocation: location,
    });

    writeFileSync(join(dir, "README.md"), "after\n");
    writeFileSync(join(dir, "new.txt"), "new\n");

    const after = await service.finalize({
      threadId: "thread-1",
      checkpointItemId: "assistant-1",
      baseCheckpointItemId: "user-1",
      projectLocation: location,
    });

    expect(after.baseRef).toBe(before.ref);
    expect(after.changedFiles.map((file) => file.path).sort()).toEqual(["README.md", "new.txt"]);
    expect(git(dir, "log", "-1", "--format=%an <%ae>", before.ref).trim()).toBe(
      "Poracode Test <test@example.com>",
    );

    await service.restore({
      threadId: "thread-1",
      checkpointItemId: "user-1",
      projectLocation: location,
    });

    expect(readFileSync(join(dir, "README.md"), "utf8")).toBe("before\n");
    expect(existsSync(join(dir, "new.txt"))).toBe(false);
    expect(git(dir, "status", "--porcelain").trim()).toBe("");

    await service.restore({
      threadId: "thread-1",
      checkpointItemId: "assistant-1",
      projectLocation: location,
    });

    expect(readFileSync(join(dir, "README.md"), "utf8")).toBe("after\n");
    expect(readFileSync(join(dir, "new.txt"), "utf8")).toBe("new\n");
    expect(git(dir, "status", "--porcelain").split(/\r?\n/).filter(Boolean).sort()).toEqual([
      " M README.md",
      "?? new.txt",
    ]);
  }, 45_000);

  it("snapshots a repository that has no configured git identity", async () => {
    const { dir, location } = makeRepo();
    // Simulate a machine with no user.name/user.email anywhere: dropping the
    // local values plus `user.useConfigOnly` makes git refuse to auto-detect,
    // which is exactly the "Author identity unknown" failure reported in the wild.
    git(dir, "config", "--unset", "user.email");
    git(dir, "config", "--unset", "user.name");
    git(dir, "config", "user.useConfigOnly", "true");
    const service = new GitCheckpointService();
    const restoreEnv = hideGitIdentityConfig(dir);

    try {
      writeFileSync(join(dir, "new.txt"), "new\n");
      const checkpoint = await service.create({
        threadId: "thread-1",
        checkpointItemId: "user-1",
        projectLocation: location,
      });

      expect(git(dir, "log", "-1", "--format=%an <%ae>", checkpoint.ref).trim()).toBe(
        "Poracode <checkpoints@poracode.local>",
      );
      await expect(
        service.list({ threadId: "thread-1", projectLocation: location }),
      ).resolves.toMatchObject({ checkpoints: [{ ref: checkpoint.ref }] });
    } finally {
      restoreEnv();
    }
  }, 45_000);

  it("reports a missing base checkpoint without surfacing raw git ref errors", async () => {
    const { location } = makeRepo();
    const service = new GitCheckpointService();

    await expect(
      service.finalize({
        threadId: "thread-1",
        checkpointItemId: "assistant-1",
        baseCheckpointItemId: "user-1",
        projectLocation: location,
      }),
    ).rejects.toThrow("No file checkpoint exists for item user-1.");
  });

  it("reads and restores checkpoints created under the legacy ref namespace", async () => {
    const { dir, location } = makeRepo();
    const service = new GitCheckpointService();
    const checkpoint = await service.create({
      threadId: "thread-1",
      checkpointItemId: "user-1",
      projectLocation: location,
    });
    const legacyRef = checkpoint.ref.replace("refs/poracode/", "refs/lightcode/");
    git(dir, "update-ref", legacyRef, checkpoint.commit);
    git(dir, "update-ref", "-d", checkpoint.ref);

    writeFileSync(join(dir, "README.md"), "after\n");
    await service.restore({
      threadId: "thread-1",
      checkpointItemId: "user-1",
      projectLocation: location,
    });

    expect(readFileSync(join(dir, "README.md"), "utf8")).toBe("before\n");
    await expect(
      service.list({ threadId: "thread-1", projectLocation: location }),
    ).resolves.toMatchObject({ checkpoints: [{ ref: legacyRef }] });
  });

  describe("list", () => {
    async function createCheckpoints(
      service: GitCheckpointService,
      location: ProjectLocation,
      threadId: string,
      count: number,
    ) {
      const created = [];
      for (let index = 0; index < count; index += 1) {
        created.push(
          await service.create({
            threadId,
            checkpointItemId: `${threadId}-item-${index}`,
            projectLocation: location,
          }),
        );
      }
      return created;
    }

    it("reads every checkpoint of a thread with a single git process", async () => {
      const { dir, location } = makeRepo();
      const service = new GitCheckpointService();
      const mine = await createCheckpoints(service, location, "thread-1", 5);
      await createCheckpoints(service, location, "thread-2", 2);

      vi.mocked(execGit).mockClear();
      const listed = await service.list({ threadId: "thread-1", projectLocation: location });

      expect(execGit).toHaveBeenCalledTimes(1);
      expect(vi.mocked(execGit).mock.calls[0]![1][0]).toBe("for-each-ref");
      expect(listed.checkpoints.map((checkpoint) => checkpoint.checkpointItemId).sort()).toEqual(
        mine.map((checkpoint) => checkpoint.checkpointItemId).sort(),
      );
      for (const checkpoint of listed.checkpoints) {
        // The batched read must report what per-ref reads report.
        expect(checkpoint.commit).toBe(git(dir, "rev-parse", checkpoint.ref).trim());
        expect(checkpoint.threadId).toBe("thread-1");
        expect(checkpoint.capturedAt).toBe(mine.find((c) => c.ref === checkpoint.ref)!.capturedAt);
      }
    });

    it("falls back to reading ref by ref when the batched output is not whole records", async () => {
      const { location } = makeRepo();
      const service = new GitCheckpointService();
      const mine = await createCheckpoints(service, location, "thread-1", 3);

      vi.mocked(execGit).mockClear();
      vi.mocked(execGit).mockResolvedValueOnce("not a record list");
      const listed = await service.list({ threadId: "thread-1", projectLocation: location });

      expect(listed.checkpoints.map((checkpoint) => checkpoint.ref).sort()).toEqual(
        mine.map((checkpoint) => checkpoint.ref).sort(),
      );
      // The malformed batch, the name listing, then two reads per ref.
      expect(vi.mocked(execGit).mock.calls.length).toBe(2 + 2 * mine.length);
    });

    it("falls back to reading ref by ref when the batched read itself fails", async () => {
      const { location } = makeRepo();
      const service = new GitCheckpointService();
      const mine = await createCheckpoints(service, location, "thread-1", 2);

      vi.mocked(execGit).mockClear();
      vi.mocked(execGit).mockRejectedValueOnce(new Error("stdout maxBuffer length exceeded"));
      const listed = await service.list({ threadId: "thread-1", projectLocation: location });

      expect(listed.checkpoints.map((checkpoint) => checkpoint.ref).sort()).toEqual(
        mine.map((checkpoint) => checkpoint.ref).sort(),
      );
    });

    it("rethrows an admission refusal instead of spawning more git processes", async () => {
      const { location } = makeRepo();
      const service = new GitCheckpointService();
      await createCheckpoints(service, location, "thread-1", 2);

      vi.mocked(execGit).mockClear();
      vi.mocked(execGit).mockRejectedValueOnce(
        new GitProcessAdmissionError(
          "git_admission_queue_full",
          {} as never,
          "git admission queue is full",
        ),
      );

      await expect(
        service.list({ threadId: "thread-1", projectLocation: location }),
      ).rejects.toBeInstanceOf(GitProcessAdmissionError);
      expect(execGit).toHaveBeenCalledTimes(1);
    });

    it("lists a ref that points at an annotated tag of a checkpoint through the per-ref read", async () => {
      const { dir, location } = makeRepo();
      const service = new GitCheckpointService();
      const [checkpoint] = await createCheckpoints(service, location, "thread-1", 1);
      git(dir, "tag", "-a", "-m", "wrap", "wrapper", checkpoint!.commit);
      git(dir, "update-ref", checkpoint!.ref, git(dir, "rev-parse", "wrapper").trim());

      const listed = await service.list({ threadId: "thread-1", projectLocation: location });

      // A tag object is not a commit: it is peeled exactly as before.
      expect(listed.checkpoints).toMatchObject([
        { ref: checkpoint!.ref, commit: checkpoint!.commit, threadId: "thread-1" },
      ]);
    });

    it("lists turn checkpoints with their base and changed files", async () => {
      const { dir, location } = makeRepo();
      const service = new GitCheckpointService();
      await service.create({
        threadId: "thread-1",
        checkpointItemId: "user-1",
        projectLocation: location,
      });
      writeFileSync(join(dir, "README.md"), "after\n");
      const turn = await service.finalize({
        threadId: "thread-1",
        checkpointItemId: "assistant-1",
        baseCheckpointItemId: "user-1",
        projectLocation: location,
      });

      const listed = await service.list({ threadId: "thread-1", projectLocation: location });

      expect(listed.turns).toHaveLength(1);
      expect(listed.turns[0]).toEqual(turn);
      expect(listed.checkpoints.map((checkpoint) => checkpoint.checkpointItemId).sort()).toEqual([
        "assistant-1",
        "user-1",
      ]);
    });

    it("returns nothing for a thread without checkpoints", async () => {
      const { location } = makeRepo();
      const service = new GitCheckpointService();
      await createCheckpoints(service, location, "thread-1", 1);

      await expect(
        service.list({ threadId: "thread-without", projectLocation: location }),
      ).resolves.toEqual({ checkpoints: [], turns: [] });
    });
  });
});
