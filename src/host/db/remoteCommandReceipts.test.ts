import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import {
  dbClaimRemoteCommand,
  dbCompleteRemoteCommand,
  dbFailRemoteCommand,
  dbMarkRemoteCommandUncertain,
  dbResetRemoteCommand,
  type RemoteCommandReceiptIdentity,
} from "./remoteCommandReceipts";
import { nativeBindingEnv, sqliteAvailable } from "./runtimeItems.testFixtures";

const ROUTE = "/api/threads/t1/start";

function identity(
  overrides: Partial<RemoteCommandReceiptIdentity> = {},
): RemoteCommandReceiptIdentity {
  return {
    route: overrides.route ?? ROUTE,
    principalId: overrides.principalId === undefined ? "session-a" : overrides.principalId,
    requestDigest: overrides.requestDigest === undefined ? "digest-1" : overrides.requestDigest,
  };
}

/**
 * Crash/reconnect matrix for remote command receipts. Every restart is a real
 * SQLite close + reopen, so the assertions describe what an actual process
 * crash leaves behind, not an in-memory state transition.
 */
describe.skipIf(!sqliteAvailable)("remote_command_receipts crash-aware recovery", () => {
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

  const reopen = () => {
    closeDatabase();
    initDatabase(join(dir, "state.sqlite"));
  };

  const seedLegacyReceipt = (commandId: string, state: string, response?: unknown) => {
    expect(
      dbClaimRemoteCommand(commandId, identity({ principalId: null, requestDigest: null })),
    ).toEqual({ state: "claimed" });
    if (state === "completed") dbCompleteRemoteCommand(commandId, response);
    if (state === "failed") dbFailRemoteCommand(commandId);
    if (state === "retryable") dbResetRemoteCommand(commandId);
    if (state === "uncertain") dbMarkRemoteCommandUncertain(commandId);
  };

  it("binds a completed receipt to the exact principal and validated body digest", () => {
    expect(dbClaimRemoteCommand("cmd", identity())).toEqual({ state: "claimed" });
    expect(dbClaimRemoteCommand("cmd", identity())).toEqual({ state: "in_progress" });
    dbCompleteRemoteCommand("cmd", { ok: true });

    expect(dbClaimRemoteCommand("cmd", identity())).toEqual({
      state: "completed",
      response: { ok: true },
    });
    // Another principal never sees the cached response.
    expect(dbClaimRemoteCommand("cmd", identity({ principalId: "session-b" }))).toEqual({
      state: "conflict",
    });
    // The same principal with a changed validated body conflicts too.
    expect(dbClaimRemoteCommand("cmd", identity({ requestDigest: "digest-2" }))).toEqual({
      state: "conflict",
    });
  });

  it("conflicts a concurrent claim from another principal while in progress", () => {
    expect(dbClaimRemoteCommand("cmd", identity())).toEqual({ state: "claimed" });
    expect(dbClaimRemoteCommand("cmd", identity({ principalId: "session-b" }))).toEqual({
      state: "conflict",
    });
    expect(dbClaimRemoteCommand("cmd", identity())).toEqual({ state: "in_progress" });
  });

  it("keeps an interrupted bound receipt uncertain across a crash and never replays it as failed", () => {
    expect(dbClaimRemoteCommand("cmd", identity())).toEqual({ state: "claimed" });
    reopen();

    expect(dbClaimRemoteCommand("cmd", identity())).toEqual({ state: "uncertain", bound: true });
    expect(dbClaimRemoteCommand("cmd", identity())).toEqual({ state: "uncertain", bound: true });
    // A different principal still cannot touch the interrupted row.
    expect(dbClaimRemoteCommand("cmd", identity({ principalId: "session-b" }))).toEqual({
      state: "conflict",
    });
  });

  it("preserves a bound completed receipt across a crash for the same identity only", () => {
    expect(dbClaimRemoteCommand("cmd", identity())).toEqual({ state: "claimed" });
    dbCompleteRemoteCommand("cmd", { threadId: "t1" });
    reopen();

    expect(dbClaimRemoteCommand("cmd", identity())).toEqual({
      state: "completed",
      response: { threadId: "t1" },
    });
    expect(dbClaimRemoteCommand("cmd", identity({ requestDigest: "changed" }))).toEqual({
      state: "conflict",
    });
  });

  it("keeps legacy pre-binding in_progress rows as unbound uncertain across the upgrade", () => {
    expect(
      dbClaimRemoteCommand(
        "legacy-interrupted",
        identity({ principalId: null, requestDigest: null }),
      ),
    ).toEqual({ state: "claimed" });
    reopen();

    expect(dbClaimRemoteCommand("legacy-interrupted", identity())).toEqual({
      state: "uncertain",
      bound: false,
    });
    expect(
      getSqlite()
        .prepare("SELECT state FROM remote_command_receipts WHERE command_id = ?")
        .get("legacy-interrupted"),
    ).toEqual({
      state: "uncertain",
    });
  });

  it("never attributes a legacy completed receipt to the claiming principal", () => {
    seedLegacyReceipt("legacy-completed", "completed", { ok: true });

    // No route validator: the frozen response is withheld (typed uncertain).
    expect(dbClaimRemoteCommand("legacy-completed", identity())).toEqual({
      state: "uncertain",
      bound: false,
    });
    // A validator with independent journal proof may replay it without binding.
    expect(
      dbClaimRemoteCommand("legacy-completed", identity(), {
        isLegacyCompletedResponseReplayable: (response) =>
          Boolean(response && typeof response === "object" && "ok" in response),
      }),
    ).toEqual({ state: "completed", response: { ok: true } });
    const row = getSqlite()
      .prepare(
        "SELECT principal_id, request_digest, state FROM remote_command_receipts WHERE command_id = ?",
      )
      .get("legacy-completed");
    expect(row).toEqual({ principal_id: null, request_digest: null, state: "completed" });
  });

  it("preserves legacy retryable releases and definite failures for the same route", () => {
    seedLegacyReceipt("legacy-retryable", "retryable");
    expect(dbClaimRemoteCommand("legacy-retryable", identity())).toEqual({ state: "claimed" });

    seedLegacyReceipt("legacy-failed", "failed");
    expect(dbClaimRemoteCommand("legacy-failed", identity())).toEqual({ state: "failed" });
    expect(dbClaimRemoteCommand("legacy-failed", identity({ route: "/api/other" }))).toEqual({
      state: "conflict",
    });
  });

  it("reclaims a completed retryable response only with an explicit predicate", () => {
    expect(dbClaimRemoteCommand("retryable-completed", identity())).toEqual({ state: "claimed" });
    dbCompleteRemoteCommand("retryable-completed", {
      outcome: "failed",
      providerPhase: "completed",
      filesPhase: "failed",
      truncatePhase: "pending",
    });
    expect(dbClaimRemoteCommand("retryable-completed", identity())).toMatchObject({
      state: "completed",
    });
    expect(
      dbClaimRemoteCommand("retryable-completed", identity(), {
        isCompletedResponseRetryable: (response) =>
          Boolean(response && typeof response === "object" && "outcome" in response) &&
          (response as { outcome?: unknown }).outcome === "failed",
      }),
    ).toEqual({ state: "claimed" });
  });

  it("releases a retryable receipt while preserving route ownership semantics", () => {
    expect(dbClaimRemoteCommand("retryable-cmd", identity())).toEqual({ state: "claimed" });
    dbResetRemoteCommand("retryable-cmd");
    expect(dbClaimRemoteCommand("retryable-cmd", identity({ route: "/api/other/route" }))).toEqual({
      state: "conflict",
    });
    expect(dbClaimRemoteCommand("retryable-cmd", identity())).toEqual({ state: "claimed" });
    expect(dbClaimRemoteCommand("retryable-cmd", identity({ route: "/api/other/route" }))).toEqual({
      state: "conflict",
    });
  });

  it("marks a dispatched in_progress receipt uncertain without disturbing settled rows", () => {
    expect(dbClaimRemoteCommand("cmd", identity())).toEqual({ state: "claimed" });
    dbMarkRemoteCommandUncertain("cmd");
    expect(dbClaimRemoteCommand("cmd", identity())).toEqual({ state: "uncertain", bound: true });

    expect(dbClaimRemoteCommand("done", identity())).toEqual({ state: "claimed" });
    dbCompleteRemoteCommand("done", { ok: true });
    dbMarkRemoteCommandUncertain("done");
    expect(dbClaimRemoteCommand("done", identity())).toEqual({
      state: "completed",
      response: { ok: true },
    });
  });

  it("keeps route conflicts enforced across a restart", () => {
    expect(dbClaimRemoteCommand("shared-id", identity({ route: "/api/threads/t1/start" }))).toEqual(
      {
        state: "claimed",
      },
    );
    expect(dbClaimRemoteCommand("shared-id", identity({ route: "/api/other/route" }))).toEqual({
      state: "conflict",
    });
    reopen();
    expect(dbClaimRemoteCommand("shared-id", identity({ route: "/api/other/route" }))).toEqual({
      state: "conflict",
    });
    expect(dbClaimRemoteCommand("shared-id", identity({ route: "/api/threads/t1/start" }))).toEqual(
      {
        state: "uncertain",
        bound: true,
      },
    );
  });
});
