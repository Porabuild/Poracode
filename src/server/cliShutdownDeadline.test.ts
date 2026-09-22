import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HostOwnerLease } from "@/backend/ownership/hostOwnerLease";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import { expectOwned, stopOwnedChild, withinDeadline } from "./cliTestHelpers";

// Plan D5: a failed disposal must not clear the hard termination deadline.
// The fixture holds a real profile lease plus retained handles (open TCP
// socket and interval timer) and runs the real installShutdown helper, so the
// parent observes an actual process exiting at the declared bound.
const DEADLINE_MS = 500;

let directory: string;
beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "poracode-shutdown-deadline-"));
});
afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

interface FixtureMessage {
  readonly type: string;
}

function runFixture(profile: string, mode: string) {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    PORACODE_BASE_DIR: profile,
    // The fixture's bare temp directory has no node_modules ancestor; the
    // repo's tree is declared explicitly for its CommonJS requires.
    NODE_PATH: fileURLToPath(new URL("../../node_modules/", import.meta.url)),
  };
  delete environment.NODE_OPTIONS;
  const child = fork(
    fileURLToPath(new URL("./fixtures/cliShutdownDeadline.mjs", import.meta.url)),
    [profile, mode, String(DEADLINE_MS)],
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
  let output = "";
  let spawnError: Error | undefined;
  child.stderr?.on("data", (bytes: Buffer) => {
    output += bytes.toString();
  });
  child.on("error", (error) => {
    spawnError = error;
  });
  // Process exit precedes pipe closure. Retain close from spawn so cleanup
  // never races an inherited pipe.
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  const exited = once(child, "exit").then(([code, signal]) => ({ code, signal }));
  void exited.catch(() => undefined);

  function waitFor(type: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => finish(new Error(`Fixture did not report ${type}: ${output}`)),
        5_000,
      );
      function finish(error?: Error): void {
        clearTimeout(timer);
        child.off("message", onMessage);
        child.off("exit", onExit);
        child.off("error", onError);
        if (error) reject(error);
        else resolve();
      }
      function onMessage(message: FixtureMessage): void {
        if (message.type === type) finish();
      }
      function onExit(): void {
        finish(new Error(`Fixture exited before ${type}: ${output}`));
      }
      function onError(error: Error): void {
        finish(error);
      }
      child.on("message", onMessage);
      child.once("exit", onExit);
      child.once("error", onError);
      if (spawnError) onError(spawnError);
      else if (child.exitCode !== null || child.signalCode !== null) onExit();
    });
  }

  return { child, closed, exited, output: () => output, waitFor };
}

function expectSuccessorCanEnter(profile: string): void {
  const successor = HostOwnerLease.acquire(resolveHostRootPaths(profile), "desktop");
  successor.release();
}

describe.skipIf(process.platform === "win32")("shutdown deadline with retained handles", () => {
  it.each([
    // A hang never settles, so only the deadline diagnostic is emitted; the
    // failure modes additionally report the unconfirmed join and the retained
    // bound before the deadline fires.
    { mode: "async-reject", reportsFailure: true },
    { mode: "sync-throw", reportsFailure: true },
    { mode: "hang", reportsFailure: false },
  ] as const)(
    "force-exits 1 by the deadline when disposal fails ($mode) and handles survive",
    async ({ mode, reportsFailure }) => {
      const profile = join(directory, mode);
      const fixture = runFixture(profile, mode);
      try {
        await fixture.waitFor("ready");
        const signalledAt = Date.now();
        fixture.child.kill("SIGTERM");
        await fixture.waitFor("disposing");
        // Custody is retained for the whole drain window: the successor cannot
        // enter while the failed owner is still alive.
        expectOwned(profile);
        const exit = await withinDeadline(
          fixture.exited,
          `Fixture did not exit after a failed ${mode} disposal: ${fixture.output()}`,
          5_000,
        );
        expect(exit).toEqual({ code: 1, signal: null });
        const elapsed = Date.now() - signalledAt;
        expect(elapsed).toBeGreaterThanOrEqual(DEADLINE_MS - 100);
        expect(elapsed).toBeLessThan(DEADLINE_MS + 2_000);
        expect(fixture.output().includes("shutdown remains unconfirmed")).toBe(reportsFailure);
        expect(fixture.output().includes("hard deadline stays armed")).toBe(reportsFailure);
        expect(fixture.output()).toContain("forcing exit");
        // The forced-exit diagnostic keeps the truthful limit: an in-process
        // timer cannot bound a blocked loop, so the service manager is the
        // external stop bound (D5).
        expect(fixture.output()).toContain(
          "service managers must enforce an external stop timeout",
        );
        // The exit itself released the lease's kernel lock.
        expectSuccessorCanEnter(profile);
      } finally {
        await stopOwnedChild(fixture, 5_000);
      }
    },
  );

  it("still completes an ordinary successful drain before the deadline", async () => {
    const profile = join(directory, "success");
    const fixture = runFixture(profile, "success");
    try {
      await fixture.waitFor("ready");
      const signalledAt = Date.now();
      fixture.child.kill("SIGTERM");
      const exit = await withinDeadline(
        fixture.exited,
        `Fixture did not exit after a confirmed drain: ${fixture.output()}`,
        5_000,
      );
      expect(exit).toEqual({ code: 0, signal: null });
      expect(Date.now() - signalledAt).toBeLessThan(DEADLINE_MS);
      expect(fixture.output()).not.toContain("forcing exit");
      expectSuccessorCanEnter(profile);
    } finally {
      await stopOwnedChild(fixture, 5_000);
    }
  });

  it("cannot preempt a synchronous event-loop wedge; an external watchdog is the bound", async () => {
    const profile = join(directory, "wedge");
    const fixture = runFixture(profile, "wedge");
    try {
      await fixture.waitFor("ready");
      fixture.child.kill("SIGTERM");
      // The wedge blocks disposal for 5s; the in-process deadline cannot fire
      // while the loop is blocked, so the child must still be alive here. This
      // test SIGKILLs it in `finally` around deadline+700 ms, so the wider
      // wedge bound does not extend the suite.
      await new Promise<void>((resolve) => setTimeout(resolve, DEADLINE_MS + 700));
      expect(fixture.child.exitCode).toBeNull();
      expect(fixture.child.signalCode).toBeNull();
      expect(fixture.output()).not.toContain("forcing exit");
      expectOwned(profile);
    } finally {
      await stopOwnedChild(fixture, 5_000);
    }
  });
});
