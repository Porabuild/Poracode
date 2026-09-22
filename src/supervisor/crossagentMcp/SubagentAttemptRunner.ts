import type { ProjectLocation, RuntimeEvent, SessionRef } from "@/shared/contracts";
import { toError } from "@/shared/errorMessage";
import {
  resolveAgentProjectLocation,
  type StructuredSessionHandle,
} from "@/supervisor/agents/base";
import type {
  HostResourceAdmission,
  HostResourceLease,
} from "@/supervisor/runtime/hostResourceAdmission";
import {
  settlesWithin,
  STRUCTURED_DISPOSAL_TIMEOUT_MS,
  StructuredDisposalCustody,
} from "@/supervisor/runtime/threadSession/structuredDisposalCustody";
import { runOneShotChild, type OneShotChildHandle } from "./oneShotChild";
import type { PreparedSubagentRun, ResolvedSpawnAttempt } from "./spawnPlan";
import type { SubagentRunHost, SubagentRunStatus } from "./types";

export interface AttemptExecutionState {
  parentThreadId: string;
  childThreadId: string;
  label: string;
  plan: PreparedSubagentRun;
  handle: StructuredSessionHandle | undefined;
  oneShot: OneShotChildHandle | undefined;
  /**
   * Retained custody of this attempt's structured handle: one pending
   * disposal operation that later teardown calls join or retry. Kept on the
   * state so custody survives manager map eviction.
   */
  pendingDisposal?:
    | { handle: StructuredSessionHandle; custody: StructuredDisposalCustody }
    | undefined;
  /** Host execution slot for this attempt's child process, if admitted. */
  resourceLease?: HostResourceLease;
  cancelRequested: boolean;
  turnStarted: boolean;
  turnDispatched: boolean;
  /** The initial turn has been acknowledged, so native steering cannot launch a second one. */
  steerReady: boolean;
  /** Captured provider identity survives process disposal for a completed follow-up. */
  sessionRef?: SessionRef;
  /** Reopen exactly this session; never silently replace it with a fresh conversation. */
  resumeSessionRef?: SessionRef;
}

interface AttemptCallbacks {
  isActive(): boolean;
  onWorking(): void;
  onRuntimeEvent(event: RuntimeEvent): void;
  onSettle(status: Exclude<SubagentRunStatus, "running">, errorMessage?: string): void;
}

/** Executes one resolved structured or one-shot attempt for a logical run. */
export class SubagentAttemptRunner {
  private readonly teardowns = new WeakMap<AttemptExecutionState, Promise<void>>();
  private readonly creations = new WeakMap<
    AttemptExecutionState,
    Promise<StructuredSessionHandle | undefined>
  >();
  private readonly startups = new WeakMap<AttemptExecutionState, Promise<void>>();
  /**
   * Custody for attempts whose teardown did not confirm: keyed by the child's
   * resource key, bounded by the admission owner (one entry per unreleased
   * reservation), pruned as soon as the lease is released.
   */
  private readonly retainedRetirements = new Map<string, AttemptExecutionState>();

  constructor(
    private readonly host: SubagentRunHost,
    private readonly admission?: HostResourceAdmission,
    private readonly structuredDisposalTimeoutMs: number = STRUCTURED_DISPOSAL_TIMEOUT_MS,
  ) {}

  run(
    state: AttemptExecutionState,
    attemptIndex: number,
    attempt: ResolvedSpawnAttempt,
    callbacks: AttemptCallbacks,
  ): void {
    void this.runResolved(state, attemptIndex, attempt, callbacks);
  }

  hasLiveResources(state: AttemptExecutionState): boolean {
    return Boolean(
      state.handle ||
      state.oneShot ||
      (state.resourceLease && state.resourceLease.state !== "released") ||
      this.creations.has(state) ||
      this.startups.has(state) ||
      this.teardowns.has(state),
    );
  }

