import { WebSocket } from "ws";
import {
  TERMINAL_CURSOR_SYNC_V2_VERSION,
  type RemoteTerminalCursorSyncRequest,
  type RemoteTerminalWatchResult,
} from "@/shared/remote";
import { type AuthenticatedRemoteSession } from "../auth";
import type { RemoteServerContext } from "./context";
import { PrincipalOverloadError } from "./principalAdmission";
import {
  buildTerminalWatchResultMessage,
  composeTerminalBaselineStream,
  composeTerminalWatchReadyResult,
  forbiddenWatchResult,
  isSupportedTerminalCursorSyncVersion,
  notFoundWatchResult,
  unavailableWatchResult,
  unsupportedCursorSyncVersionResult,
} from "./terminalCursorSync";

/** A client normally watches only the visible terminals. Keep interest state
 * finite even if a malformed or runaway client sends unique watch IDs. */
export const MAX_TERMINAL_WATCHES_PER_CLIENT = 256;

/**
 * Install reliable watch state, await the event-interest barrier, take a
 * supervisor snapshot (reply flush establishes the cursor boundary), then emit
 * `terminal-watch-result` only if the install epoch is still current.
 *
 * Failed setups (interest barrier, snapshot not-found/unavailable, etc.) clear
 * only that exact registration so live deltas never stream without a baseline,
 * and an older failure cannot clear a newer same-watchId registration.
 */
