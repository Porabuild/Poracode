import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import {
  dbClaimRemoteCommand,
  dbCompleteRemoteCommand,
  dbMarkRemoteCommandUncertain,
} from "./remoteCommandReceipts";
import {
  dbClaimCheckpointRevertOperation,
  dbGetCheckpointRevertOperation,
  dbUpdateCheckpointRevertPhases,
} from "./checkpointRevertOperations";
import { mapCheckpointRevertCompletedResponse } from "@/host/remote/server/httpRouter";
import {
  remoteCommandRequestDigest,
  runRemoteCommand,
} from "@/host/remote/server/remoteCommandIdempotency";
import { nativeBindingEnv, sqliteAvailable } from "./runtimeItems.testFixtures";

/**
 * Focused HTTP coherence: the outer `remote_command_receipts` cache hit for
 * `POST /api/threads/{id}/checkpoint-revert` must not bypass the canonical
 * inner-journal target check. Exercises the actual route validator plus the
 * real journal rows (owned temp DB), not source-text assertions.
 */
describe.skipIf(!sqliteAvailable)("checkpoint revert HTTP receipt coherence", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) {
      process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    }
    dir = mkdtempSync(join(tmpdir(), "poracode-checkpoint-http-coherence-"));
    initDatabase(join(dir, "state.sqlite"));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  const seedCompletedInner = (operationKey: string): void => {
    const claim = dbClaimCheckpointRevertOperation({
      operationKey,
      threadId: "thread-1",
      checkpointItemId: "checkpoint",
      projectLocationJson: null,
      configJson: null,
    });
    expect(claim.kind).toBe("claimed");
    dbUpdateCheckpointRevertPhases(operationKey, {
      providerPhase: "completed",
      filesPhase: "completed",
      truncatePhase: "completed",
      outcome: "completed",
    });
    expect(dbGetCheckpointRevertOperation(operationKey)?.outcome).toBe("completed");
  };

  const seedOuterCompleted = (commandId: string, route: string, response: unknown): void => {
    // Pre-binding (legacy) outer row: no principal/digest attribution.
    expect(
      dbClaimRemoteCommand(commandId, { route, principalId: null, requestDigest: null }),
    ).toEqual({ state: "claimed" });
    dbCompleteRemoteCommand(commandId, response);
  };

  it("replays the frozen outer receipt for the same explicit request with replayed:true", () => {
    seedCompletedInner("op-http-1");
    const cached = {
      outcome: "completed",
      replayed: false,
      numTurns: 1,
      providerPhase: "completed",
      filesPhase: "completed",
      truncatePhase: "completed",
      removedCompletedTurnAnchors: [],
    };
    seedOuterCompleted(
      "checkpoint-revert:op-http-1",
      "/api/threads/thread-1/checkpoint-revert",
      cached,
    );

    const replayed = mapCheckpointRevertCompletedResponse(
      { threadId: "thread-1", checkpointItemId: "checkpoint", operationKey: "op-http-1" },
      cached,
    ) as typeof cached;
    expect(replayed.replayed).toBe(true);
    expect(replayed.outcome).toBe("completed");
    expect(replayed.numTurns).toBe(1);
  });

  it("conflicts with zero side effects when the same ID targets a different checkpoint", () => {
    seedCompletedInner("op-http-2");
    const cached = {
      outcome: "completed",
      replayed: false,
      numTurns: 1,
      providerPhase: "completed",
      filesPhase: "completed",
      truncatePhase: "completed",
      removedCompletedTurnAnchors: [],
    };
    seedOuterCompleted(
      "checkpoint-revert:op-http-2",
      "/api/threads/thread-1/checkpoint-revert",
      cached,
    );

    expect(() =>
      mapCheckpointRevertCompletedResponse(
        { threadId: "thread-1", checkpointItemId: "other-checkpoint", operationKey: "op-http-2" },
        cached,
      ),
    ).toThrow(/already used for another operation/);
    // The inner frozen plan is untouched by the rejected replay.
    expect(dbGetCheckpointRevertOperation("op-http-2")?.checkpointItemId).toBe("checkpoint");
  });

  it("replays a pre-upgrade outer receipt without starting a new mutation when the inner row is gone", () => {
    // Legacy outer receipt with no inner journal row (retention-aged or
    // pre-journal): replay safely instead of reinterpreting as a new mutation.
    const cached = {
      outcome: "completed",
      replayed: false,
      numTurns: 2,
      providerPhase: "completed",
      filesPhase: "completed",
      truncatePhase: "completed",
      removedCompletedTurnAnchors: [],
    };
    seedOuterCompleted(
      "checkpoint-revert:legacy-no-inner",
      "/api/threads/thread-1/checkpoint-revert",
      cached,
    );

    // B2: a bound retry must pass the route's journal validator; the legacy row
    // stays unbound (never attributed to the retrying principal) and never
    // starts a new mutation.
    expect(
      dbClaimRemoteCommand(
        "checkpoint-revert:legacy-no-inner",
        {
          route: "/api/threads/thread-1/checkpoint-revert",
          principalId: "session-1",
          requestDigest: "digest-1",
        },
        { isLegacyCompletedResponseReplayable: () => true },
      ),
    ).toEqual({ state: "completed", response: cached });

    const replayed = mapCheckpointRevertCompletedResponse(
      {
        threadId: "thread-1",
        checkpointItemId: "checkpoint",
        operationKey: "legacy-no-inner",
      },
      cached,
    ) as typeof cached;
    expect(replayed.replayed).toBe(true);
    expect(replayed.numTurns).toBe(2);
    expect(dbGetCheckpointRevertOperation("legacy-no-inner")).toBeNull();
    expect(
      getSqlite()
        .prepare(
          "SELECT principal_id, request_digest FROM remote_command_receipts WHERE command_id = ?",
        )
        .get("checkpoint-revert:legacy-no-inner"),
    ).toEqual({ principal_id: null, request_digest: null });
  });

  it("resumes an interrupted post-upgrade revert through its journal instead of re-running it", async () => {
    seedCompletedInner("op-resume");
    const payload = {
      threadId: "thread-1",
      checkpointItemId: "checkpoint",
      operationKey: "op-resume",
    };
    const route = "/api/threads/thread-1/checkpoint-revert";
    const commandId = "checkpoint-revert:op-resume";
    expect(
      dbClaimRemoteCommand(commandId, {
        route,
        principalId: "session-1",
        requestDigest: remoteCommandRequestDigest(payload),
      }),
    ).toEqual({ state: "claimed" });
    // Crash before the outer completion write: the bound receipt is uncertain.
    dbMarkRemoteCommandUncertain(commandId);

    const journalClaims: string[] = [];
    const result = await runRemoteCommand({
      commandId,
      route,
      principalId: "session-1",
      requestPayload: payload,
      operation: async (markDispatched) => {
        markDispatched();
        const claim = dbClaimCheckpointRevertOperation({
          ...payload,
          projectLocationJson: null,
          configJson: null,
        });
        journalClaims.push(claim.kind);
        return { outcome: claim.row.outcome, replayed: claim.kind === "replay" };
      },
      reconcileUncertain: () => ({ kind: "resume" }),
    });
    // The journal proves the destructive provider phase already ran: the
    // resume replays the frozen outcome and never starts a new mutation.
    expect(journalClaims).toEqual(["replay"]);
    expect(result).toEqual({ outcome: "completed", replayed: true });

    // The outer receipt settles, so a later retry replays without touching the
    // journal at all.
    await expect(
      runRemoteCommand({
        commandId,
        route,
        principalId: "session-1",
        requestPayload: payload,
        operation: () => {
          throw new Error("must not run");
        },
      }),
    ).resolves.toEqual({ outcome: "completed", replayed: true });
  });
});