  teardown(state: AttemptExecutionState): Promise<void> {
    const pending = this.teardowns.get(state);
    if (pending) return pending;
    // Publish the promise before callbacks from interrupt/cancel can re-enter teardown.
    const teardown = Promise.resolve()
      .then(async () => {
        // Wait only for handle creation: waiting for runStructured would deadlock its teardown.
        await this.creations.get(state)?.catch(() => undefined);
        const oneShot = state.oneShot;
        const handle = state.handle;
        if (oneShot) {
          oneShot.cancel();
          // Exit is the only release signal. The join is bounded so a stuck
          // child cannot block a caller forever; the handle stays retained
          // and a later retry joins the same `closed` promise.
          if (!(await settlesWithin(oneShot.closed, this.structuredDisposalTimeoutMs))) {
            throw new Error(`Subagent ${state.childThreadId} did not confirm exit.`);
          }
          if (state.oneShot === oneShot) state.oneShot = undefined;
          // Exit-derived settlement resolved `closed`: the process effect is gone.
          state.resourceLease?.confirmExit();
        }
        if (handle) {
          // A rejected/hung disposal retains the lease (`retiring`, still
          // counted); the one pending operation stays joinable through
          // `retryRetirements`, and its eventual completion releases.
          await this.disposeHandle(state, handle);
          if (state.handle === handle) state.handle = undefined;
          state.resourceLease?.confirmExit();
        }
        if (!oneShot && !handle) {
          // Nothing was ever created for this attempt: release pre-effect.
          state.resourceLease?.cancel();
        }
      })
      .finally(() => {
        this.teardowns.delete(state);
        if (this.hasLiveResources(state)) {
          this.retainedRetirements.set(state.childThreadId, state);
        } else if (this.retainedRetirements.get(state.childThreadId) === state) {
          this.retainedRetirements.delete(state.childThreadId);
        }
      });
    this.teardowns.set(state, teardown);
    return teardown;
  }

  /**
   * Join/retry every child retirement that still holds capacity. Each join is
   * bounded; a still-hanging disposal keeps its custody instead of being
   * cancelled, so its eventual completion releases the slot exactly once.
   */
  async retryRetirements(): Promise<void> {
    let firstError: unknown;
    for (const [childThreadId, state] of [...this.retainedRetirements]) {
      if (!this.hasLiveResources(state)) {
        if (this.retainedRetirements.get(childThreadId) === state) {
          this.retainedRetirements.delete(childThreadId);
        }
        continue;
      }
      try {
        await this.teardown(state);
      } catch (error) {
        firstError ??= error;
      }
    }
    if (firstError !== undefined) throw toError(firstError);
  }

