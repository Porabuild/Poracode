import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import type {
  WslBridgeClient,
  WslGitExecResult,
  WslLocation,
} from "@/supervisor/wsl/bridge/client";
import {
  admitGitProcess,
  configureGitProcessAdmission,
  GitProcessAdmissionError,
  GIT_ADMISSION_CANCELLED_CODE,
  GIT_ADMISSION_QUEUE_FULL_CODE,
  GIT_ADMISSION_WAIT_TIMEOUT_CODE,
  GIT_PROCESS_ADMISSION_DEFAULT_POLICY,
  gitProcessAdmissionUsage,
  resetGitProcessAdmissionForTests,
} from "./gitProcessAdmission";
import { execGit, execGitBatchWslBridge, setWslGitBridgeClient } from "./exec";
import { GitStatusService } from "./statusService";

const wslLocation: ProjectLocation & { kind: "wsl" } = {
  kind: "wsl",
  distro: "Ubuntu-22.04",
  uncPath: "\\\\wsl.localhost\\Ubuntu-22.04\\repo",
  linuxPath: "/home/u/repo",
};

const posixRepoLocation: ProjectLocation = { kind: "posix", path: process.cwd() };

interface GateBridgeRecorder {
  gitExecStarted: string[];
  batchStarted: number;
  gitExecInFlight: number;
  maxGitExecInFlight: number;
}

interface GatedBridge {
  client: WslBridgeClient;
  release: () => void;
}

/**
 * Bridge fake whose git calls block on a manual gate: admission must happen
 * before `client.gitExec`/`client.gitBatch` is invoked, so start order and
 * in-flight counts are exact observations of the scheduler.
 */
function makeGatedBridge(recorder: GateBridgeRecorder): GatedBridge {
  let releaseGate!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseGate = resolve;
  });
  return {
    client: {
      gitExec: (_location: WslLocation, input: { args: string[] }) => {
        recorder.gitExecStarted.push(input.args.join(" "));
        recorder.gitExecInFlight += 1;
        recorder.maxGitExecInFlight = Math.max(
          recorder.maxGitExecInFlight,
          recorder.gitExecInFlight,
        );
        return gate.then(() => {
          recorder.gitExecInFlight -= 1;
          return { ok: true, stdout: "", stderr: "", exitCode: 0 } satisfies WslGitExecResult;
        });
      },
      gitBatch: (_location: WslLocation, input: { commands: { args: string[] }[] }) => {
        recorder.batchStarted += 1;
        return gate.then(() => ({
          results: input.commands.map(
            () => ({ ok: true, stdout: "", stderr: "", exitCode: 0 }) satisfies WslGitExecResult,
          ),
        }));
      },
    } as unknown as WslBridgeClient,
    release: releaseGate,
  };
}

