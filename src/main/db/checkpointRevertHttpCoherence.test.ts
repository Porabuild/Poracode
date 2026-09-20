import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, initDatabase } from "./connection";
import { dbClaimRemoteCommand, dbCompleteRemoteCommand } from "./remoteCommandReceipts";
import {
  dbClaimCheckpointRevertOperation,
  dbGetCheckpointRevertOperation,
  dbUpdateCheckpointRevertPhases,
} from "./checkpointRevertOperations";
import { mapCheckpointRevertCompletedResponse } from "../remote/server/httpRouter";
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
    expect(dbClaimRemoteCommand(commandId, route)).toEqual({ state: "claimed" });
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
  });
});
