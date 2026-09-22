import {
  closeDatabase,
  dbGetThread,
  dbGetProject,
  dbMarkLiveThreadsInactive,
  dbTruncateThreadRuntimeAfter,
  initDatabase,
  dbClaimCheckpointRevertOperation,
  dbGetCheckpointRevertOperation,
  dbHasThreadRuntimeItem,
  dbUpdateCheckpointRevertPhases,
  acknowledgeRuntimeThreadGap,
  attachRuntimePersistenceDurableGapFromCurrentConnection,
  armRuntimeThreadForLaunch,
  getRuntimeThreadGapDescriptor,
  type CheckpointRevertFilesPhase,
  type CheckpointRevertOperationRow,
  type CheckpointRevertOutcome,
  type CheckpointRevertProviderPhase,
  type CheckpointRevertTruncatePhase,
  getRuntimePersistenceShutdownReport,
  type RuntimeProducerSignal,
  type RuntimeShutdownReport,
} from "@/host/db";
import type {
  RuntimeHistoryGapAcknowledgeResult,
  RuntimeHistoryGapDescriptor,
} from "@/shared/runtimeHistoryNotice";
import { SupervisorClient, type SupervisorClientOptions } from "@/host/supervisor/SupervisorClient";
import { ensureHomeProjectRow } from "@/host/schedules/homeProject";
import { HostDataFence } from "@/backend/ownership/hostDataFence";
import { persistSupervisorEvent } from "@/host/remote/server/runtimePersistence";
import { TerminalScrollbackPersistence } from "@/host/remote/server/terminalScrollbackPersistence";
import { HostPersistenceProducerControl } from "@/backend/hostPersistenceProducerControl";
import { settleOrphanedCrossagentRuns } from "@/backend/crossagentBootSettle";
import type { SupervisorEvent } from "@/shared/ipc";
import type { ProjectLocation } from "@/shared/contracts/common";
import type { ThreadConfig } from "@/shared/contracts/config";
import type { ProviderRevertAnchor } from "@/shared/contracts";

function isTimedOutError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("timed out");
}

/** Anchor absence is the capability declaration of the ACP-style structured
 * sessions; the supervisor surfaces it as a plain IPC error message. */
function isAnchorUnsupportedError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("does not support revert anchors");
}

export type RevertCheckpointRefusalReason = "THREAD_TURN_ACTIVE";

/** Typed refusal for a revert the backend declined before any side effect. */
export class RevertCheckpointRefusedError extends Error {
  constructor(
    public readonly reason: RevertCheckpointRefusalReason,
    message: string,
  ) {
    super(message);
    this.name = "RevertCheckpointRefusedError";
  }
}

export interface RevertCheckpointInput {
  threadId: string;
  checkpointItemId: string;
  /** Client-generated idempotency key: retries of the same logical revert
   * replay the stored outcome instead of re-executing phases. */
  operationKey: string;
  /** Where the checkpoint's project lives; required for the file-restore
   * phase. Frozen into the journal at claim time. */
  projectLocation?: ProjectLocation;
}

export type RevertCheckpointOutcome =
  | "completed"
  | "completed_local_only"
  | "ambiguous"
  | "failed"
  | "noop";

export interface RevertCheckpointResult {
  outcome: RevertCheckpointOutcome;
  /** True when a settled journal row was replayed instead of re-executed. */
  replayed: boolean;
  numTurns: number;
  providerPhase: CheckpointRevertProviderPhase;
  filesPhase: CheckpointRevertFilesPhase;
  truncatePhase: CheckpointRevertTruncatePhase;
  removedCompletedTurnAnchors: string[];
}

/** Narrow retryable handle to a database a failed construction could not close. */
export interface RetainedStartupCustody {
  /**
   * Retry the refused close. While the before-close hook still refuses this
   * throws and custody is retained (`closeDatabase` keeps the handle open);
   * after a successful close it is a no-op, so a composition can join it from
   * a retryable dispose barrier.
   */
  retryCloseDatabase(): void;
}

