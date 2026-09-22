import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createProcessStagingExecutor } from "./executor";
import type { WslStagingProcessSpec } from "./executor";

const fixturePath = fileURLToPath(
  new URL("./__fixtures__/stagingWorkerFixture.mjs", import.meta.url),
);

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "poracode-staging-executor-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixtureSpec(mode: string, pidFile?: string): WslStagingProcessSpec {
  return {
    command: process.execPath,
    args: [fixturePath],
    env: {
      ...process.env,
      FIXTURE_MODE: mode,
      ...(pidFile ? { FIXTURE_PID_FILE: pidFile } : {}),
    },
    readyTimeoutMs: 5_000,
  };
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("ProcessStagingExecutor", () => {
  it("round-trips a request through the worker protocol", async () => {
    const executor = createProcessStagingExecutor(fixtureSpec("echo"));
    try {
      await expect(
        executor.execute({ op: "exists", path: "/tmp/whatever" }, { timeoutMs: 5_000 }),
      ).resolves.toEqual({ mode: "echo" });
    } finally {
      await executor.dispose();
    }
  });

  it("kills the stalled worker and rejects at the deadline", async () => {
    const executor = createProcessStagingExecutor(fixtureSpec("stall"));
    const started = Date.now();
    try {
      const stalled = executor.execute({ op: "exists", path: "/tmp/whatever" }, { timeoutMs: 250 });
      // The parent loop stays free while the isolated worker is stalled.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(Date.now() - started).toBeLessThan(250);
      await expect(stalled).rejects.toThrow(/timed out/);
      expect(Date.now() - started).toBeLessThan(5_000);
      await expect(
        executor.execute({ op: "exists", path: "/tmp/other" }, { timeoutMs: 250 }),
      ).rejects.toThrow(/timed out/);
    } finally {
      await executor.dispose();
    }
  });

  it.each(["1", "2"] as const)(
    "rejects a cached worker with protocol %s instead of half-serving the new protocol",
    async (workerProtocol) => {
      const executor = createProcessStagingExecutor({
        ...fixtureSpec("echo"),
        env: { ...process.env, FIXTURE_MODE: "echo", FIXTURE_PROTOCOL_VERSION: workerProtocol },
      });
      try {
        await expect(
          executor.execute({ op: "exists", path: "/tmp/whatever" }, { timeoutMs: 5_000 }),
        ).rejects.toThrow(
          new RegExp(`protocol ${workerProtocol} is not supported by host protocol 3`, "u"),
        );
      } finally {
        await executor.dispose();
      }
    },
  );

  it("rejects waiters when the worker exits", async () => {
    const executor = createProcessStagingExecutor(fixtureSpec("exit"));
    try {
      await expect(
        executor.execute({ op: "exists", path: "/tmp/whatever" }, { timeoutMs: 5_000 }),
      ).rejects.toThrow(/exited|ready/);
    } finally {
      await executor.dispose();
    }
  });

  it("rejects an aborted waiter without killing the worker", async () => {
    const executor = createProcessStagingExecutor(fixtureSpec("echo"));
    try {
      const controller = new AbortController();
      const stalled = executor.execute(
        { op: "exists", path: "/tmp/whatever" },
        { timeoutMs: 5_000, signal: controller.signal },
      );
      controller.abort(new Error("caller went away"));
      await expect(stalled).rejects.toThrow("caller went away");
      await expect(
        executor.execute({ op: "exists", path: "/tmp/again" }, { timeoutMs: 5_000 }),
      ).resolves.toEqual({ mode: "echo" });
    } finally {
      await executor.dispose();
    }
  });

  it("dispose resolves only after the worker process has exited", async () => {
    const root = makeRoot();
    const pidFile = join(root, "worker.pid");
    const executor = createProcessStagingExecutor(fixtureSpec("stall", pidFile));
    await executor
      .execute({ op: "exists", path: "/tmp/whatever" }, { timeoutMs: 100 })
      .catch(() => {
        // The stalled request is expected to time out; the pid file is written at boot.
      });
    const pid = Number(readFileSync(pidFile, "utf8"));
    expect(processIsAlive(pid)).toBe(true);

    await executor.dispose();

    expect(processIsAlive(pid)).toBe(false);
    await expect(
      executor.execute({ op: "exists", path: "/tmp/after" }, { timeoutMs: 1_000 }),
    ).rejects.toThrow(/disposed/);
  });
});
