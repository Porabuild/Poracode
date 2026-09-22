import type { RuntimeEvent } from "@/shared/contracts";
import type { RuntimePersistenceSample } from "@/shared/diagnostics/runtimePersistenceSample";
import type {
  RuntimeHistoryGapAcknowledgeResult,
  RuntimeHistoryGapDescriptor,
  RuntimeHistoryNotice,
} from "@/shared/runtimeHistoryNotice";
import { getSqlite, registerBeforeDatabaseClose } from "./connection";
import type { RuntimeHistoryNoticeLookup } from "./runtimeHistoryNotice";
import {
  RuntimePersistenceController,
  type SynchronousMutationCallback,
} from "./runtimePersistenceController";
import type { RuntimeControlOperation } from "./runtimeControlOperationQueue";
import { applyThreadRuntimeEventsNow, resetRuntimeItemsWriterCache } from "./runtimeItemsWriter";
import {
  RuntimePersistenceDrainIncompleteError,
  type RuntimeAdmission,
  type RuntimeBarrierResult,
  type RuntimeFenceResult,
  type RuntimeFenceToken,
  type RuntimePersistenceStateInfo,
  type RuntimeProducerSignal,
  type RuntimeShutdownReport,
  type RuntimeStorageErrorClass,
} from "./runtimePersistenceTypes";

/**
 * Process-wide runtime persistence pipeline: one controller, one bounded queue,
 * one close hook. `runtimeItems.ts` re-exports the read/apply API; compositions
 * (desktop backend, headless server) subscribe for producer signals and read
 * the shutdown report.
 *
 * Close contract: the hook drains accepted events and throws a typed
 * `RuntimePersistenceDrainIncompleteError` when work is left, so
 * `closeDatabase` keeps the handle open (its documented failed-hook contract)
 * and the process exits under its hard deadline without ever logging a
 * successful join over uncommitted events.
 */

export interface RuntimePersistenceHealthListener {
  onSignal?(signal: RuntimeProducerSignal): void;
  onStateChange?(info: RuntimePersistenceStateInfo): void;
}

const healthListeners = new Set<RuntimePersistenceHealthListener>();

export function addRuntimePersistenceHealthListener(
  listener: RuntimePersistenceHealthListener,
): () => void {
  healthListeners.add(listener);
  return () => healthListeners.delete(listener);
}

function notifyHealthListeners(notify: (listener: RuntimePersistenceHealthListener) => void): void {
  for (const listener of healthListeners) {
    try {
      notify(listener);
    } catch (error) {
      console.error("[db] runtime persistence health listener failed:", error);
    }
  }
}

export const runtimePersistenceController = new RuntimePersistenceController({
  write: (threadId, events) => applyThreadRuntimeEventsNow(threadId, events),
  onSignal: (signal) => notifyHealthListeners((listener) => listener.onSignal?.(signal)),
  onStateChange: (info) => notifyHealthListeners((listener) => listener.onStateChange?.(info)),
  onFailure: (error, errorClass, threadId) => {
    console.error(
      `[db] runtime persistence write failed (${errorClass}${threadId ? `, thread ${threadId}` : ""}):`,
      error,
    );
  },
  onRefusal: (reason, scope, info) => {
    console.error(
      `[db] runtime persistence admission refused (${reason}, ${scope}): ${info.pendingEvents} pending event(s), ${info.pendingBytes} bytes; refused ${info.refusedEvents} event(s) / ${info.refusedBytes} bytes.`,
    );
  },
});

let lastShutdownReport: RuntimeShutdownReport | null = null;
let lastConnection: unknown;

/**
 * Tests and long-lived processes can reopen the database; a new handle resets
 * the health state so admission is not permanently closed after a close.
 */