export interface BackendHostCoreOptions {
  baseDir: string;
  dbPath: string;
  databaseSchemaMode?: "migrate" | "validate";
  markLiveThreadsInactiveOnOpen?: boolean;
  /**
   * Data-custody fence path (`hostDataFence.ts`). Compositions that fork this
   * core into a backend child pass the fence resolved by their owner: the
   * child takes it before opening SQLite and releases it only after the
   * database closes, so a killed owner cannot leave its orphaned child writing
   * a root a successor owner already leases. In-process compositions (headless)
   * omit it: the owner process holds the lease directly.
   */
  dataFencePath?: string;
  /**
   * Failed-startup custody handoff. When the constructor's cleanup close is
   * refused (its drain hook threw; the handle stays open and the fence, if
   * any, stays held), this callback receives the only retryable path to that
   * close. In-process compositions that own the root directly register it on
   * their dispose barrier so a transient refusal can still close cleanly
   * before the owner lease is released; a refusal that persists keeps the
   * lease with the owner until process death. Compositions that retire the
   * failed process instead (desktop backend child) omit it.
   */
  onStartupCustodyRetained?(custody: RetainedStartupCustody): void;
  supervisor: Omit<SupervisorClientOptions, "baseDir" | "onEvent" | "onReset" | "onOutputShed">;
  onEvent(event: SupervisorEvent): void;
  onReset(): void;
  /**
   * The supervisor shed queued terminal-output batches for these threads
   * under backend-IPC backpressure. Compositions ask their clients to
   * resynchronize those threads' terminal output from the supervisor — the
   * shed events never reached persistence, so without this the loss would
   * be silent.
   */
  onSupervisorOutputShed?(threadIds: string[]): void;
  /**
   * B1 GUI durable-gap recovery post-commit hook: an acknowledgement applied
   * (the durable notice exists and the matching episode evidence is cleared).
   * Composition roots use this to mark the thread in their live/replay scoping
   * gate and broadcast `resync-required`. It runs after the commit, only on
   * `applied`, and a throwing hook never fails the acknowledgement.
   */
  onRuntimeGapAcknowledged?(threadId: string): void;
}

/**
 * Process-agnostic owner for Poracode's durable state and agent runtime.
 * Desktop and headless composition roots add their own UI/network adapters,
 * while this core keeps database lifecycle and supervisor-event durability in
 * one place so it can move behind a transport without changing those services.
 */
export class BackendHostCore {
  readonly supervisorClient: SupervisorClient;
  private readonly terminalScrollbackPersistence: TerminalScrollbackPersistence;
  private persistenceProducerControl: HostPersistenceProducerControl | null = null;
  private databaseOpen = false;
  private closing = false;
  private supervisorJoined = false;
  private supervisorDisposal: Promise<void> | null = null;
  private disposal: Promise<void> | null = null;
  /** Serializes checkpoint reverts per thread: two clients reverting the same
   * thread run one after the other, and the second recount happens only after
   * the first compound fully settles. */
  private readonly revertLocks = new Map<string, Promise<unknown>>();
  private dataFence: HostDataFence | null = null;

