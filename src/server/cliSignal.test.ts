import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { HostOwnerLease } from "@/backend/ownership/hostOwnerLease";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import { buildSyntheticCliEntry } from "./cliTestBundle";
import { expectOwned, signalOwnedChild, stopOwnedChild, withinDeadline } from "./cliTestHelpers";
import { ensureDeclaredAssetsDir } from "./testDeclaredAssets";

let directory: string;
let entry: string;

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), "poracode-cli-signal-"));
  entry = join(directory, "server.cjs");
  await buildSyntheticCliEntry(entry);
});

afterAll(() => rmSync(directory, { recursive: true, force: true }));

interface ChildMessage {
  type: string;
  [key: string]: unknown;
}

function runChild(
  profile: string,
  stage: string,
  outcome = "joined",
  execPath = process.execPath,
  extraEnv: NodeJS.ProcessEnv = {},
) {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    ...extraEnv,
    PORACODE_BASE_DIR: profile,
    // The synthetic child bundle lives in a bare temp directory, outside both
    // published install shapes; serve() resolves the layout contract first, so
    // the required asset is declared explicitly (the documented escape hatch).
    // A test-owned temp dir satisfies the exists-requirement without depending
    // on prepared checkout resources (CI test shards stage none).
    PORACODE_WSL_HELPERS_DIR: ensureDeclaredAssetsDir(),
    // The esbuild bundle keeps runtime packages external (`packages:
    // "external"`), and its bare temp directory has no node_modules ancestor —
    // ambient resolution differs between dev machines and CI test shards, so
    // the repo's node_modules is declared explicitly. NODE_PATH applies to the
    // child's CommonJS requires; the fixture's own imports resolve from source.
    NODE_PATH: fileURLToPath(new URL("../../node_modules/", import.meta.url)),
  };
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
    waitForExit: () => withinDeadline(exited, "CLI child did not exit after its join.", 3_000),
  };
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
    await stopOwnedChild(test, 3_000);
    expect(kill).not.toHaveBeenCalled();
  } finally {
    await stopOwnedChild(test, 3_000);
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
        await stopOwnedChild(test, 3_000);
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
      await stopOwnedChild(test, 3_000);
    }
  });
});
