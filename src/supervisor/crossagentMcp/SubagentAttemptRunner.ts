import type { ProjectLocation, RuntimeEvent } from "@/shared/contracts";
import {
  resolveAgentProjectLocation,
  type StructuredSessionHandle,
} from "@/supervisor/agents/base";
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
  cancelRequested: boolean;
  turnStarted: boolean;
  turnDispatched: boolean;
  /** The initial turn has been acknowledged, so native steering cannot launch a second one. */
  steerReady: boolean;
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

  constructor(private readonly host: SubagentRunHost) {}

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
        if (oneShot) {
          oneShot.cancel();
          await oneShot.closed;
          if (state.oneShot === oneShot) state.oneShot = undefined;
        }
        const handle = state.handle;
        if (handle) {
          await this.disposeHandle(state, handle);
          if (state.handle === handle) state.handle = undefined;
        }
      })
      .finally(() => {
        this.teardowns.delete(state);
      });
    this.teardowns.set(state, teardown);
    return teardown;
  }

  private async runResolved(
    state: AttemptExecutionState,
    attemptIndex: number,
    attempt: ResolvedSpawnAttempt,
    callbacks: AttemptCallbacks,
  ): Promise<void> {
    try {
      const projectLocation = await resolveAgentProjectLocation(
        attempt.adapter,
        state.plan.projectLocation,
        attempt.config.executionEnvironment,
      );
      if (!callbacks.isActive() || state.cancelRequested) return;
      if (attempt.execution === "one-shot") {
        this.runOneShot(state, attemptIndex, attempt, projectLocation, callbacks);
        return;
      }
      await this.runStructured(state, attempt, projectLocation, callbacks);
    } catch (error) {
      callbacks.onSettle(
        state.cancelRequested ? "cancelled" : "failed",
        error instanceof Error ? error.message : String(error),
      );
    }
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
      if (!callbacks.isActive() || state.cancelRequested) {
        await this.teardown(state);
        return;
      }

      handle.setListener({
        onClose: () =>
          callbacks.onSettle("failed", "Subagent session closed before the turn completed"),
        onError: (message) => callbacks.onSettle("failed", message),
        onUpdate: (update) => {
          if (callbacks.isActive() && update.status === "working") callbacks.onWorking();
          if (callbacks.isActive() && state.turnStarted && update.status === "idle") {
            callbacks.onSettle("completed");
          }
        },
        onRuntimeEvent: callbacks.onRuntimeEvent,
      });

      if (!callbacks.isActive() || state.cancelRequested) return;
      if (handle.activate) await this.runStartup(state, () => handle.activate!());
      if (!callbacks.isActive() || state.cancelRequested) return;
      if (handle.openThread) await this.runStartup(state, () => handle.openThread!(config));
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

  private runOneShot(
    state: AttemptExecutionState,
    attemptIndex: number,
    attempt: ResolvedSpawnAttempt,
    projectLocation: ProjectLocation,
    callbacks: AttemptCallbacks,
  ): void {
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

    const handle = runOneShotChild({
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
    await handle.dispose();
  }
}