  constructor(private readonly options: BackendHostCoreOptions) {
    // Custody order: the fence is taken before SQLite opens and released only
    // after it closes, so the database is never writable without the fence.
    if (options.dataFencePath) {
      this.dataFence = HostDataFence.acquire(options.dataFencePath);
    }
    this.databaseOpen = true;
    try {
      if (options.databaseSchemaMode) {
        initDatabase(options.dbPath, { schemaMode: options.databaseSchemaMode });
      } else {
        initDatabase(options.dbPath);
      }
      if (options.databaseSchemaMode !== "validate") {
        // Eager runtime-owned durable-gap arm: one write per boot, committed
        // before any canonical event can be admitted. Storage failure is
        // classified into the typed degraded state (every canonical batch is
        // then refused) instead of silently succeeding unarmed. A validate-only
        // open never arms; offline imports and validate/seed opens never call
        // this entry point.
        attachRuntimePersistenceDurableGapFromCurrentConnection();
        // Settle Crossagent run rows orphaned by the previous supervisor
        // process before any supervisor exists: a fresh supervisor tracks
        // nothing, so a row still reading "running" belonged to a run that
        // died without a settle tile. Keeping the database honest here is
        // what lets renderer hydration treat a running Crossagent row as
        // alive instead of force-failing it.
        this.settleOrphanedCrossagentRuns("boot");
      }
      if (options.markLiveThreadsInactiveOnOpen) dbMarkLiveThreadsInactive();
      if (options.databaseSchemaMode !== "validate") {
        // Canonical Home row before this host can serve its first catalog or
        // launch: a managed root launches Home threads against
        // `startRemoteThread`, which refuses HOME_PROJECT_ID while the row is
        // absent. The existing helper reuses any row a renderer already
        // created (same fixed id/shape) and never mints a renderer-random id;
        // a validate-only/offline open writes nothing.
        ensureHomeProjectRow();
      }

      this.terminalScrollbackPersistence = new TerminalScrollbackPersistence({
        onOverflow: (threadIds) => options.onSupervisorOutputShed?.(threadIds),
      });
      this.supervisorClient = new SupervisorClient({
        ...options.supervisor,
        baseDir: options.baseDir,
        // B1 pre-launch bridge: every host launch funnels through
        // `SupervisorClient.call` for `startThread`/`ensureThreadRunning`, and
        // this hook runs before the request is built and sent. It composes any
        // existing preparation callback and then commits the durable per-thread
        // touch; an unknown thread or storage failure rejects the call before
        // `child.send`, so no provider process can run without a durable
        // marker.
        prepareStartThread: (payload) => {
          const prepared = options.supervisor.prepareStartThread
            ? options.supervisor.prepareStartThread(payload)
            : payload;
          // A launch that lets the supervisor allocate the id (no threadId yet)
          // cannot be touched before dispatch; its first canonical event still
          // arms and touches before acceptance through admission.
          const threadId = prepared.threadId;
          if (typeof threadId === "string" && threadId.length > 0) {
            armRuntimeThreadForLaunch(threadId);
          }
          return prepared;
        },
        onEvent: (event) => {
          // Persistence must never throw into the supervisor IPC handler: the
          // bounded controller classifies storage failures and raises producer
          // backpressure instead. This try/catch is the last line of defense.
          try {
            this.terminalScrollbackPersistence.handle(event);
            const outcome = persistSupervisorEvent(event, {
              publishDeferredEvent: (deferred) => {
                // Resets are withheld until their durable rebase completes.
                // The remote persistence API also accepts non-supervisor
                // events; only its reset completion belongs to this callback.
                if (deferred.type === "thread-reset") options.onEvent(deferred);
              },
            });
            // The original envelope's credit is resolved even on an explicit
            // refusal. Publication uses only the accepted envelope/prefix.
            this.persistenceProducerControl?.acknowledgeCanonicalFlow(event);
            if (outcome.kind !== "withhold") options.onEvent(outcome.event);
          } catch (error) {
            console.error("[backend] supervisor event persistence failed:", error);
          }
        },
        onOutputShed: (threadIds) => options.onSupervisorOutputShed?.(threadIds),
        onReset: () => {
          // The supervisor process that owned every Crossagent run just died;
          // its replacement spawns with an empty run tracker. Settle the
          // orphaned running rows now — before the respawn accepts a
          // startThread, with every pending prefix committed so the dying
          // generation's last admitted events cannot land after the sweep.
          this.settleOrphanedCrossagentRuns("supervisor-reset");
          options.onReset();
        },
        // Reserve the advertised in-flight headroom before granting credit,
        // and re-raise current storage pressure for each supervisor generation.
        onFlowControlReady: () => this.persistenceProducerControl?.refreshPeerCapabilities(),
      });
      // Producer backpressure plane: persistence health -> supervisor control.
      // SupervisorClient only sends the negotiated control to a peer that
      // advertised the capability, so a legacy supervisor is never misread.
      this.persistenceProducerControl = new HostPersistenceProducerControl(this.supervisorClient);
    } catch (error) {
      // A refused close (its drain hook threw; see `closeDatabase`) keeps the
      // SQLite handle open and writable, so this failed construction must keep
      // custody: `databaseOpen` stays true and the fence stays held, exactly
      // like the instance `closeDatabase()` below. The composition that owns a
      // failed backend child retires it with the bounded SIGTERM -> SIGKILL ->
      // confirmed-exit join (`BackendHostClient.retireChild`) and admits a
      // successor only after that exit; process death releases the fence. Until
      // then a successor acquisition must be refused instead of writing the
      // still-open root.
      try {
        closeDatabase();
      } catch (closeError) {
        console.error(
          "[backend] database close refused during failed startup; custody retained:",
          getRuntimePersistenceShutdownReport() ?? closeError,
        );
        // Hand the composition the only retryable path to the still-open
        // handle. A thrown handoff registration must never replace the
        // original construction failure.
        let retained = true;
        const custody: RetainedStartupCustody = {
          retryCloseDatabase: () => {
            if (!retained) return;
            closeDatabase();
            retained = false;
            this.databaseOpen = false;
            this.dataFence?.release();
            this.dataFence = null;
          },
        };
        try {
          options.onStartupCustodyRetained?.(custody);
        } catch (handoffError) {
          console.error("[backend] failed-startup custody handoff failed:", handoffError);
        }
        throw error;
      }
      this.databaseOpen = false;
      this.dataFence?.release();
      this.dataFence = null;
      throw error;
    }
  }

  /** Last persistence producer signal, for diagnostics and tests. */
  getPersistenceSignal(): RuntimeProducerSignal | null {
    return this.persistenceProducerControl?.getLastSignal() ?? null;
  }