function bindCurrentConnection(): void {
  let sqlite: ReturnType<typeof getSqlite>;
  try {
    sqlite = getSqlite();
  } catch {
    // No database open (unit harnesses with injected writers): the controller
    // still classifies whatever the operation itself throws.
    return;
  }
  if (sqlite === lastConnection) return;
  lastConnection = sqlite;
  runtimePersistenceController.resetForNewConnection();
  lastShutdownReport = null;
  // Read-only durable-gap bind: reads the singleton epoch row and nothing else.
  // Arming is eager for a production composition (BackendHostCore) and lazy on
  // the first canonical admission or pre-launch touch for direct harnesses, so
  // a pure GET/bind/validate/import can never arm or write.
  runtimePersistenceController.bindDurableGapForConnection(sqlite);
}

registerBeforeDatabaseClose(() => {
  const report = runtimePersistenceController.shutdown();
  if (report.kind === "incomplete") {
    lastShutdownReport = report;
    throw new RuntimePersistenceDrainIncompleteError(report);
  }
  // Durable evidence finalize: retry every pending exact gap, then delete this
  // boot's touches and clear the armed flag in one transaction. A throw here
  // keeps the handle open (failed-hook custody), so the armed epoch and every
  // touch survive to the next boot and no false clean history is possible.
  runtimePersistenceController.finalizeDurableGapClose();
  lastShutdownReport = report;
  resetRuntimeItemsWriterCache();
});

export function getRuntimePersistenceShutdownReport(): RuntimeShutdownReport | null {
  return lastShutdownReport;
}

/**
 * Eager runtime-owned durable-gap open for a production composition. Runs after
 * `initDatabase` and before any canonical event can be admitted: binds the
 * store and commits this boot's root arm (one write per boot). A storage
 * failure is classified into the typed degraded state and never throws.
 */
export function attachRuntimePersistenceDurableGapFromCurrentConnection(): void {
  const sqlite = getSqlite();
  // Fresh boot on a freshly opened handle: re-arm the pipeline before the
  // durable open so admission is not left closed by a previous close.
  runtimePersistenceController.resetForNewConnection();
  runtimePersistenceController.attachDurableGapForConnection(sqlite);
  // The eager open is this boot's connection bind: later runtime entry points
  // must not reset the pipeline (or rebind the store) for the same handle.
  lastConnection = sqlite;
  lastShutdownReport = null;
}

/**
 * Pre-launch bridge for `SupervisorClient.prepareStartThread`: arm the boot if
 * needed and commit `touch(T)` before the launch request is built and sent.
 * Throws typed for an unknown thread or a storage failure, which rejects the
 * supervisor call before `child.send`: no provider process can run without a
 * durable marker.
 */
export function armRuntimeThreadForLaunch(threadId: string): void {
  bindCurrentConnection();
  runtimePersistenceController.armThreadForLaunch(threadId);
}

/**
 * Thread deletion is an authoritative rebase: the `threads` row delete
 * cascades the durable gap/touch rows, and this drops the in-memory
 * contamination, touch decision, and pending obligation so a reused id cannot
 * inherit stale evidence.
 */
export function forgetRuntimeThreadDurableGap(threadId: string): void {
  bindCurrentConnection();
  runtimePersistenceController.forgetDurableGapThread(threadId);
}

/**
 * Armed boot epoch an authoritative rebase transaction must preserve (the
 * current boot's touch), or null when this boot never armed.
 */
export function getRuntimeDurableGapRebaseEpoch(): number | null {
  bindCurrentConnection();
  return runtimePersistenceController.durableGapRebaseEpoch();
}

/** Diagnostics/tests: threads whose exact gap evidence is not yet durable. */
export function getRuntimeDurableGapPendingThreadIds(): readonly string[] {
  return runtimePersistenceController.durableGapPendingThreadIds();
}

/** Diagnostics/tests: the pending-obligation reserve overflowed this process. */
export function isRuntimeDurableGapReserveLatched(): boolean {
  return runtimePersistenceController.isDurableGapReserveLatched();
}

