import type Database from "better-sqlite3";
import type {
  RuntimeHistoryGapAcknowledgeResult,
  RuntimeHistoryGapDescriptor,
  RuntimeHistoryNotice,
} from "@/shared/runtimeHistoryNotice";
import {
  RuntimeDurableGapStore,
  RUNTIME_DURABLE_GAP_PENDING_ENTRY_OVERHEAD_BYTES,
  RUNTIME_DURABLE_GAP_PENDING_MAX_BYTES,
  RUNTIME_DURABLE_GAP_PENDING_MAX_THREADS,
  identityOfRuntimeDatabase,
  type RuntimeDurableGapPort,
  type RuntimeDurableGapResolution,
} from "./runtimeDurableGap";
import { RuntimeHistoryNoticeStore, type RuntimeHistoryNoticeLookup } from "./runtimeHistoryNotice";
import { onProjectThreadDataChanged } from "./projectThreadChanges";
import {
  RuntimePersistenceDurableStateUnavailableError,
  RuntimePersistenceDurableGapPendingError,
  RuntimePersistenceUnknownThreadError,
  type RuntimeContaminationReason,
} from "./runtimePersistenceTypes";

type SqliteDatabase = InstanceType<typeof Database>;

/**
 * Boot-lifecycle owner for the durable-gap store: handle binding, the eager
 * runtime-owned arm, the pre-launch/admission touch, the bounded pending
 * obligation reserve, and the clean-close finalize. The store owns every SQL
 * statement; this module owns the failure policy (through the injected health
 * callback) and the identity boundary between database roots.
 *
 * Pending obligations are evidence and are never evicted. They are retained per
 * owning database identity, so a process-global reserve can never write an old
 * root's obligation into a new root that happens to reuse a thread id; a
 * clean close is refused while any obligation (or the overflow latch) remains,
 * which also keeps root replacement blocked until custody is resolved.
 */
export interface RuntimeDurableGapCoordinatorOptions {
  now?: () => number;
  /** Classified storage failure from a durable-gap operation. */
  onStorageFailure(error: unknown): void;
  /** A durable-gap write committed (health recovery evidence). */
  onStorageSuccess?(): void;
  /** Pending reserve overflow: degradation must latch for this process. */
  onReserveOverflow(): void;
  pendingMaxThreads?: number;
  pendingMaxBytes?: number;
  resolutionCacheMaxEntries?: number;
  /** Bound for the derived notice-lookup cache (WS scoping). */
  noticeLookupCacheMaxEntries?: number;
}

interface PendingGapObligation {
  readonly owner: unknown;
  reason: RuntimeContaminationReason;
  refusedEvents: number;
  refusedBytes: number;
}

export class RuntimeDurableGapCoordinator {
  private readonly options: RuntimeDurableGapCoordinatorOptions;
  private store: RuntimeDurableGapStore | null = null;
  private noticeStore: RuntimeHistoryNoticeStore | null = null;
  private projectThreadChangeUnsubscribe: (() => void) | null = null;
  private owner: unknown;
  private readonly pending = new Map<string, PendingGapObligation>();
  private pendingBytes = 0;
  private reserveLatched = false;

  constructor(options: RuntimeDurableGapCoordinatorOptions) {
    this.options = options;
  }

