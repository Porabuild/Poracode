import { fenceRefusalError } from "@/host/db/runtimeItems";
import { beginRuntimeFence, flushRuntimeFence } from "@/host/db/runtimePersistenceRuntime";
import { RuntimePersistenceBusyError } from "@/host/db/runtimePersistenceTypes";
import type { RuntimeFenceToken } from "@/host/db/runtimePersistenceTypes";
import { RemoteHttpError } from "../auth";
import { mapPersistenceRefusal } from "./persistenceRefusals";

/**
 * B4 history fence composition. Degraded and contaminated persistence refusals
 * reuse the one B1 HTTP mapping (`persistenceRefusals.ts`); the only
 * read-specific case is a busy gate, which a read path reports as
 * `persistence_read_refused` (the write path's `persistence_busy` would
 * misdescribe a refused cursor-consistent read). No persistence internals are
 * touched here.
 */
export function mapHistoryPersistenceRefusal(error: unknown): unknown {
  if (error instanceof RuntimePersistenceBusyError) {
    return new RemoteHttpError(
      "persistence_read_refused",
      `Host persistence refused a read for thread "${error.threadId}": too many concurrent readers. Retry shortly.`,
      503,
      error.retryAfterMs,
    );
  }
  return mapPersistenceRefusal(error);
}

/**
 * Flushes a fence token opened by the caller and maps a failed outcome to the
 * typed retryable refusal. The caller opens the token and captures `ctx.seq`
 * in the same synchronous turn before this await, so the served content is
 * exactly the committed prefix at the request's pinned cursor.
 */
export async function flushHistoryFenceOrThrow(
  threadId: string,
  token: RuntimeFenceToken,
): Promise<void> {
  const result = await flushRuntimeFence(token);
  if (result.kind !== "committed") {
    throw mapHistoryPersistenceRefusal(fenceRefusalError(threadId, result));
  }
}

export { beginRuntimeFence };
