import { msg } from "@lingui/core/macro";
import { toast } from "@heroui/react";
import {
  REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
  REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
  RemoteClientError,
  isRemoteBoundedReadProtocolError,
  type RemoteBoundedReadsProof,
  type RemoteBoundedThreadHistoryResult,
  type RemoteDesktopClient,
} from "@/shared/remote/client";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { i18n } from "@/renderer/i18n/i18n";
import {
  readManagedLoopbackActivation,
  retryManagedLoopbackIntake,
  retryManagedParentDescriptor,
  subscribeManagedLoopbackActivation,
  subscribeManagedLoopbackMembershipEvents,
  type ManagedLoopbackActivationSnapshot,
} from "@/renderer/hostTransport/loopbackHttpWsTransport";
import {
  beginBoundedCatalogAttempt,
  configureBoundedCatalogController,
  disposeBoundedCatalog,
  installBoundedCatalogShellPage,
  noteBoundedCatalogMembershipEvent,
  requestManualPaintRefresh,
  resetBoundedCatalogForResync,
} from "@/renderer/state/remoteServers/catalog/boundedCatalogController";
import {
  BOUNDED_CATALOG_PAGE_LIMIT,
  type CatalogKind,
} from "@/renderer/state/remoteServers/catalog/boundedCatalogAlgorithm";
import { configureBoundedHistoryManagedRootClient } from "@/renderer/state/remoteServers/catalog/boundedHistory";
import { managedRootNoticeAuthority } from "@/renderer/state/remote/historyNoticeCapability";
import {
  getManagedParentAuthorityState,
  subscribeManagedParentAuthority,
} from "@/renderer/state/remoteServers/managedLoopbackOwner";
import { useAppStore } from "@/renderer/state/appStore";
import {
  applyRootCatalogOrder,
  applyRootCatalogProjectOrder,
  applyRootCatalogProjectRows,
  applyRootCatalogThreadRows,
  isManagedRootRow,
  readRootCatalogProjects,
  readRootCatalogThreads,
  removeRootCatalogProjects,
  removeRootCatalogThreads,
} from "./rootCatalogRows";
import {
  getManagedRootCatalogStatus,
  pinManagedRootThread,
  pinnedManagedRootThreadIds,
  retainedUncertainManagedRootThreadIds,
  setManagedRootCatalogStatus,
} from "./rootCatalogStore";
import { configureRootCreateIntentRuntime } from "./rootCreateIntent";
import { __resetManagedRootLaunchMetadataCapabilityForTest } from "./rootLaunchMetadataCapability";
import {
  MANAGED_ROOT_CATALOG_KEY,
  bumpManagedRootOrderGenerationFor,
  bumpManagedRootOrderGenerations,
  managedRootOrderGenerationFor,
  managedRootOrderIntentInFlightFor,
  __resetManagedRootOrderFenceForTest,
} from "./managedRootOrderFence";
import {
  isApplyingHostOriginatedManagedRootMutation,
  isManagedRootDesktopRuntime,
} from "./rootCatalogCommands";

/**
 * Managed-root catalog adapter (B4 S3).
 *
 * Drives the shared bounded W1 controller for the desktop's OWN catalog key
 * using the ONE managed loopback client (S1 accessor): page 1 paints, later
 * pages continue progressively, membership events schedule follow-up passes,
 * and only the controller's completed-pass + membership-confirmation gate
 * removes rows. No catalog mirror, no dbSyncAll/dbSyncChanges, no new IPC
 * history route.
 */

export { MANAGED_ROOT_CATALOG_KEY } from "./managedRootOrderFence";

/**
 * The root connection's seq ledger. Both the page guard and the per-thread
 * applied seq come from the SAME loopback dispatch sequence space (the
 * supervisor event stream), so "live event newer than page" comparisons are
 * meaningful. Page snapshot seqs are deliberately not mixed in.
 */
let rootConnectionSeq = 0;
const rootThreadAppliedSeqs = new Map<string, number>();

