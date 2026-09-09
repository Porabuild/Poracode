import {
  closeDatabase,
  dbGetThread,
  dbMarkLiveThreadsInactive,
  dbTruncateThreadRuntimeAfter,
  initDatabase,
  dbClaimCheckpointRevertOperation,
  dbHasThreadRuntimeItem,
  dbUpdateCheckpointRevertPhases,
  type CheckpointRevertFilesPhase,
  type CheckpointRevertOperationRow,
  type CheckpointRevertOutcome,
  type CheckpointRevertProviderPhase,
  type CheckpointRevertTruncatePhase,
} from "@/main/db";
import { SupervisorClient, type SupervisorClientOptions } from "@/main/supervisor/SupervisorClient";
import { persistSupervisorEvent } from "@/main/remote/server/runtimePersistence";
import { TerminalScrollbackPersistence } from "@/main/remote/server/terminalScrollbackPersistence";
import type { SupervisorEvent } from "@/shared/ipc";
import type { BackendEventInterests } from "@/shared/backendHostProtocol";
import {
  filterRuntimeEventsForLiveInterest,
  isBulkRuntimeContentEvent,
} from "@/shared/liveEventInterests";
import type { ProjectLocation } from "@/shared/contracts/common";
import type { ThreadConfig } from "@/shared/contracts/config";

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

export interface BackendHostCoreOptions {
  baseDir: string;
  dbPath: string;
  databaseSchemaMode?: "migrate" | "validate";
  markLiveThreadsInactiveOnOpen?: boolean;
  supervisor: Omit<SupervisorClientOptions, "baseDir" | "onEvent" | "onReset">;
  onEvent(event: SupervisorEvent): void;
  onReset(): void;
}

/**
 * Keeps high-volume live payloads behind explicit client interest while the
 * backend still persists every event before this projection is evaluated.
 */
export function filterSupervisorEventForInterests(
  event: SupervisorEvent,
  interests: BackendEventInterests,
  hiddenShellActivityAt?: Map<string, number>,
  now = Date.now(),
): SupervisorEvent | null {
  if (event.type === "thread-output") {
    if (interests.terminalThreadIds.includes(event.threadId)) return event;
    if (!event.threadId.startsWith("shell:") || !hiddenShellActivityAt) return null;
    const lastActivityAt = hiddenShellActivityAt.get(event.threadId) ?? -Infinity;
    if (now - lastActivityAt < 500) return null;
    hiddenShellActivityAt.set(event.threadId, now);
    return { ...event, data: "" };
  }
  if (event.type === "thread-reset" || event.type === "thread-exited") {
    hiddenShellActivityAt?.delete(event.threadId);
  }
  if (interests.allRuntimeEvents) return event;
  if (event.type === "thread-runtime-event") {
    return interests.runtimeThreadIds.includes(event.threadId) ||
      !isBulkRuntimeContentEvent(event.event)
      ? event
      : null;
  }
  if (event.type === "thread-runtime-events") {
    const events = filterRuntimeEventsForLiveInterest(
      event.events,
      interests.runtimeThreadIds.includes(event.threadId),
    );
    return events.length === 0
      ? null
      : events === event.events
        ? event
        : { ...event, events: [...events] };
  }
  if (event.type === "thread-runtime-events-multi") {
    const wanted = new Set(interests.runtimeThreadIds);
    let changed = false;
    const batches = event.batches.flatMap((batch) => {
      const events = filterRuntimeEventsForLiveInterest(batch.events, wanted.has(batch.threadId));
      if (events.length === 0) {
        changed = true;
        return [];
      }
      if (events === batch.events) return [batch];
      changed = true;
      return [{ ...batch, events: [...events] }];
    });
    return batches.length === 0 ? null : changed ? { ...event, batches } : event;
  }
  return event;
}

/**
 * Owns the backend's live projection state, including the short bootstrap
 * window that prevents initial PTY output from racing the renderer's first
 * interest acknowledgement.
 */
export class BackendEventRouter {
  private interests: BackendEventInterests = {
    terminalThreadIds: [],
    runtimeThreadIds: [],
    allRuntimeEvents: false,
  };
  private readonly terminalBootstrapInterests = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly hiddenShellActivityAt = new Map<string, number>();

  retainTerminalBootstrap(threadId: string): void {
    this.clearTerminalBootstrap(threadId);
    const timer = setTimeout(() => this.terminalBootstrapInterests.delete(threadId), 10_000);
    timer.unref?.();
    this.terminalBootstrapInterests.set(threadId, timer);
  }

  clearTerminalBootstrap(threadId: string): void {
    const timer = this.terminalBootstrapInterests.get(threadId);
    if (timer) clearTimeout(timer);
    this.terminalBootstrapInterests.delete(threadId);
  }

  setInterests(interests: BackendEventInterests): void {
    this.interests = interests;
    for (const threadId of interests.terminalThreadIds) {
      this.clearTerminalBootstrap(threadId);
    }
  }

  filter(event: SupervisorEvent): SupervisorEvent | null {
    if (event.type === "thread-output" && this.terminalBootstrapInterests.has(event.threadId)) {
      return event;
    }
    return filterSupervisorEventForInterests(event, this.interests, this.hiddenShellActivityAt);
  }

  dispose(): void {
    for (const timer of this.terminalBootstrapInterests.values()) clearTimeout(timer);
    this.terminalBootstrapInterests.clear();
    this.hiddenShellActivityAt.clear();
  }
}

/**
 * Process-agnostic owner for Poracode's durable state and agent runtime.
 * Desktop and headless composition roots add their own UI/network adapters,
 * while this core keeps database lifecycle and supervisor-event durability in
 * one place so it can move behind a transport without changing those services.
 */