/**
 * Test-only: re-arm the singleton pipeline (health state, pending entries)
 * without reopening SQLite. Exists because the controller is process-global and
 * suites that publish supervisor events with a mocked database must not leak a
 * degraded state into later tests.
 */
export function resetRuntimePersistenceForTests(): void {
  runtimePersistenceController.resetForNewConnection();
  runtimePersistenceController.resetDurableGapForTests();
  // Force the next operation to re-bind (and read the epoch row) even when the
  // suite reuses the same SQLite handle.
  lastConnection = undefined;
  lastShutdownReport = null;
}

export function getRuntimePersistenceSample(): RuntimePersistenceSample | null {
  try {
    bindCurrentConnection();
    return runtimePersistenceController.sample();
  } catch {
    return null;
  }
}

export function getRuntimePersistenceState(): RuntimePersistenceStateInfo | null {
  try {
    bindCurrentConnection();
    const pending = runtimePersistenceController.pendingStats();
    return {
      state: runtimePersistenceController.getState(),
      errorClass: runtimePersistenceController.getLastErrorClass(),
      pendingEvents: pending.events,
      pendingBytes: pending.bytes,
      contaminatedThreads: runtimePersistenceController.contaminatedThreadCount(),
    };
  } catch {
    return null;
  }
}

export function applyRuntimeEvents(
  threadId: string,
  events: readonly RuntimeEvent[],
): RuntimeAdmission {
  bindCurrentConnection();
  return runtimePersistenceController.admit(threadId, events);
}

export function barrierRuntimeWrites(threadId: string): RuntimeBarrierResult {
  bindCurrentConnection();
  return runtimePersistenceController.barrier(threadId);
}

export function barrierRuntimeWritesOrThrow(threadId: string): number {
  bindCurrentConnection();
  return runtimePersistenceController.barrierOrThrow(threadId);
}

export function runRuntimeControlWrite(
  operation: () => void,
  threadId?: string,
): { ok: boolean; errorClass?: RuntimeStorageErrorClass; error?: unknown } {
  bindCurrentConnection();
  return runtimePersistenceController.runControlWrite(operation, threadId);
}

/**
 * Queue an idempotent control write for bounded retry. Control capacity is
 * reserved and never consumed by canonical bulk admission. Refusal means the
 * control reserve itself is exhausted (a genuine host fault, already reflected
 * in the controller state).
 */
export function enqueueRuntimeControlOperation(
  operation: RuntimeControlOperation,
): "accepted" | "refused" {
  bindCurrentConnection();
  return runtimePersistenceController.enqueueControlOperation(operation);
}

export function discardRuntimeWrites(threadId: string): void {
  bindCurrentConnection();
  runtimePersistenceController.discard(threadId);
}

/**
 * Record that a deferred authoritative rebase (`thread-reset`) exhausted its
 * bounded control retries or was refused before it could run. The thread
 * carries an explicit contamination marker until an applied rebase, so a later
 * session's events are refused instead of silently appending to the pre-reset
 * transcript.
 */
export function markRuntimeRebaseDropped(threadId: string): void {
  bindCurrentConnection();
  runtimePersistenceController.markDroppedRebase(threadId);
}

/**
 * Commit a thread's accepted prefix synchronously in chunk-bound transactions.
 * The synchronous boundary caller owns it: it throws the typed degraded or
 * contaminated refusal rather than reading behind uncommitted/refused state.
 */
export function commitRuntimeThreadPrefixSync(threadId: string): number {
  bindCurrentConnection();
  return runtimePersistenceController.commitThreadPrefixSync(threadId);
}

export function hasPendingRuntimeWrites(threadId?: string): boolean {
  bindCurrentConnection();
  return runtimePersistenceController.hasPending(threadId);
}

/** Thread ids with admitted-but-uncommitted runtime writes right now. */
export function pendingRuntimeThreadIds(): string[] {
  bindCurrentConnection();
  return runtimePersistenceController.pendingThreadIds();
}