  /**
   * Run the orphaned-Crossagent-run settle pass. Called at boot (after the
   * durable-gap arm, before the first supervisor spawn) and on every
   * supervisor reset (after the old process is gone, before the respawn
   * accepts requests) — the only two moments when "running in the database"
   * provably means "owned by a dead supervisor generation". The pass commits
   * each pending thread's accepted prefix first, so the dying generation's
   * last admitted events cannot resurrect a running row after the sweep. The
   * settle events are forwarded like any canonical event (the durable effect
   * is the settle write itself, so like the truncate control path they
   * deliberately bypass persistSupervisorEvent) so attached local and remote
   * clients converge without waiting for a snapshot. A failure must never
   * take the host down: the rows stay running, which is the pre-sweep status
   * quo, and the next pass retries.
   */
  private settleOrphanedCrossagentRuns(when: "boot" | "supervisor-reset"): void {
    try {
      const report = settleOrphanedCrossagentRuns();
      if (report.items > 0) {
        console.info(
          `[backend] settled ${report.items} orphaned Crossagent run row(s) across ${report.threads} thread(s) on ${when}`,
        );
        for (const batch of report.settledBatches) {
          this.options.onEvent({
            type: "thread-runtime-events",
            threadId: batch.threadId,
            events: batch.events,
          });
        }
      }
    } catch (error) {
      console.warn(`[backend] Crossagent orphan settle failed on ${when}:`, error);
    }
  }

  /** Read-only custody capability for services sharing this backend's root.
   * The core remains the sole owner of acquisition and release. */
  getDataCustody(): Pick<HostDataFence, "generation" | "assertActive"> | null {
    const fence = this.dataFence;
    return fence
      ? {
          generation: fence.generation,
          assertActive: (expectedGeneration) => fence.assertActive(expectedGeneration),
        }
      : null;
  }

  /** Shutdown drain outcome from the last close attempt, if any. */
  getPersistenceShutdownReport(): RuntimeShutdownReport | null {
    return getRuntimePersistenceShutdownReport();
  }

  /**
   * B1 GUI durable-gap recovery: ordinary read-only descriptor of a thread's
   * current unacknowledged canonical episode, or null when the thread is
   * clean. Throws typed (fail closed) when the durable state is unavailable or
   * an episode identity is malformed; never writes and never arms.
   */
  getThreadRuntimeGap(threadId: string): RuntimeHistoryGapDescriptor | null {
    if (this.closing) throw new Error("Backend host is shutting down.");
    return getRuntimeThreadGapDescriptor(threadId);
  }

  /**
   * B1 GUI durable-gap recovery: acknowledge the exact/suspect episode token a
   * client read from `getThreadRuntimeGap`.
   *
   * Ordering: the supervisor per-thread dispatch lock (`runThreadMutation`)
   * orders this against launches/sends/compound operations, and the
   * persistence controller's per-thread mutation gate orders it against
   * fences/truncates/rebases. The episode precondition plus the
   * delete-matching-evidence + notice transaction is one synchronous SQL step;
   * the accepted-but-uncommitted prefix is superseded only on `applied` (its
   * count is folded into the notice), and committed transcript bytes are never
   * rewritten.
   *
   * On `applied` only: the GUI `thread-reset` (clients discard local gapped
   * state and re-hydrate) then the composition post-commit hook (live/replay
   * notice scoping + resync). `already`/`stale` return zero-write outcomes.
   */
  async acknowledgeThreadRuntimeGap(
    threadId: string,
    token: string,
  ): Promise<RuntimeHistoryGapAcknowledgeResult> {
    if (this.closing) throw new Error("Backend host is shutting down.");
    const result = await this.supervisorClient.runThreadMutation(threadId, () =>
      acknowledgeRuntimeThreadGap(threadId, token),
    );
    if (result.outcome === "applied") {
      // The durable acknowledgement is committed; publication is best-effort
      // and each callback is guarded INDEPENDENTLY, so a throwing reset fan-out
      // cannot skip the composition hook (or vice versa), and neither can turn
      // committed success into a client-visible rejection. A retry after such
      // a failure would return `already` and never reach this branch again.
      try {
        this.options.onEvent({ type: "thread-reset", threadId });
      } catch (error) {
        console.error("[backend] runtime gap acknowledgement reset publication failed:", error);
      }
      try {
        this.options.onRuntimeGapAcknowledged?.(threadId);
      } catch (error) {
        console.error("[backend] runtime gap acknowledgement hook failed:", error);
      }
    }
    return result;
  }

