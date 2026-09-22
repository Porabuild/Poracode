import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HostOwnerLease } from "@/backend/ownership/hostOwnerLease";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import { buildSyntheticCliEntry } from "./cliTestBundle";
import { expectOwned, stopOwnedChild, withinDeadline } from "./cliTestHelpers";
import { ensureDeclaredAssetsDir } from "./testDeclaredAssets";

// B1/D5 follow-through: a failed startup whose cleanup cannot confirm must end
// at the configured drain deadline even when NO signal is sent and the partial
// runtime retains referenced handles. The fixture runs the real bundled CLI
// (only its headless factory, pairing control and diagnostics are synthetic)
// and holds a real profile owner lease, so the parent observes actual process
// exits and actual custody transfer.
//
// `expectOwned` costs the lease's 250ms busy timeout while the child still
// holds the lock, so every timing assertion starts its clock at the child's
// failure message and checks ownership after the clock has started.
const DEADLINE_MS = 1_000;
const WEDGE_DEADLINE_MS = 500;
const WEDGE_MS = 1_200;

let directory: string;
let entry: string;

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), "poracode-cli-startup-deadline-"));
  entry = join(directory, "server.cjs");
  await buildSyntheticCliEntry(entry);
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));

interface FixtureMessage {
  readonly type: string;
  readonly disposeCalls?: number;
}