/**
 * Compose handoff: the supervisor's advertised canonical in-flight bound
 * (`SupervisorClient.getPeerCanonicalCapabilities().maxInFlightBytes`), or
 * `null` when the peer advertised nothing (the controller then keeps the
 * conservative constant). Call it whenever the peer (re)advertises so the
 * pause threshold covers the supervisor's own retained queue.
 */
export function setRuntimePersistenceInFlightWindowBytes(bytes: number | null): void {
  bindCurrentConnection();
  runtimePersistenceController.setInFlightWindowBytes(bytes);
}

export function beginRuntimeFence(threadId: string): RuntimeFenceToken {
  bindCurrentConnection();
  return runtimePersistenceController.beginFence(threadId);
}

export function flushRuntimeFence(
  token: RuntimeFenceToken,
  options?: { deadlineMs?: number; signal?: AbortSignal },
): Promise<RuntimeFenceResult> {
  bindCurrentConnection();
  return runtimePersistenceController.flushFence(token, options);
}

export function readRuntimeFence<T>(token: RuntimeFenceToken, read: () => T): T {
  bindCurrentConnection();
  return runtimePersistenceController.readFenced(token, read);
}

export function releaseRuntimeFence(token: RuntimeFenceToken): void {
  bindCurrentConnection();
  runtimePersistenceController.releaseFence(token);
}

export function runThreadRuntimeMutation<T>(
  threadId: string,
  kind: "truncate" | "replace" | "reset" | "delete",
  operation: SynchronousMutationCallback<T>,
  options?: { deadlineMs?: number },
): Promise<T> {
  bindCurrentConnection();
  return runtimePersistenceController.runThreadMutation(threadId, kind, operation, options);
}

export function tryRunThreadRuntimeMutation<T>(
  threadId: string,
  kind: "truncate" | "replace" | "reset",
  operation: SynchronousMutationCallback<T>,
): T {
  bindCurrentConnection();
  return runtimePersistenceController.tryRunThreadMutation(threadId, kind, operation);
}

export function getRuntimeContamination(
  threadId: string,
): ReturnType<RuntimePersistenceController["getContamination"]> {
  bindCurrentConnection();
  return runtimePersistenceController.getContamination(threadId);
}

/**
 * Ordinary read-only descriptor of a thread's current unacknowledged canonical
 * episode, or null when clean. Throws typed (fail closed) when the durable
 * state is unavailable or an episode identity is malformed.
 */
export function getRuntimeThreadGapDescriptor(
  threadId: string,
): RuntimeHistoryGapDescriptor | null {
  bindCurrentConnection();
  return runtimePersistenceController.getThreadRuntimeGapDescriptor(threadId);
}

/** Ordinary read-only durable history-incomplete notice, or null. */
export function getRuntimeThreadGapNotice(threadId: string): RuntimeHistoryNotice | null {
  bindCurrentConnection();
  return runtimePersistenceController.getThreadRuntimeGapNotice(threadId);
}

/**
 * Acknowledge one durable canonical-gap episode under the per-thread mutation
 * gate. The caller owns the supervisor dispatch lock (BackendHostCore); this
 * wrapper only binds the connection. Resolves with the typed idempotence
 * outcome (`applied`/`already`/`stale`); a storage failure rejects and has
 * performed zero writes and zero discards.
 */
export function acknowledgeRuntimeThreadGap(
  threadId: string,
  token: string,
): Promise<RuntimeHistoryGapAcknowledgeResult> {
  bindCurrentConnection();
  return runtimePersistenceController.acknowledgeThreadRuntimeGap(threadId, token);
}

/**
 * Bounded derived notice lookup for live/replay scoping (WS lane). Never
 * throws: a read failure is returned as `{kind:"error"}` so the caller fails
 * closed instead of assuming clean.
 */
export function lookupRuntimeNotice(threadId: string): RuntimeHistoryNoticeLookup {
  bindCurrentConnection();
  return runtimePersistenceController.lookupRuntimeNotice(threadId);
}