  /**
   * Read-only bind for a connection that may only ever read (desktop/headless
   * runtime owner or a direct harness): reads the singleton epoch row, never
   * writes and never arms. The root arm is a separate, explicit step. The
   * notice/acknowledgement store is constructed for the same handle and reads
   * the current episode through this store's resolution.
   */
  bindForConnection(sqlite: SqliteDatabase): void {
    const store = new RuntimeDurableGapStore({
      ...(this.options.now ? { now: this.options.now } : {}),
      ...(this.options.resolutionCacheMaxEntries !== undefined
        ? { resolutionCacheMaxEntries: this.options.resolutionCacheMaxEntries }
        : {}),
    });
    const result = store.bind(sqlite);
    this.store = store;
    this.owner = identityOfRuntimeDatabase(sqlite);
    this.noticeStore = new RuntimeHistoryNoticeStore(sqlite, {
      now: this.options.now ?? (() => Date.now()),
      currentEpoch: () => store.getCurrentEpoch(),
      resolve: (threadId) => store.resolve(threadId),
      invalidateResolution: (threadId) => store.forgetThread(threadId),
      ...(this.options.noticeLookupCacheMaxEntries !== undefined
        ? { lookupCacheMaxEntries: this.options.noticeLookupCacheMaxEntries }
        : {}),
    });
    // Derived notice lookups are tied to the bound database identity: any
    // project/thread row change (renderer sync, bulk/authoritative delete)
    // drops them so the WS-side cache can over-warn but never miss a durable
    // notice that a rebind or a sync left behind. Re-querying is the authority.
    this.projectThreadChangeUnsubscribe?.();
    this.projectThreadChangeUnsubscribe = onProjectThreadDataChanged(() => {
      this.noticeStore?.invalidateAllNotices();
    });
    if (result.error !== undefined) this.options.onStorageFailure(result.error);
  }

  /**
   * Eager runtime-owned open: bind if the handle changed, then commit this
   * boot's root arm. A storage failure is reported typed and leaves the boot
   * unarmed, so every canonical batch is refused (degraded/global) while reads
   * still resolve from durable evidence. It never throws: the boot is allowed
   * to continue in an explicitly degraded state.
   */
  attachAndArm(sqlite: SqliteDatabase): void {
    if (this.store === null || this.owner !== identityOfRuntimeDatabase(sqlite)) {
      this.bindForConnection(sqlite);
    }
    // A boot arms exactly once: repeated attach calls for the same live handle
    // (composition re-entry, tests) must not advance the epoch again.
    if (this.store?.isArmed()) return;
    try {
      this.store?.arm();
    } catch (error) {
      this.options.onStorageFailure(error);
    }
  }

  /**
   * The runtime owner dropped this connection (reopen or test reset). Derived
   * caches go with it; pending obligations are evidence and stay tracked.
   */
  resetForConnection(): void {
    this.store = null;
    this.noticeStore = null;
    this.owner = undefined;
    this.projectThreadChangeUnsubscribe?.();
    this.projectThreadChangeUnsubscribe = null;
  }

  /** Test-only: drop the connection and every obligation/latch. */
  resetForTests(): void {
    this.resetForConnection();
    this.pending.clear();
    this.pendingBytes = 0;
    this.reserveLatched = false;
  }

  /**
   * Pre-launch bridge: arm the boot if needed, then commit the thread touch
   * before the supervisor request is built and sent. An unknown thread is
   * refused typed; a storage failure keeps the boot's explicit degraded state.
   * Either way the caller (SupervisorClient.prepareStartThread) rejects the
   * launch before any provider process can run.
   */
  armThreadForLaunch(threadId: string): void {
    this.armThread(threadId);
  }

  /**
   * Admission ordering: arm the boot if needed, then commit the touch before
   * any event may enter the bounded queue. Throws on storage failure (the
   * decider refuses the whole batch) or for a thread with no `threads` row
   * (the decider refuses without fabricating evidence that could never commit).
   */
  armThreadForAdmission(threadId: string): void {
    this.armThread(threadId);
  }

  /**
   * One arm/touch policy for both entry points: an unknown thread is a typed
   * refusal, anything else is a classified storage failure, and both reject
   * the caller before a launch dispatches or a batch is admitted.
   */
  private armThread(threadId: string): void {
    const store = this.store;
    if (!store) return;
    try {
      store.ensureArmed();
      store.touch(threadId);
      this.options.onStorageSuccess?.();
    } catch (error) {
      if (!(error instanceof RuntimePersistenceUnknownThreadError)) {
        this.options.onStorageFailure(error);
      }
      throw error;
    }
  }

  /** Bounded read-only resolution; a missing store is inert (unit harnesses). */
  resolve(threadId: string): RuntimeDurableGapResolution {
    return this.store?.resolve(threadId) ?? { kind: "clean" };
  }