function noteRootDispatchSequence(event: unknown, seq: number | undefined): void {
  if (typeof seq !== "number") return;
  rootConnectionSeq = Math.max(rootConnectionSeq, seq);
  const threadId = (event as { readonly threadId?: unknown } | null)?.threadId;
  if (typeof threadId !== "string") return;
  const previous = rootThreadAppliedSeqs.get(threadId) ?? 0;
  if (seq > previous) rootThreadAppliedSeqs.set(threadId, seq);
}

/**
 * Rows the deletion gate must never remove while their intent is in flight:
 * call-scoped pins, open managed-root panes, in-flight worktree provisioning,
 * queued launch episodes, and retained UNCERTAIN launch operations (whose
 * same-command-id replay body must survive until the host resolves the
 * operation or the row is removed — an absent durable row is evidence only).
 */
function protectedRootThreadIds(): ReadonlySet<string> {
  const protectedIds = new Set<string>(pinnedManagedRootThreadIds());
  const state = useAppStore.getState();
  if (state.view.kind === "thread") {
    for (const paneId of state.view.panes) {
      const row = state.threads.find((thread) => thread.id === paneId);
      if (row && isManagedRootRow(row)) protectedIds.add(row.id);
    }
  }
  for (const [threadId, value] of Object.entries(state.provisioningWorktreeThreadIds)) {
    if (value === true) protectedIds.add(threadId);
  }
  for (const [threadId, pending] of Object.entries(state.pendingThreadLaunches)) {
    if (pending !== undefined) protectedIds.add(threadId);
  }
  for (const threadId of retainedUncertainManagedRootThreadIds()) protectedIds.add(threadId);
  return protectedIds;
}

function rootRuntimeStatus(): string | undefined {
  return readManagedLoopbackActivation() ? "online" : undefined;
}

function withRootClient<Result>(
  invoke: (client: RemoteDesktopClient) => Promise<Result>,
): Promise<Result> {
  const activation = readManagedLoopbackActivation();
  if (!activation) {
    throw new Error(
      i18n._(msg`The desktop's own server is not connected. Your change was not saved.`),
    );
  }
  return invoke(activation.client);
}

let configured = false;
let installed = false;
let unsubscribeActivation: (() => void) | null = null;
let unsubscribeMembership: (() => void) | null = null;
let unsubscribeAuthority: (() => void) | null = null;
let unsubscribeSupervisorEvents: (() => void) | null = null;

