/**
 * Failed-startup data-custody regression (B1 durable-gap review F1): when a
 * `BackendHostCore` constructor fails after SQLite opened and the close hook
 * refuses, the SQLite handle stays open and writable (`closeDatabase`'s
 * documented failed-hook contract). The constructor must then keep the data
 * fence — a successor acquisition must be refused — and report the original
 * constructor error; only a successful close may release custody.
 *
 * Real path: real `initDatabase`/`closeDatabase` + real before-close hook +
 * real `HostDataFence`; only the supervisor constructor is mocked to throw.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nativeBindingEnv, sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";

const state = vi.hoisted(() => ({ supervisorError: null as Error | null }));

vi.mock("@/host/supervisor/SupervisorClient", () => ({
  SupervisorClient: class {
    constructor() {
      throw state.supervisorError ?? new Error("supervisor-constructor-boom");
    }
  },
}));

import { closeDatabase, registerBeforeDatabaseClose } from "@/host/db/connection";
import { BackendHostCore, type RetainedStartupCustody } from "./BackendHostCore";
import { HostDataFence, HostDataFenceInUseError } from "./ownership/hostDataFence";

if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;

let closeHookRefuses = false;
registerBeforeDatabaseClose(() => {
  if (closeHookRefuses) throw new Error("close-hook-refused");
});

function coreOptions(dir: string) {
  return {
    baseDir: dir,
    dbPath: join(dir, "state.sqlite"),
    dataFencePath: join(dir, "state.host-data.sqlite"),
    supervisor: {
      appVersion: "test",
      isDev: false,
      supervisorPath: join(dir, "supervisor.cjs"),
      wslHelpersDir: join(dir, "wsl"),
      secretStorageKey: "fixture",
    },
    onEvent: () => undefined,
    onReset: () => undefined,
  };
}

describe.skipIf(!sqliteAvailable)("BackendHostCore failed-startup data custody", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("releases custody when the failed-startup close succeeds", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-custody-release-"));
    const fencePath = join(dir, "state.host-data.sqlite");
    try {
      expect(() => new BackendHostCore(coreOptions(dir))).toThrow("supervisor-constructor-boom");
      const successor = HostDataFence.acquire(fencePath);
      successor.release();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps custody when the failed-startup close is refused", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-custody-retain-"));
    const fencePath = join(dir, "state.host-data.sqlite");
    const acquire = vi.spyOn(HostDataFence, "acquire");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.supervisorError = new Error("supervisor-constructor-boom");
    closeHookRefuses = true;
    let thrown: unknown;
    try {
      try {
        const construct = () => new BackendHostCore(coreOptions(dir));
        construct();
      } catch (error) {
        thrown = error;
      }
      // The original constructor error survives the refused cleanup ...
      expect(thrown).toBe(state.supervisorError);
      // ... the still-open root refuses a successor owner ...
      expect(() => HostDataFence.acquire(fencePath)).toThrow(HostDataFenceInUseError);
      // ... and the cleanup failure is reported as retained custody.
      expect(
        consoleError.mock.calls.some(
          ([message]) =>
            message === "[backend] database close refused during failed startup; custody retained:",
        ),
      ).toBe(true);
    } finally {
      closeHookRefuses = false;
      for (const result of acquire.mock.results) {
        if (result.type === "return" && result.value instanceof HostDataFence)
          result.value.release();
      }
      closeDatabase();
      state.supervisorError = null;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("hands the refused failed-startup close to the retryable custody handle", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-custody-handoff-"));
    const fencePath = join(dir, "state.host-data.sqlite");
    const acquire = vi.spyOn(HostDataFence, "acquire");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.supervisorError = new Error("supervisor-constructor-boom");
    closeHookRefuses = true;
    let custody: RetainedStartupCustody | null = null;
    let thrown: unknown;
    try {
      try {
        const construct = () =>
          new BackendHostCore({
            ...coreOptions(dir),
            onStartupCustodyRetained: (handle) => {
              custody = handle;
            },
          });
        construct();
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBe(state.supervisorError);
      expect(custody).not.toBeNull();
      expect(() => HostDataFence.acquire(fencePath)).toThrow(HostDataFenceInUseError);

      // Once the hook stops refusing, the handed-off handle closes the real
      // database, releases the fence, and stays a no-op on repeat.
      closeHookRefuses = false;
      custody!.retryCloseDatabase();
      const successor = HostDataFence.acquire(fencePath);
      successor.release();
      custody!.retryCloseDatabase();
      expect(consoleError).toHaveBeenCalled();
    } finally {
      closeHookRefuses = false;
      for (const result of acquire.mock.results) {
        if (result.type === "return" && result.value instanceof HostDataFence)
          result.value.release();
      }
      closeDatabase();
      state.supervisorError = null;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
