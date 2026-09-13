import { build } from "esbuild";
import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { HostOwnerLease, HostRootInUseError } from "@/backend/ownership/hostOwnerLease";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";

let directory: string;
let entry: string;

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), "poracode-cli-signal-"));
  entry = join(directory, "server.cjs");
  await build({
    entryPoints: [fileURLToPath(new URL("./cli.ts", import.meta.url))],
    outfile: entry,
    bundle: true,
    platform: "node",
    format: "cjs",
    packages: "external",
    logLevel: "silent",
    plugins: [
      {
        name: "synthetic-headless-services",
        setup(builder) {
          builder.onResolve(
            {
              filter: new RegExp(
                "(createHeadlessRemoteHost|headlessRemoteComposition|pairingControl|nodePerformanceDiagnostics)$",
              ),
            },
            (args) => ({ path: args.path, namespace: "synthetic" }),
          );
          builder.onLoad({ filter: new RegExp(".*"), namespace: "synthetic" }, (args) => {
            const contents = args.path.endsWith("createHeadlessRemoteHost")
              ? "export const createHeadlessRemoteHost = (options) => globalThis.__cliFixture.create(options);"
              : args.path.endsWith("nodePerformanceDiagnostics")
                ? "export const startNodePerformanceDiagnostics = () => ({stop: () => globalThis.__cliFixture.stopDiagnostics()});"
                : args.path.endsWith("headlessRemoteComposition")
                  ? "export class HeadlessCompositionShutdownError extends AggregateError {}"
                  : "export const requestPairingFromRunningServer = () => { throw new Error('Pairing is outside this fixture.'); };";
            return { contents, loader: "js" };
          });
        },
      },
    ],
  });
});

afterAll(() => rmSync(directory, { recursive: true, force: true }));

interface ChildMessage {
  type: string;
  [key: string]: unknown;
}

