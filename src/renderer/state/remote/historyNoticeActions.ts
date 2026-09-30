import { msg } from "@lingui/core/macro";
import { remoteMutationMayHaveCommitted, type RemoteDesktopClient } from "@/shared/remote/client";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { remoteConnectionKey, type RemoteServerRecord } from "@/renderer/state/remoteServers/types";
import { i18n } from "@/renderer/i18n/i18n";
import { readManagedLoopbackActivation } from "@/renderer/hostTransport/loopbackHttpWsTransport";
import {
  acknowledgeManagedRootRuntimeHistoryGap,
  readManagedRootRuntimeHistoryGap,
} from "@/renderer/state/managedRootCatalog/rootHistory";
import { isManagedRootDesktopRuntime } from "@/renderer/state/managedRootCatalog/rootCatalogCommands";
import { isManagedRootRow } from "@/renderer/state/managedRootCatalog/rootCatalogRows";
import { rehydrateThreadRuntimeItemsAfterReset } from "@/renderer/state/chatRuntimePersister";
import {
  recordThreadHistoryGapRead,
  recordThreadHistoryNoticeRead,
  readThreadHistoryNotice,
  type ThreadHistoryNoticeEntry,
} from "./historyNoticeStore";
import {
  hostSupportsRuntimeHistoryNotices,
  hostSupportsRuntimeHistoryNoticesForConnection,
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
 * Root threads on the managed desktop read/ack through the ONE managed
 * loopback client (the same client as their bounded transcript reads); their
 * authority is the opaque per-activation managed identity.
 */
export { hostSupportsRuntimeHistoryNotices };

interface OwnedRemoteThread {
  readonly kind: "remote";
  readonly desktopId: string;
  readonly remoteId: string;
  readonly authority: string;
}

interface OwnedManagedRootThread {
  readonly kind: "managed-root";
  readonly threadId: string;
  readonly authority: string;
}

type OwnedThread = OwnedRemoteThread | OwnedManagedRootThread;

function authorityOf(server: RemoteServerRecord): string {
  // Connection identity: stable across token rotation, distinct across hosts
  // and re-pairings, so a notice from one authority can never be displayed or
  // acknowledged against another.
  return remoteConnectionKey(server);
}

function ownedThread(viewThreadId: string): OwnedThread | undefined {
  const thread = useAppStore.getState().threads.find((candidate) => candidate.id === viewThreadId);
  if (!thread) return undefined;
  if (thread.remoteServerId && thread.remoteId) {
    const server = useRemoteServersStore
      .getState()
      .servers.find((entry) => remoteConnectionKey(entry) === thread.remoteServerId);
    if (!server) return undefined;
    return {
      kind: "remote",
      desktopId: thread.remoteServerId,
      remoteId: thread.remoteId,
      authority: authorityOf(server),
    };
  }
  if (!isManagedRootRow(thread) || !isManagedRootDesktopRuntime()) return undefined;
  const activation = readManagedLoopbackActivation();
  if (!activation) return undefined;
  return {
    kind: "managed-root",
    threadId: thread.id,
    authority: activation.authority,
  };
}

function stillOwned(owned: OwnedThread): boolean {
  if (owned.kind === "managed-root") {
    const activation = readManagedLoopbackActivation();
    if (!activation || activation.authority !== owned.authority) {
      return false;
    }
    const thread = useAppStore
      .getState()
      .threads.find((candidate) => candidate.id === owned.threadId);
    return thread !== undefined && isManagedRootRow(thread);
  }
  const thread = useAppStore
    .getState()
    .threads.find(
      (candidate) =>
        candidate.remoteServerId === owned.desktopId && candidate.remoteId === owned.remoteId,
    );
  if (!thread) return false;
  const server = useRemoteServersStore
    .getState()
    .servers.find((entry) => remoteConnectionKey(entry) === owned.desktopId);
  return server !== undefined && authorityOf(server) === owned.authority;
}

/** The advertised notice capability of this thread's actual authority. */
function capabilityAdvertisedFor(owned: OwnedThread): boolean {
  if (owned.kind === "managed-root") {
    return hostSupportsRuntimeHistoryNoticesForConnection(owned.authority);
  }
  const server = useRemoteServersStore
    .getState()
    .servers.find((entry) => remoteConnectionKey(entry) === owned.desktopId);
  return server !== undefined && hostSupportsRuntimeHistoryNotices(server);
}

async function withOwnedClient<Result>(
  owned: OwnedThread,
  invoke: (client: RemoteDesktopClient) => Promise<Result>,
): Promise<Result> {
  if (owned.kind === "managed-root") {
    const activation = readManagedLoopbackActivation();
    if (!activation || activation.authority !== owned.authority) {
      throw new Error(i18n._(msg`The desktop's own server is not connected.`));
    }
    return invoke(activation.client);
  }
  return useRemoteServersStore.getState().withClient(owned.desktopId, invoke);
}

const pendingAckCommandIds = new Map<string, string>();

/**
 * Read the current unacknowledged episode (declared-only route) and record it.
 * An authority without the advertised capability is never asked (F9).
 */
export async function requestThreadHistoryGap(
  viewThreadId: string,
): Promise<"ok" | "unsupported" | "failed"> {
  const owned = ownedThread(viewThreadId);
  if (!owned) return "failed";
  if (!capabilityAdvertisedFor(owned)) return "unsupported";
  try {
    const result =
      owned.kind === "managed-root"
        ? await readManagedRootRuntimeHistoryGap(owned.threadId)
        : await withOwnedClient(owned, (client) => client.runtimeHistoryGap(owned.remoteId));
    if (!stillOwned(owned)) return "failed";
    recordThreadHistoryGapRead(viewThreadId, owned.authority, result.gap);
    if (result.notice) {
      recordThreadHistoryNoticeRead(viewThreadId, owned.authority, result.notice);
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
  const owned = ownedThread(viewThreadId);
  if (!owned) return "failed";
  if (!capabilityAdvertisedFor(owned)) return "failed";

  // Read the exact precondition immediately before acknowledging: the gap may
  // have advanced since the banner listed it.
  let gap: { readonly token: string } | null;
  try {
    const read =
      owned.kind === "managed-root"
        ? await readManagedRootRuntimeHistoryGap(owned.threadId)
        : await withOwnedClient(owned, (client) => client.runtimeHistoryGap(owned.remoteId));
    if (!stillOwned(owned)) return "failed";
    recordThreadHistoryGapRead(viewThreadId, owned.authority, read.gap);
    if (read.notice) {
      recordThreadHistoryNoticeRead(viewThreadId, owned.authority, read.notice);
    }
    gap = read.gap;
  } catch {
    return "failed";
  }
  if (!gap) return "already";

  const token = gap.token;
  const commandId = pendingAckCommandIds.get(token) ?? crypto.randomUUID();
  try {
    const result =
      owned.kind === "managed-root"
        ? await acknowledgeManagedRootRuntimeHistoryGap(owned.threadId, {
            episodeToken: token,
            commandId,
          })
        : await withOwnedClient(owned, (client) =>
            client.acknowledgeRuntimeHistoryGap(owned.remoteId, {
              episodeToken: token,
              commandId,
            }),
          );
    if (!stillOwned(owned)) {
      pendingAckCommandIds.delete(token);
      return "failed";
    }
    switch (result.outcome) {
      case "applied":
      case "already": {
        pendingAckCommandIds.delete(token);
        recordThreadHistoryGapRead(viewThreadId, owned.authority, null);
        recordThreadHistoryNoticeRead(viewThreadId, owned.authority, result.notice);
        // The acknowledged prefix is readable now (declared readers get the
        // retained transcript plus the durable notice): re-attach once so the
        // ChatPane installs what the server actually kept. Never a resend of
        // any mutation.
        if (owned.kind === "managed-root") {
          void rehydrateThreadRuntimeItemsAfterReset(owned.threadId).catch(() => undefined);
        } else {
          void useRemoteServersStore
            .getState()
            .openRemoteThread(owned.desktopId, owned.remoteId, { focus: false })
            .catch(() => undefined);
        }
        return result.outcome;
      }
      case "stale":
        // Zero effect: the descriptor shown to the user is updated, and its
        // replacement is never auto-acknowledged.
        pendingAckCommandIds.delete(token);
        recordThreadHistoryGapRead(viewThreadId, owned.authority, result.current);
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
