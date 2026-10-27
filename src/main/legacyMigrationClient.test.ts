import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnSyncMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => unknown>());

vi.mock("node:child_process", async (importActual) => {
  const actual = await importActual<typeof import("node:child_process")>();
  return {
    ...actual,
    spawnSync: spawnSyncMock,
  };
});

vi.mock("better-sqlite3", () => ({
  default: class TestDatabase {},
}));

import { migrateLegacyDataOutOfProcess } from "./legacyMigrationClient";

describe("migrateLegacyDataOutOfProcess", () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), "poracode-migration-client-"));
    spawnSyncMock.mockReset();
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  const options = () => ({
    baseDir,
    channel: "stable" as const,
    allowCustomDataRoot: true,
  });

  it("returns the settled result without spawning the worker", () => {
    writeFileSync(join(baseDir, ".lightcode-migration-v1.json"), "{}");

    expect(migrateLegacyDataOutOfProcess(options())).toEqual({ status: "already-complete" });
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });

  it("spawns the worker once when nothing is settled and returns its result", () => {
    const workerResult = { status: "no-legacy-data" };
    spawnSyncMock.mockReturnValue({
      status: 0,
      stdout: JSON.stringify(workerResult),
      stderr: "",
    });

    expect(migrateLegacyDataOutOfProcess(options())).toEqual(workerResult);
    expect(spawnSyncMock).toHaveBeenCalledOnce();
  });
});