  /**
   * Single-mutation owner for checkpoint truncates: the database is mutated
   * exactly once here, then one canonical `runtime.truncated` event is
   * published through the same funnel a supervisor event uses
   * (`options.onEvent` reaches renderer windows, the remote server relay, and
   * notification consumers in every composition). The event deliberately
   * bypasses `persistSupervisorEvent` — the durable effect IS the
   * transactional delete above, and routing a truncate back through
   * `dbApplyThreadRuntimeEvents` would re-enter the runtime write queue that
   * `dbTruncateThreadRuntimeAfter` just flushed.
   *
   * Publication is gated on an actual truncation: a missing checkpoint or an
   * already-last checkpoint touches no rows at all, so no event is emitted —
   * a broadcast no-op rollback could destructively delete newer client items
   * when replayed. An actual truncation always publishes exactly one event,
   * even when no completed turns were anchored on the removed items (an empty
   * `removedCompletedTurnAnchors`).
   */
  truncateThreadRuntime(
    threadId: string,
    itemId: string,
  ): {
    truncated: boolean;
    removedCompletedTurnAnchors: string[];
  } {
    if (this.closing) throw new Error("Backend host is shutting down.");
    this.assertRevertAllowed(threadId);
    return this.truncateThreadRuntimeOwned(threadId, itemId);
  }

  /** Guard for entry points that mutate a thread's checkpointed history: a
   * turn-active thread can append items mid-operation, so a truncate here
   * would delete a live turn's items or land under late provider events. */
  private assertRevertAllowed(threadId: string): void {
    const thread = dbGetThread(threadId);
    if (!thread) {
      // A missing thread row cascades to missing runtime items, so the
      // truncate below is already a natural no-op; keep that contract.
      return;
    }
    if (thread.status === "working" || thread.status === "launching") {
      throw new RevertCheckpointRefusedError(
        "THREAD_TURN_ACTIVE",
        `Thread "${threadId}" is ${thread.status}; checkpoint reverts are refused until the turn settles.`,
      );
    }
  }

  /**
   * Between-phase revalidation for the compound revert's file restore: the
   * thread and its project must still exist and the project must still live
   * at the journal's frozen location. A delete racing the revert (a client
   * removing the thread or its project mid-compound) therefore skips the
   * destructive git restore instead of rewriting a directory the user already
   * removed; the frozen plan is compared through the same serialization the
   * claim froze, so any drift refuses the restore.
   */
  private isRevertFileTargetIntact(threadId: string, frozenLocation: ProjectLocation): boolean {
    const thread = dbGetThread(threadId);
    if (!thread) return false;
    const project = dbGetProject(thread.projectId);
    if (!project?.location) return false;
    return JSON.stringify(project.location) === JSON.stringify(frozenLocation);
  }

  /** Single DB mutation + canonical event; callers own the entry guards. */
  private truncateThreadRuntimeOwned(
    threadId: string,
    itemId: string,
  ): {
    truncated: boolean;
    removedCompletedTurnAnchors: string[];
  } {
    const result = dbTruncateThreadRuntimeAfter(threadId, itemId);
    if (!result.truncated) {
      return result;
    }
    this.options.onEvent({
      type: "thread-runtime-event",
      threadId,
      event: {
        type: "runtime.truncated",
        threadId,
        itemId,
        removedCompletedTurnAnchors: [...result.removedCompletedTurnAnchors],
      },
    });
    return result;
  }

  /**
   * Backend-owned compound checkpoint revert: provider conversation rollback,
   * file checkpoint restore, and durable transcript truncation run as one
   * journaled operation instead of a client-orchestrated sequence.
   *
   * Invariants:
   * - The destructive provider restore runs at most once per `operationKey`,
   *   with a turn count derived server-side from durable state and frozen at
   *   claim time. Retries and crash resumes replay the stored count instead
   *   of recounting a transcript the first attempt may already have mutated
   *   (the over-rollback window).
   * - Settled (`completed`/`completed_local_only`/`ambiguous`) IDs always
   *   replay verbatim, even after later work arrived: a deliberate new action
   *   must mint a fresh ID to target current work. No `#N` supersession is
   *   created.
   * - Same-ID reuse for a different target (or a different explicit project
   *   location) conflicts before any side effect.
   * - Every phase write precedes its side effect, so the journal always
   *   describes what a resumed attempt must not redo.
   * - The whole operation is serialized per thread; a concurrent second
   *   revert waits, then finds its checkpoint already removed (noop).
   * - Provider failure on a capability-less provider keeps the established
   *   `local_only` contract (files + transcript still revert); a timed-out
   *   provider call settles `ambiguous` — the provider state is unknown, so
   *   retries deliberately do not re-issue it.
   */
  async revertCheckpoint(input: RevertCheckpointInput): Promise<RevertCheckpointResult> {
    if (this.closing) throw new Error("Backend host is shutting down.");
    const previous = this.revertLocks.get(input.threadId) ?? Promise.resolve();
    const accepted = Promise.withResolvers<RevertCheckpointResult>();
    // Register accepted work before handing it to the supervisor coordinator;
    // an immediate shutdown must join a queued revert even if its callback has
    // not started yet.
    const tracked = accepted.promise.then(
      () => undefined,
      () => undefined,
    );
    this.revertLocks.set(input.threadId, tracked);
    void tracked.then(() => {
      if (this.revertLocks.get(input.threadId) === tracked) {
        this.revertLocks.delete(input.threadId);
      }
    });
    const run = async (): Promise<RevertCheckpointResult> => {
      await previous.catch(() => {});
      if (this.closing) throw new Error("Backend host is shutting down.");
      return this.runRevertCheckpoint(input);
    };
    // SupervisorClient owns the cross-composition per-thread coordinator. The
    // optional fallback keeps the lightweight core unit-test double compatible
    // while production clients hold the lock across every compound phase.
    const operation =
      typeof this.supervisorClient.runThreadMutation === "function"
        ? this.supervisorClient.runThreadMutation(input.threadId, run)
        : run();
    void operation.then(accepted.resolve, accepted.reject);
    return operation;
  }

