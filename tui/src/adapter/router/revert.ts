import {
  findCheckpointBeforeUserMessage,
  mintCheckpointOperationKey,
} from "@/shared/checkpointRevert";
import { json, record } from "./helpers";
import { itemId, parseSubSessionId, threadId } from "../ids";
import { openCodeEvent } from "../events";
import { logAdapterDebug } from "../diagnostics";
import type { RouteArgs, RouterContext } from "./context";

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

/** Revert stage/commit/clear/delete routes. */
export async function handleRevertRoutes({
  ctx,
  method,
  path,
  readBody,
}: RouteArgs): Promise<Response | undefined> {
  const {
    input,
    pendingReverts,
    emitRevertEvent,
    commitPendingRevert,
    listThreadItems,
    isHiddenThread,
  } = ctx;

  const revertStageMatch = path.match(/^\/api\/session\/([^/]+)\/revert\/stage$/u);
  if (revertStageMatch && method === "POST") {
    const revertSession = decodeURIComponent(revertStageMatch[1]!);
    const rawId = threadId(revertSession);
    if (parseSubSessionId(revertSession))
      return json({ error: { code: "read_only", message: "This session is read-only" } }, 400);
    if (await isHiddenThread(rawId))
      return json({ error: { code: "not_found", message: "Session not found" } }, 404);
    const body = record(await readBody());
    const userItemId = itemId(String(body.messageID ?? ""));
    const items = await listThreadItems(rawId);
    const itemsById = Object.fromEntries(items.map((item) => [item.id, item]));
    const checkpointItemId = findCheckpointBeforeUserMessage(
      items.map((item) => item.id),
      itemsById,
      userItemId,
    );
    if (!checkpointItemId)
      return json(
        {
          error: {
            code: "invalid_request",
            message: "Nothing to undo before the first message.",
          },
        },
        400,
      );
    // Stage only marks the boundary — the irreversible checkpointRevert
    // runs on commit, which the vendored prompt sends before the next
    // message. Until then /redo (clear) restores the view.
    pendingReverts.set(revertSession, {
      messageID: String(body.messageID ?? ""),
      checkpointItemId,
    });
    emitRevertEvent("session.revert.staged", revertSession, {
      revert: { messageID: String(body.messageID ?? "") },
    });
    if (ctx.debug)
      void logAdapterDebug(input.bootstrap.home, {
        source: "revert.stage",
        threadId: rawId,
        messageID: String(body.messageID ?? ""),
        checkpointItemId,
      });
    // session.revert.stage declares 200 + SessionRevert — the vendored
    // undo prefills the prompt from the staged message.
    return json({ data: { messageID: String(body.messageID ?? "") } });
  }
  const revertEndMatch = path.match(/^\/api\/session\/([^/]+)\/revert\/(commit|clear)$/u);
  if (revertEndMatch && method === "POST") {
    const revertSession = decodeURIComponent(revertEndMatch[1]!);
    if (revertEndMatch[2] === "commit" && pendingReverts.has(revertSession)) {
      const failure = await commitPendingRevert(revertSession);
      if (failure) return json({ error: failure.error }, failure.status);
      return new Response(null, { status: 204 });
    }
    pendingReverts.delete(revertSession);
    emitRevertEvent("session.revert.cleared", revertSession, {});
    return new Response(null, { status: 204 });
  }
  // The generated client sends revert.clear as DELETE /session/{id}/revert.
  const revertDeleteMatch = path.match(/^\/api\/session\/([^/]+)\/revert$/u);
  if (revertDeleteMatch && method === "DELETE") {
    const revertSession = decodeURIComponent(revertDeleteMatch[1]!);
    pendingReverts.delete(revertSession);
    emitRevertEvent("session.revert.cleared", revertSession, {});
    return new Response(null, { status: 204 });
  }
  // Background tasks surface as vendored shells. Only the last progress
  // snapshot is available — output pages read it as a byte range.
  return undefined;
}
