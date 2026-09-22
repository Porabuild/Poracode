import {
  REMOTE_RUNTIME_HISTORY_NOTICES_DECLARATION,
  type RemoteRuntimeGapAcknowledgeResult,
  type RemoteRuntimeGapDescriptor,
  type RemoteRuntimeHistoryNotice,
} from "@/shared/remote";
import type {
  RuntimeHistoryGapAcknowledgeResult,
  RuntimeHistoryGapDescriptor,
  RuntimeHistoryNotice,
} from "@/shared/runtimeHistoryNotice";
import { RemoteHttpError } from "../auth";
import type { RemoteServerContext } from "./context";

/**
 * B1 history-notice read gate + wire projection, shared by every production
 * transcript read (legacy snapshot, bounded snapshot, item pages, turns page).
 *
 * The declaration is per request (`notices=v1`), parsed independently of
 * `reads=bounded-v1`, exactly like the B4 capability: absent means the reader
 * cannot render a notice, and any other value is a 400 protocol error. A thread
 * with a durable notice is served only to a declared reader; every other reader
 * gets a definite 409 instead of a transcript it cannot reconcile.
 *
 * The gate and the notice projection run inside the read's own fenced turn
 * (callers invoke them synchronously where a fence is held), so an
 * acknowledgement cannot land between "no notice" and the serialized page.
 * A host that did not compose the durable store neither gates nor attaches
 * anything: no notice can exist on it.
 */

export function parseRuntimeHistoryNoticesDeclaration(url: URL): boolean {
  const raw = url.searchParams.get("notices");
  if (raw === null) return false;
  if (raw === REMOTE_RUNTIME_HISTORY_NOTICES_DECLARATION) return true;
  throw new RemoteHttpError(
    "invalid_notices_capability",
    `notices must be "${REMOTE_RUNTIME_HISTORY_NOTICES_DECLARATION}" when present.`,
    400,
  );
}

/**
 * Declared-only routes require the capability explicitly: a request that did
 * not declare it is a protocol error, never a silent downgrade.
 */
export function requireRuntimeHistoryNoticesDeclaration(url: URL): void {
  if (parseRuntimeHistoryNoticesDeclaration(url)) return;
  throw new RemoteHttpError(
    "invalid_notices_capability",
    `notices=${REMOTE_RUNTIME_HISTORY_NOTICES_DECLARATION} is required on this route.`,
    400,
  );
}

/**
 * The composed gap port, or a typed 503. A host without the composition has no
 * durable notice state; the routes are still registered (the path is stable)
 * so the refusal is explicit instead of a misleading 404.
 */
export function requireRuntimeHistoryGapPort(
  ctx: RemoteServerContext,
): NonNullable<RemoteServerContext["options"]["runtimeHistoryGap"]> {
  const port = ctx.options.runtimeHistoryGap;
  if (!port) {
    throw new RemoteHttpError(
      "runtime_history_notices_unavailable",
      "This host does not compose durable runtime history notices.",
      503,
    );
  }
  return port;
}

/** Wire projection of the durable notice (no thread id, no idempotence token). */
export function toRemoteRuntimeHistoryNotice(
  notice: RuntimeHistoryNotice,
): RemoteRuntimeHistoryNotice {
  return {
    kind: "history-incomplete",
    source: notice.source,
    reason: notice.reason,
    refusedEvents: notice.refusedEvents,
    refusedBytes: notice.refusedBytes,
    acknowledgedCount: notice.acknowledgedCount,
    firstAcknowledgedAt: notice.firstAcknowledgedAt,
    lastAcknowledgedAt: notice.lastAcknowledgedAt,
  };
}

/** Wire projection of the current unacknowledged episode descriptor. */
export function toRemoteRuntimeGapDescriptor(
  descriptor: RuntimeHistoryGapDescriptor,
): RemoteRuntimeGapDescriptor {
  return {
    token: descriptor.token,
    source: descriptor.source,
    reason: descriptor.reason,
    refusedEvents: descriptor.refusedEvents,
    refusedBytes: descriptor.refusedBytes,
    createdAt: descriptor.createdAt,
  };
}

/** Wire projection of the acknowledgement result (one shape for HTTP + receipt). */
export function toRemoteRuntimeGapAcknowledgeResult(
  result: RuntimeHistoryGapAcknowledgeResult,
): RemoteRuntimeGapAcknowledgeResult {
  switch (result.outcome) {
    case "applied":
      return {
        outcome: "applied",
        notice: toRemoteRuntimeHistoryNotice(result.notice),
        descriptor: toRemoteRuntimeGapDescriptor(result.descriptor),
        supersededAcceptedEvents: result.supersededAcceptedEvents,
      };
    case "already":
      return { outcome: "already", notice: toRemoteRuntimeHistoryNotice(result.notice) };
    case "stale":
      return {
        outcome: "stale",
        current: result.current ? toRemoteRuntimeGapDescriptor(result.current) : null,
      };
  }
}

/**
 * Reads the durable notice for one thread and enforces the declared-reader
 * gate. Returns `undefined` when the host did not compose the feature or the
 * thread has no notice, so callers show nothing.
 *
 * A read failure (malformed persisted identity) propagates typed and is mapped
 * by the one persistence-refusal mapper, never silently treated as clean.
 */
export function readRuntimeHistoryNoticeForRead(
  ctx: RemoteServerContext,
  threadId: string,
  noticesDeclared: boolean,
): RemoteRuntimeHistoryNotice | undefined {
  const port = ctx.options.runtimeHistoryGap;
  if (!port) return undefined;
  const notice = port.readNotice(threadId);
  if (!notice) return undefined;
  if (!noticesDeclared) {
    throw new RemoteHttpError(
      "runtime_history_notice_unsupported",
      "This thread has an acknowledged history gap; only a client that declares notices=v1 can read it.",
      409,
    );
  }
  return toRemoteRuntimeHistoryNotice(notice);
}
