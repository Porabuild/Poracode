import type Database from "better-sqlite3";
import { withRuntimeBusyTimeout } from "./runtimeBusyTimeout";
import type { RuntimeAtomicBatchWriter } from "./runtimeWriteQueue";

/**
 * Execute a cached top-level SQLite transaction under one zero-timeout scope.
 * The operation must return only after its .immediate() has committed. There
 * are no externally observable callbacks inside it. In particular, releasing
 * a savepoint is insufficient evidence for a queue acknowledgement.
 */
export function commitRuntimeAtomicWrite(
  sqlite: InstanceType<typeof Database>,
  transaction: () => void,
): ReturnType<RuntimeAtomicBatchWriter> {
  if (sqlite.inTransaction) {
    throw new Error("An atomic runtime batch must own the outer SQLite transaction.");
  }
  let committed = false;
  let rolledBack = false;
  let transactionFailure: { error: unknown } | undefined;
  try {
    withRuntimeBusyTimeout(() => {
      try {
        transaction();
        committed = true;
      } catch (error) {
        transactionFailure = { error };
        // better-sqlite3 rolls back a failed body OR a failed COMMIT before
        // rethrowing. Certify that it really exited our top-level transaction;
        // a failed rollback or closed handle supplies no replay permission.
        rolledBack = sqlite.open && !sqlite.inTransaction;
        throw error;
      }
    });
  } catch (error) {
    if (committed) {
      // A timeout-restoration error cannot turn a durable append into pending
      // work. Report cleanup separately, while preserving the commit receipt.
      try {
        console.error("[db] runtime batch committed but busy-timeout restoration failed:", error);
      } catch {
        /* Reporting must never revoke an actual commit. */
      }
    } else if (rolledBack) {
      // Preserve the SQL classification even if restoring the scope also failed.
      return { kind: "rolled-back", error: transactionFailure!.error };
    } else {
      throw transactionFailure?.error ?? error;
    }
  }
  return { kind: "committed" };
}
