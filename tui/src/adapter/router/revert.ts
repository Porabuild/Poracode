import { mintCheckpointOperationKey } from "@/shared/checkpointRevert";
import { openCodeEvent } from "../events";
import { threadId } from "../ids";
import { logAdapterDebug } from "../diagnostics";
import type { RouterContext } from "./context";

export function createRevert(ctx: RouterContext) {
  const emitRevertEvent = (
    type: "session.revert.staged" | "session.revert.cleared" | "session.revert.committed",
    sessionID: string,
    extra: Record<string, unknown>,
  ) =>
    ctx.input.events.emit(
      openCodeEvent(type, { sessionID, ...extra } as never, {
        durable: {
          aggregateID: sessionID,
          seq: ctx.input.events.nextDurableSequence(sessionID),
          version: 1,
        },
        location: { directory: ctx.input.bootstrap.directory },
      }),
    );
  // A staged revert commits the stored checkpoint when the user sends the next
  // prompt without going through revert.commit — /undo stays reversible until
  // then. Failure surfaces like the commit route's and keeps the prompt away.
  const commitPendingRevert = async (sessionID: string) => {
    const pendingRevert = ctx.pendingReverts.get(sessionID);
    if (!pendingRevert) return undefined;
    const result = await ctx.input.client.checkpointRevert({
      threadId: threadId(sessionID),
      checkpointItemId: pendingRevert.checkpointItemId,
      operationKey: mintCheckpointOperationKey(),
    });
    if (ctx.debug)
      void logAdapterDebug(ctx.input.bootstrap.home, {
        source: "revert.commit",
        threadId: threadId(sessionID),
        messageID: pendingRevert.messageID,
        checkpointItemId: pendingRevert.checkpointItemId,
        result,
      });
    if (result.outcome === "ambiguous")
      return {
        status: 409,
        error: {
          code: "conflict",
          message: "The revert outcome is uncertain — reopen the thread to check.",
        },
      };
    if (result.outcome === "failed")
      return {
        status: 400,
        error: {
          code: "invalid_request",
          message: "Can't restore files for that turn (no checkpoint was captured.)",
        },
      };
    ctx.pendingReverts.delete(sessionID);
    emitRevertEvent("session.revert.committed", sessionID, { to: pendingRevert.messageID });
    return undefined;
  };
  return { emitRevertEvent, commitPendingRevert };
}