function configureController(): void {
  if (configured) return;
  configured = true;
  configureBoundedCatalogController(
    {
      id: MANAGED_ROOT_CATALOG_KEY,
      ownsConnection: (connectionKey) => connectionKey === MANAGED_ROOT_CATALOG_KEY,
    },
    {
      connectionIdentity: (connectionKey) => {
        if (connectionKey !== MANAGED_ROOT_CATALOG_KEY) return undefined;
        const activation = readManagedLoopbackActivation();
        if (!activation) return undefined;
        return {
          generation: activation.seq,
          identity: activation.endpoint,
          client: activation.client,
        };
      },
      runtimeThreads: (connectionKey) =>
        connectionKey === MANAGED_ROOT_CATALOG_KEY ? readRootCatalogThreads() : undefined,
      runtimeProjects: (connectionKey) =>
        connectionKey === MANAGED_ROOT_CATALOG_KEY ? readRootCatalogProjects() : undefined,
      runtimeStatus: (connectionKey) =>
        connectionKey === MANAGED_ROOT_CATALOG_KEY ? rootRuntimeStatus() : undefined,
      commitThreadRows: (connectionKey, rows, preserveThreadIds) => {
        if (connectionKey !== MANAGED_ROOT_CATALOG_KEY) return;
        applyRootCatalogThreadRows(rows, preserveThreadIds);
      },
      commitProjectRows: (connectionKey, rows) => {
        if (connectionKey !== MANAGED_ROOT_CATALOG_KEY) return;
        applyRootCatalogProjectRows(rows);
      },
      removeThreadRows: (connectionKey, threadIds) => {
        if (connectionKey !== MANAGED_ROOT_CATALOG_KEY) return;
        removeRootCatalogThreads(threadIds);
      },
      removeProjectRows: (connectionKey, projectIds) => {
        if (connectionKey !== MANAGED_ROOT_CATALOG_KEY) return;
        removeRootCatalogProjects(projectIds);
      },
      withClient: (connectionKey, invoke) => {
        if (connectionKey !== MANAGED_ROOT_CATALOG_KEY) {
          throw new Error("Unknown bounded catalog connection.");
        }
        return withRootClient(invoke);
      },
      reportProtocolError: (connectionKey, error) => {
        if (connectionKey !== MANAGED_ROOT_CATALOG_KEY) return;
        const message = friendlyError(error) || i18n._(msg`The desktop's own catalog read failed.`);
        setManagedRootCatalogStatus({ status: "failed", message, retrying: false });
        toast.danger(message);
      },
      appliedThreadSeq: (connectionKey, threadId) =>
        connectionKey === MANAGED_ROOT_CATALOG_KEY
          ? rootThreadAppliedSeqs.get(threadId)
          : undefined,
      connectionSeq: (connectionKey) =>
        connectionKey === MANAGED_ROOT_CATALOG_KEY ? rootConnectionSeq : 0,
      // The guard is the live dispatch sequence at install time; page snapshot
      // seqs live in a different space and are deliberately not mixed in.
      bumpConnectionSeq: () => {},
      protectedThreadIds: (connectionKey) =>
        connectionKey === MANAGED_ROOT_CATALOG_KEY ? protectedRootThreadIds() : new Set<string>(),
      // Manual-order convergence: the controller applies each completed manual
      // paint pass's accumulated id order here, and refreshes the paint on
      // membership events. Each kind has its own generation, so a finished pass
      // of one kind can never invalidate the other's: the captured generation
      // fences a late pass over a newer local intent or newer authoritative order
      // OF THE SAME KIND, and an in-flight local reorder keeps its optimistic
      // paint until the host confirms it. A refused pass reports `"stale"` so the
      // controller schedules one bounded re-walk instead of dropping the order.
      manualOrderConvergence: {
        generation: (_connectionKey, kind) => managedRootOrderGenerationFor(kind),
        apply: (connectionKey, kind, orderedIds, generation) => {
          if (connectionKey !== MANAGED_ROOT_CATALOG_KEY) return "deferred";
          if (generation !== managedRootOrderGenerationFor(kind)) return "stale";
          if (managedRootOrderIntentInFlightFor(kind)) return "deferred";
          bumpManagedRootOrderGenerationFor(kind);
          if (kind === "threads") applyRootCatalogOrder(orderedIds);
          else applyRootCatalogProjectOrder(orderedIds);
          return "applied";
        },
      },
      isForeground: () => typeof document === "undefined" || document.visibilityState === "visible",
    },
  );
  // Bind the bounded-history engine to the ONE managed loopback client. The
  // adapter is the module that owns the transport import, so the registry
  // stays import-light; the provider is null while the leg is down.
  configureBoundedHistoryManagedRootClient(() => {
    const activation = readManagedLoopbackActivation();
    return activation
      ? {
          client: activation.client,
          seq: activation.seq,
          authority: managedRootNoticeAuthority(activation.seq),
        }
      : null;
  });
}

