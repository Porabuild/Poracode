import type { ServerResponse } from "node:http";
import { legacyReadTooLargeBodySchema } from "@/shared/remote/legacyReadContract";
import { writeJson } from "./httpResponses";
import { requirePathParam, type HttpRouteCall } from "./httpRouteHandlers.shared";
import { handleCatalogShellSnapshot, parseLegacyShellSnapshotOptions } from "./catalogPages";
import { handleBoundedThreadHistory, parseLegacyThreadHistoryOptions } from "./historyReadHandlers";
import {
  assertLegacyHistoryWithinReservation,
  assertLegacySnapshotWithinReservation,
  LegacyReadTooLargeError,
  legacyReadRetryAfterSeconds,
} from "./legacyReadPrecheck";

/**
 * B4 legacy bulk-read wrapper handlers (H1).
 *
 * `shell-snapshot` and `thread-history` keep their existing handler for every
 * request; ONLY a request the ingress classified `legacy-bulk` (no `reads`
 * echo, regardless of `threadLimit`/`runtimePage` dummy bounds) passes through
 * the explicit admission and the stored-byte pre-check. The delegated handler
 * still writes the complete legacy response — this wrapper never truncates.
 *
 * The legacy selection query is parsed with the delegated handler's own helper
 * BEFORE admission and the pre-check: the reservation charges exactly the rows
 * and columns that selection materializes, and an invalid bound surfaces as the
 * handler's 400 instead of a 503 that would mask it. The lease is held until
 * the response completes, and released on every path (success, typed refusal,
 * thrown error, client abort). A synchronous legacy build cannot be interrupted
 * mid-flight, so cancellation is honored at phase boundaries: before the
 * pre-check and before the delegated build starts.
 */

export async function handleLegacyAdmittedShellSnapshot(call: HttpRouteCall): Promise<void> {
  if (call.readClass !== "legacy-bulk") {
    return handleCatalogShellSnapshot(call);
  }
  const options = parseLegacyShellSnapshotOptions(call.url);
  return withLegacyBulkReadAdmission(
    call,
    () => assertLegacySnapshotWithinReservation(options),
    () => handleCatalogShellSnapshot(call),
  );
}

export async function handleLegacyAdmittedThreadHistory(call: HttpRouteCall): Promise<void> {
  if (call.readClass !== "legacy-bulk") {
    return handleBoundedThreadHistory(call);
  }
  const threadId = requirePathParam(call.params, "threadId");
  const options = parseLegacyThreadHistoryOptions(call.url);
  return withLegacyBulkReadAdmission(
    call,
    () => assertLegacyHistoryWithinReservation(threadId, options),
    () => handleBoundedThreadHistory(call),
  );
}

async function withLegacyBulkReadAdmission(
  call: HttpRouteCall,
  precheck: () => number,
  run: () => Promise<void>,
): Promise<void> {
  const { res } = call;
  const lease = call.ctx.legacyBulkReadAdmission.tryAdmit(call.session?.sessionId ?? null);
  // `close` fires after a normal `finish` too (Node emits `finish`, then
  // `close` once the socket is torn down), so only a close before the response
  // finished is a client abort. Counting the normal close as an abort made
  // every completed legacy read indistinguishable from a cancellation.
  const onClose = () => {
    if (!res.writableFinished) lease.abort();
  };
  res.once("close", onClose);
  try {
    if (lease.aborted) return;
    try {
      precheck();
    } catch (error) {
      if (error instanceof LegacyReadTooLargeError && !res.headersSent) {
        res.setHeader("Retry-After", String(legacyReadRetryAfterSeconds()));
        writeJson(res, 503, legacyReadTooLargeBodySchema.parse(error.body));
        return;
      }
      throw error;
    }
    if (lease.aborted) return;
    await run();
    // Hold the slot until the response is actually handed off / closed, so an
    // aborted write cannot free admission while its body is still retained.
    await waitForResponseCompletion(res);
  } finally {
    res.off("close", onClose);
    lease.release();
  }
}

function waitForResponseCompletion(res: ServerResponse): Promise<void> {
  if (res.writableFinished || res.destroyed) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      res.off("finish", done);
      res.off("close", done);
      resolve();
    };
    res.once("finish", done);
    res.once("close", done);
  });
}
