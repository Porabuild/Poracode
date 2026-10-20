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
  subscribeManagedLoopbackActivation,
  type ManagedLoopbackActivationSnapshot,
} from "@/renderer/hostTransport/loopbackHttpWsTransport";
import { useAppStore } from "@/renderer/state/appStore";
import { hostSupportsRuntimeHistoryNoticesForConnection } from "@/renderer/state/remote/historyNoticeCapability";
import {
  isThreadHistoryRecoveryError,
  noteThreadHistoryRecoveryNeeded,
  recordThreadHistoryNoticeRead,
} from "@/renderer/state/remote/historyNoticeStore";
import {
  invokeManagedRootRuntimeItemsPage,
  recordManagedRootBoundedHistoryTail,
} from "@/renderer/state/remoteServers/catalog/boundedHistory";
import { isManagedRootDesktopRuntime } from "./rootCatalogCommands";
import { isManagedRootRow } from "./rootCatalogRows";

// Paint the recent viewport first. Continuations keep their normal page size,
// and the host still completes any tool group crossing this initial boundary.
const INITIAL_HISTORY_TIMELINE_ENTRIES = 20;
const INITIAL_HISTORY_RETRY_DELAYS_MS = [250, 500] as const;

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

function isRetryableHistoryReadError(error: unknown): boolean {
  return (
    isRemoteTransportFailure(error) ||
    (error instanceof RemoteClientError &&
      error.status === 503 &&
      [
        "persistence_read_refused",
        "persistence_busy",
        "persistence_degraded",
        "persistence_unavailable",
      ].includes(error.code))
  );
}

function waitForHistoryRetry(
  activation: ManagedLoopbackActivationSnapshot,
  delayMs: number,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      unsubscribe();
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);
    // Release reducer recovery on disconnection, before the next activation's
    // rebuild. Waiting out backoff would suppress that rebuild as in-flight.
    const unsubscribe = subscribeManagedLoopbackActivation(() => {
      try {
        assertSameActivation(activation);
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
    signal?.addEventListener("abort", abort, { once: true });
  });
}

async function readInitialHistoryPage(
  activation: ManagedLoopbackActivationSnapshot,
  threadId: string,
  signal?: AbortSignal,
) {
  for (let attempt = 0; ; attempt += 1) {
    signal?.throwIfAborted();
    assertSameActivation(activation);
    try {
      return await activation.client.boundedThreadHistory(threadId, {
        targetTimelineEntryCount: INITIAL_HISTORY_TIMELINE_ENTRIES,
        compactDetails: true,
        noticesCapable: true,
        maxBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
        maxDecodeBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      signal?.throwIfAborted();
      const delay = INITIAL_HISTORY_RETRY_DELAYS_MS[attempt];
      if (delay === undefined || !isRetryableHistoryReadError(error)) throw error;
      // Keep one pending hydration and its live-event barrier across the two
      // fallback attempts. A closed pane or replaced activation owns no retry.
      assertSameActivation(activation);
      await waitForHistoryRetry(activation, delay, signal);
    }
  }
}

/**
 * The authoritative bounded history tail for one root thread. Records the
 * continuation tail and the durable notice under the activation's opaque
 * authority before returning.
 */
export async function readManagedRootHistoryPage(
  threadId: string,
  options: { readonly signal?: AbortSignal; readonly page?: RemoteBoundedThreadHistoryPage } = {},
): Promise<RemoteBoundedThreadHistoryPage> {
  const activation = requireActivation();
  const result = options.page
    ? ({ negotiation: "bounded", page: options.page } as const)
    : await readInitialHistoryPage(activation, threadId, options.signal);
  // A buffered response can resolve despite transport cancellation. Fence its
  // continuation and notice writes before changing the authoritative tail.
  options.signal?.throwIfAborted();
  assertSameActivation(activation);
  if (result.negotiation !== "bounded") {
    throw new Error(i18n._(msg`This server does not support the bounded history read.`));
  }
  if (result.page.thread.id !== threadId)
    throw new Error("History response has a different thread identity.");
  recordManagedRootBoundedHistoryTail({ threadId, page: result.page });
  recordThreadHistoryNoticeRead(threadId, activation.authority, result.page.runtimeNotice);
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
  readonly signal?: AbortSignal;
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
  return hostSupportsRuntimeHistoryNoticesForConnection(activation.authority);
}

/**
 * A typed gap refusal on a notice-capable host offers the explicit review
 * path. Other history read failures do not establish missing history.
 */
export function noteManagedRootHistoryFailure(threadId: string, error: unknown): void {
  const activation = managedRootHistoryActivation();
  if (!activation) return;
  const authority = activation.authority;
  if (!hostSupportsRuntimeHistoryNoticesForConnection(authority)) return;
  if (!isThreadHistoryRecoveryError(error)) return;
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