async function loadRootCatalogPageOne(
  activation: ManagedLoopbackActivationSnapshot,
): Promise<void> {
  if (readManagedLoopbackActivation() !== activation) return;
  setManagedRootCatalogStatus({ status: "starting" });
  beginBoundedCatalogAttempt(MANAGED_ROOT_CATALOG_KEY);
  try {
    const result = await activation.client.boundedShellSnapshot({
      order: "manual",
      threadLimit: BOUNDED_CATALOG_PAGE_LIMIT,
      summaries: false,
      maxBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
      maxDecodeBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
    });
    if (readManagedLoopbackActivation() !== activation) return;
    if (result.negotiation !== "bounded") {
      setManagedRootCatalogStatus({
        status: "failed",
        message: i18n._(msg`This server does not support the bounded catalog read.`),
        retrying: false,
      });
      return;
    }
    installBoundedCatalogShellPage(MANAGED_ROOT_CATALOG_KEY, result.page);
    setManagedRootCatalogStatus({ status: "ready" });
  } catch (error) {
    if (readManagedLoopbackActivation() !== activation) return;
    if (isRemoteBoundedReadProtocolError(error)) {
      const message = friendlyError(error) || i18n._(msg`The desktop's own catalog read failed.`);
      setManagedRootCatalogStatus({ status: "failed", message, retrying: false });
      return;
    }
    setManagedRootCatalogStatus({
      status: "failed",
      message: friendlyError(error) || i18n._(msg`The desktop's own server is not connected yet.`),
      retrying: false,
    });
  }
}

/**
 * Resolve one exact root thread outside the progressive projection (pane,
 * provisioning, deeplink, pending intent) with the existing bounded history
 * route: the authoritative row plus a one-turn tail. Installed like a page;
 * never a local DB read and never a new route.
 */
export async function resolveManagedRootThreadPin(threadId: string): Promise<boolean> {
  return (await readManagedRootThreadExistence(threadId)) === "present";
}

/** Authoritative existence of one root thread (never a local DB read). */
export type ManagedRootThreadExistence = "present" | "absent" | "unknown";

export async function readManagedRootThreadExistence(
  threadId: string,
): Promise<ManagedRootThreadExistence> {
  const activation = readManagedLoopbackActivation();
  if (!activation) return "unknown";
  const release = pinManagedRootThread(threadId);
  try {
    const result: RemoteBoundedThreadHistoryResult = await activation.client.boundedThreadHistory(
      threadId,
      {
        completedTurnsLimit: 1,
        omitScrollback: true,
        maxBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
        maxDecodeBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
      },
    );
    if (readManagedLoopbackActivation() !== activation) return "unknown";
    applyRootCatalogThreadRows([result.page.thread], new Set());
    return "present";
  } catch (error) {
    if (readManagedLoopbackActivation() !== activation) return "unknown";
    // A definite 404 is the host's authoritative "no such row". It is NOT used
    // as proof that a launch never effected anything (the host retains the row
    // on a possibly-effective start failure); callers treat it as evidence
    // only. Anything else (timeout, transport, protocol) leaves it unknown.
    if (error instanceof RemoteClientError && error.status === 404) return "absent";
    if (import.meta.env.DEV) {
      const evidence = error as { body?: unknown; responseEvidence?: unknown; code?: unknown };
      console.error(
        "[root-catalog] pin read failed",
        evidence.code,
        evidence.body,
        evidence.responseEvidence,
        error instanceof Error ? error.message : error,
      );
    }
    return "unknown";
  } finally {
    release();
  }
}

/**
 * One bounded authoritative read after an uncertain root launch: the row is
 * read back exactly once — never a resend — and a follow-up pass converges
 * membership/order. The existence verdict is evidence for the caller; it is
 * never used to mint a fresh operation identity, because a missing row does
 * not prove the provider never started.
 */
export async function reconcileManagedRootThreadLaunch(
  threadId: string,
): Promise<ManagedRootThreadExistence> {
  const existence = await readManagedRootThreadExistence(threadId);
  refreshManagedRootCatalogSoon();
  return existence;
}

/** Ask the controller for a bounded follow-up pass (event or intent result). */
export function refreshManagedRootCatalogSoon(): void {
  noteBoundedCatalogMembershipEvent(MANAGED_ROOT_CATALOG_KEY, "remote-threads-changed");
}

/**
 * Recover the authoritative manual order of ONE kind after a failed order
 * intent: walk the existing bounded manual paint route page by page (no
 * unbounded read, no page cap, no local DB) and apply the converged id order
 * ONCE, only while that kind's order generation captured at the start is still
 * current. A newer local order intent or a newer authoritative pass of that
 * kind invalidates this recovery's captured order, so it can never overwrite
 * newer state; that newer actor's own success/failure path re-runs convergence
 * (an ordinary paint pass applies the host order, and a failed intent starts
 * its own recovery), so invalidation is never a permanent abandonment.
 *
 * A failed or non-bounded recovery requests one bounded ordinary paint
 * refresh of the kind instead of relying on an unrelated future event. The
 * request is coalesced per kind, so a failed recovery cannot busy-loop.
 */
