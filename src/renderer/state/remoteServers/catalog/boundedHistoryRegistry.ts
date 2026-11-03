import {
  REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
  REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
  type RemoteBoundedReadsProof,
  type RemoteBoundedThreadHistoryPage,
  type RemoteDesktopClient,
} from "@/shared/remote/client";
import { remoteThreadId } from "@/renderer/state/remoteProjection";
import { recordThreadHistoryNoticeRead } from "@/renderer/state/remote/historyNoticeStore";
import { currentRemoteServerGeneration, remoteServerResumeFence } from "../eventSocketRegistry";

/**
 * B4 bounded-history tail registry (W1, renderer).
 *
 * Stores, per projected thread, the bounded history page proof and
 * `completedTurnsNextCursor` so continuations can carry a strict reads echo.
 * Deliberately free of app-store/store imports so the procedure router and the
 * browser bridge can consult it without creating a module cycle; the
 * app-store-facing merge helpers live in `boundedHistory.ts`.
 */

interface BoundedHistorySession {
  readonly authority: string;
  isCurrent(): boolean;
  withClient<Result>(
    invoke: (client: RemoteDesktopClient) => Promise<Result>,
  ): Promise<Result> | undefined;
}

export interface BoundedHistoryTail {
  readonly compactDetails?: boolean;
  readonly session: BoundedHistorySession;
  readonly threadId: string;
  readonly viewThreadId: string;
  cursor: string | null;
  readonly proof: RemoteBoundedReadsProof;
  readonly snapshotSeq: number;
}

const tails = new Map<string, BoundedHistoryTail>();
const MAX_TRACKED_TAILS = 256;

let withBoundedClient:
  | (<Result>(
      desktopId: string,
      invoke: (client: RemoteDesktopClient) => Promise<Result>,
    ) => Promise<Result>)
  | null = null;

export function configureBoundedHistoryClient(
  invoke: <Result>(
    desktopId: string,
    operation: (client: RemoteDesktopClient) => Promise<Result>,
  ) => Promise<Result>,
): void {
  withBoundedClient = invoke;
}

export function boundedClientInvoker(): typeof withBoundedClient {
  return withBoundedClient;
}

/**
 * The managed loopback client provider (B4 root history). Bound by the root
 * adapter from the live activation accessor so this registry stays free of
 * transport imports; `null` while the leg is down.
 */
export interface ManagedRootHistoryClientSnapshot {
  readonly client: RemoteDesktopClient;
  readonly seq: number;
  /** Opaque per-activation notice authority (C1 identity custody). */
  readonly authority: string;
}

let managedRootClientProvider: (() => ManagedRootHistoryClientSnapshot | null) | null = null;

export function configureBoundedHistoryManagedRootClient(
  provider: (() => ManagedRootHistoryClientSnapshot | null) | null,
): void {
  managedRootClientProvider = provider;
}

export function managedRootHistoryClient(): ManagedRootHistoryClientSnapshot | null {
  return managedRootClientProvider?.() ?? null;
}

export function recordBoundedHistoryTail(input: {
  readonly desktopId: string;
  readonly threadId: string;
  readonly page: RemoteBoundedThreadHistoryPage;
}): void {
  const desktopId = input.desktopId;
  const viewThreadId = remoteThreadId(desktopId, input.threadId);
  const generation = currentRemoteServerGeneration(desktopId);
  const fence = remoteServerResumeFence(desktopId);
  recordHistoryTail(viewThreadId, input.threadId, input.page, {
    authority: desktopId,
    isCurrent: () =>
      currentRemoteServerGeneration(desktopId) === generation &&
      remoteServerResumeFence(desktopId) === fence,
    withClient: (invoke) => withBoundedClient?.(desktopId, invoke),
  });
}

/**
 * Record a managed-root bounded tail. Root rows are not projected, so the view
 * thread id IS the host thread id; the activation seq is the generation fence.
 */
export function recordManagedRootBoundedHistoryTail(input: {
  readonly threadId: string;
  readonly page: RemoteBoundedThreadHistoryPage;
}): void {
  const managed = managedRootHistoryClient();
  if (!managed) return;
  recordHistoryTail(input.threadId, input.threadId, input.page, {
    authority: managed.authority,
    isCurrent: () => {
      const current = managedRootHistoryClient();
      return current?.seq === managed.seq && current.client === managed.client;
    },
    withClient: (invoke) => invoke(managed.client),
  });
}

function recordHistoryTail(
  viewThreadId: string,
  threadId: string,
  page: RemoteBoundedThreadHistoryPage,
  session: BoundedHistorySession,
): void {
  if (tails.has(viewThreadId)) tails.delete(viewThreadId);
  tails.set(viewThreadId, {
    session,
    threadId,
    viewThreadId,
    cursor: page.completedTurnsNextCursor,
    proof: { reads: page.reads },
    snapshotSeq: page.snapshotSeq,
    ...(page.historyProjection ? { compactDetails: true } : {}),
  });
  evictOldestTails();
}

