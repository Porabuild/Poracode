import { msg } from "@lingui/core/macro";
import type { PersistedRuntimeItem } from "@/shared/ipc";
import {
  REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
  REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
  RemoteClientError,
  isRemoteTransportFailure,
  type RemoteBoundedThreadHistoryPage,
  type RemoteDesktopClient,
} from "@/shared/remote/client";
import { i18n } from "@/renderer/i18n/i18n";
import {
  readManagedLoopbackActivation,
  type ManagedLoopbackActivationSnapshot,
} from "@/renderer/hostTransport/loopbackHttpWsTransport";
import { useAppStore } from "@/renderer/state/appStore";
import {
  hostSupportsRuntimeHistoryNoticesForConnection,
  managedRootNoticeAuthority,
} from "@/renderer/state/remote/historyNoticeCapability";
import {
  noteThreadHistoryRecoveryNeeded,
  recordThreadHistoryNoticeRead,
} from "@/renderer/state/remote/historyNoticeStore";
import {
  invokeManagedRootRuntimeItemsPage,
  recordManagedRootBoundedHistoryTail,
} from "@/renderer/state/remoteServers/catalog/boundedHistory";
import { isManagedRootDesktopRuntime } from "./rootCatalogCommands";
import { isManagedRootRow } from "./rootCatalogRows";

/**
 * Managed-root bounded transcript reads (B4 F6).
 *
 * The desktop's OWN threads read their transcript through the SAME bounded
 * HTTP contract remote threads use — the bounded history tail (items + newest
 * completed turns + `ct1.` cursor + durable notice), the bounded older-items
 * page and the `ct1.` turns continuation — over the ONE managed loopback
 * client. No preload IPC history route, no new IPC field, no local-DB
 * completed-turns read: a root transcript can never pull an unbounded row set
 * across a boundary.
 *
 * The tail is registered in the shared bounded-history registry keyed by the
 * raw (unprojected) thread id, so the same continuation engine serves root and
 * remote threads; `configureBoundedHistoryManagedRootClient` binds the live
 * client/activation identity in the root adapter.
 */

/** The live managed activation, or null on another runtime / leg down. */
export function managedRootHistoryActivation(): ManagedLoopbackActivationSnapshot | null {
  if (!isManagedRootDesktopRuntime()) return null;
  return readManagedLoopbackActivation();
}

/** True for a resident root row on the managed desktop with a live leg. */
export function isManagedRootHistoryThread(threadId: string): boolean {
  if (managedRootHistoryActivation() === null) return false;
  const thread = useAppStore.getState().threads.find((candidate) => candidate.id === threadId);
  return thread !== undefined && isManagedRootRow(thread);
}

function requireActivation(): ManagedLoopbackActivationSnapshot {
  const activation = managedRootHistoryActivation();
  if (!activation) {
    throw new Error(i18n._(msg`The desktop's own server is not connected yet.`));
  }
  return activation;
}

function assertSameActivation(activation: ManagedLoopbackActivationSnapshot): void {
  if (readManagedLoopbackActivation() !== activation) {
    throw new Error(
      i18n._(msg`The desktop's own server reconnected before the history read completed.`),
    );
  }
}

/**
 * The authoritative bounded history tail for one root thread. Records the
 * continuation tail and the durable notice under the activation's opaque
 * authority before returning.
 */
export async function readManagedRootHistoryPage(
  threadId: string,
): Promise<RemoteBoundedThreadHistoryPage> {
  const activation = requireActivation();
  const result = await activation.client.boundedThreadHistory(threadId, {
    noticesCapable: true,
    maxBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
    maxDecodeBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
  });
  assertSameActivation(activation);
  if (result.negotiation !== "bounded") {
    throw new Error(i18n._(msg`This server does not support the bounded history read.`));
  }
  recordManagedRootBoundedHistoryTail({ threadId, page: result.page });
  recordThreadHistoryNoticeRead(
    threadId,
    managedRootNoticeAuthority(activation.seq),
    result.page.runtimeNotice,
  );
  return result.page;
}

/**
 * One older runtime-items page for a root thread, continuing the recorded
 * tail. Returns undefined when the thread has no live managed tail; the caller
 * must never fall back to the local-DB page read.
 */
export async function loadManagedRootRuntimeItemsPage(input: {
  readonly threadId: string;
  readonly beforePosition: number;
  readonly limit: number;
  readonly targetTimelineEntryCount?: number | undefined;
}): Promise<
  { readonly items: PersistedRuntimeItem[]; readonly nextCursor: number | null } | undefined
> {
  const result = await invokeManagedRootRuntimeItemsPage(input);
  if (!result) return undefined;
  return {
    items: result.items as PersistedRuntimeItem[],
    nextCursor: result.nextCursor,
  };
}

/** Declared-only durable gap descriptor read for a root thread. */
export async function readManagedRootRuntimeHistoryGap(
  threadId: string,
): Promise<Awaited<ReturnType<RemoteDesktopClient["runtimeHistoryGap"]>>> {
  const activation = requireActivation();
  const result = await activation.client.runtimeHistoryGap(threadId);
  assertSameActivation(activation);
  return result;
}

/** True when a root read's error is the host's authoritative "no such row". */
export function isManagedRootThreadAbsentError(error: unknown): boolean {
  return error instanceof RemoteClientError && error.status === 404;
}

/** True when the live managed activation advertised the notice capability. */
export function managedRootSupportsRuntimeHistoryNotices(): boolean {
  const activation = managedRootHistoryActivation();
  if (!activation) return false;
  return hostSupportsRuntimeHistoryNoticesForConnection(managedRootNoticeAuthority(activation.seq));
}

/**
 * A definite (non-transport) failure of a root transcript read on a
 * notice-capable host is the open-gap recovery signal: surface the explicit
 * review path instead of only a generic load failure. A transport failure or
 * an incapable host is never turned into a notice.
 */
export function noteManagedRootHistoryFailure(threadId: string, error: unknown): void {
  const activation = managedRootHistoryActivation();
  if (!activation) return;
  const authority = managedRootNoticeAuthority(activation.seq);
  if (!hostSupportsRuntimeHistoryNoticesForConnection(authority)) return;
  if (isRemoteTransportFailure(error)) return;
  noteThreadHistoryRecoveryNeeded(threadId, authority);
}

/** Explicit acknowledgement of one root gap episode over the same client. */
export async function acknowledgeManagedRootRuntimeHistoryGap(
  threadId: string,
  input: { readonly episodeToken: string; readonly commandId: string },
): Promise<Awaited<ReturnType<RemoteDesktopClient["acknowledgeRuntimeHistoryGap"]>>> {
  const activation = requireActivation();
  const result = await activation.client.acknowledgeRuntimeHistoryGap(threadId, input);
  assertSameActivation(activation);
  return result;
}
