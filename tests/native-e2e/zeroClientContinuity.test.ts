// Gate 2.2 / S2.3 zero-client continuity drill at the native seam (Gates 2-3
// Batch 1 freeze evidence, Lane 1C). Boots a REAL headless owner in a REAL
// child process (real lease, owned key initialization, control server,
// settings authority, ScheduleService tick) and drives a REAL SIGTERM through
// the CLI shutdown chain.
//
// New invariants (each fails against pre-batch expectations or a regression):
// - the owner stays ready on the SAME owner generation with no clients and no
//   window (G2.2 continuity);
// - a scheduled effect fires and commits through the settings authority while
//   zero clients are attached (the pre-batch G2.2 contradiction would tie
//   effects to a mounted client);
// - SIGTERM drains and exits 0 through the real installShutdown chain
//   (S2.3), after which the lease is released (a fresh owner can acquire)
//   and the control discovery is gone.
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { fork } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { callHostControl } from "@/backend/ownership/hostControlClient";
import { readHostControlDiscovery } from "@/backend/ownership/hostControlDiscovery";
import { acquireHostDataFenceWithWait } from "@/backend/ownership/hostDataFence";
import { HostOwnerLease } from "@/backend/ownership/hostOwnerLease";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import { defaultSharedSettings } from "@/shared/settings";
import { REAL_HOST_FIXTURE_KEY } from "./harness/realHostRoot";

const CHILD_ENTRY = fileURLToPath(new URL("./harness/zeroClientOwnerChild.ts", import.meta.url));
const TS_REGISTER = fileURLToPath(
  new URL("../../scripts/remote-v3-ts-register.mjs", import.meta.url),
);

interface ReadyMessage {
  type: "ready";
  ownerGeneration: string;
  profileNamespace: string;
  dataRoot: string;
}

interface ChildFixture {
  readonly child: import("node:child_process").ChildProcess;
  readonly ready: Promise<ReadyMessage>;
  readonly namespace: string;
  readonly paths: ReturnType<typeof resolveHostRootPaths>;
  readonly effectMarker: string;
  readonly root: string;
  stderr: string;
}

function forkOwner(): ChildFixture {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-zero-client-")));
  const namespace = join(root, "profile");
  const paths = resolveHostRootPaths(namespace);
  const effectMarker = join(root, "effect-marker.log");
  const child = fork(CHILD_ENTRY, [namespace, effectMarker], {
    execArgv: [
      "--experimental-transform-types",
      "--disable-warning=ExperimentalWarning",
      "--import",
      TS_REGISTER,
    ],
    env: { ...process.env, PORACODE_SECRET_STORAGE_KEY: REAL_HOST_FIXTURE_KEY },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  const stderrChunks: Buffer[] = [];
  child.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
  const ready = new Promise<ReadyMessage>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            `Owner child did not report ready. stderr: ${Buffer.concat(stderrChunks).toString()}`,
          ),
        ),
      15_000,
    );
    child.once("message", (message: unknown) => {
      clearTimeout(timer);
      if (message && typeof message === "object" && (message as ReadyMessage).type === "ready") {
        resolve(message as ReadyMessage);
      } else {
        reject(new Error(`Unexpected child message: ${JSON.stringify(message)}`));
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Owner child exited before ready (code ${code}). stderr: ` +
            Buffer.concat(stderrChunks).toString(),
        ),
      );
    });
  });
  return {
    child,
    ready,
    namespace,
    paths,
    effectMarker,
    root,
    get stderr() {
      return Buffer.concat(stderrChunks).toString();
    },
  };
}

function exitOf(child: ChildFixture["child"]): Promise<number | null> {
  return new Promise((resolve) => child.once("exit", (code) => resolve(code)));
}

async function waitFor(
  probe: () => boolean,
  description: string,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!probe()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${description}.`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe("zero-client continuity drill (Gate 2.2 freeze matrix, native seam)", () => {
  it("keeps the owner ready on one generation with no clients, fires the scheduled effect, and drains to exit 0 with the lease released", async () => {
    const fixture = forkOwner();
    try {
      const ready = await fixture.ready;
      expect(ready.profileNamespace).toBe(fixture.paths.profileNamespace);

      // Zero clients attached: the owner is ready and the control server
      // authenticates the drill's describe.
      const firstDescribe = await callHostControl(fixture.paths, "describe");
      expect(firstDescribe.ownerGeneration).toBe(ready.ownerGeneration);
      expect(firstDescribe.result).toMatchObject({ state: "ready", mode: "headless" });

      // The scheduled effect fires with zero clients and commits through the
      // settings authority.
      await waitFor(() => existsSync(fixture.effectMarker), "the scheduled effect marker");
      const settingsPath = join(fixture.paths.dataRoot, "settings.json");
      expect(existsSync(settingsPath)).toBe(true);
      const committed = JSON.parse(readFileSync(settingsPath, "utf8")) as {
        $poracodeSettingsVersion?: number;
        guiChatFontSize?: number;
      };
      expect(committed.$poracodeSettingsVersion).toBe(1);
      expect(committed.guiChatFontSize).toBe(defaultSharedSettings.guiChatFontSize + 1);

      // Still ready, still the SAME generation: continuity held across the
      // client-less window.
      const secondDescribe = await callHostControl(fixture.paths, "describe");
      expect(secondDescribe.ownerGeneration).toBe(ready.ownerGeneration);
      expect(secondDescribe.result).toMatchObject({ state: "ready" });

      // Explicit stop: real SIGTERM through the real CLI shutdown chain.
      const stopping = exitOf(fixture.child);
      fixture.child.kill("SIGTERM");
      await expect(stopping).resolves.toBe(0);

      // The lease is released: a fresh owner acquires immediately.
      const lease = HostOwnerLease.acquire(fixture.paths, "headless");
      lease.release();

      // No orphaned data custody on the root.
      const fence = await acquireHostDataFenceWithWait(fixture.paths.dataFencePath, 1, 10);
      fence.release();

      // The control discovery is gone with the owner.
      expect(() => readHostControlDiscovery(fixture.paths)).toThrow(/host control is unavailable/);
    } catch (error) {
      if (!fixture.child.exitCode && !fixture.child.killed) fixture.child.kill("SIGKILL");
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\nchild stderr: ${fixture.stderr}`,
        { cause: error },
      );
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});
