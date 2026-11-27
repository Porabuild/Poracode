import { afterEach, describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startLab } from "./helpers/testClient.ts";
import { ProcessCleanup } from "./harness/processCleanup.ts";

function canListen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(true));
  });
}

describe("cleanup and port reuse", () => {
  const harnesses: Array<Awaited<ReturnType<typeof startLab>>> = [];

  afterEach(async () => {
    while (harnesses.length > 0) {
      await harnesses.pop()?.stop();
    }
  });

  it("does not wait out the shutdown timeout when a child failed to spawn", async () => {
    const child = spawn(join(tmpdir(), `poracode-missing-${randomUUID()}`), { stdio: "ignore" });
    child.on("error", () => {});
    const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
    const cleanup = new ProcessCleanup({ shutdownTimeoutMs: 200 });
    cleanup.trackChild(child);
    await closed;

    vi.useFakeTimers();
    try {
      const stopped = cleanup.shutdown("failed spawn");
      const pendingTimers = vi.getTimerCount();
      await vi.runAllTimersAsync();
      await stopped;
      expect(pendingTimers).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("force-kills a stubborn non-detached child after its SIGTERM is ignored", async () => {
    const child = spawn(
      process.execPath,
      [
        "-e",
        "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); process.stdout.write('ready');",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    // Wait until the child has installed its SIGTERM handler; otherwise the
    // signal can land during startup and end it before it becomes stubborn.
    await new Promise<void>((resolve) => {
      child.stdout?.once("data", () => resolve());
    });
    const cleanup = new ProcessCleanup({ shutdownTimeoutMs: 150 });
    cleanup.trackChild(child);
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    await cleanup.shutdown("stubborn-child");
    // Only a forced SIGKILL can end a child that ignores SIGTERM; the old
    // child.killed short-circuit would skip it and leave the child alive.
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const outcome = await Promise.race([
        exited.then(() => "exited" as const),
        new Promise<"timeout">((resolve) => {
          timer = setTimeout(() => resolve("timeout"), 1_000);
        }),
      ]);
      if (outcome === "timeout") child.kill("SIGKILL");
      expect(outcome).toBe("exited");
      expect(child.signalCode).toBe("SIGKILL");
    } finally {
      if (timer) clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
  });

  it("releases host and control ports so a second lab can bind them", async () => {
    const first = await startLab();
    harnesses.push(first);
    const hostPort = first.hostPort;
    const controlPort = first.controlPort;
    expect(hostPort).toBeGreaterThan(0);
    expect(controlPort).toBeGreaterThan(0);
    await first.stop();
    harnesses.pop();

    await expect.poll(() => canListen(hostPort), { timeout: 3_000 }).toBe(true);
    await expect.poll(() => canListen(controlPort), { timeout: 3_000 }).toBe(true);

    const second = await startLab();
    harnesses.push(second);
    expect(second.hostPort).toBeGreaterThan(0);
    expect(second.controlPort).toBeGreaterThan(0);
    const env = await fetch(new URL("/.well-known/poracode/environment", second.httpBaseUrl));
    expect(env.status).toBe(200);
  });
});
