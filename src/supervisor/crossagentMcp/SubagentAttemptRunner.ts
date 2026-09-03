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
}

interface AttemptCallbacks {
  isActive(): boolean;
  onRuntimeEvent(event: RuntimeEvent): void;
  onSettle(status: Exclude<SubagentRunStatus, "running">, errorMessage?: string): void;
}

/** Executes one resolved structured or one-shot attempt for a logical run. */
export class SubagentAttemptRunner {
  constructor(private readonly host: SubagentRunHost) {}

  run(
    state: AttemptExecutionState,
    attemptIndex: number,
    attempt: ResolvedSpawnAttempt,
    callbacks: AttemptCallbacks,
  ): void {
    void this.runResolved(state, attemptIndex, attempt, callbacks);
  }

  async teardown(state: AttemptExecutionState): Promise<void> {
    if (state.oneShot) {
      state.oneShot.cancel();
      state.oneShot = undefined;
    }
    const handle = state.handle;
    if (!handle) return;
    state.handle = undefined;
    await this.disposeHandle(handle);
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
      if (!callbacks.isActive()) return;

      const handle = await adapter.createStructuredSession?.({
        threadId: state.childThreadId,
        projectLocation,
        config,
        presentationMode: "gui",
        // Same contract as SpawnPipeline.createStructuredSession: the shared
        // runtime — not the provider — supplies `baseSpawnEnv`, so a structured
        // subagent child spawns with the provider's updater/telemetry opt-outs.
        ...(adapter.baseSpawnEnv ? { baseSpawnEnv: adapter.baseSpawnEnv } : {}),
        ...(mcpAccess ?? {}),
      });
      if (!handle) {
        callbacks.onSettle("failed", "Failed to create subagent session");
        return;
      }
      if (!callbacks.isActive() || state.cancelRequested) {
        await this.disposeHandle(handle);
        return;
      }

      state.handle = handle;
      handle.setListener({
        onClose: () =>
          callbacks.onSettle("failed", "Subagent session closed before the turn completed"),
        onError: (message) => callbacks.onSettle("failed", message),
        onUpdate: (update) => {
          if (callbacks.isActive() && state.turnStarted && update.status === "idle") {
            callbacks.onSettle("completed");
          }
        },
        onRuntimeEvent: callbacks.onRuntimeEvent,
      });

      if (handle.activate) await handle.activate();
      if (!callbacks.isActive() || state.cancelRequested) return;
      if (handle.openThread) await handle.openThread(config);
      if (!callbacks.isActive() || state.cancelRequested) return;
      if (!handle.startTurn) {
        callbacks.onSettle("failed", "Subagent session cannot start a turn");
        return;
      }
      state.turnStarted = true;
      state.turnDispatched = true;
      await handle.startTurn(state.plan.prompt, config);
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

  private async disposeHandle(handle: StructuredSessionHandle): Promise<void> {
    try {
      if (handle.interruptTurn) await handle.interruptTurn();
    } catch {}
    try {
      await handle.dispose();
    } catch {}
  }
}