export async function resyncManagedRootCatalogOrder(kind: CatalogKind): Promise<void> {
  const activation = readManagedLoopbackActivation();
  if (!activation) return;
  const generation = managedRootOrderGenerationFor(kind);
  // The projection's order paint at walk start: if ANY local paint changes it
  // during the walk (a newer optimistic reorder, a completed authoritative
  // pass, a pending row entering the array), the recovered order is stale and
  // must not be applied over the newer paint.
  const localOrderAtStart =
    kind === "threads"
      ? readRootCatalogThreads().map((thread) => thread.id)
      : readRootCatalogProjects().map((project) => project.id);
  try {
    const result = await activation.client.boundedShellSnapshot({
      order: "manual",
      threadLimit: BOUNDED_CATALOG_PAGE_LIMIT,
      summaries: false,
      maxBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
      maxDecodeBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
    });
    if (readManagedLoopbackActivation() !== activation) return;
    if (result.negotiation !== "bounded") {
      requestManualPaintRefresh(MANAGED_ROOT_CATALOG_KEY, kind);
      return;
    }
    let proof: RemoteBoundedReadsProof = result.page;
    const orderedIds =
      kind === "threads"
        ? result.page.threads.map((thread) => thread.id)
        : result.page.projects.map((project) => project.id);
    let cursor =
      kind === "threads" ? result.page.threadsNextCursor : result.page.projectsNextCursor;
    while (cursor !== null) {
      if (kind === "threads") {
        const next = await activation.client.boundedThreadListPage({
          mode: "page",
          order: "manual",
          limit: BOUNDED_CATALOG_PAGE_LIMIT,
          summaries: false,
          cursor,
          after: proof,
          maxBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
          maxDecodeBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
        });
        if (readManagedLoopbackActivation() !== activation) return;
        if (next.negotiation !== "bounded") {
          requestManualPaintRefresh(MANAGED_ROOT_CATALOG_KEY, kind);
          return;
        }
        proof = next.page;
        orderedIds.push(...next.page.threads.map((thread) => thread.id));
        cursor = next.page.nextCursor;
      } else {
        const next = await activation.client.boundedProjectListPage({
          mode: "page",
          projectLimit: BOUNDED_CATALOG_PAGE_LIMIT,
          cursor,
          maxBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
          maxDecodeBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
        });
        if (readManagedLoopbackActivation() !== activation) return;
        orderedIds.push(...next.projects.map((project) => project.id));
        cursor = next.projectsNextCursor;
      }
      if (managedRootOrderGenerationFor(kind) !== generation) return;
    }
    if (managedRootOrderGenerationFor(kind) !== generation) return;
    if (orderedIds.length === 0) return;
    const localOrderNow =
      kind === "threads"
        ? readRootCatalogThreads().map((thread) => thread.id)
        : readRootCatalogProjects().map((project) => project.id);
    if (!arraysEqual(localOrderNow, localOrderAtStart)) return;
    // The recovered order is itself a newer authoritative paint: it bumps the
    // generation so an earlier in-flight pass cannot apply over it.
    bumpManagedRootOrderGenerationFor(kind);
    if (kind === "threads") applyRootCatalogOrder(orderedIds);
    else applyRootCatalogProjectOrder(orderedIds);
  } catch {
    // Order resync is a recovery aid: one bounded ordinary paint refresh of the
    // kind, so a rejected move converges without depending on an unrelated
    // event. Never a loop — an ordinary pass that itself fails schedules
    // nothing, and the request is coalesced with any pending refresh.
    requestManualPaintRefresh(MANAGED_ROOT_CATALOG_KEY, kind);
  }
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function applyActivation(activation: ManagedLoopbackActivationSnapshot | null): void {
  // A replaced (or dropped) authority invalidates every in-flight order walk of
  // BOTH kinds: a delayed page from the retired activation must never paint its
  // order over the successor's state.
  bumpManagedRootOrderGenerations();
  if (!activation) {
    // The leg is down: rows stay visible (bounded projection, no local
    // authority) and the next activation starts a fresh attempt.
    disposeBoundedCatalog(MANAGED_ROOT_CATALOG_KEY);
    const authority = getManagedParentAuthorityState();
    if (authority.status === "failed") {
      setManagedRootCatalogStatus({
        status: "failed",
        message: authority.message,
        retrying: authority.retrying,
      });
    } else {
      setManagedRootCatalogStatus({ status: "starting" });
    }
    return;
  }
  void loadRootCatalogPageOne(activation);
}

function handleMembershipEvent(eventType: string): void {
  if (!readManagedLoopbackActivation()) return;
  if (eventType === "resync-required") {
    resetBoundedCatalogForResync(MANAGED_ROOT_CATALOG_KEY);
    return;
  }
  noteBoundedCatalogMembershipEvent(MANAGED_ROOT_CATALOG_KEY, eventType);
}

/**
 * Installs the managed root catalog runtime once per renderer process. Only
 * the managed Electron desktop has root rows; attached/browser runtimes never
 * configure this adapter.
 */
export function installManagedRootCatalogRuntime(): void {
  if (installed) return;
  if (!isManagedRootDesktopRuntime()) return;
  installed = true;
  configureController();
  // Central create-intent ownership: the thread store consults this for every
  // renderer-created row, so no producer can bypass the host create+launch.
  configureRootCreateIntentRuntime({
    isHostOriginatedApplication: isApplyingHostOriginatedManagedRootMutation,
  });
  unsubscribeActivation = subscribeManagedLoopbackActivation(applyActivation);
  unsubscribeMembership = subscribeManagedLoopbackMembershipEvents(handleMembershipEvent);
  unsubscribeAuthority = subscribeManagedParentAuthority(() => {
    if (readManagedLoopbackActivation()) return;
    const authority = getManagedParentAuthorityState();
    if (authority.status === "failed") {
      setManagedRootCatalogStatus({
        status: "failed",
        message: authority.message,
        retrying: authority.retrying,
      });
    }
  });
  // Record per-thread applied sequences from the same event stream the desktop
  // reducer consumes; the controller's stale-page arbitration reads them.
  unsubscribeSupervisorEvents = readBridge().onSupervisorEvent((event, seq) =>
    noteRootDispatchSequence(event, seq),
  );
  applyActivation(readManagedLoopbackActivation());
}

/** Truthful retry from the readiness surface. */
export function retryManagedRootCatalog(): void {
  setManagedRootCatalogStatus({ status: "starting" });
  retryManagedParentDescriptor();
  retryManagedLoopbackIntake();
  const activation = readManagedLoopbackActivation();
  if (activation) void loadRootCatalogPageOne(activation);
}

export function managedRootCatalogStatus(): ReturnType<typeof getManagedRootCatalogStatus> {
  return getManagedRootCatalogStatus();
}

/** Test seam: tear down subscriptions and controller/ledger state. */
export function __resetManagedRootCatalogRuntimeForTest(): void {
  unsubscribeActivation?.();
  unsubscribeMembership?.();
  unsubscribeAuthority?.();
  unsubscribeSupervisorEvents?.();
  unsubscribeActivation = null;
  unsubscribeMembership = null;
  unsubscribeAuthority = null;
  unsubscribeSupervisorEvents = null;
  installed = false;
  configured = false;
  configureRootCreateIntentRuntime(null);
  configureBoundedHistoryManagedRootClient(null);
  __resetManagedRootLaunchMetadataCapabilityForTest();
  __resetManagedRootOrderFenceForTest();
  rootConnectionSeq = 0;
  rootThreadAppliedSeqs.clear();
  disposeBoundedCatalog(MANAGED_ROOT_CATALOG_KEY);
}
