import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { nativeBindingEnv, sqliteAvailable } from "./runtimeItems.testFixtures";
import {
  getRuntimeContamination,
  resetRuntimePersistenceForTests,
} from "./runtimePersistenceRuntime";

const FIXTURE = resolve("src/host/db/runtimeDurableGap.crashFixture.ts");
const THREAD_ID = "thread-crash-fixture";

function epochRow(): { epoch: number; armed: number } {
  return getSqlite()
    .prepare("SELECT epoch, armed FROM runtime_persistence_epoch WHERE id = 1")
    .get() as { epoch: number; armed: number };
}

function touchEpochs(): number[] {
  return (
    getSqlite()
      .prepare("SELECT epoch FROM thread_runtime_epoch_touches WHERE thread_id = ? ORDER BY epoch")
      .all(THREAD_ID) as Array<{ epoch: number }>
  ).map((row) => row.epoch);
}

function gapRow(): { reason: string } | undefined {
  return getSqlite()
    .prepare("SELECT reason FROM thread_runtime_gaps WHERE thread_id = ?")
    .get(THREAD_ID) as { reason: string } | undefined;
}

/**
 * Real SIGKILL evidence for the B1 durable-gap protocol. The in-process reopen
 * tests prove the state machine; these tests prove that a killed production
 * process leaves exactly the evidence the next boot expects: an armed epoch
 * plus a surviving touch resolve suspect after storage recovers, a failed gap
 * write cannot hide the refusal, and a real clean close leaves no false gap.
 */
describe.skipIf(!sqliteAvailable || process.platform === "win32")(
  "runtime durable-gap evidence across real process kills",
  () => {
    let dir: string;
    let dbPath: string;
    const children: ChildProcess[] = [];

    beforeEach(() => {
      if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
      dir = mkdtempSync(join(tmpdir(), "poracode-durable-gap-crash-"));
      dbPath = join(dir, "state.sqlite");
    });

    afterEach(async () => {
      for (const child of children.splice(0)) {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
          await once(child, "exit");
        }
      }
      resetRuntimePersistenceForTests();
      closeDatabase();
      rmSync(dir, { recursive: true, force: true });
      delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
    });

    function launch(mode: string): ChildProcess {
      const child = fork(FIXTURE, [mode, dbPath], {
        execArgv: [
          "--experimental-transform-types",
          "--disable-warning=ExperimentalWarning",
          "--import",
          resolve("scripts/remote-v3-ts-register.mjs"),
        ],
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      });
      children.push(child);
      return child;
    }

    async function killAfterMarker(child: ChildProcess, marker: string): Promise<void> {
      let output = "";
      let stderr = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        output += chunk.toString("utf8");
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      const deadline = Date.now() + 30_000;
      while (!output.includes(marker)) {
        if (child.exitCode !== null || child.signalCode !== null) {
          throw new Error(`fixture exited before ${marker}: ${output}${stderr}`);
        }
        if (Date.now() > deadline) {
          throw new Error(`fixture did not report ${marker}: ${output}${stderr}`);
        }
        await new Promise((resolveWait) => setTimeout(resolveWait, 25));
      }
      child.kill("SIGKILL");
      await once(child, "exit");
    }

    async function waitForCleanExit(child: ChildProcess, marker: string): Promise<void> {
      let output = "";
      let stderr = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        output += chunk.toString("utf8");
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      const [code] = (await once(child, "exit")) as [number | null];
      if (code !== 0 || !output.includes(marker)) {
        throw new Error(`fixture failed (${String(code)}): ${output}${stderr}`);
      }
    }

    it("a SIGKILL after the pre-launch touch resolves suspect after storage recovers", async () => {
      await killAfterMarker(launch("armed-touch-accepted"), "TOUCHED_ACCEPTED");

      initDatabase(dbPath);
      expect(epochRow()).toEqual({ epoch: 1, armed: 1 });
      expect(touchEpochs()).toEqual([1]);
      expect(gapRow()).toBeUndefined();
      // Storage is writable again, but no later write may erase the evidence:
      // the surviving touch resolves the thread suspect until a rebase.
      expect(getRuntimeContamination(THREAD_ID)?.reason).toBe("unclean-epoch");
    });

    it("a SIGKILL with a failed gap write still identifies the thread after reopen", async () => {
      await killAfterMarker(launch("gap-write-failed"), "GAP_WRITE_REFUSED");

      initDatabase(dbPath);
      expect(epochRow()).toEqual({ epoch: 1, armed: 1 });
      expect(touchEpochs()).toEqual([1]);
      // The exact gap row never committed (the write was refused); the touch
      // is the durable evidence that the boot accepted and lost work.
      expect(gapRow()).toBeUndefined();
      expect(getRuntimeContamination(THREAD_ID)?.reason).toBe("unclean-epoch");
    });

    it("a real clean close disarms and removes this boot's touches (no false gap)", async () => {
      await waitForCleanExit(launch("clean-close"), "CLEAN_CLOSED");

      initDatabase(dbPath);
      expect(epochRow()).toEqual({ epoch: 1, armed: 0 });
      expect(touchEpochs()).toEqual([]);
      expect(gapRow()).toBeUndefined();
      expect(getRuntimeContamination(THREAD_ID)).toBeNull();
    });
  },
);