async function withinDeadline<T>(work: Promise<T>, description: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(description)), 3_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function runChild(profile: string, stage: string, outcome = "joined", execPath = process.execPath) {
  const environment: NodeJS.ProcessEnv = { ...process.env, PORACODE_BASE_DIR: profile };
  delete environment.NODE_OPTIONS;
  const child = fork(
    fileURLToPath(new URL("./fixtures/cliStartupSignal.mjs", import.meta.url)),
    [entry, profile, stage, outcome],
    {
      execPath,
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
  let stderr = "";
  let spawnError: Error | undefined;
  child.on("error", (error) => {
    spawnError = error;
  });
  // Process exit precedes pipe closure. Retain close from spawn, including
  // failure/early exit, so fixture removal never races an inherited pipe.
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  child.stderr?.on("data", (bytes: Buffer) => {
    stderr += bytes.toString();
  });
  const received: ChildMessage[] = [];
  const consumed = new Set<ChildMessage>();
  child.on("message", (message: ChildMessage) => received.push(message));
  const exited = once(child, "exit").then(([code, signal]) => ({ code, signal }));
  void exited.catch(() => undefined);
  async function waitFor(type: string): Promise<ChildMessage> {
    const known = received.find((message) => message.type === type && !consumed.has(message));
    if (known) {
      consumed.add(known);
      return known;
    }
    return new Promise((resolve, reject) => {
      const finish = (error?: Error, message?: ChildMessage) => {
        clearTimeout(deadline);
        child.off("message", onMessage);
        child.off("exit", onExit);
        child.off("error", onError);
        if (error) reject(error);
        else {
          consumed.add(message!);
          resolve(message!);
        }
      };
      const onMessage = (message: ChildMessage) => {
        if (message.type === type) finish(undefined, message);
      };
      const onExit = () =>
        finish(
          new Error(
            `CLI child exited (${child.exitCode ?? child.signalCode}) before ${type}: ${stderr}`,
          ),
        );
      const onError = (error: Error) => finish(error);
      const deadline = setTimeout(
        () => finish(new Error(`CLI child did not report ${type}: ${stderr}`)),
        3_000,
      );
      child.on("message", onMessage);
      child.once("exit", onExit);
      child.once("error", onError);
      if (spawnError) onError(spawnError);
      else if (child.exitCode !== null || child.signalCode !== null) onExit();
    });
  }
  return {
    child,
    closed,
    waitFor,
    waitForExit: () => withinDeadline(exited, "CLI child did not exit after its join."),
  };
}

function signalOwnedChild(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (typeof child.pid !== "number" || !Number.isSafeInteger(child.pid) || child.pid <= 0)
    throw new Error("The test has no positive owned child PID to signal.");
  child.kill(signal);
}

async function stopOwnedChild(test: ReturnType<typeof runChild>): Promise<void> {
  const { child, closed } = test;
  if (
    child.exitCode === null &&
    child.signalCode === null &&
    typeof child.pid === "number" &&
    Number.isSafeInteger(child.pid) &&
    child.pid > 0
  )
    signalOwnedChild(child, "SIGKILL");
  await withinDeadline(closed, "Test-owned CLI child did not confirm pipe closure.");
}

function expectOwned(profile: string) {
  let contender: HostOwnerLease | undefined;
  try {
    expect(() => {
      contender = HostOwnerLease.acquire(resolveHostRootPaths(profile), "desktop");
    }).toThrow(HostRootInUseError);
  } finally {
    contender?.release();
  }
}

it("joins failed spawn closure without signaling an absent PID", async () => {
  const test = runChild(
    join(directory, "failed-spawn"),
    "factory",
    "joined",
    join(directory, "missing-node"),
  );
  // Never send a native signal with an absent PID, even against a broken draft.
  const kill = vi.spyOn(test.child, "kill").mockImplementation(() => false);
  try {
    await expect(test.waitFor("pending")).rejects.toMatchObject({ code: "ENOENT" });
    expect(test.child.pid).toBeUndefined();
    await stopOwnedChild(test);
    expect(kill).not.toHaveBeenCalled();
  } finally {
    await stopOwnedChild(test);
    kill.mockRestore();
  }
});

describe.skipIf(process.platform === "win32")("actual CLI startup signals", () => {
  it.each([
    { signal: "SIGINT", stage: "factory" },
    { signal: "SIGTERM", stage: "factory" },
    { signal: "SIGINT", stage: "listener" },
    { signal: "SIGTERM", stage: "listener" },
  ] as const)(
    "joins $stage startup after $signal before releasing its lease",
    async ({ signal, stage }) => {
      const profile = join(directory, `${stage}-${signal}`);
      const test = runChild(profile, stage);
      try {
        await test.waitFor("pending");
        expectOwned(profile);
        signalOwnedChild(test.child, signal);
        await test.waitFor("cancelled");
        expectOwned(profile);
        test.child.send("release-startup");
        await test.waitFor("disposing");
        expectOwned(profile);
        test.child.send("inspect");
        expect(await test.waitFor("state")).toMatchObject({
          cancelled: true,
          startCalls: stage === "factory" ? 0 : 1,
          disposeCalls: 1,
        });
        test.child.send("release-drain");
        await test.waitFor("released");
        expect(await test.waitForExit()).toEqual({ code: 0, signal: null });
        const successor = HostOwnerLease.acquire(resolveHostRootPaths(profile), "desktop");
        successor.release();
      } finally {
        await stopOwnedChild(test);
      }
    },
  );

  it("keeps the live lease and signal admission after an unconfirmed startup drain", async () => {
    const profile = join(directory, "failed-join");
    const test = runChild(profile, "listener", "failed-join");
    try {
      await test.waitFor("pending");
      signalOwnedChild(test.child, "SIGTERM");
      await test.waitFor("cancelled");
      await test.waitFor("disposing");
      test.child.send("release-startup");
      test.child.send("release-drain");
      expect(await test.waitFor("diagnostics-stopped")).toMatchObject({
        cancelled: true,
        disposeCalls: 1,
        exitCode: 1,
      });
      expectOwned(profile);
      signalOwnedChild(test.child, "SIGINT");
      test.child.send("inspect");
      expect(await test.waitFor("state")).toMatchObject({ disposeCalls: 1, exitCode: 1 });
    } finally {
      await stopOwnedChild(test);
    }
  });
});
