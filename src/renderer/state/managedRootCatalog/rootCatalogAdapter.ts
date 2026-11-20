import { protectedThreadRowIds } from "@/renderer/state/protectedThreadRows";
import { msg } from "@lingui/core/macro";
import { toast } from "@heroui/react";
import type { EventSequenceSpace } from "@/shared/eventSequenceSpace";
import { HostSession, hostEventThreadIds } from "@/renderer/hostTransport/hostSession";
import {
  REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
  REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
  isRemoteBoundedReadProtocolError,
  type RemoteBoundedReadsProof,
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
  boundedCatalogRemovalMark,
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
import {
  getManagedParentAuthorityState,
  subscribeManagedParentAuthority,
} from "@/renderer/state/remoteServers/managedLoopbackOwner";
import { pendingProjectRemovalRows } from "../projectRemovalIntents";
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
import { getManagedRootCatalogStatus, setManagedRootCatalogStatus } from "./rootCatalogStore";
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

const SHELL_SNAPSHOT_RETRY_BASE_MS = 500;
const SHELL_SNAPSHOT_RETRY_MAX_MS = 10_000;
const SHELL_SNAPSHOT_MAX_AUTO_RETRIES = 5;

/**
 * The root connection's seq ledger. Both the page guard and the per-thread
 * applied seq come from the SAME loopback dispatch sequence space (the
 * supervisor event stream), so "live event newer than page" comparisons are
 * meaningful. Page snapshot seqs are deliberately not mixed in, and so are
 * the desktop-internal `ipc` frames (`provider-usage*`, `thread-voice`,
 * `thread-osc-*`, `thread-scrollback-resync`, …): they carry an independent
 * sequence whose head must never raise the shared live head.
 */
const rootSession = new HostSession();

/** The managed host's live sequence session. */
export function managedRootHostSession(): HostSession {
  return rootSession;
}

function noteRootDispatchSequence(
  event: unknown,
  seq: number | undefined,
  space: EventSequenceSpace | undefined,
): void {
  // Loopback-space events only; an absent space is the transport's loopback
  // default (see PreloadIpcTransport.dispatch).
  if (space !== undefined && space !== "loopback") return;
  if (typeof seq !== "number") return;
  rootSession.recordApplied(seq, hostEventThreadIds(event));
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
let shellRetryTimer: ReturnType<typeof setTimeout> | null = null;
let shellLoadAttempt = 0;
let shellRetryDelayOverrideMs: number | null = null;
let shellLoadToken = 0;
let shellLoadInFlight: {
  readonly activation: ManagedLoopbackActivationSnapshot;
  readonly token: number;
  readonly promise: Promise<void>;
} | null = null;
const failedProtocolKinds = new Set<CatalogKind>();

function clearShellRetryTimer(): void {
  if (shellRetryTimer !== null) {
    clearTimeout(shellRetryTimer);
    shellRetryTimer = null;
  }
}

function clearShellLoadInFlight(token: number): void {
  if (shellLoadInFlight?.token === token) shellLoadInFlight = null;
}

function recoverManagedRootStatusIfFailed(kind: CatalogKind): void {
  failedProtocolKinds.delete(kind);
  if (
    failedProtocolKinds.size === 0 &&
    shellLoadInFlight === null &&
    shellRetryTimer === null &&
    getManagedRootCatalogStatus().status === "failed"
  ) {
    setManagedRootCatalogStatus({ status: "ready" });
  }
}

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
        connectionKey === MANAGED_ROOT_CATALOG_KEY
          ? [...readRootCatalogProjects(), ...pendingProjectRemovalRows().filter(isManagedRootRow)]
          : undefined,
      runtimeStatus: (connectionKey) =>
        connectionKey === MANAGED_ROOT_CATALOG_KEY ? rootRuntimeStatus() : undefined,
      commitThreadRows: (connectionKey, rows, preserveThreadIds) => {
        if (connectionKey !== MANAGED_ROOT_CATALOG_KEY) return;
        applyRootCatalogThreadRows(rows, preserveThreadIds);
        recoverManagedRootStatusIfFailed("threads");
      },
      commitProjectRows: (connectionKey, rows) => {
        if (connectionKey !== MANAGED_ROOT_CATALOG_KEY) return;
        applyRootCatalogProjectRows(rows);
        recoverManagedRootStatusIfFailed("projects");
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
      reportProtocolError: (connectionKey, error, kind) => {
        if (connectionKey !== MANAGED_ROOT_CATALOG_KEY) return;
        if (kind) {
          failedProtocolKinds.add(kind);
        } else {
          failedProtocolKinds.add("threads");
          failedProtocolKinds.add("projects");
        }
        const message = friendlyError(error) || i18n._(msg`The desktop's own catalog read failed.`);
        setManagedRootCatalogStatus({ status: "failed", message, retrying: false });
        toast.danger(message);
      },
      appliedThreadSeq: (connectionKey, threadId) =>
        connectionKey === MANAGED_ROOT_CATALOG_KEY
          ? rootSession.threadSequence(threadId)
          : undefined,
      connectionSeq: (connectionKey) =>
        connectionKey === MANAGED_ROOT_CATALOG_KEY ? rootSession.appliedSequence() : 0,
      // The guard is the live dispatch sequence at install time; page snapshot
      // seqs live in a different space and are deliberately not mixed in.
      bumpConnectionSeq: () => {},
      protectedThreadIds: (connectionKey) =>
        connectionKey === MANAGED_ROOT_CATALOG_KEY ? protectedThreadRowIds() : new Set<string>(),
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
}

function shellSnapshotRetryDelayMs(attempt: number): number {
  if (shellRetryDelayOverrideMs !== null) return shellRetryDelayOverrideMs;
  return Math.min(SHELL_SNAPSHOT_RETRY_BASE_MS * 2 ** attempt, SHELL_SNAPSHOT_RETRY_MAX_MS);
}

function loadRootCatalogPageOne(activation: ManagedLoopbackActivationSnapshot): Promise<void> {
  if (readManagedLoopbackActivation() !== activation) return Promise.resolve();
  if (shellLoadInFlight?.activation === activation) return shellLoadInFlight.promise;
  clearShellRetryTimer();
  const token = ++shellLoadToken;
  const run = runLoadRootCatalogPageOne(activation, token).finally(() => {
    clearShellLoadInFlight(token);
  });
  shellLoadInFlight = { activation, token, promise: run };
  return run;
}

async function runLoadRootCatalogPageOne(
  activation: ManagedLoopbackActivationSnapshot,
  token: number,
): Promise<void> {
  if (readManagedLoopbackActivation() !== activation) return;
  failedProtocolKinds.clear();
  setManagedRootCatalogStatus({ status: "starting" });
  beginBoundedCatalogAttempt(MANAGED_ROOT_CATALOG_KEY);
  try {
    const removalMark = boundedCatalogRemovalMark();
    const result = await activation.client.boundedShellSnapshot({
      order: "manual",
      threadLimit: BOUNDED_CATALOG_PAGE_LIMIT,
      summaries: false,
      maxBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
      maxDecodeBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
    });
    if (readManagedLoopbackActivation() !== activation) return;
    if (result.negotiation !== "bounded") {
      clearShellLoadInFlight(token);
      setManagedRootCatalogStatus({
        status: "failed",
        message: i18n._(msg`This server does not support the bounded catalog read.`),
        retrying: false,
      });
      return;
    }
    shellLoadAttempt = 0;
    failedProtocolKinds.clear();
    clearShellLoadInFlight(token);
    installBoundedCatalogShellPage(MANAGED_ROOT_CATALOG_KEY, result.page, removalMark);
    setManagedRootCatalogStatus({ status: "ready" });
  } catch (error) {
    if (readManagedLoopbackActivation() !== activation) return;
    if (isRemoteBoundedReadProtocolError(error)) {
      clearShellLoadInFlight(token);
      const message = friendlyError(error) || i18n._(msg`The desktop's own catalog read failed.`);
      setManagedRootCatalogStatus({ status: "failed", message, retrying: false });
      return;
    }
    if (shellLoadAttempt < SHELL_SNAPSHOT_MAX_AUTO_RETRIES) {
      const delayMs = shellSnapshotRetryDelayMs(shellLoadAttempt);
      shellLoadAttempt += 1;
      clearShellLoadInFlight(token);
      clearShellRetryTimer();
      shellRetryTimer = setTimeout(() => {
        shellRetryTimer = null;
        if (readManagedLoopbackActivation() !== activation) return;
        void loadRootCatalogPageOne(activation);
      }, delayMs);
      shellRetryTimer.unref?.();
      return;
    }
    clearShellLoadInFlight(token);
    setManagedRootCatalogStatus({
      status: "failed",
      message: friendlyError(error) || i18n._(msg`The desktop's own server is not connected yet.`),
      retrying: false,
    });
  }
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
 * A failed, non-bounded, or locally invalidated recovery requests one bounded
 * ordinary paint refresh instead of relying on an unrelated future event. The
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
    if (!arraysEqual(localOrderNow, localOrderAtStart)) {
      // Membership can change the projection without advancing the order
      // generation. Keep the stale-paint guard, but do not strand a failed
      // optimistic order when, for example, its deleted anchor disappears.
      requestManualPaintRefresh(MANAGED_ROOT_CATALOG_KEY, kind);
      return;
    }
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
  clearShellRetryTimer();
  shellLoadAttempt = 0;
  shellLoadInFlight = null;
  failedProtocolKinds.clear();
  rootSession.clearApplied();
  // A new activation may be a new backend child whose sequences restart:
  // baselines recorded against the previous stream prove nothing for it.
  rootSession.clearResume();
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
  const activation = readManagedLoopbackActivation();
  if (!activation) return;
  if (getManagedRootCatalogStatus().status === "failed" && shellRetryTimer === null) {
    // If an earlier shell snapshot or bounded read left status failed while the
    // loopback leg remained live, a fresh host membership change re-arms page 1
    // instead of ignoring the event.
    shellLoadAttempt = 0;
    void loadRootCatalogPageOne(activation);
    return;
  }
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
  unsubscribeSupervisorEvents = readBridge().onSupervisorEvent((event, seq, space) =>
    noteRootDispatchSequence(event, seq, space),
  );
  applyActivation(readManagedLoopbackActivation());
}

/** Truthful retry from the readiness surface. */
export function retryManagedRootCatalog(): void {
  clearShellRetryTimer();
  shellLoadAttempt = 0;
  failedProtocolKinds.clear();
  setManagedRootCatalogStatus({ status: "starting" });
  retryManagedParentDescriptor();
  retryManagedLoopbackIntake();
  const activation = readManagedLoopbackActivation();
  if (activation) void loadRootCatalogPageOne(activation);
}

export function managedRootCatalogStatus(): ReturnType<typeof getManagedRootCatalogStatus> {
  return getManagedRootCatalogStatus();
}

/** Test seam: override the automatic shell-snapshot retry delay. */
export function __setManagedRootRetryDelayForTest(delayMs: number | null): void {
  shellRetryDelayOverrideMs = delayMs;
}

/** Test seam: tear down subscriptions and controller/ledger state. */
export function __resetManagedRootCatalogRuntimeForTest(): void {
  clearShellRetryTimer();
  shellLoadAttempt = 0;
  shellRetryDelayOverrideMs = null;
  shellLoadInFlight = null;
  failedProtocolKinds.clear();
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
  __resetManagedRootLaunchMetadataCapabilityForTest();
  __resetManagedRootOrderFenceForTest();
  rootSession.clearApplied();
  disposeBoundedCatalog(MANAGED_ROOT_CATALOG_KEY);
}