  /**
   * Commit exact gap evidence. A storage failure keeps the refusal explicit and
   * records a bounded pending obligation (which blocks a clean close until it is
   * durable). Never throws: the decider's refusal result is already decided.
   */
  recordGap(
    threadId: string,
    reason: RuntimeContaminationReason,
    refusedEvents: number,
    refusedBytes: number,
  ): void {
    const store = this.store;
    if (!store) return;
    try {
      store.persistGap(threadId, reason, refusedEvents, refusedBytes);
    } catch (error) {
      this.options.onStorageFailure(error);
      this.recordPendingObligation(threadId, reason, refusedEvents, refusedBytes);
    }
  }

  /**
   * Retry every obligation owned by the current root, then refuse the close if
   * anything is still unwritten or the reserve overflowed. Obligations owned by
   * another root are never written here and also keep the close refused.
   */
  flushPendingGaps(): void {
    const store = this.store;
    if (store) {
      for (const [threadId, entry] of [...this.pending]) {
        if (entry.owner !== this.owner) continue;
        try {
          store.persistGap(threadId, entry.reason, entry.refusedEvents, entry.refusedBytes);
          this.pending.delete(threadId);
          this.pendingBytes -= pendingEntryBytes(threadId);
        } catch {
          // Keep the obligation; the close below refuses.
        }
      }
    }
    if (this.pending.size > 0 || this.reserveLatched) {
      throw new RuntimePersistenceDurableGapPendingError(
        [...this.pending.keys()],
        this.reserveLatched,
      );
    }
  }

  /** Clean-close step 3: delete this boot's touches and disarm. */
  disarmAfterCleanClose(): void {
    this.store?.disarmAfterCleanClose();
  }

  /** After an applied authoritative rebase/delete: drop in-memory obligations. */
  forgetThread(threadId: string): void {
    if (this.pending.delete(threadId)) {
      this.pendingBytes -= pendingEntryBytes(threadId);
    }
    this.store?.forgetThread(threadId);
    // A delete/cascade invalidates the derived lookup so a reused thread id
    // re-queries the durable table; an authoritative rebase keeps the durable
    // notice row but must not keep a stale derived answer for it.
    this.noticeStore?.invalidateNotice(threadId);
  }

  /**
   * Owner-checked pending exact-gap obligation for one thread, or null. Only
   * evidence recorded while this same database root was bound is returned: a
   * process-global reserve must never fold another root's obligation into this
   * root's notice.
   */
  pendingObligationFor(threadId: string): { refusedEvents: number; refusedBytes: number } | null {
    const entry = this.pending.get(threadId);
    if (!entry || entry.owner !== this.owner) return null;
    return { refusedEvents: entry.refusedEvents, refusedBytes: entry.refusedBytes };
  }

  /**
   * Read-only current episode descriptor; `null` means clean. A missing store
   * or an unreadable/identity-corrupt episode throws typed: the read never
   * pretends a thread is clean when it cannot verify that.
   */
  getGapDescriptor(threadId: string): RuntimeHistoryGapDescriptor | null {
    return this.requireNoticeStore(threadId, "gap-descriptor").readDescriptor(threadId);
  }

  /** Read-only durable notice for one thread, or null. */
  getNotice(threadId: string): RuntimeHistoryNotice | null {
    return this.requireNoticeStore(threadId, "notice-descriptor").readNotice(threadId);
  }

  /**
   * Bounded derived notice lookup for live/replay scoping. A missing store is
   * returned as an error (fail closed) instead of a false clean answer.
   */
  lookupNotice(threadId: string): RuntimeHistoryNoticeLookup {
    const store = this.noticeStore;
    if (!store) {
      return {
        kind: "error",
        error: new RuntimePersistenceDurableStateUnavailableError(threadId, "notice-descriptor"),
      };
    }
    return store.lookupNotice(threadId);
  }

  /** Derived notice-cache size (tests/diagnostics). */
  noticeLookupCacheSize(): number {
    return this.noticeStore?.lookupCacheSize() ?? 0;
  }