  private async runRevertCheckpoint(input: RevertCheckpointInput): Promise<RevertCheckpointResult> {
    this.assertRevertAllowed(input.threadId);
    if (!dbHasThreadRuntimeItem(input.threadId, input.checkpointItemId)) {
      // Nothing addressable to revert: no journal row, no side effects, and a
      // concurrent second client converges on this noop after the first
      // operation truncated the tail. A journal row left `running`/`failed` by
      // a crash after its truncate landed settles here, so the operation never
      // blocks a later thread deletion while nothing is left to do. Settled
      // rows replay their stored outcome; a missing row is a true noop.
      const existing = dbGetCheckpointRevertOperation(input.operationKey);
      if (!existing) {
        return {
          outcome: "noop",
          replayed: false,
          numTurns: 0,
          providerPhase: "skipped_missing_checkpoint",
          filesPhase: "skipped_missing_checkpoint",
          truncatePhase: "noop",
          removedCompletedTurnAnchors: [],
        };
      }
      if (
        existing.outcome === "completed" ||
        existing.outcome === "completed_local_only" ||
        existing.outcome === "ambiguous"
      ) {
        return {
          outcome: existing.outcome,
          replayed: true,
          numTurns: existing.numTurns,
          providerPhase: existing.providerPhase,
          filesPhase: existing.filesPhase,
          truncatePhase: existing.truncatePhase,
          removedCompletedTurnAnchors: existing.removedAnchors,
        };
      }
      dbUpdateCheckpointRevertPhases(input.operationKey, {
        outcome: "completed",
        truncatePhase: "noop",
        removedAnchors: [],
      });
      return {
        outcome: "noop",
        replayed: false,
        numTurns: 0,
        providerPhase: "skipped_missing_checkpoint",
        filesPhase: "skipped_missing_checkpoint",
        truncatePhase: "noop",
        removedCompletedTurnAnchors: [],
      };
    }

    const thread = dbGetThread(input.threadId);
    // The project location is resolved SERVER-SIDE from durable state when the
    // caller omits it (the compound wire route never trusts a client-supplied
    // path) and frozen into the journal at claim time either way. Only an
    // explicitly supplied location participates in same-ID conflict detection;
    // server-resolved drift never invalidates a legitimate replay.
    const resolvedLocation =
      input.projectLocation ?? (thread ? dbGetProject(thread.projectId)?.location : undefined);
    const claim = dbClaimCheckpointRevertOperation({
      operationKey: input.operationKey,
      threadId: input.threadId,
      checkpointItemId: input.checkpointItemId,
      projectLocationJson: resolvedLocation ? JSON.stringify(resolvedLocation) : null,
      configJson: thread?.config ? JSON.stringify(thread.config) : null,
      ...(input.projectLocation !== undefined
        ? { explicitProjectLocationJson: JSON.stringify(input.projectLocation) }
        : {}),
    });
    let row: CheckpointRevertOperationRow = claim.row;
    // Phase updates target the claimed row's exact key: settled rows replay,
    // running/failed rows resume, and no versioned `key#N` row is ever
    // created.
    const journalKey = claim.row.operationKey;
    const replayed = claim.kind === "replay";
    if (replayed) {
      return {
        outcome: row.outcome as RevertCheckpointResult["outcome"],
        replayed: true,
        numTurns: row.numTurns,
        providerPhase: row.providerPhase,
        filesPhase: row.filesPhase,
        truncatePhase: row.truncatePhase,
        removedCompletedTurnAnchors: row.removedAnchors,
      };
    }

    // Provider phase — at most once per operation key. WS2 stage 3: prefer an
    // absolute revert anchor, journalled BEFORE the restore side effect, so a
    // resumed attempt re-restores to the SAME provider position instead of
    // re-rolling a relative turn count against an already-mutated
    // conversation. Sessions without anchor support fall back to the legacy
    // relative rollback, whose failure keeps the established `local_only`
    // contract (files + transcript still revert).
    //
    // Re-attempt policy: a FAILED restore with a journalled anchor is retried
    // on an explicit retry (the absolute restore is idempotent, so the retry
    // cannot over-roll); a failed RELATIVE fallback is terminal (it is not
    // idempotent), and `ambiguous` is always terminal — the provider state is
    // unknown, so retries deliberately do not re-issue it.
    if (
      row.providerPhase === "pending" ||
      (row.providerPhase === "failed" && row.providerAnchorJson !== null)
    ) {
      if (row.numTurns === 0) {
        row = this.bumpPhase(journalKey, row, { providerPhase: "skipped_no_turns" });
      } else {
        const config = row.configJson ? (JSON.parse(row.configJson) as ThreadConfig) : undefined;
        let anchorJson = row.providerAnchorJson;
        // Plan phase (fresh attempts only): create and journal the anchor.
        if (!anchorJson && row.providerPhase === "pending") {
          try {
            const created = await this.supervisorClient.call(
              "createRevertAnchor",
              {
                threadId: input.threadId,
                numTurns: row.numTurns,
                ...(config ? { config } : {}),
              },
              { skipThreadMutation: true },
            );
            anchorJson = JSON.stringify(created.anchor);
            // Freeze the absolute target durably before any restore runs.
            row = this.bumpPhase(journalKey, row, { providerAnchorJson: anchorJson });
          } catch (error) {
            if (!isAnchorUnsupportedError(error)) {
              row = this.bumpPhase(journalKey, row, {
                providerPhase: isTimedOutError(error) ? "ambiguous" : "failed",
              });
            }
          }
        }
        // Restore phase.
        if (anchorJson && (row.providerPhase === "pending" || row.providerPhase === "failed")) {
          try {
            await this.supervisorClient.call(
              "restoreToRevertAnchor",
              {
                threadId: input.threadId,
                anchor: JSON.parse(anchorJson) as ProviderRevertAnchor,
                ...(config ? { config } : {}),
              },
              { skipThreadMutation: true },
            );
            row = this.bumpPhase(journalKey, row, { providerPhase: "completed" });
          } catch (error) {
            row = this.bumpPhase(journalKey, row, {
              providerPhase: isTimedOutError(error) ? "ambiguous" : "failed",
            });
          }
        } else if (!anchorJson && row.providerPhase === "pending") {
          // Anchor-unsupported fallback: the legacy relative rollback.
          try {
            await this.supervisorClient.call(
              "rollbackThreadConversation",
              {
                threadId: input.threadId,
                numTurns: row.numTurns,
                ...(config ? { config } : {}),
              },
              { skipThreadMutation: true },
            );
            row = this.bumpPhase(journalKey, row, { providerPhase: "completed" });
          } catch (error) {
            row = this.bumpPhase(journalKey, row, {
              providerPhase: isTimedOutError(error) ? "ambiguous" : "failed",
            });
          }
        }
      }
    }

    // File restore phase — idempotent (git reset to a fixed checkpoint ref),
    // so unlike the provider phase a `failed` attempt is re-attempted on an
    // explicit retry. The target is re-validated between phases: a thread or
    // project deleted while this compound was in flight must not receive a
    // git restore into a path the user already removed, and a project whose
    // location no longer matches the frozen plan must not be restored from a
    // stale anchor.
    if (row.filesPhase === "pending" || row.filesPhase === "failed") {
      const projectLocation = row.projectLocationJson
        ? (JSON.parse(row.projectLocationJson) as ProjectLocation)
        : null;
      if (!projectLocation || !this.isRevertFileTargetIntact(input.threadId, projectLocation)) {
        row = this.bumpPhase(journalKey, row, { filesPhase: "skipped_no_location" });
      } else {
        try {
          await this.supervisorClient.call("restoreFileCheckpoint", {
            threadId: input.threadId,
            checkpointItemId: input.checkpointItemId,
            projectLocation,
          });
          row = this.bumpPhase(journalKey, row, { filesPhase: "completed" });
        } catch {
          // Preserve the established contract: a failing file restore aborts
          // the compound before the transcript is truncated.
          row = this.bumpPhase(journalKey, row, {
            filesPhase: "failed",
            outcome: "failed",
          });
          return this.resultFromRow(row, replayed);
        }
      }
    }

    // Transcript truncation — the single-mutation owner publishes the one
    // canonical `runtime.truncated` event; a replayed/resumed operation whose
    // truncate already landed skips straight to settle.
    let removedCompletedTurnAnchors = row.removedAnchors;
    if (row.truncatePhase === "pending") {
      const truncated = this.truncateThreadRuntimeOwned(input.threadId, input.checkpointItemId);
      removedCompletedTurnAnchors = [...truncated.removedCompletedTurnAnchors];
      row = this.bumpPhase(journalKey, row, {
        truncatePhase: truncated.truncated ? "completed" : "noop",
        removedAnchors: truncated.removedCompletedTurnAnchors,
      });
    }

    const outcome: RevertCheckpointResult["outcome"] =
      row.providerPhase === "ambiguous"
        ? "ambiguous"
        : row.providerPhase === "failed"
          ? "completed_local_only"
          : "completed";
    this.bumpPhase(journalKey, row, { outcome });
    return {
      outcome,
      replayed,
      numTurns: row.numTurns,
      providerPhase: row.providerPhase,
      filesPhase: row.filesPhase,
      truncatePhase: row.truncatePhase,
      removedCompletedTurnAnchors,
    };
  }

