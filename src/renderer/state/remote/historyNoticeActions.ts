import { msg } from "@lingui/core/macro";
import { remoteMutationMayHaveCommitted } from "@/shared/remote/client";
import { useAppStore } from "@/renderer/state/appStore";
import { i18n } from "@/renderer/i18n/i18n";
import { entityHost, type EntityHost } from "@/renderer/state/entityHost";
import { rehydrateThreadRuntimeItemsAfterReset } from "@/renderer/state/chatRuntimePersister";
import {
  recordThreadHistoryGapRead,
  recordThreadHistoryNoticeRead,
  readThreadHistoryNotice,
  type ThreadHistoryNoticeEntry,
} from "./historyNoticeStore";
import {
  hostSupportsRuntimeHistoryNotices,
  hostSupportsRuntimeHistoryNoticesFor,
} from "./historyNoticeCapability";

/**
 * B1 renderer recovery actions.
 *
 * Recovery is available only when the SAME authority advertises
 * `runtimeHistoryNotices` v1 and returns an actual current gap descriptor.
 * Acknowledgement is an explicit user action: it permits continuing with
 * incomplete history and never claims the missing content was restored or the
 * producer retired. A stale outcome updates the displayed descriptor without
 * acknowledging its replacement; `already` is zero-effect; an uncertain
 * response keeps the descriptor and lets the same explicit retry reuse the
 * same command id/token.
 *
 * Every thread reads and acknowledges through its own host's client, whichever
 * host that is; the managed host's authority is the opaque per-activation
 * managed identity.
 */
export { hostSupportsRuntimeHistoryNotices, hostSupportsRuntimeHistoryNoticesFor };

/**
 * The host that owns this thread, resolved while it has a live connection.
 * Every read and acknowledgement goes through that host's own client and is
 * recorded under its authority.
 */
function ownedHost(viewThreadId: string): EntityHost | undefined {
  const host = entityHost(
    useAppStore.getState().threads.find((candidate) => candidate.id === viewThreadId),
  );
  return host?.authority !== undefined && host.isCurrent() ? host : undefined;
}

/** The row is still owned by the same host over the same connection. */
function stillOwned(viewThreadId: string, host: EntityHost): boolean {
  const current = entityHost(
    useAppStore.getState().threads.find((candidate) => candidate.id === viewThreadId),
  );
  return (
    host.isCurrent() &&
    current !== undefined &&
    current.sessionKey === host.sessionKey &&
    current.hostId === host.hostId
  );
}

function readGap(host: EntityHost) {
  return host.withClient((client) => client.runtimeHistoryGap(host.hostId));
}

const pendingAckCommandIds = new Map<string, string>();

/**
 * Read the current unacknowledged episode (declared-only route) and record it.
 * An authority without the advertised capability is never asked (F9).
 */
export async function requestThreadHistoryGap(
  viewThreadId: string,
): Promise<"ok" | "unsupported" | "failed"> {
  const host = ownedHost(viewThreadId);
  if (!host?.authority) return "failed";
  if (!hostSupportsRuntimeHistoryNoticesFor(host)) return "unsupported";
  try {
    const result = await readGap(host);
    if (!stillOwned(viewThreadId, host)) return "failed";
    recordThreadHistoryGapRead(viewThreadId, host.authority, result.gap);
    if (result.notice) {
      recordThreadHistoryNoticeRead(viewThreadId, host.authority, result.notice);
    }
    return "ok";
  } catch {
    return "failed";
  }
}

export type AcknowledgeHistoryNoticeOutcome =
  | "applied"
  | "already"
  | "stale"
  | "uncertain"
  | "failed";

/**
 * Explicit acknowledgement of the current episode. The user is told this only
 * permits continuing with incomplete history; no content is restored.
 */
export async function acknowledgeThreadHistoryNotice(
  viewThreadId: string,
): Promise<AcknowledgeHistoryNoticeOutcome> {
  const host = ownedHost(viewThreadId);
  if (!host?.authority) return "failed";
  if (!hostSupportsRuntimeHistoryNoticesFor(host)) return "failed";
  const authority = host.authority;

  // Read the exact precondition immediately before acknowledging: the gap may
  // have advanced since the banner listed it.
  let gap: { readonly token: string } | null;
  try {
    const read = await readGap(host);
    if (!stillOwned(viewThreadId, host)) return "failed";
    recordThreadHistoryGapRead(viewThreadId, authority, read.gap);
    if (read.notice) {
      recordThreadHistoryNoticeRead(viewThreadId, authority, read.notice);
    }
    gap = read.gap;
  } catch {
    return "failed";
  }
  if (!gap) return "already";

  const token = gap.token;
  const commandId = pendingAckCommandIds.get(token) ?? crypto.randomUUID();
  try {
    const result = await host.withClient((client) =>
      client.acknowledgeRuntimeHistoryGap(host.hostId, { episodeToken: token, commandId }),
    );
    if (!stillOwned(viewThreadId, host)) {
      pendingAckCommandIds.delete(token);
      return "failed";
    }
    switch (result.outcome) {
      case "applied":
      case "already": {
        pendingAckCommandIds.delete(token);
        recordThreadHistoryGapRead(viewThreadId, authority, null);
        recordThreadHistoryNoticeRead(viewThreadId, authority, result.notice);
        // The acknowledged prefix is readable now (declared readers get the
        // retained transcript plus the durable notice): read the history once
        // more so the pane installs what the host actually kept. Never a
        // resend of any mutation.
        void rehydrateThreadRuntimeItemsAfterReset(viewThreadId).catch(() => undefined);
        return result.outcome;
      }
      case "stale":
        // Zero effect: the descriptor shown to the user is updated, and its
        // replacement is never auto-acknowledged.
        pendingAckCommandIds.delete(token);
        recordThreadHistoryGapRead(viewThreadId, authority, result.current);
        return "stale";
    }
  } catch (error) {
    if (remoteMutationMayHaveCommitted(error)) {
      // The acknowledgement may have committed: keep the descriptor, keep the
      // same command id so an explicit retry replays instead of re-applying.
      pendingAckCommandIds.set(token, commandId);
      return "uncertain";
    }
    return "failed";
  }
}

export function threadHistoryNoticeEntry(
  viewThreadId: string,
): ThreadHistoryNoticeEntry | undefined {
  return readThreadHistoryNotice(viewThreadId);
}

/** Localized failure copy for the banner's ack/refresh actions. */
export function historyNoticeFailureMessage(): string {
  return i18n._(msg`The history notice could not be read from the server.`);
}