function runFixture(profile: string, mode: string, options: { readonly deadlineMs?: number } = {}) {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    PORACODE_BASE_DIR: profile,
    // The CLI resolves the deadline through its normal configuration path; the
    // documented minimum clamp (500ms) keeps the suite fast.
    PORACODE_SHUTDOWN_DRAIN_DEADLINE_MS: String(options.deadlineMs ?? DEADLINE_MS),
    // The synthetic bundle lives in a bare temp directory, outside both
    // published install shapes; the required layout asset is declared
    // explicitly. NODE_PATH resolves the bundle's external runtime packages.
    PORACODE_WSL_HELPERS_DIR: ensureDeclaredAssetsDir(),
    NODE_PATH: fileURLToPath(new URL("../../node_modules/", import.meta.url)),
  };
  delete environment.NODE_OPTIONS;
  const child = fork(
    fileURLToPath(new URL("./fixtures/cliStartupDeadline.mjs", import.meta.url)),
    [entry, profile, mode],
    {
      execPath: process.execPath,
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

  function waitFor(type: string): Promise<FixtureMessage> {
    return new Promise<FixtureMessage>((resolve, reject) => {
      const timer = setTimeout(
        () => finish(new Error(`Fixture did not report ${type}: ${output}`)),
        5_000,
      );
      function finish(error?: Error, message?: FixtureMessage): void {
        clearTimeout(timer);
        child.off("message", onMessage);
        child.off("exit", onExit);
        child.off("error", onError);
        if (error) reject(error);
        else resolve(message!);
      }
      function onMessage(message: FixtureMessage): void {
        if (message.type === type) finish(undefined, message);
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

describe.skipIf(process.platform === "win32")("fatal startup bounded drain", () => {
  it.each(["reject", "hang"] as const)(
    "force-exits 1 by the configured deadline with retained handles and no signal (%s)",
    async (mode) => {
      const profile = join(directory, `fatal-${mode}`);
      const fixture = runFixture(profile, mode);
      try {
        await fixture.waitFor("disposing");
        const failedAt = Date.now();
        // Custody stays with the failed startup until the actual process exit:
        // no successor can enter while it is alive and cleanup is unconfirmed.
        expectOwned(profile);
        const exit = await withinDeadline(
          fixture.exited,
          `Fixture did not exit after an unconfirmed ${mode} startup cleanup: ${fixture.output()}`,
          DEADLINE_MS + 2_500,
        );
        expect(exit).toEqual({ code: 1, signal: null });
        const elapsed = Date.now() - failedAt;
        expect(elapsed).toBeGreaterThanOrEqual(DEADLINE_MS - 150);
        expect(elapsed).toBeLessThan(DEADLINE_MS + 2_000);
        // A refused join reports the unconfirmed cleanup before the bound; a
        // hang never settles, so only the forced-exit diagnostic is emitted.
        const reportsUnconfirmed = mode === "reject";
        expect(fixture.output().includes("shutdown remains unconfirmed")).toBe(reportsUnconfirmed);
        expect(fixture.output().includes("hard deadline stays armed")).toBe(reportsUnconfirmed);
        expect(fixture.output()).toContain("forcing exit");
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

  it("exits 1 promptly when the one-shot startup cleanup confirms", async () => {
    const profile = join(directory, "fatal-recovered");
    const fixture = runFixture(profile, "recovered");
    try {
      await fixture.waitFor("released");
      const recoveredAt = Date.now();
      const exit = await withinDeadline(
        fixture.exited,
        `Fixture did not exit after a recovered startup cleanup: ${fixture.output()}`,
        3_000,
      );
      expect(exit).toEqual({ code: 1, signal: null });
      expect(Date.now() - recoveredAt).toBeLessThan(DEADLINE_MS);
      expect(fixture.output()).toContain("failed to start");
      expect(fixture.output()).not.toContain("forcing exit");
      expectSuccessorCanEnter(profile);
    } finally {
      await stopOwnedChild(fixture, 5_000);
    }
  });

  it("exits naturally at 1 without the deadline keeping a bare process alive", async () => {
    const profile = join(directory, "bare");
    const fixture = runFixture(profile, "bare");
    try {
      const exit = await withinDeadline(
        fixture.exited,
        `Fixture did not exit after an unconfirmed startup cleanup: ${fixture.output()}`,
        3_000,
      );
      expect(exit).toEqual({ code: 1, signal: null });
      // The armed (unref'd) deadline must not itself keep the process alive: a
      // natural exit never prints the forced-exit diagnostic.
      expect(fixture.output()).toContain("hard deadline stays armed");
      expect(fixture.output()).not.toContain("forcing exit");
      expectSuccessorCanEnter(profile);
    } finally {
      await stopOwnedChild(fixture, 5_000);
    }
  });

  it("still starts healthy, stays alive past the deadline, and exits 0 on SIGTERM", async () => {
    const profile = join(directory, "healthy");
    const fixture = runFixture(profile, "healthy");
    try {
      await fixture.waitFor("ready");
      expectOwned(profile);
      await new Promise<void>((resolve) => setTimeout(resolve, DEADLINE_MS + 400));
      expect(fixture.child.exitCode).toBeNull();
      expect(fixture.child.signalCode).toBeNull();
      expect(fixture.output()).not.toContain("forcing exit");
      expectOwned(profile);
      fixture.child.kill("SIGTERM");
      const exit = await withinDeadline(
        fixture.exited,
        `Healthy fixture did not exit after SIGTERM: ${fixture.output()}`,
        5_000,
      );
      expect(exit).toEqual({ code: 0, signal: null });
      expectSuccessorCanEnter(profile);
    } finally {
      await stopOwnedChild(fixture, 5_000);
    }
  });

  it("cannot preempt a post-failure synchronous block; the exit follows the unblock", async () => {
    const profile = join(directory, "wedge");
    const fixture = runFixture(profile, "wedge", { deadlineMs: WEDGE_DEADLINE_MS });
    try {
      await fixture.waitFor("wedging");
      const wedgedAt = Date.now();
      // The deadline is shorter than the synchronous block, so the process
      // must still be alive past the deadline while the loop cannot run the
      // timer. An external watchdog is the only bound for this state.
      await new Promise<void>((resolve) => setTimeout(resolve, WEDGE_DEADLINE_MS + 200));
      expect(fixture.child.exitCode).toBeNull();
      expect(fixture.child.signalCode).toBeNull();
      expect(fixture.output()).not.toContain("forcing exit");
      expectOwned(profile);
      const exit = await withinDeadline(
        fixture.exited,
        `Wedged fixture did not exit after the block: ${fixture.output()}`,
        3_000,
      );
      expect(exit).toEqual({ code: 1, signal: null });
      expect(Date.now() - wedgedAt).toBeGreaterThanOrEqual(WEDGE_MS - 300);
      expect(fixture.output()).toContain("forcing exit");
      expectSuccessorCanEnter(profile);
    } finally {
      await stopOwnedChild(fixture, 5_000);
    }
  });
});
