import { FollowUpQueueDirectInput, type DirectInputReservation } from "./followUpQueueDirectInput";
import { randomUUID } from "node:crypto";
import type {
  EditQueuedThreadFollowUpPayload,
  ReorderQueuedThreadFollowUpPayload,
  RuntimeEvent,
  SetPendingSteerPayload,
  ThreadFollowUpQueueState,
  ThreadStatus,
} from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { msg } from "@/shared/messages";
import { isCompletedWithoutTurn, type StructuredTurnResult } from "../../agents/base";
import {
  type QueueEntry,
  type QueueRecord,
  type ActiveQueueEntry,
  type ThreadLifecycle,
  snapshotPayload,
  pendingState,
  isSettledStatus,
  isBlockedStatus,
} from "./followUpQueueState";
import type { QueuedStructuredTurn, SessionRuntime } from "../sessionTypes";
import type { SteerSubmissionOptions } from "./steerCoordinator";

function createAdmissionBarrier(): {
  promise: Promise<void>;
  resolve(): void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export interface FollowUpQueueCoordinatorContext {
  emit(event: SupervisorEvent): void;
  sessions: Map<string, SessionRuntime>;
  waitForPendingStart(threadId: string): Promise<void>;
  isCurrentSession(session: SessionRuntime): boolean;
  prepareTurn(
    session: SessionRuntime,
    payload: SetPendingSteerPayload,
  ): Promise<QueuedStructuredTurn>;
  steer(payload: SetPendingSteerPayload, options?: SteerSubmissionOptions): Promise<void>;
  /** Ordinary start only: this coordinator never steers or interrupts. */
  startStructuredTurn(
    session: SessionRuntime,
    turn: QueuedStructuredTurn,
  ): Promise<void | StructuredTurnResult> | undefined;
  /** Restart a session whose structured transport was disposed on close. */
  restartStructuredTurn?(
    session: SessionRuntime,
    turn: QueuedStructuredTurn,
  ): Promise<void | StructuredTurnResult>;
}

/**
 * Supervisor-owned FIFO for GUI follow-ups. It deliberately knows only the
 * shared turn lifecycle and the normal structured-start operation.
 */
export class FollowUpQueueCoordinator {
  private readonly records = new Map<string, QueueRecord>();
  private readonly lifecycles = new Map<string, ThreadLifecycle>();
  private readonly directInput: FollowUpQueueDirectInput;
  private readonly pausedThreads = new Set<string>();
  private readonly mutationTails = new Map<string, Promise<void>>();
  private disposed = false;

  constructor(private readonly ctx: FollowUpQueueCoordinatorContext) {
    this.directInput = new FollowUpQueueDirectInput({
      lifecycleFor: (session) => this.lifecycleFor(session),
      onChange: (threadId) => {
        const session = this.ctx.sessions.get(threadId);
        const lifecycle = this.lifecycles.get(threadId);
        // Completion can arrive while another direct reservation is still
        // held. Releasing it must settle the barrier without needing a new event.
        if (session && lifecycle?.instanceId === session.instanceId) {
          this.directInput.maybeFinishDirect(session, lifecycle);
        }
        this.schedulePump(threadId);
      },
      onStarted: (session) => {
        // A dispatched queue turn becomes a direct turn when the user steers it.
        const record = this.records.get(session.threadId);
        if (record?.active?.dispatched) {
          this.resolveAdmission(record.active);
          delete record.active;
        }
      },
    });
  }

  async queueThreadFollowUp(payload: SetPendingSteerPayload): Promise<void> {
    // Keep this copy before the first await so receipt order and raw content
    // do not depend on attachment/skill preparation latency.
    const snapshot = snapshotPayload(payload);
    await this.mutate(snapshot.threadId, async () => {
      await this.ctx.waitForPendingStart(snapshot.threadId);
      const session = this.ctx.sessions.get(snapshot.threadId);
      this.assertQueueSession(session);
      const record = this.records.get(snapshot.threadId) ?? this.createRecord(snapshot.threadId);
      record.items.push({
        id: `follow-up-${randomUUID()}`,
        stagedAt: Date.now(),
        payload: snapshot,
        userMessageItemId: `user-${randomUUID()}`,
      });
      if (
        session.status === "error" ||
        session.status === "inactive" ||
        this.pausedThreads.has(snapshot.threadId)
      ) {
        record.paused = true;
        this.pausedThreads.add(snapshot.threadId);
      }
      this.emitQueueState(snapshot.threadId);
      this.schedulePump(snapshot.threadId);
    });
  }

  async reorderQueuedThreadFollowUp(input: ReorderQueuedThreadFollowUpPayload): Promise<void> {
    await this.mutate(input.threadId, () => {
      const { record, entry, index } = this.findPending(input);
      if (input.beforeId === input.id) return;
      const anchor =
        input.beforeId === null
          ? undefined
          : this.findPending({ threadId: input.threadId, id: input.beforeId }).entry;
      // Validate both IDs before touching the queue. A dispatched/removed item
      // cannot be resurrected by a drag begun from an older renderer snapshot.
      record.items.splice(index, 1);
      record.items.splice(anchor ? record.items.indexOf(anchor) : record.items.length, 0, entry);
      if (record.active && record.active.entry !== record.items[0]) {
        this.cancelPreparation(record, record.active.entry);
      }
      this.emitQueueState(input.threadId);
      this.schedulePump(input.threadId);
    });
  }

  async editQueuedThreadFollowUp(input: EditQueuedThreadFollowUpPayload): Promise<void> {
    await this.mutate(input.threadId, () => {
      const { record, entry, index } = this.findPending(input);
      if (
        input.expectedStagedAt !== undefined &&
        (input.expectedStagedAt !== entry.stagedAt || !record.paused)
      ) {
        throw new Error(msg("supervisor.followUpQueue.itemChanged"));
      }
      this.cancelPreparation(record, entry);
      record.items[index] = {
        ...entry,
        stagedAt: Math.max(Date.now(), entry.stagedAt + 1),
        payload: snapshotPayload({
          threadId: input.threadId,
          config: entry.payload.config,
          prompt: input.prompt,
          ...(input.segments ? { segments: input.segments } : {}),
        }),
      };
      delete record.items[index]!.prepared;
      this.emitQueueState(input.threadId);
      this.schedulePump(input.threadId);
    });
  }

  async steerQueuedThreadFollowUp(input: { threadId: string; id: string }): Promise<void> {
    // Reserve before any await: preparation of the FIFO head may already be running.
    const reservation = this.beginDirectInput(input.threadId);
    try {
      await this.mutate(input.threadId, async () => {
        const { record, entry } = this.findPending(input);
        this.cancelPreparation(record, entry);
        // The existing direct-steer path owns capability selection and interruption.
        // Keep the item visible until that path accepts it; failures retain the FIFO.
        await this.ctx.steer(snapshotPayload(entry.payload), {
          awaitReplacement: true,
          awaitCanonicalStart: true,
          userMessageItemId: entry.userMessageItemId,
        });
        const index = record.items.indexOf(entry);
        if (index >= 0) record.items.splice(index, 1);
        this.emitQueueState(input.threadId);
      });
    } finally {
      reservation.release();
    }
  }

  private findPending(input: { threadId: string; id: string }) {
    const record = this.records.get(input.threadId);
    const index = record?.items.findIndex((entry) => entry.id === input.id) ?? -1;
    if (!record || index < 0)
      throw new Error(msg("supervisor.followUpQueue.itemNotFound", { id: input.id }));
    return { record, index, entry: record.items[index]! };
  }

  private cancelPreparation(record: QueueRecord, entry: QueueEntry): void {
    if (record.active?.entry === entry && !record.active.dispatched) {
      record.active.cancelled = true;
      delete record.active;
    }
  }

  async removeQueuedThreadFollowUp(input: { threadId: string; id: string }): Promise<void> {
    await this.mutate(input.threadId, () => {
      const record = this.records.get(input.threadId);
      if (!record) throw new Error(msg("supervisor.followUpQueue.itemNotFound", { id: input.id }));

      const active = record.active;
      if (active?.entry.id === input.id) {
        if (active.dispatched) throw new Error(msg("supervisor.followUpQueue.itemInFlight"));
        const index = record.items.indexOf(active.entry);
        if (index >= 0) record.items.splice(index, 1);
        active.cancelled = true;
        delete record.active;
        this.emitQueueState(input.threadId);
        this.schedulePump(input.threadId);
        return;
      }

      const index = record.items.findIndex((entry) => entry.id === input.id);
      if (index < 0) {
        throw new Error(msg("supervisor.followUpQueue.itemNotFound", { id: input.id }));
      }
      record.items.splice(index, 1);
      this.emitQueueState(input.threadId);
    });
  }

  directInputFailed(threadId: string): void {
    const lifecycle = this.lifecycles.get(threadId);
    if (lifecycle) {
      lifecycle.direct = false;
      lifecycle.directAwaitingReplacement = false;
      lifecycle.directCompletion = false;
    }
    this.pauseThread(threadId);
  }

  /** An edit pauses delivery before returning so the row cannot disappear mid-edit. */
  async pauseThreadFollowUps(input: { threadId: string; id: string }): Promise<void> {
    await this.mutate(input.threadId, () => {
      this.findPending(input);
      this.pauseThread(input.threadId);
    });
  }

  async resumeThreadFollowUps(threadId: string): Promise<void> {
    await this.mutate(threadId, () => {
      const record = this.records.get(threadId);
      this.pausedThreads.delete(threadId);
      if (!record) return;
      record.paused = false;
      this.emitQueueState(threadId);
      this.schedulePump(threadId);
    });
  }

  getThreadFollowUpQueue(threadId: string): ThreadFollowUpQueueState | null {
    const record = this.records.get(threadId);
    if (!record || record.items.length === 0) return null;
    return { items: record.items.map(pendingState), paused: record.paused };
  }

  /**
   * Wait only for queued-turn admission, not for the provider turn to finish.
   * Direct input uses this to avoid starting a second turn while a queued
   * provider call is still doing asynchronous setup and the session still
   * reports idle.
   */
  async waitForQueuedTurnAdmission(threadId: string): Promise<void> {
    const active = this.records.get(threadId)?.active;
    if (!active?.dispatched || !active.admission) return;
    if (active.admitted || active.session.status === "working") {
      active.admitted = true;
      this.resolveAdmission(active);
      return;
    }
    await active.admission.promise;
  }

  beginDirectInput(threadId: string): DirectInputReservation {
    return this.directInput.beginDirectInput(threadId);
  }
  noteDirectTurnSubmitted(session: SessionRuntime): void {
    this.directInput.noteDirectTurnSubmitted(session);
  }
  noteDirectSteerSubmitted(session: SessionRuntime): void {
    this.directInput.noteDirectSteerSubmitted(session);
  }
  /** A provider command can complete without emitting canonical turn events. */
  onDirectTurnCompletedWithoutTurn(session: SessionRuntime): void {
    if (this.disposed || !this.ctx.isCurrentSession(session)) return;
    const lifecycle = this.lifecycleFor(session);
    if (!lifecycle.direct) return;
    lifecycle.directCompletion = true;
    lifecycle.turnCompleted = true;
    this.directInput.maybeFinishDirect(session, lifecycle);
    this.schedulePump(session.threadId);
  }
  cancelDirectInput(session: SessionRuntime): void {
    this.directInput.cancelDirectInput(session);
  }

  /** A watchdog force-close has no provider completion event to release barriers. */
  onForcedInterrupt(session: SessionRuntime): void {
    const lifecycle = this.lifecycleFor(session);
    lifecycle.direct = false;
    lifecycle.directAwaitingReplacement = false;
    lifecycle.directCompletion = false;
    lifecycle.pendingRequestIds.clear();
    this.resetTurn(lifecycle);
    const record = this.records.get(session.threadId);
    if (record?.active) {
      this.resolveAdmission(record.active);
      if (!record.active.admitted) this.restoreActive(record, record.active, false);
      else delete record.active;
    }
    this.emitQueueState(session.threadId);
    this.schedulePump(session.threadId);
  }

  pauseThread(threadId: string): void {
    this.pausedThreads.add(threadId);
    const record = this.records.get(threadId);
    if (!record) return;
    record.paused = true;
    if (record.active && !record.active.dispatched)
      this.restoreActive(record, record.active, false);
    this.emitQueueState(threadId);
  }

  beginSessionReplacement(threadId: string): void {
    const record = this.records.get(threadId);
    if (record) record.replacing = true;
    const lifecycle = this.lifecycles.get(threadId);
    if (lifecycle) {
      lifecycle.direct = false;
      lifecycle.directAwaitingReplacement = false;
      lifecycle.directCompletion = false;
    }
  }

  sessionReplacementFailed(threadId: string): void {
    const record = this.records.get(threadId);
    if (!record) return;
    if (record.active) {
      this.resolveAdmission(record.active);
      if (!record.active.turnId) this.restoreActive(record, record.active, false);
      else delete record.active;
    }
    record.replacing = false;
    record.restarting = false;
    record.paused = true;
    this.pausedThreads.add(threadId);
    this.emitQueueState(threadId);
  }

  onSessionAttached(session: SessionRuntime): void {
    const record = this.records.get(session.threadId);
    if (record) {
      const active = record.active;
      if (active && active.session.instanceId !== session.instanceId) {
        if (record.restarting) {
          // A queue-owned restart already owns the entry. Rebind the active
          // lifecycle instead of restoring the entry and dispatching it twice.
          active.session = session;
          delete active.turnId;
          delete active.completionState;
          record.restarting = false;
        } else {
          this.resolveAdmission(active);
          if (!active.turnId) this.restoreActive(record, active, false);
          else delete record.active;
          this.emitQueueState(session.threadId);
        }
      }
      record.replacing = false;
    }

    const previous = this.lifecycles.get(session.threadId);
    this.lifecycles.set(session.threadId, {
      instanceId: session.instanceId,
      turnCompleted: false,
      direct: previous?.direct === true,
      directAwaitingReplacement: false,
      directCompletion: false,
      pendingRequestIds: new Set<string>(),
    });
    this.schedulePump(session.threadId);
  }

  onSessionClosing(threadId: string, session?: SessionRuntime): void {
    const record = this.records.get(threadId);
    if (record) {
      if (record.active && !record.restarting) {
        this.resolveAdmission(record.active);
        if (!record.active.admitted) this.restoreActive(record, record.active, false);
        else delete record.active;
      }
      if (!record.replacing) {
        record.paused = true;
        this.pausedThreads.add(threadId);
      }
      this.emitQueueState(threadId);
    }
    const lifecycle = this.lifecycles.get(threadId);
    if (!lifecycle || (session && lifecycle.instanceId !== session.instanceId)) return;
    if (!record?.replacing) this.lifecycles.delete(threadId);
    else {
      delete lifecycle.turnId;
      lifecycle.turnCompleted = false;
      lifecycle.direct = false;
      lifecycle.directAwaitingReplacement = false;
      lifecycle.directCompletion = false;
    }
  }

  onStructuredRuntimeEvent(session: SessionRuntime, event: RuntimeEvent): void {
    if (
      this.disposed ||
      event.threadId !== session.threadId ||
      !this.ctx.isCurrentSession(session)
    ) {
      return;
    }
    const lifecycle = this.lifecycleFor(session);
    const record = this.records.get(session.threadId);

    if (event.type === "request.opened") {
      lifecycle.pendingRequestIds.add(event.requestId);
      return;
    }
    if (event.type === "request.resolved") {
      lifecycle.pendingRequestIds.delete(event.requestId);
      this.finishOrSchedule(session, lifecycle, record);
      return;
    }

    if (event.type === "turn.started") {
      const active = record?.active;
      lifecycle.turnId = event.turnId;
      lifecycle.turnCompleted = false;
      if (lifecycle.direct && !lifecycle.directAwaitingReplacement) {
        lifecycle.directCompletion = false;
      }
      if (active?.session.instanceId === session.instanceId && active.dispatched) {
        active.turnId = event.turnId;
        // A canonical provider turn-start is the admission boundary. Do not
        // wait for the provider's start promise (some runtimes resolve it only
        // after the full turn); the later working update is merely a duplicate
        // signal for providers that emit both edges.
        active.admitted = true;
        this.resolveAdmission(active);
      }
      return;
    }

    if (event.type === "turn.completed") {
      const active = record?.active;
      const queuedMatch =
        active?.session.instanceId === session.instanceId && active.turnId === event.turnId;
      if (queuedMatch) {
        active.admitted = true;
        this.resolveAdmission(active);
        lifecycle.turnCompleted = true;
        active.completionState = event.state;
        this.finishOrSchedule(session, lifecycle, record);
        return;
      }

      if (lifecycle.direct && lifecycle.turnId === event.turnId) {
        lifecycle.turnCompleted = true;
        if (!lifecycle.directAwaitingReplacement) lifecycle.directCompletion = true;
        this.directInput.maybeFinishDirect(session, lifecycle);
      } else if (lifecycle.turnId === event.turnId) {
        if (event.state !== "completed") this.pauseThread(session.threadId);
        lifecycle.turnCompleted = true;
        this.finishOrSchedule(session, lifecycle, record);
      }
      return;
    }

    if (event.type === "error") this.pauseForFailure(session.threadId, record, lifecycle);
  }

  onStructuredUpdate(session: SessionRuntime, status: ThreadStatus): void {
    if (this.disposed || !this.ctx.isCurrentSession(session)) return;
    const lifecycle = this.lifecycleFor(session);
    const record = this.records.get(session.threadId);
    const active = record?.active;
    if (
      status === "working" &&
      active?.session.instanceId === session.instanceId &&
      active.dispatched
    ) {
      // Status working is the earliest provider-agnostic admission signal. A
      // startTurn promise may resolve before this edge and must not be used as
      // a whole-turn or active-turn signal.
      active.admitted = true;
      this.resolveAdmission(active);
    }
    if (status === "error") {
      this.pauseForFailure(session.threadId, record, lifecycle);
      return;
    }
    if (isBlockedStatus(status)) return;
    if (!isSettledStatus(status)) return;
    this.finishOrSchedule(session, lifecycle, record);
  }

  dispose(): void {
    this.disposed = true;
    this.records.clear();
    this.lifecycles.clear();
    this.directInput.dispose();
    this.pausedThreads.clear();
    this.mutationTails.clear();
  }

  private assertQueueSession(
    session: SessionRuntime | undefined,
  ): asserts session is SessionRuntime {
    if (!session) throw new Error(msg("supervisor.followUpQueue.sessionUnavailable"));
    if (session.presentationMode !== "gui") {
      throw new Error(msg("supervisor.followUpQueue.guiOnly"));
    }
    if (!session.structuredSession?.startTurn) {
      throw new Error(msg("supervisor.followUpQueue.unsupported"));
    }
  }

  private createRecord(threadId: string): QueueRecord {
    const record: QueueRecord = {
      threadId,
      items: [],
      paused: this.pausedThreads.has(threadId),
      replacing: false,
      restarting: false,
      pumpRunning: false,
      pumpAgain: false,
    };
    this.records.set(threadId, record);
    return record;
  }

  private lifecycleFor(session: SessionRuntime): ThreadLifecycle {
    const existing = this.lifecycles.get(session.threadId);
    if (existing && existing.instanceId === session.instanceId) return existing;
    const lifecycle: ThreadLifecycle = {
      instanceId: session.instanceId,
      turnCompleted: false,
      direct: false,
      directAwaitingReplacement: false,
      directCompletion: false,
      pendingRequestIds: new Set<string>(),
    };
    this.lifecycles.set(session.threadId, lifecycle);
    return lifecycle;
  }

  private resetTurn(lifecycle: ThreadLifecycle): void {
    delete lifecycle.turnId;
    lifecycle.turnCompleted = false;
  }

  private finishOrSchedule(
    session: SessionRuntime,
    lifecycle: ThreadLifecycle,
    record: QueueRecord | undefined,
  ): void {
    if (record?.active?.session.instanceId === session.instanceId) {
      this.finishActiveIfReady(session, lifecycle, record);
    } else if (lifecycle.direct) {
      this.directInput.maybeFinishDirect(session, lifecycle);
    } else if (lifecycle.turnCompleted && lifecycle.pendingRequestIds.size === 0) {
      this.resetTurn(lifecycle);
    }
    this.schedulePump(session.threadId);
  }

  private finishActiveIfReady(
    session: SessionRuntime,
    lifecycle: ThreadLifecycle,
    record: QueueRecord,
  ): void {
    const active = record.active;
    if (!active || active.session.instanceId !== session.instanceId) return;
    if (!active.completionState) return;
    if (!isSettledStatus(session.status) || lifecycle.pendingRequestIds.size > 0) return;

    this.resolveAdmission(active);
    delete record.active;
    if (active.completionState !== "completed") {
      record.paused = true;
      this.pausedThreads.add(session.threadId);
    }
    this.resetTurn(lifecycle);
    this.emitQueueState(session.threadId);
  }

  private pauseForFailure(
    threadId: string,
    record: QueueRecord | undefined,
    lifecycle: ThreadLifecycle,
  ): void {
    if (record) {
      if (record.active) {
        this.resolveAdmission(record.active);
        if (!record.active.turnId) this.restoreActive(record, record.active, false);
        else delete record.active;
      }
      record.paused = true;
      this.pausedThreads.add(threadId);
      this.emitQueueState(threadId);
    }
    lifecycle.direct = false;
    lifecycle.directAwaitingReplacement = false;
    lifecycle.directCompletion = false;
    lifecycle.pendingRequestIds.clear();
    this.resetTurn(lifecycle);
  }

  private restoreActive(record: QueueRecord, active: ActiveQueueEntry, pause: boolean): void {
    if (record.active !== active) return;
    delete record.active;
    if (!active.cancelled && !record.items.includes(active.entry)) {
      record.items.unshift(active.entry);
    }
    if (pause) {
      record.paused = true;
      this.pausedThreads.add(record.threadId);
    }
  }

  private schedulePump(threadId: string): void {
    if (this.disposed) return;
    const record = this.records.get(threadId);
    if (!record) return;
    if (record.pumpRunning) {
      record.pumpAgain = true;
      return;
    }
    record.pumpRunning = true;
    void this.runPump(record).finally(() => {
      if (this.records.get(threadId) !== record) return;
      record.pumpRunning = false;
      if (record.pumpAgain) {
        record.pumpAgain = false;
        this.schedulePump(threadId);
      } else if (!record.active && record.items.length === 0) {
        this.records.delete(threadId);
      }
    });
  }

  private async runPump(record: QueueRecord): Promise<void> {
    if (
      this.disposed ||
      record.paused ||
      record.replacing ||
      record.active ||
      record.items.length === 0
    ) {
      return;
    }
    const session = this.ctx.sessions.get(record.threadId);
    if (!session || !this.ctx.isCurrentSession(session)) return;
    const restarting = session.ignoreExit === true;
    if (restarting ? !this.isRestartReady(record, session) : !this.isReady(record, session)) return;

    const entry = record.items[0]!;
    const active: ActiveQueueEntry = { entry, session, dispatched: false };
    record.active = active;
    this.emitQueueState(record.threadId);

    let prepared: QueuedStructuredTurn;
    try {
      prepared =
        entry.prepared?.instanceId === session.instanceId
          ? entry.prepared.turn
          : await this.ctx.prepareTurn(session, entry.payload);
    } catch (error) {
      this.handleAdmissionFailure(record, active, error);
      return;
    }

    // Recheck every readiness gate after async preparation. A direct submit,
    // permission request, Stop, or replacement may have arrived meanwhile.
    if (
      this.disposed ||
      active.cancelled ||
      record.active !== active ||
      !this.ctx.isCurrentSession(session) ||
      record.paused ||
      record.replacing ||
      (restarting ? !this.isRestartReady(record, session) : !this.isReady(record, session))
    ) {
      if (record.active === active && !active.cancelled) {
        this.restoreActive(record, active, false);
        this.emitQueueState(record.threadId);
      }
      return;
    }

    entry.prepared = { instanceId: session.instanceId, turn: prepared };
    if (record.items[0] !== entry) {
      this.handleAdmissionFailure(
        record,
        active,
        new Error(msg("supervisor.followUpQueue.itemNotFound", { id: entry.id })),
      );
      return;
    }
    // This is the only point where the pending item leaves the public FIFO.
    record.items.shift();
    active.dispatched = true;
    active.admission = createAdmissionBarrier();
    this.emitQueueState(record.threadId);
    try {
      const turn: QueuedStructuredTurn = {
        ...prepared,
        userMessageItemId: entry.userMessageItemId,
      };
      if (restarting) {
        if (!this.ctx.restartStructuredTurn) {
          throw new Error(msg("supervisor.followUpQueue.unsupported"));
        }
        record.replacing = true;
        record.restarting = true;
        void this.ctx.restartStructuredTurn(session, turn).then(
          (result) => {
            if (isCompletedWithoutTurn(result)) {
              this.completeActiveWithoutTurn(record, active);
            } else if (record.active === active && record.restarting) {
              record.restarting = false;
              record.replacing = false;
              this.handleAdmissionFailure(
                record,
                active,
                new Error(msg("supervisor.followUpQueue.sessionUnavailable")),
              );
            }
          },
          (error) => {
            record.restarting = false;
            record.replacing = false;
            this.handleAdmissionFailure(record, active, error);
          },
        );
      } else {
        const start = this.ctx.startStructuredTurn(session, turn);
        if (!start) throw new Error(msg("supervisor.followUpQueue.unsupported"));
        void start.then(
          (result) => {
            if (isCompletedWithoutTurn(result)) {
              this.completeActiveWithoutTurn(record, active);
            }
          },
          (error) => this.handleAdmissionFailure(record, active, error),
        );
      }
    } catch (error) {
      this.handleAdmissionFailure(record, active, error);
    }
  }

  private completeActiveWithoutTurn(record: QueueRecord, active: ActiveQueueEntry): void {
    if (
      this.disposed ||
      this.records.get(record.threadId) !== record ||
      record.active !== active ||
      !this.ctx.isCurrentSession(active.session)
    ) {
      return;
    }
    this.resolveAdmission(active);
    active.completionState = "completed";
    const lifecycle = this.lifecycles.get(record.threadId);
    if (lifecycle?.instanceId !== active.session.instanceId) return;
    this.finishOrSchedule(active.session, lifecycle, record);
  }

  private isReady(record: QueueRecord, session: SessionRuntime): boolean {
    const lifecycle = this.lifecycleFor(session);
    return (
      session.presentationMode === "gui" &&
      Boolean(session.structuredSession?.startTurn) &&
      (isSettledStatus(session.status) || session.status === "error") &&
      session.ignoreExit !== true &&
      !lifecycle.turnId &&
      !lifecycle.turnCompleted &&
      !lifecycle.direct &&
      lifecycle.pendingRequestIds.size === 0 &&
      !this.directInput.hasReservation(record.threadId)
    );
  }

  private isRestartReady(record: QueueRecord, session: SessionRuntime): boolean {
    const lifecycle = this.lifecycleFor(session);
    return (
      session.presentationMode === "gui" &&
      Boolean(session.sessionRef) &&
      (isSettledStatus(session.status) ||
        session.status === "error" ||
        session.status === "inactive") &&
      !lifecycle.turnId &&
      !lifecycle.turnCompleted &&
      !lifecycle.direct &&
      lifecycle.pendingRequestIds.size === 0 &&
      !this.directInput.hasReservation(record.threadId)
    );
  }

  private handleAdmissionFailure(
    record: QueueRecord,
    active: ActiveQueueEntry,
    error: unknown,
  ): void {
    if (this.records.get(record.threadId) !== record || record.active !== active) return;
    this.resolveAdmission(active);
    record.restarting = false;
    record.replacing = false;
    console.error(`[supervisor] queued follow-up was not admitted for ${record.threadId}:`, error);
    if (!active.admitted) {
      this.restoreActive(record, active, true);
    } else {
      delete record.active;
      record.paused = true;
      this.pausedThreads.add(record.threadId);
    }
    const lifecycle = this.lifecycles.get(record.threadId);
    if (lifecycle?.instanceId === active.session.instanceId) {
      lifecycle.direct = false;
      this.resetTurn(lifecycle);
    }
    this.emitQueueState(record.threadId);
  }

  private resolveAdmission(active: ActiveQueueEntry): void {
    active.admission?.resolve();
    delete active.admission;
  }

  private async mutate<T>(threadId: string, operation: () => Promise<T> | T): Promise<T> {
    const previous = this.mutationTails.get(threadId) ?? Promise.resolve();
    const run = previous.then(operation);
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    this.mutationTails.set(threadId, tail);
    try {
      return await run;
    } finally {
      if (this.mutationTails.get(threadId) === tail) this.mutationTails.delete(threadId);
    }
  }

  private emitQueueState(threadId: string): void {
    const record = this.records.get(threadId);
    const queue: ThreadFollowUpQueueState | null =
      record && record.items.length > 0
        ? { items: record.items.map(pendingState), paused: record.paused }
        : null;
    this.ctx.emit({ type: "thread-follow-up-queue", threadId, queue });
    if (!queue && record && !record.active && !record.pumpRunning) this.records.delete(threadId);
  }
}