  private resultFromRow(
    row: CheckpointRevertOperationRow,
    replayed: boolean,
  ): RevertCheckpointResult {
    return {
      outcome: row.outcome as RevertCheckpointResult["outcome"],
      replayed,
      numTurns: row.numTurns,
      providerPhase: row.providerPhase,
      filesPhase: row.filesPhase,
      truncatePhase: row.truncatePhase,
      removedCompletedTurnAnchors: row.removedAnchors,
    };
  }

  private bumpPhase(
    operationKey: string,
    current: CheckpointRevertOperationRow,
    update: {
      providerPhase?: CheckpointRevertProviderPhase;
      providerAnchorJson?: string;
      filesPhase?: CheckpointRevertFilesPhase;
      truncatePhase?: CheckpointRevertTruncatePhase;
      removedAnchors?: string[];
      outcome?: CheckpointRevertOutcome;
    },
  ): CheckpointRevertOperationRow {
    dbUpdateCheckpointRevertPhases(operationKey, update);
    return {
      ...current,
      providerPhase: update.providerPhase ?? current.providerPhase,
      providerAnchorJson: update.providerAnchorJson ?? current.providerAnchorJson,
      filesPhase: update.filesPhase ?? current.filesPhase,
      truncatePhase: update.truncatePhase ?? current.truncatePhase,
      removedAnchors: update.removedAnchors ?? current.removedAnchors,
      outcome: update.outcome ?? current.outcome,
    };
  }

