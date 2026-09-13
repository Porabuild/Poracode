import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, initDatabase } from "./connection";
import {
  dbClaimRemoteCommand,
  dbCompleteRemoteCommand,
  dbFailRemoteCommand,
  dbResetRemoteCommand,
} from "./remoteCommandReceipts";
import { nativeBindingEnv, sqliteAvailable } from "./runtimeItems.testFixtures";

describe.skipIf(!sqliteAvailable)("remote_command_receipts startup recovery", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) {
      process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    }
    dir = mkdtempSync(join(tmpdir(), "poracode-receipts-db-test-"));
    initDatabase(join(dir, "state.sqlite"));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("purges stale in_progress receipts at boot so deterministic retries can re-claim", () => {
    // A claim inserts `in_progress`; simulate a crash mid-command where the
    // client's deterministic retry id stays parked on that row forever.
    expect(dbClaimRemoteCommand("thread-start:t1", "/api/threads/t1/start")).toEqual({
      state: "claimed",
    });
    expect(dbClaimRemoteCommand("thread-start:t1", "/api/threads/t1/start")).toEqual({
      state: "in_progress",
    });
    // Settled receipts must survive the restart purge.
    expect(dbClaimRemoteCommand("completed-cmd", "/api/threads/t1/start")).toEqual({
      state: "claimed",
    });
    dbCompleteRemoteCommand("completed-cmd", { ok: true });
    expect(dbClaimRemoteCommand("failed-cmd", "/api/threads/t1/start")).toEqual({
      state: "claimed",
    });
    dbFailRemoteCommand("failed-cmd");

    closeDatabase();
    initDatabase(join(dir, "state.sqlite"));

    // The interrupted command is claimable again; settled receipts replay.
    expect(dbClaimRemoteCommand("thread-start:t1", "/api/threads/t1/start")).toEqual({
      state: "claimed",
    });
    expect(dbClaimRemoteCommand("completed-cmd", "/api/threads/t1/start")).toEqual({
      state: "completed",
      response: { ok: true },
    });
    expect(dbClaimRemoteCommand("failed-cmd", "/api/threads/t1/start")).toEqual({
      state: "failed",
    });
  });

  it("keeps route conflicts enforced within one process lifetime", () => {
    expect(dbClaimRemoteCommand("shared-id", "/api/threads/t1/start")).toEqual({
      state: "claimed",
    });
    expect(dbClaimRemoteCommand("shared-id", "/api/other/route")).toEqual({ state: "conflict" });
    expect(dbClaimRemoteCommand("shared-id", "/api/threads/t1/start")).toEqual({
      state: "in_progress",
    });
  });

  it("releases a retryable receipt while preserving route ownership semantics", () => {
    expect(dbClaimRemoteCommand("retryable-cmd", "/api/threads/t1/checkpoint-revert")).toEqual({
      state: "claimed",
    });
    dbResetRemoteCommand("retryable-cmd");
    expect(dbClaimRemoteCommand("retryable-cmd", "/api/other/route")).toEqual({
      state: "conflict",
    });
    expect(dbClaimRemoteCommand("retryable-cmd", "/api/threads/t1/checkpoint-revert")).toEqual({
      state: "claimed",
    });
    expect(dbClaimRemoteCommand("retryable-cmd", "/api/other/route")).toEqual({
      state: "conflict",
    });
  });

  it("reclaims a legacy completed retryable response only with an explicit predicate", () => {
    expect(dbClaimRemoteCommand("legacy-failed", "/api/checkpoint-revert")).toEqual({
      state: "claimed",
    });
    dbCompleteRemoteCommand("legacy-failed", {
      outcome: "failed",
      providerPhase: "completed",
      filesPhase: "failed",
      truncatePhase: "pending",
    });
    expect(dbClaimRemoteCommand("legacy-failed", "/api/checkpoint-revert")).toMatchObject({
      state: "completed",
    });
    expect(
      dbClaimRemoteCommand("legacy-failed", "/api/checkpoint-revert", {
        isCompletedResponseRetryable: (response) =>
          Boolean(response && typeof response === "object" && "outcome" in response) &&
          (response as { outcome?: unknown }).outcome === "failed",
      }),
    ).toEqual({ state: "claimed" });
  });
});