function emptyRecorder(): GateBridgeRecorder {
  return { gitExecStarted: [], batchStarted: 0, gitExecInFlight: 0, maxGitExecInFlight: 0 };
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe("execGit admission (WSL single path)", () => {
  it("caps concurrent subprocess starts at the short limit and releases on completion", async () => {
    const recorder = emptyRecorder();
    const { client, release } = makeGatedBridge(recorder);
    setWslGitBridgeClient(client);
    const runs = Array.from({ length: 12 }, () =>
      execGit(wslLocation, ["status", "--porcelain=v2", "-b"]),
    );
    await settle();

    // 8 admitted, 4 queued, none lost.
    expect(recorder.gitExecStarted).toHaveLength(8);
    expect(gitProcessAdmissionUsage().short).toMatchObject({
      active: 8,
      queued: 4,
      maxActive: 8,
    });

    release();
    await Promise.all(runs);

    expect(recorder.gitExecStarted).toHaveLength(12);
    expect(recorder.maxGitExecInFlight).toBe(8);
    expect(gitProcessAdmissionUsage().short).toMatchObject({ active: 0, queued: 0, maxActive: 8 });
    expect(gitProcessAdmissionUsage().admitted).toBe(12);
  });

  it("honors queued cancellation before spawn", async () => {
    const recorder = emptyRecorder();
    const { client, release } = makeGatedBridge(recorder);
    setWslGitBridgeClient(client);
    configureGitProcessAdmission({ shortPermits: 1 });
    const holder = execGit(wslLocation, ["status", "--porcelain=v2", "-b"]);
    await settle();

    const controller = new AbortController();
    const queued = execGit(wslLocation, ["status", "--porcelain=v2", "-b"], {
      signal: controller.signal,
    });
    await settle();
    expect(recorder.gitExecStarted).toHaveLength(1);

    controller.abort();
    await expect(queued).rejects.toMatchObject({ code: GIT_ADMISSION_CANCELLED_CODE });
    // Cancelled before spawn: the bridge never saw the command.
    expect(recorder.gitExecStarted).toHaveLength(1);
    expect(gitProcessAdmissionUsage().cancellations).toBe(1);

    release();
    await holder;
    expect(gitProcessAdmissionUsage().short.active).toBe(0);
  });

  it("fails queued work on a bounded admission deadline, distinct from Git failures", async () => {
    const recorder = emptyRecorder();
    const { client, release } = makeGatedBridge(recorder);
    setWslGitBridgeClient(client);
    configureGitProcessAdmission({ shortPermits: 1, admissionWaitTimeoutMs: 80 });
    const holder = execGit(wslLocation, ["status", "--porcelain=v2", "-b"]);
    await settle();

    const timedOut = execGit(wslLocation, ["status", "--porcelain=v2", "-b"]);
    const error = await timedOut.then(
      () => {
        throw new Error("expected admission timeout");
      },
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(GitProcessAdmissionError);
    const admissionError = error as GitProcessAdmissionError;
    expect(admissionError.code).toBe(GIT_ADMISSION_WAIT_TIMEOUT_CODE);
    // No Git-shaped fields: overload must stay distinguishable from a Git
    // failure such as "not a Git repository".
    expect((admissionError as { stdout?: unknown }).stdout).toBeUndefined();
    expect((admissionError as { stderr?: unknown }).stderr).toBeUndefined();
    expect(admissionError.message).toContain("admission");
    expect(gitProcessAdmissionUsage().waitTimeoutRefusals).toBe(1);

    release();
    await holder;
    expect(gitProcessAdmissionUsage().short.active).toBe(0);
  });

  it("refuses with a typed overflow error when the queue is full", async () => {
    const recorder = emptyRecorder();
    const { client, release } = makeGatedBridge(recorder);
    setWslGitBridgeClient(client);
    configureGitProcessAdmission({ shortPermits: 1, maxQueuedEntries: 1 });
    const holder = execGit(wslLocation, ["status", "--porcelain=v2", "-b"]);
    const queuedBehind = execGit(wslLocation, ["status", "--porcelain=v2", "-b"]);
    await settle();
    await expect(execGit(wslLocation, ["status", "--porcelain=v2", "-b"])).rejects.toMatchObject({
      code: GIT_ADMISSION_QUEUE_FULL_CODE,
    });

    release();
    await holder;
    await queuedBehind;
    expect(gitProcessAdmissionUsage().short.active).toBe(0);
  });
});

describe("execGitBatchWslBridge admission", () => {
  it("weights a batch by its command count so batches cannot multiply the allowance", async () => {
    const recorder = emptyRecorder();
    const { client, release } = makeGatedBridge(recorder);
    setWslGitBridgeClient(client);
    const batchCommands = (
      [
        ["rev-parse", "--is-inside-work-tree"],
        ["status", "--porcelain=v2", "-b"],
        ["remote", "-v"],
        ["diff", "--cached", "--numstat"],
        ["diff", "--numstat"],
        ["branch", "--format=x"],
        ["worktree", "list", "--porcelain"],
      ] as const
    ).map((args) => ({ cwd: wslLocation.linuxPath, args: [...args] }));

    const batch = execGitBatchWslBridge(wslLocation, batchCommands, 10_000);
    const singles = Array.from({ length: 3 }, () =>
      execGit(wslLocation, ["status", "--porcelain=v2", "-b"]),
    );
    await settle();

    // Batch occupies 7 of 8 short permits, one single takes the last slot,
    // two singles queue: concurrent batches cannot multiply the allowance.
    expect(recorder.batchStarted).toBe(1);
    expect(recorder.gitExecStarted).toHaveLength(1);
    expect(gitProcessAdmissionUsage().short).toMatchObject({ active: 8, queued: 2 });

    release();
    const results = await batch;
    await Promise.all(singles);

    expect(results).toHaveLength(7);
    expect(gitProcessAdmissionUsage().short).toMatchObject({ active: 0, queued: 0, maxActive: 8 });
  });

  it("routes long commands into the separate long pool", async () => {
    const recorder = emptyRecorder();
    const { client, release } = makeGatedBridge(recorder);
    setWslGitBridgeClient(client);
    configureGitProcessAdmission({ longPermits: 3 });

    const longHolder = execGit(wslLocation, ["push", "origin", "HEAD"]);
    await settle();
    expect(gitProcessAdmissionUsage().long.active).toBe(1);

    const longBatch = execGitBatchWslBridge(
      wslLocation,
      [
        { cwd: wslLocation.linuxPath, args: ["push", "--porcelain"] },
        { cwd: wslLocation.linuxPath, args: ["push", "--porcelain"] },
      ],
      10_000,
    );
    await settle();
    // Two-command long batch admitted into the long pool: 1 + 2 = 3.
    expect(gitProcessAdmissionUsage().long.active).toBe(3);
    expect(recorder.batchStarted).toBe(1);

    release();
    await Promise.all([longHolder, longBatch]);
    expect(gitProcessAdmissionUsage().long.active).toBe(0);
  });

  it("splits mixed-class work into satisfiable same-class chunks", async () => {
    const batchSizes: number[] = [];
    setWslGitBridgeClient({
      gitBatch: (_location: WslLocation, input: { commands: unknown[] }) => {
        batchSizes.push(input.commands.length);
        return Promise.resolve({
          results: input.commands.map(
            () => ({ ok: true, stdout: "", stderr: "", exitCode: 0 }) satisfies WslGitExecResult,
          ),
        });
      },
    } as unknown as WslBridgeClient);
    configureGitProcessAdmission({ longPermits: 1 });
    const results = await execGitBatchWslBridge(
      wslLocation,
      [
        { cwd: wslLocation.linuxPath, args: ["status"] },
        { cwd: wslLocation.linuxPath, args: ["fetch", "origin"] },
        { cwd: wslLocation.linuxPath, args: ["push", "origin", "HEAD"] },
      ],
      10_000,
    );
    expect(results).toHaveLength(3);
    expect(batchSizes).toEqual([1, 1, 1]);
  });

  it("chunks an unbounded worktree-style batch at the active class limit", async () => {
    const batchSizes: number[] = [];
    setWslGitBridgeClient({
      gitBatch: (_location: WslLocation, input: { commands: unknown[] }) => {
        batchSizes.push(input.commands.length);
        return Promise.resolve({
          results: input.commands.map(
            () => ({ ok: true, stdout: "", stderr: "", exitCode: 0 }) satisfies WslGitExecResult,
          ),
        });
      },
    } as unknown as WslBridgeClient);
    const commands = Array.from({ length: 15 }, (_, index) => ({
      cwd: wslLocation.linuxPath,
      args: ["status", `--slot=${index}`],
    }));
    const results = await execGitBatchWslBridge(wslLocation, commands, 10_000);
    expect(results).toHaveLength(15);
    expect(batchSizes).toEqual([8, 7]);
    expect(gitProcessAdmissionUsage().short.maxActive).toBe(8);
  });

  it("keeps multi-worktree WSL status functional across batch chunks", async () => {
    const batchSizes: number[] = [];
    setWslGitBridgeClient({
      gitBatch: (_location: WslLocation, input: { commands: { args: string[] }[] }) => {
        batchSizes.push(input.commands.length);
        return Promise.resolve({
          results: input.commands.map((command) => ({
            ok: !command.args.includes("rev-parse"),
            stdout: "",
            stderr: "",
            exitCode: command.args.includes("rev-parse") ? 128 : 0,
          })),
        });
      },
    } as unknown as WslBridgeClient);
    const service = new GitStatusService();
    const paths = ["/repo/.worktrees/a", "/repo/.worktrees/b", "/repo/.worktrees/c"];
    const statuses = await service.getWorktreeStatusBatchWsl(wslLocation, paths);
    expect(Object.keys(statuses)).toEqual(paths);
    expect(Object.values(statuses).every((status) => status.isRepo === false)).toBe(true);
    expect(batchSizes).toEqual([8, 7]);
  });

  it("preserves the empty-batch contract", async () => {
    const { client } = makeGatedBridge(emptyRecorder());
    setWslGitBridgeClient(client);
    await expect(execGitBatchWslBridge(wslLocation, [], 10_000)).resolves.toEqual([]);
  });

  it("preserves the bridge payload mapping behind admission", async () => {
    let captured: { args: string[]; loginEnv?: boolean }[] | undefined;
    const client = {
      gitBatch: (
        _location: WslLocation,
        input: { commands: { args: string[]; loginEnv?: boolean }[] },
      ) => {
        captured = input.commands.map((command) => ({ ...command }));
        return Promise.resolve({
          results: input.commands.map(
            () => ({ ok: true, stdout: "", stderr: "", exitCode: 0 }) satisfies WslGitExecResult,
          ),
        });
      },
    } as unknown as WslBridgeClient;
    setWslGitBridgeClient(client);
    const results = await execGitBatchWslBridge(
      wslLocation,
      [
        { cwd: wslLocation.linuxPath, args: ["status", "--porcelain=v2", "-b"] },
        { cwd: wslLocation.linuxPath, args: ["log", "--oneline"], loginEnv: false },
      ],
      10_000,
    );
    expect(results).toHaveLength(2);
    expect(captured?.[0]?.args).toEqual([
      "-c",
      "core.quotepath=false",
      "status",
      "--porcelain=v2",
      "-b",
    ]);
    expect(captured?.[0]?.loginEnv).toBe(true);
    expect(captured?.[1]?.args).toEqual(["-c", "core.quotepath=false", "log", "--oneline"]);
    expect(captured?.[1]?.loginEnv).toBe(false);
  });
});

describe("execGit admission (local path, real git)", () => {
  it("serializes local short processes under a limit of one and releases on success", async () => {
    configureGitProcessAdmission({ shortPermits: 1 });
    const outputs = await Promise.all(
      Array.from({ length: 3 }, () => execGit(posixRepoLocation, ["--version"])),
    );
    expect(outputs).toHaveLength(3);
    const usage = gitProcessAdmissionUsage();
    expect(usage.short.maxActive).toBe(1);
    expect(usage.short.active).toBe(0);
    expect(usage.admitted).toBe(3);
  });

  it("releases the permit when the git command fails, preserving command error behavior", async () => {
    const nonRepo = mkdtempSync(join(tmpdir(), "poracode-git-admission-"));
    try {
      await expect(
        execGit({ kind: "posix", path: nonRepo }, ["rev-parse", "--is-inside-work-tree"]),
      ).rejects.toThrow(/rev-parse failed/i);
      expect(gitProcessAdmissionUsage().short).toMatchObject({ active: 0, queued: 0 });
    } finally {
      rmSync(nonRepo, { recursive: true, force: true });
    }
  });

  it("releases the permit through the acceptedExitCodes path", async () => {
    // `rev-parse --verify` exits 128 (not 1) for an unusable revision.
    await expect(
      execGit(posixRepoLocation, ["rev-parse", "--verify", "poracode-no-such-ref"], {
        acceptedExitCodes: [0, 128],
      }),
    ).resolves.toBeDefined();
    expect(gitProcessAdmissionUsage().short).toMatchObject({ active: 0, queued: 0 });
  });

  it("separates long operations from saturated short reads end to end", async () => {
    const recorder = emptyRecorder();
    const { client, release } = makeGatedBridge(recorder);
    setWslGitBridgeClient(client);
    configureGitProcessAdmission({ shortPermits: 1, longPermits: 1 });

    const stalledPush = execGit(wslLocation, ["push", "origin", "HEAD"]);
    await settle();
    expect(gitProcessAdmissionUsage().long).toMatchObject({ active: 1, queued: 0 });

    // The stalled long permit must not consume the short-read slot: the
    // status read is admitted and starts while the push still holds the gate.
    const statusRead = execGit(wslLocation, ["status", "--porcelain=v2", "-b"]);
    await settle();
    expect(recorder.gitExecStarted).toContain("-c core.quotepath=false status --porcelain=v2 -b");
    expect(gitProcessAdmissionUsage().long.active).toBe(1);

    release();
    await Promise.all([stalledPush, statusRead]);
    expect(gitProcessAdmissionUsage().long.active).toBe(0);
    expect(gitProcessAdmissionUsage().short.active).toBe(0);
  });
});

describe("Git status admission failures", () => {
  it("does not translate admission pressure into a non-repository result", async () => {
    configureGitProcessAdmission({ shortPermits: 1, admissionWaitTimeoutMs: 20 });
    const holder = await admitGitProcess("short");
    const service = new GitStatusService();
    try {
      await expect(service.getStatus(posixRepoLocation)).rejects.toMatchObject({
        code: GIT_ADMISSION_WAIT_TIMEOUT_CODE,
      });
      await expect(service.getStatusSummary(posixRepoLocation)).rejects.toMatchObject({
        code: GIT_ADMISSION_WAIT_TIMEOUT_CODE,
      });
    } finally {
      holder.release();
    }
  });
});

beforeEach(() => {
  resetGitProcessAdmissionForTests();
  configureGitProcessAdmission({ ...GIT_PROCESS_ADMISSION_DEFAULT_POLICY });
});

afterEach(() => {
  setWslGitBridgeClient(undefined);
  resetGitProcessAdmissionForTests();
  configureGitProcessAdmission({ ...GIT_PROCESS_ADMISSION_DEFAULT_POLICY });
});