  startSupervisor(): Promise<void> {
    if (this.closing) throw new Error("Backend host is shutting down.");
    return this.supervisorClient.start();
  }

  /**
   * WS5 P1-2: forward downstream renderer-stream pressure to the supervisor.
   * The supervisor sheds rebuildable terminal output at the source instead of
   * pausing PTYs, so agent processes never stall behind a slow consumer.
   */
  setSupervisorOutputBackpressured(paused: boolean): void {
    this.supervisorClient.setOutputBackpressured(paused);
  }

  restartSupervisor(): Promise<void> {
    if (this.closing) throw new Error("Backend host is shutting down.");
    return this.supervisorClient.restart();
  }

  disposeSupervisor(): Promise<void> {
    if (this.supervisorDisposal) return this.supervisorDisposal;
    // Close admission before taking the continuation snapshot. The last lock
    // for each thread includes every previously queued compound operation.
    this.closing = true;
    const continuations = [...this.revertLocks.values()];
    this.supervisorDisposal = (async () => {
      await this.supervisorClient.dispose();
      await Promise.all(continuations);
      this.supervisorJoined = true;
    })();
    return this.supervisorDisposal;
  }

  closeDatabase(): void {
    if (!this.databaseOpen) return;
    if (!this.supervisorJoined)
      throw new Error("Cannot close the database before supervisor work has joined.");
    this.terminalScrollbackPersistence.flush();
    // Runs the runtime persistence drain hook. When accepted events remain
    // uncommitted the hook throws a typed error, `closeDatabase` keeps the
    // handle open (its documented failed-hook contract), and the report is
    // available through `getPersistenceShutdownReport()`; this method must not
    // mark the database closed or release custody in that case.
    try {
      closeDatabase();
    } catch (error) {
      console.error(
        "[backend] database close did not commit all accepted runtime events; custody retained:",
        getRuntimePersistenceShutdownReport() ?? error,
      );
      throw error;
    }
    this.databaseOpen = false;
    this.persistenceProducerControl?.dispose();
    this.persistenceProducerControl = null;
    // The fence outlives the database handle on purpose: custody ends only
    // when nothing can write anymore. Process death also releases it.
    this.dataFence?.release();
    this.dataFence = null;
  }

  dispose(): Promise<void> {
    this.disposal ??= this.disposeSupervisor().then(() => this.closeDatabase());
    return this.disposal;
  }
}