export async function handleReliableTerminalWatch(
  ctx: RemoteServerContext,
  ws: WebSocket,
  session: AuthenticatedRemoteSession,
  terminalId: string,
  cursorSync: RemoteTerminalCursorSyncRequest,
): Promise<void> {
  const { watchId, version } = cursorSync;
  if (!isSupportedTerminalCursorSyncVersion(version)) {
    // Replacement semantics: an unsupported positive version must not leave a
    // prior reliable *or* legacy stream for this terminal alive, and must never
    // install/downgrade a watch. Clear both interest maps, notify the supervisor
    // filter safely, then emit the non-retryable unavailable result.
    // Guard sync *and* async throws from the notify hook so the client still
    // receives the unavailable result.
    ctx.terminalCursorSync.clearReliable(ws, terminalId);
    ctx.terminalWatches.get(ws)?.delete(terminalId);
    ctx.principalAdmission.releaseWatch(ws, terminalId);
    try {
      void Promise.resolve(ctx.notifyEventInterestsChanged()).catch(() => {});
    } catch {
      // Synchronous throw from onEventInterestsChanged — still deliver error.
    }
    if (ws.readyState === WebSocket.OPEN) {
      ctx.send(
        ws,
        buildTerminalWatchResultMessage(terminalId, watchId, unsupportedCursorSyncVersionResult()),
      );
    }
    return;
  }

  if (!session.scopes.includes("terminal:read")) {
    if (ws.readyState === WebSocket.OPEN) {
      ctx.send(ws, buildTerminalWatchResultMessage(terminalId, watchId, forbiddenWatchResult()));
    }
    return;
  }

  const terminalWatches = ctx.terminalWatches.get(ws);
  if (
    terminalWatches &&
    !terminalWatches.has(terminalId) &&
    terminalWatches.size >= MAX_TERMINAL_WATCHES_PER_CLIENT
  ) {
    if (ws.readyState === WebSocket.OPEN) {
      ctx.send(
        ws,
        buildTerminalWatchResultMessage(terminalId, watchId, {
          status: "error",
          code: "unavailable",
          retryable: true,
          reason: "client-watch-capacity",
        }),
      );
    }
    return;
  }

  // B3 principal watch budget, checked before any state is installed. A
  // rejection is a typed retryable result, never a silent drop.
  if (terminalWatches && !terminalWatches.has(terminalId)) {
    try {
      ctx.principalAdmission.tryAdmitWatch(ws, session.sessionId, terminalId);
    } catch (error) {
      if (error instanceof PrincipalOverloadError && ws.readyState === WebSocket.OPEN) {
        ctx.send(
          ws,
          buildTerminalWatchResultMessage(terminalId, watchId, {
            status: "error",
            code: "unavailable",
            retryable: true,
            reason: error.watchReason,
          }),
        );
      }
      return;
    }
  }

  // Rewatch replaces prior reliable state for this terminal id (new epoch).
  // Version 2 baselines stream through the credit-windowed scheduler; the
  // registration (epochs, barrier, tagging) is identical to v1.
  const epoch = ctx.terminalCursorSync.setReliable(ws, terminalId, { version, watchId });
  ctx.terminalWatches.get(ws)?.add(terminalId);

  const stillCurrent = () => ctx.terminalCursorSync.isCurrent(ws, terminalId, watchId, epoch);

  /** Clear this install only, drop interest, notify supervisor filter, emit error. */
  const failSetup = (
    errorResult: Extract<RemoteTerminalWatchResult, { status: "error" }>,
  ): void => {
    if (!ctx.terminalCursorSync.clearReliableIfMatch(ws, terminalId, watchId, epoch)) return;
    // Only remove terminal interest when no reliable registration remains for it.
    if (!ctx.terminalCursorSync.hasReliableWatcher(ws, terminalId)) {
      ctx.terminalWatches.get(ws)?.delete(terminalId);
      ctx.principalAdmission.releaseWatch(ws, terminalId);
    }
    void Promise.resolve(ctx.notifyEventInterestsChanged()).catch(() => {});
    if (ws.readyState === WebSocket.OPEN) {
      ctx.send(ws, buildTerminalWatchResultMessage(terminalId, watchId, errorResult));
    }
  };

  try {
    await Promise.resolve(ctx.notifyEventInterestsChanged());
  } catch {
    if (!stillCurrent()) return;
    failSetup(unavailableWatchResult());
    return;
  }

  if (!stillCurrent()) return;

  let result;
  try {
    const snapshot = await ctx.options.callSupervisor("readTerminalSnapshot", {
      threadId: terminalId,
    });
    result = composeTerminalWatchReadyResult(snapshot, terminalId) ?? notFoundWatchResult();
  } catch {
    result = unavailableWatchResult();
  }

  if (!stillCurrent()) return;
  if (ws.readyState !== WebSocket.OPEN) {
    // Socket closed mid-setup: drop the registration so reconnect cannot inherit
    // a half-installed reliable watch without a delivered baseline.
    if (ctx.terminalCursorSync.clearReliableIfMatch(ws, terminalId, watchId, epoch)) {
      if (!ctx.terminalCursorSync.hasReliableWatcher(ws, terminalId)) {
        ctx.terminalWatches.get(ws)?.delete(terminalId);
        ctx.principalAdmission.releaseWatch(ws, terminalId);
      }
      void Promise.resolve(ctx.notifyEventInterestsChanged()).catch(() => {});
    }
    return;
  }

  if (result.status === "error") {
    failSetup(result);
    return;
  }

  if (version === TERMINAL_CURSOR_SYNC_V2_VERSION) {
    // Chunked v2 delivery: pre-stream errors already ran through failSetup,
    // so from here the baseline reaches the client as ordered chunks under
    // the credit window (or the socket dies trying — never a silent gap).
    const stream = composeTerminalBaselineStream({
      terminalId,
      watchId,
      result,
      resume: cursorSync.resume,
      maxChunkBytes: cursorSync.maxChunkBytes,
      maxWindowBytes: cursorSync.maxWindowBytes,
    });
    // B3 principal baseline budget: retained serialized bytes + stream count,
    // reserved per stream identity (watchId + epoch) and released by the
    // scheduler when the stream actually leaves it.
    let baselineBytes = 0;
    for (const messageBytes of stream.messageBytes) baselineBytes += messageBytes;
    try {
      ctx.principalAdmission.tryAdmitBaseline(ws, session.sessionId, watchId, epoch, baselineBytes);
    } catch (error) {
      if (error instanceof PrincipalOverloadError) {
        failSetup({
          status: "error",
          code: "unavailable",
          retryable: true,
          reason: error.watchReason,
        });
        return;
      }
      throw error;
    }
    ctx.terminalBaselineStreams.enqueue(ws, {
      terminalId,
      watchId,
      epoch,
      messages: stream.messages,
      messageBytes: stream.messageBytes,
      throughCursors: stream.throughCursors,
      finalCursor: stream.finalCursor,
      windowBytes: stream.windowBytes,
    });
    return;
  }

  ctx.send(ws, buildTerminalWatchResultMessage(terminalId, watchId, result));
}