  /**
   * One synchronous acknowledgement transaction under the caller's per-thread
   * mutation gate. The owner-checked pending obligation is folded into the
   * notice counters and dropped only on `applied`; `already`/`stale`/SQL
   * failure performs zero writes and zero drops. The store sets the derived
   * lookup positive on success.
   */
  acknowledgeThreadGap(
    threadId: string,
    token: string,
    accepted: { events: number; bytes: number },
  ): RuntimeHistoryGapAcknowledgeResult {
    const store = this.requireNoticeStore(threadId, "acknowledge");
    const pending = this.pendingObligationFor(threadId);
    const result = store.acknowledge(threadId, token, {
      pendingEvents: pending?.refusedEvents ?? 0,
      pendingBytes: pending?.refusedBytes ?? 0,
      acceptedEvents: accepted.events,
      acceptedBytes: accepted.bytes,
    });
    if (result.outcome === "applied") {
      if (pending) {
        this.pending.delete(threadId);
        this.pendingBytes -= pendingEntryBytes(threadId);
      }
      // The applied ack deleted the exact gap and every foreign touch, so the
      // derived resolution cache must be re-read; the durable notice lookup
      // stays positive (the store cached it).
      this.store?.forgetThread(threadId);
    }
    return result;
  }

  private requireNoticeStore(
    threadId: string,
    operation: "gap-descriptor" | "notice-descriptor" | "acknowledge",
  ): RuntimeHistoryNoticeStore {
    const store = this.noticeStore;
    if (!store) {
      throw new RuntimePersistenceDurableStateUnavailableError(threadId, operation);
    }
    return store;
  }

  /** Armed boot epoch that a rebase transaction must preserve, or null. */
  currentBootEpochForRebase(): number | null {
    return this.store?.getCurrentEpoch() ?? null;
  }

  /** Bounded accessor for the admission port. */
  get port(): RuntimeDurableGapPort {
    return {
      armThread: (threadId) => this.armThreadForAdmission(threadId),
      resolve: (threadId) => this.resolve(threadId),
      recordGap: (threadId, reason, refusedEvents, refusedBytes) =>
        this.recordGap(threadId, reason, refusedEvents, refusedBytes),
      reportFailure: (error) => this.options.onStorageFailure(error),
    };
  }

  pendingThreadIds(): readonly string[] {
    return [...this.pending.keys()];
  }

  isReserveLatched(): boolean {
    return this.reserveLatched;
  }

  /** Diagnostics/tests: the current store's bind metadata. */
  storeBindResult() {
    return this.store?.getBindResult() ?? null;
  }

  private recordPendingObligation(
    threadId: string,
    reason: RuntimeContaminationReason,
    refusedEvents: number,
    refusedBytes: number,
  ): void {
    const existing = this.pending.get(threadId);
    if (existing) {
      existing.refusedEvents += refusedEvents;
      existing.refusedBytes += refusedBytes;
      return;
    }
    const maxThreads = this.options.pendingMaxThreads ?? RUNTIME_DURABLE_GAP_PENDING_MAX_THREADS;
    const maxBytes = this.options.pendingMaxBytes ?? RUNTIME_DURABLE_GAP_PENDING_MAX_BYTES;
    const cost = pendingEntryBytes(threadId);
    if (this.pending.size + 1 > maxThreads || this.pendingBytes + cost > maxBytes) {
      // Never evict evidence: latch the overflow so no clean close can erase
      // the surviving touches that identify the untracked threads.
      if (!this.reserveLatched) {
        this.reserveLatched = true;
        this.options.onReserveOverflow();
      }
      return;
    }
    this.pending.set(threadId, {
      owner: this.owner,
      reason,
      refusedEvents,
      refusedBytes,
    });
    this.pendingBytes += cost;
  }
}

function pendingEntryBytes(threadId: string): number {
  return threadId.length * 2 + RUNTIME_DURABLE_GAP_PENDING_ENTRY_OVERHEAD_BYTES;
}