function evictOldestTails(): void {
  while (tails.size > MAX_TRACKED_TAILS) {
    const oldest = tails.keys().next().value;
    if (oldest === undefined) break;
    tails.delete(oldest);
  }
}

export function readBoundedHistoryTail(viewThreadId: string): BoundedHistoryTail | undefined {
  const tail = tails.get(viewThreadId);
  if (!tail) return undefined;
  if (!tail.session.isCurrent()) {
    tails.delete(viewThreadId);
    return undefined;
  }
  return tail;
}

/**
 * Advance the continuation cursor only while the captured tail is still the
 * registry's current entry. A forgotten/replaced tail (truncate, reset,
 * removal, re-open) rejects the stale page outright.
 */
export function advanceBoundedHistoryTailCursor(
  viewThreadId: string,
  tail: BoundedHistoryTail,
  cursor: string | null,
): boolean {
  if (readBoundedHistoryTail(viewThreadId) !== tail) return false;
  tail.cursor = cursor;
  return true;
}

/** Drops one thread's continuation after a truncate/reset/removal. */
export function forgetBoundedHistoryThread(desktopId: string, threadId: string): void {
  tails.delete(remoteThreadId(desktopId, threadId));
}

/** Drops one projected thread's continuation (timeline reset/eviction). */
export function forgetBoundedHistoryThreadByViewId(viewThreadId: string): void {
  tails.delete(viewThreadId);
}

export function forgetBoundedHistoryForServer(desktopId: string): void {
  const prefix = remoteThreadId(desktopId, "");
  for (const key of tails.keys()) {
    if (key.startsWith(prefix)) tails.delete(key);
  }
}

export function __resetBoundedHistoryRegistryForTest(): void {
  // The store-provided client invoker is a process-level binding, not
  // per-test state; only the recorded tails are cleared.
  tails.clear();
}

/**
 * Older runtime-items continuation for a negotiated bounded connection. Returns
 * undefined when this thread has no bounded tail, so the caller falls back to
 * the legacy IPC route (the only path a genuine older host supports).
 */
export async function invokeBoundedRuntimeItemsPage(
  client: RemoteDesktopClient,
  desktopId: string,
  payload: RuntimeItemsPageRequest,
): Promise<{ readonly items: unknown; readonly nextCursor: number | null } | undefined> {
  const tail = readBoundedHistoryTail(remoteThreadId(desktopId, payload.threadId));
  if (!tail) return undefined;
  return readRuntimeItemsPage(client, tail, payload);
}

type RuntimeItemsPageRequest = {
  readonly threadId: string;
  readonly limit: number;
  readonly beforePosition?: number | undefined;
  readonly targetTimelineEntryCount?: number | undefined;
  readonly signal?: AbortSignal;
};

/** Root ids are unprojected; both entry points use the same page reader. */
export async function invokeManagedRootRuntimeItemsPage(
  payload: RuntimeItemsPageRequest,
): Promise<{ readonly items: unknown; readonly nextCursor: number | null } | undefined> {
  const tail = readBoundedHistoryTail(payload.threadId);
  if (!tail) return undefined;
  return tail.session.withClient((client) => readRuntimeItemsPage(client, tail, payload));
}

async function readRuntimeItemsPage(
  client: RemoteDesktopClient,
  tail: BoundedHistoryTail,
  payload: RuntimeItemsPageRequest,
): Promise<{ readonly items: unknown; readonly nextCursor: number | null } | undefined> {
  if (payload.beforePosition === undefined) return undefined;
  const result = await client.boundedThreadHistoryItems({
    ...(tail.compactDetails ? { compactDetails: true } : {}),
    threadId: payload.threadId,
    beforePosition: payload.beforePosition,
    after: tail.proof,
    limit: payload.limit,
    ...(payload.targetTimelineEntryCount !== undefined
      ? { targetTimelineEntryCount: payload.targetTimelineEntryCount }
      : {}),
    noticesCapable: true,
    maxBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
    maxDecodeBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
    ...(payload.signal ? { signal: payload.signal } : {}),
  });
  payload.signal?.throwIfAborted();
  if (readBoundedHistoryTail(tail.viewThreadId) !== tail) return undefined;
  if (result.negotiation !== "bounded") return undefined;
  recordThreadHistoryNoticeRead(
    tail.viewThreadId,
    tail.session.authority,
    result.page.runtimeNotice,
  );
  return { items: result.page.items, nextCursor: result.page.nextCursor };
}
