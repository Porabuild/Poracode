import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, initDatabase } from "./connection";
import {
  dbClaimCheckpointRevertOperation,
  dbGetCheckpointRevertOperation,
  dbUpdateCheckpointRevertPhases,
} from "./checkpointRevertOperations";
import { nativeBindingEnv, sqliteAvailable } from "./runtimeItems.testFixtures";

describe.skipIf(!sqliteAvailable)("checkpoint revert phase updates", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) {
      process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    }
    dir = mkdtempSync(join(tmpdir(), "poracode-checkpoint-revert-ops-"));
    initDatabase(join(dir, "state.sqlite"));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  function claimRunning(operationKey: string): void {
    const claim = dbClaimCheckpointRevertOperation({
      operationKey,
      threadId: "thread-1",
      checkpointItemId: "checkpoint",
      projectLocationJson: null,
      configJson: null,
    });
    expect(claim.kind).toBe("claimed");
  }

  it.each(["completed", "ambiguous"] as const)(
    "refuses to overwrite a settled %s row",
    (outcome) => {
      claimRunning(`op-${outcome}`);
      dbUpdateCheckpointRevertPhases(`op-${outcome}`, {
        providerPhase: outcome === "ambiguous" ? "ambiguous" : "completed",
        filesPhase: "completed",
        truncatePhase: "completed",
        outcome,
      });
      expect(dbGetCheckpointRevertOperation(`op-${outcome}`)?.outcome).toBe(outcome);

      expect(() =>
        dbUpdateCheckpointRevertPhases(`op-${outcome}`, {
          outcome: "completed",
          truncatePhase: "noop",
        }),
      ).toThrow(/missing or already settled/u);
      expect(dbGetCheckpointRevertOperation(`op-${outcome}`)?.outcome).toBe(outcome);
    },
  );
});