  private async runResolved(
    state: AttemptExecutionState,
    attemptIndex: number,
    attempt: ResolvedSpawnAttempt,
    callbacks: AttemptCallbacks,
  ): Promise<void> {
    // Admit before any provider process: pending counts against the class
    // limit, so held starts cannot overshoot it. A refusal settles this
    // attempt as failed without launching anything.
    try {
      const lease = this.admission?.tryAcquire({
        resourceClass: "agent-session",
        key: state.childThreadId,
      });
      if (lease) state.resourceLease = lease;
      const projectLocation = await resolveAgentProjectLocation(
        state.plan.projectLocation,
        attempt.config.executionEnvironment,
      );
      if (!callbacks.isActive() || state.cancelRequested) return;
      if (attempt.execution === "one-shot") {
        await this.runOneShot(state, attemptIndex, attempt, projectLocation, callbacks);
        return;
      }
      await this.runStructured(state, attempt, projectLocation, callbacks);
    } catch (error) {
      callbacks.onSettle(
        state.cancelRequested ? "cancelled" : "failed",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      // Early returns before handle creation must never strand a pending slot.
      this.releaseUnstartedLease(state);
    }
  }

  private releaseUnstartedLease(state: AttemptExecutionState): void {
    const lease = state.resourceLease;
    if (!lease || lease.state === "released") return;
    if (state.handle || state.oneShot || this.creations.has(state) || this.teardowns.has(state)) {
      return;
    }
    lease.cancel();
  }

  private async runStructured(
    state: AttemptExecutionState,
    attempt: ResolvedSpawnAttempt,
    projectLocation: ProjectLocation,
    callbacks: AttemptCallbacks,
  ): Promise<void> {
    const { adapter, config } = attempt;
    try {
      const mcpAccess = await this.host.resolveParentMcpAccess?.(
        state.parentThreadId,
        { threadId: state.childThreadId, title: state.label },
        adapter.kind,
        projectLocation,
      );
      if (!callbacks.isActive() || state.cancelRequested) return;

      const creation = Promise.resolve()
        .then(() =>
          adapter.createStructuredSession?.({
            threadId: state.childThreadId,
            projectLocation,
            config,
            presentationMode: "gui",
            ...(state.resumeSessionRef ? { sessionRef: state.resumeSessionRef } : {}),
            // Same contract as SpawnPipeline.createStructuredSession: the shared
            // runtime — not the provider — supplies `baseSpawnEnv`, so a structured
            // subagent child spawns with the provider's updater/telemetry opt-outs.
            ...(adapter.baseSpawnEnv ? { baseSpawnEnv: adapter.baseSpawnEnv } : {}),
            ...(mcpAccess ?? {}),
          }),
        )
        .then((handle) => {
          if (handle) state.handle = handle;
          return handle;
        })
        .finally(() => {
          this.creations.delete(state);
        });
      this.creations.set(state, creation);
      const handle = await creation;
      if (!handle) {
        callbacks.onSettle("failed", "Failed to create subagent session");
        return;
      }
      // The child process effect now exists: activate its admitted slot.
      state.resourceLease?.activate();
      if (!callbacks.isActive() || state.cancelRequested) {
        await this.teardown(state);
        return;
      }

      handle.setListener({
        onClose: () => {
          // Transport close is the child's logical retirement signal: the
          // lease is released, so no disposal custody is needed any more.
          state.resourceLease?.confirmExit();
          if (state.handle === handle) state.handle = undefined;
          if (state.pendingDisposal?.handle === handle) state.pendingDisposal = undefined;
          if (this.retainedRetirements.get(state.childThreadId) === state) {
            this.retainedRetirements.delete(state.childThreadId);
          }
          callbacks.onSettle("failed", "Subagent session closed before the turn completed");
        },
        onError: (message) => callbacks.onSettle("failed", message),
        onUpdate: (update) => {
          if (callbacks.isActive() && update.sessionRef) state.sessionRef = update.sessionRef;
          if (callbacks.isActive() && update.status === "working") callbacks.onWorking();
          if (callbacks.isActive() && state.turnStarted && update.status === "idle") {
            callbacks.onSettle("completed");
          }
        },
        // Opening a resumed session can replay history. Only the new turn belongs
        // to this run's result, cursor and synthetic tile.
        onRuntimeEvent: (event) => {
          if (state.turnDispatched) callbacks.onRuntimeEvent(event);
        },
      });

      if (!callbacks.isActive() || state.cancelRequested) return;
      if (handle.activate) await this.runStartup(state, () => handle.activate!());
      if (!callbacks.isActive() || state.cancelRequested) return;
      if (state.resumeSessionRef && !handle.openThread) {
        throw new Error("This subagent cannot reopen its completed session");
      }
      if (handle.openThread) {
        await this.runStartup(state, async () => {
          const sessionId = await handle.openThread!(config, state.resumeSessionRef);
          if (state.resumeSessionRef && sessionId !== state.resumeSessionRef.providerSessionId) {
            throw new Error("Subagent resumed a different session; follow-up was not sent");
          }
          if (sessionId) {
            state.sessionRef = {
              providerSessionId: sessionId,
              discoveredAt: new Date().toISOString(),
            };
          }
        });
      }
      if (!callbacks.isActive() || state.cancelRequested) return;
      if (!handle.startTurn) {
        callbacks.onSettle("failed", "Subagent session cannot start a turn");
        return;
      }
      state.turnStarted = true;
      state.turnDispatched = true;
      await handle.startTurn(state.plan.prompt, config);
      if (callbacks.isActive()) state.steerReady = true;
    } catch (error) {
      callbacks.onSettle(
        state.cancelRequested ? "cancelled" : "failed",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async runOneShot(
    state: AttemptExecutionState,
    attemptIndex: number,
    attempt: ResolvedSpawnAttempt,
    projectLocation: ProjectLocation,
    callbacks: AttemptCallbacks,
  ): Promise<void> {
    const { adapter, config } = attempt;
    const itemId = `attempt-${attemptIndex + 1}-oneshot-out`;
    let opened = false;
    const ensureOpen = () => {
      if (opened) return;
      opened = true;
      callbacks.onRuntimeEvent({
        type: "item.started",
        threadId: state.childThreadId,
        itemId,
        itemType: "assistant_message",
      });
    };

    const handle = await runOneShotChild({
      adapter,
      projectLocation,
      model: config.model,
      effort: config.effort,
      prompt: state.plan.prompt,
      onTextDelta: (delta) => {
        ensureOpen();
        callbacks.onRuntimeEvent({
          type: "content.delta",
          threadId: state.childThreadId,
          itemId,
          stream: "assistant_text",
          delta,
        });
      },
      onSettle: ({ status, errorMessage }) => {
        if (opened) {
          callbacks.onRuntimeEvent({
            type: "item.completed",
            threadId: state.childThreadId,
            itemId,
          });
        }
        callbacks.onSettle(status, errorMessage);
      },
    });

    state.turnDispatched = true;
    state.oneShot = handle;
    // `runOneShotChild` returns a handle for the spawned child (or a no-op
    // handle after a synchronous spawn failure); activate uniformly and let
    // teardown's `closed` join release it.
    state.resourceLease?.activate();
    if (state.cancelRequested) handle.cancel();
  }

  private runStartup(
    state: AttemptExecutionState,
    operation: () => Promise<unknown>,
  ): Promise<void> {
    // Record startup before provider callbacks can synchronously request teardown.
    const startup = Promise.resolve()
      .then(operation)
      .then(() => {})
      .finally(() => {
        this.startups.delete(state);
      });
    this.startups.set(state, startup);
    return startup;
  }

  private async disposeHandle(
    state: AttemptExecutionState,
    handle: StructuredSessionHandle,
  ): Promise<void> {
    try {
      if (handle.interruptTurn) await handle.interruptTurn();
    } catch {}
    // Startup may still acquire a process or session; dispose only after it settles.
    // startTurn is deliberately excluded: interruption/disposal ends that lifetime.
    await this.startups.get(state)?.catch(() => undefined);
    let pending = state.pendingDisposal;
    if (!pending || pending.handle !== handle) {
      const custody = new StructuredDisposalCustody(() => handle.dispose(), {
        timeoutMs: this.structuredDisposalTimeoutMs,
        onConfirmed: () => {
          // The disposal settled after any caller timeout: drop the handle
          // and release the slot at the real completion, not at the deadline.
          if (state.handle === handle) state.handle = undefined;
          if (state.pendingDisposal?.custody === custody) state.pendingDisposal = undefined;
          state.resourceLease?.confirmExit();
          if (this.retainedRetirements.get(state.childThreadId) === state) {
            this.retainedRetirements.delete(state.childThreadId);
          }
        },
        onFailure: (error) => {
          console.warn(
            `[supervisor] failed to dispose subagent session ${state.childThreadId}; its execution slot stays counted:`,
            error,
          );
        },
      });
      pending = { handle, custody };
      state.pendingDisposal = pending;
    }
    const outcome = await pending.custody.settle();
    if (outcome !== "confirmed") {
      throw toError(
        pending.custody.error ??
          new Error(`Subagent ${state.childThreadId} disposal did not confirm.`),
      );
    }
  }
}
