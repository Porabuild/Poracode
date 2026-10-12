import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { HostOwnerLease } from "@/backend/ownership/hostOwnerLease";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import { withinDeadline } from "./cliTestHelpers";

// Plan D5: an in-process timer cannot bound a synchronously blocked event loop.
// This suite runs a real external parent whose own wall-clock timer SIGKILLs a
// wedged child and then proves the successor can enter: the profile lease is
// acquirable and the child's listening port is rebindable.
const DRAIN_DEADLINE_MS = 500;
const WATCHDOG_MS = 500;

const directories: string[] = [];
const parents: ChildProcess[] = [];
const grandchildren = new Set<number>();

afterEach(async () => {
  for (const parent of parents.splice(0)) {
    if (parent.exitCode === null && parent.signalCode === null) {
      const closed = once(parent, "close");
      parent.kill("SIGKILL");
      await closed;
    }
  }
  for (const pid of grandchildren) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // already gone
    }
  }
  grandchildren.clear();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

interface FixtureMessage {
  readonly type: string;
  readonly pid?: number;
  readonly watchdogFired?: boolean;
  readonly waitedMs?: number;
  readonly code?: number | null;
  readonly signal?: string | null;
  readonly leaseReleased?: boolean;
  readonly portRebindable?: boolean;
}

describe.skipIf(process.platform === "win32")("external parent watchdog", () => {
  it("kills a synchronously wedged child and releases its lease and listener", async () => {
    const profile = mkdtempSync(join(tmpdir(), "poracode-external-watchdog-"));
    directories.push(profile);
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      PORACODE_BASE_DIR: profile,
      NODE_PATH: fileURLToPath(new URL("../../node_modules/", import.meta.url)),
    };
    delete environment.NODE_OPTIONS;
    const parent = fork(
      fileURLToPath(new URL("./fixtures/cliExternalWatchdogParent.mjs", import.meta.url)),
      [profile, "wedge", String(DRAIN_DEADLINE_MS), String(WATCHDOG_MS)],
      {
        execArgv: [
          "--experimental-transform-types",
          "--disable-warning=ExperimentalWarning",
          "--import",
          fileURLToPath(new URL("../../scripts/remote-v3-ts-register.mjs", import.meta.url)),
        ],
        env: environment,
        stdio: ["ignore", "ignore", "pipe", "ipc"],
      },
    );
    parents.push(parent);
    const exited = once(parent, "exit").then(([code, signal]) => ({ code, signal }));
    void exited.catch(() => undefined);
    let output = "";
    parent.stderr?.on("data", (bytes: Buffer) => {
      output += bytes.toString();
    });
    const messages: FixtureMessage[] = [];
    const waiters = new Map<
      string,
      { resolve: (message: FixtureMessage) => void; reject: (error: Error) => void }
    >();
    parent.on("message", (message: FixtureMessage) => {
      messages.push(message);
      const waiter = waiters.get(message.type);
      if (!waiter) return;
      waiters.delete(message.type);
      waiter.resolve(message);
    });
    const waitForMessage = (type: string): Promise<FixtureMessage> => {
      const existing = messages.find((message) => message.type === type);
      if (existing) return Promise.resolve(existing);
      return new Promise<FixtureMessage>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`External watchdog parent did not report ${type}: ${output}`)),
          5_000,
        );
        waiters.set(type, {
          resolve: (message) => {
            clearTimeout(timer);
            resolve(message);
          },
          reject,
        });
      });
    };

    const started = await waitForMessage("child-started");
    if (typeof started.pid === "number") grandchildren.add(started.pid);
    const result = await waitForMessage("watchdog-result");
    const exit = await withinDeadline(
      exited,
      `External watchdog parent did not exit: ${output}`,
      5_000,
    );

    expect(exit).toEqual({ code: 0, signal: null });
    expect(result.watchdogFired).toBe(true);
    expect(result.code).toBeNull();
    expect(result.signal).toBe("SIGKILL");
    expect(result.leaseReleased).toBe(true);
    expect(result.portRebindable).toBe(true);
    // The parent's timer ran on schedule in its own event loop even though the
    // child's loop was blocked. The upper bound tolerates shard scheduling lag
    // but stays far below the child's 5s wedge, so the external kill — not the
    // wedge finishing — is what ended the child.
    expect(result.waitedMs).toBeGreaterThanOrEqual(WATCHDOG_MS - 150);
    expect(result.waitedMs).toBeLessThan(WATCHDOG_MS + 2_500);
    expect(output).not.toContain("forcing exit");
    // The test process itself can now take the lease the child held.
    const successor = HostOwnerLease.acquire(resolveHostRootPaths(profile), "desktop");
    successor.release();
  }, 10_000);
});
