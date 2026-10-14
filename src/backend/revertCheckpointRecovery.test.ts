import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BackendHostCore } from "./BackendHostCore";
import {
  dbAssertNoRunningCheckpointRevert,
  dbClaimCheckpointRevertOperation,
  dbGetCheckpointRevertOperation,
} from "@/host/db/checkpointRevertOperations";
import { dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import { nativeBindingEnv, sqliteAvailable, testThread } from "@/host/db/runtimeItems.testFixtures";

describe.skipIf(!sqliteAvailable)("checkpoint revert recovery boundaries", () => {
  let directory: string;
  let host: BackendHostCore | undefined;

  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    directory = mkdtempSync(join(tmpdir(), "poracode-revert-recovery-"));
  });

  afterEach(async () => {
    await host?.dispose();
    host = undefined;
    rmSync(directory, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it.each([
    { threadId: "other", checkpointItemId: "checkpoint" },
    { threadId: "thread-1", checkpointItemId: "different" },
    {
      threadId: "thread-1",
      checkpointItemId: "checkpoint",
      projectLocation: { kind: "posix" as const, path: "/other" },
    },
  ])("preserves running custody for a conflicting missing target: %j", async (input) => {
    host = new BackendHostCore({
      baseDir: directory,
      dbPath: join(directory, "state.sqlite"),
      supervisor: {
        appVersion: "test",
        isDev: false,
        supervisorPath: "/unused",
        wslHelpersDir: "/unused",
        secretStorageKey: "",
      },
      onEvent() {},
      onReset() {},
    });
    const location = { kind: "posix" as const, path: directory };
    dbUpsertProject(
      { id: "project-1", name: "Project", location, createdAt: "2026-01-01T00:00:00.000Z" },
      0,
    );
    for (const id of ["thread-1", "other"])
      dbUpsertThread({ ...testThread(), id, status: "idle" }, 0);
    dbClaimCheckpointRevertOperation({
      operationKey: "same-key",
      threadId: "thread-1",
      checkpointItemId: "checkpoint",
      projectLocationJson: JSON.stringify(location),
      configJson: null,
    });
    const before = dbGetCheckpointRevertOperation("same-key");
    await expect(host.revertCheckpoint({ ...input, operationKey: "same-key" })).rejects.toThrow(
      /different (target|project location)/,
    );
    expect(dbGetCheckpointRevertOperation("same-key")).toEqual(before);
    expect(() => dbAssertNoRunningCheckpointRevert(["thread-1"])).toThrow(/still running/);
  });

  it.skipIf(process.platform === "win32")(
    "does not repeat relative rollback after a process dies after the provider effect",
    () => {
      writeFileSync(
        join(directory, "thread.json"),
        JSON.stringify({ ...testThread(), status: "idle" }),
      );
      const args = [
        "--import",
        "./src/backend/backendChildProcessRegister.mjs",
        "src/backend/__fixtures__/relativeCheckpointCrash.mjs",
        directory,
      ];
      const crashed = spawnSync(process.execPath, [...args, "crash"], {
        encoding: "utf8",
        timeout: 10_000,
      });
      expect(crashed.signal).toBe("SIGKILL");
      const resumed = spawnSync(process.execPath, [...args, "resume"], {
        encoding: "utf8",
        timeout: 10_000,
      });
      expect(resumed.status).toBe(0);
      expect(resumed.stdout).toContain('"outcome":"ambiguous"');
      expect(readFileSync(join(directory, "rollback-effects"), "utf8")).toBe("rollback\n");
    },
  );
});