export class BackendHostCore {
  readonly supervisorClient: SupervisorClient;
  private readonly terminalScrollbackPersistence = new TerminalScrollbackPersistence();
  private databaseOpen = false;
  /** Serializes checkpoint reverts per thread: two clients reverting the same
   * thread run one after the other, and the second recount happens only after
   * the first compound fully settles. */
  private readonly revertLocks = new Map<string, Promise<unknown>>();

  constructor(private readonly options: BackendHostCoreOptions) {
    this.databaseOpen = true;
    try {
      if (options.databaseSchemaMode) {
        initDatabase(options.dbPath, { schemaMode: options.databaseSchemaMode });
      } else {
        initDatabase(options.dbPath);
      }
      if (options.markLiveThreadsInactiveOnOpen) dbMarkLiveThreadsInactive();

      this.supervisorClient = new SupervisorClient({
        ...options.supervisor,
        baseDir: options.baseDir,
        onEvent: (event) => {
          this.terminalScrollbackPersistence.handle(event);
          persistSupervisorEvent(event);
          options.onEvent(event);
        },
        onReset: options.onReset,
      });
    } catch (error) {
      closeDatabase();
      this.databaseOpen = false;
      throw error;
    }
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
   * - The destructive relative provider rollback runs at most once per
   *   `operationKey`, with a turn count derived server-side from durable
   *   state and frozen at claim time. Retries and crash resumes replay the
   *   stored count instead of recounting a transcript the first attempt may
   *   already have mutated (the over-rollback window).
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
    const previous = this.revertLocks.get(input.threadId) ?? Promise.resolve();
    const operation = previous.catch(() => {}).then(() => this.runRevertCheckpoint(input));
    // The tracked (swallowed) twin keeps the lock map free of rejecting
    // promises; the caller still receives `operation`'s rejection directly.
    const tracked = operation.catch(() => {});
    this.revertLocks.set(input.threadId, tracked);
    void tracked.finally(() => {
      if (this.revertLocks.get(input.threadId) === tracked) {
        this.revertLocks.delete(input.threadId);
      }
    });
    return operation;
  }

  private async runRevertCheckpoint(input: RevertCheckpointInput): Promise<RevertCheckpointResult> {
    this.assertRevertAllowed(input.threadId);
    if (!dbHasThreadRuntimeItem(input.threadId, input.checkpointItemId)) {
      // Nothing addressable to revert: no journal row, no side effects, and a
      // concurrent second client converges on this noop after the first
      // operation truncated the tail.
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
    const claim = dbClaimCheckpointRevertOperation({
      operationKey: input.operationKey,
      threadId: input.threadId,
      checkpointItemId: input.checkpointItemId,
      projectLocationJson: input.projectLocation ? JSON.stringify(input.projectLocation) : null,
      configJson: thread?.config ? JSON.stringify(thread.config) : null,
    });
    let row: CheckpointRevertOperationRow = claim.row;
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

    // Provider phase — at most once per operation key.
    if (row.providerPhase === "pending") {
      if (row.numTurns === 0) {
        row = this.bumpPhase(input.operationKey, row, { providerPhase: "skipped_no_turns" });
      } else {
        try {
          const payload: { threadId: string; numTurns: number; config?: ThreadConfig } = {
            threadId: input.threadId,
            numTurns: row.numTurns,
          };
          if (row.configJson) payload.config = JSON.parse(row.configJson) as ThreadConfig;
          await this.supervisorClient.call("rollbackThreadConversation", payload);
          row = this.bumpPhase(input.operationKey, row, { providerPhase: "completed" });
        } catch (error) {
          const ambiguous = error instanceof Error && error.message.includes("timed out");
          row = this.bumpPhase(input.operationKey, row, {
            providerPhase: ambiguous ? "ambiguous" : "failed",
          });
        }
      }
    }

    // File restore phase — idempotent (git reset to a fixed checkpoint ref),
    // so unlike the provider phase a `failed` attempt is re-attempted on an
    // explicit retry.
    if (row.filesPhase === "pending" || row.filesPhase === "failed") {
      const projectLocation = row.projectLocationJson
        ? (JSON.parse(row.projectLocationJson) as ProjectLocation)
        : null;
      if (!projectLocation) {
        row = this.bumpPhase(input.operationKey, row, { filesPhase: "skipped_no_location" });
      } else {
        try {
          await this.supervisorClient.call("restoreFileCheckpoint", {
            threadId: input.threadId,
            checkpointItemId: input.checkpointItemId,
            projectLocation,
          });
          row = this.bumpPhase(input.operationKey, row, { filesPhase: "completed" });
        } catch {
          // Preserve the established contract: a failing file restore aborts
          // the compound before the transcript is truncated.
          row = this.bumpPhase(input.operationKey, row, {
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
      row = this.bumpPhase(input.operationKey, row, {
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
    this.bumpPhase(input.operationKey, row, { outcome });
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
      filesPhase: update.filesPhase ?? current.filesPhase,
      truncatePhase: update.truncatePhase ?? current.truncatePhase,
      removedAnchors: update.removedAnchors ?? current.removedAnchors,
      outcome: update.outcome ?? current.outcome,
    };
  }

  startSupervisor(): void {
    this.supervisorClient.start();
  }

  restartSupervisor(): void {
    this.supervisorClient.start();
  }

  disposeSupervisor(): void {
    this.supervisorClient.dispose();
  }

  closeDatabase(): void {
    if (!this.databaseOpen) return;
    this.terminalScrollbackPersistence.flush();
    this.databaseOpen = false;
    closeDatabase();
  }

  dispose(): void {
    this.disposeSupervisor();
    this.closeDatabase();
  }
}
