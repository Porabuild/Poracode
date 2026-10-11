/**
 * Headless failed-startup custody regression (B1 durable-gap review follow-through):
 * `composeHeadlessRemoteHost` only assigns `backendHostRef` after the core
 * constructor returns. When the constructor throws after SQLite opened and its
 * cleanup close is refused, the failed instance is unreachable; the composition
 * must still retry that close through the core's retained-custody handoff and
 * must refuse to release the outer owner lease while the database stays open.
 *
 * Real path: real HostOwnerController + real `initDatabase`/`closeDatabase` +
 * real before-close hook; only the supervisor constructor is mocked to throw.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nativeBindingEnv, sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";

const state = vi.hoisted(() => ({
  supervisorError: null as Error | null,
  refuseCloseAttempts: 0,
  closeAttempts: 0,
}));

vi.mock("@/host/supervisor/SupervisorClient", () => ({
  SupervisorClient: class {
    constructor() {
      throw state.supervisorError ?? new Error("supervisor-constructor-boom");
    }
  },
}));

import { closeDatabase, getSqlite, registerBeforeDatabaseClose } from "@/host/db/connection";
import { HostOwnerController } from "@/backend/ownership/HostOwnerController";
import { HostRootInUseError } from "@/backend/ownership/hostOwnerLease";
import { createHeadlessRemoteHost, type HeadlessRemoteHost } from "./createHeadlessRemoteHost";
import { HeadlessCompositionShutdownError } from "./headlessRemoteComposition";

if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;

registerBeforeDatabaseClose(() => {
  state.closeAttempts++;
  if (state.refuseCloseAttempts > 0) {
    state.refuseCloseAttempts--;
    throw new Error("close-hook-refused");
  }
});

function makeHost(baseDir: string): Promise<HeadlessRemoteHost> {
  return createHeadlessRemoteHost({
    appVersion: "9.9.9-test",
    baseDir,
    supervisorPath: "/fixture/supervisor.cjs",
    wslHelpersDir: "/fixture/wsl",
    environmentKey: Buffer.alloc(32, 7).toString("base64"),
    host: "127.0.0.1",
    advertisedHost: "127.0.0.1",
    port: 0,
  });
}

describe.skipIf(!sqliteAvailable)("headless failed-startup custody handoff", () => {
  let root: string;
  let baseDir: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "poracode-headless-custody-"));
    baseDir = join(root, "profile");
    state.supervisorError = new Error("supervisor-constructor-boom");
    state.refuseCloseAttempts = 0;
    state.closeAttempts = 0;
  });

  afterEach(() => {
    state.refuseCloseAttempts = 0;
    state.supervisorError = null;
    // The persistent-refusal case intentionally keeps its real handle until
    // here; every case is closed for real before the fixture directory goes.
    try {
      closeDatabase();
    } catch {
      // No open handle left (the one-shot case already closed it).
    }
    rmSync(root, { recursive: true, force: true });
  });

  it("retries a one-shot refused constructor close and releases the owner cleanly", async () => {
    state.refuseCloseAttempts = 1; // the constructor's own cleanup close

    let failure: unknown;
    try {
      await makeHost(baseDir);
    } catch (error) {
      failure = error;
    }

    // The original construction failure is preserved (no shutdown wrap), the
    // retry through the dispose barrier actually closed the database, and the
    // namespace owner was released because shutdown confirmed.
    expect(failure).toBe(state.supervisorError);
    expect(state.closeAttempts).toBe(2);
    expect(() => getSqlite()).toThrow("Database not initialized");
    const successor = HostOwnerController.acquire(baseDir, "desktop");
    await successor.close();
  });

  it("retains the owner lease and the live database when the refused close persists", async () => {
    state.refuseCloseAttempts = Number.POSITIVE_INFINITY;

    let failure: unknown;
    try {
      await makeHost(baseDir);
    } catch (error) {
      failure = error;
    }

    // Both the original failure and the unconfirmed shutdown are reported,
    // the outer owner keeps the lease, and the still-open handle stays the
    // only writer while the process lives.
    expect(failure).toBeInstanceOf(HeadlessCompositionShutdownError);
    expect((failure as HeadlessCompositionShutdownError).errors[0]).toBe(state.supervisorError);
    expect(state.closeAttempts).toBe(2); // constructor attempt + barrier retry
    expect(() => getSqlite()).not.toThrow();
    expect(() => HostOwnerController.acquire(baseDir, "desktop")).toThrow(HostRootInUseError);
  });
});
