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
  STRUCTURED_DISPOSAL_TIMEOUT_MS,
  type StructuredDisposalCustody,
} from "@/supervisor/runtime/threadSession/structuredDisposalCustody";
import { SubagentAttemptCustody } from "./SubagentAttemptCustody";
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
   * Mirror of the structured handle's whole cleanup custody. The runner also
   * retains that generation before creation/startup finishes, independently
   * of manager map eviction.
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
  private readonly attempts = new WeakMap<AttemptExecutionState, SubagentAttemptCustody>();
  /**
   * Enumerable custody from the start of cleanup until confirmed retirement.
   * Entries own attempt generations, so even a reused child key cannot replace
   * an older pending cleanup or let its observer remove a successor's custody.
   */
  private readonly retainedRetirements = new Set<SubagentAttemptCustody>();

  constructor(
    private readonly host: SubagentRunHost,
    private readonly admission?: HostResourceAdmission,
    private readonly structuredDisposalTimeoutMs: number = STRUCTURED_DISPOSAL_TIMEOUT_MS,
    private readonly onRetired?: (parentThreadId: string) => void,
  ) {}

  run(
    state: AttemptExecutionState,
    attemptIndex: number,
    attempt: ResolvedSpawnAttempt,
    callbacks: AttemptCallbacks,
  ): void {
    const resources = this.createCustody(state);
    void this.runResolved(state, resources, attemptIndex, attempt, callbacks);
  }

  hasLiveResources(state: AttemptExecutionState): boolean {
    return (
      this.attempts.get(state)?.hasLiveResources ??
      Boolean(
        state.handle ||
        state.oneShot ||
        (state.resourceLease && state.resourceLease.state !== "released"),
      )
    );
  }

  teardown(state: AttemptExecutionState): Promise<void> {
    const resources = this.attempts.get(state) ?? this.createCustody(state, true);
    // Enumerable from the start, including held creation/startup/interrupt.
    // Retries join this captured generation, never whichever attempt is next.
    if (resources.handle)
      state.pendingDisposal = {
        handle: resources.handle,
        custody: resources.disposal,
      };
    return this.retire(resources);
  }

  private retire(resources: SubagentAttemptCustody): Promise<void> {
    if (!resources.retired) this.retainedRetirements.add(resources);
    return resources.teardown();
  }

  private createCustody(state: AttemptExecutionState, adopt = false): SubagentAttemptCustody {
    const resources = new SubagentAttemptCustody(
      state.parentThreadId,
      state.childThreadId,
      this.structuredDisposalTimeoutMs,
      () => {
        if (this.attempts.get(state) === resources) {
          if (state.handle === resources.handle) state.handle = undefined;
          if (state.oneShot === resources.oneShot) state.oneShot = undefined;
          if (state.pendingDisposal?.custody === resources.disposal)
            state.pendingDisposal = undefined;
        }
        this.retainedRetirements.delete(resources);
        this.onRetired?.(resources.parentThreadId);
      },
    );
    this.attempts.set(state, resources);
    if (adopt) {
      resources.lease = state.resourceLease;
      if (state.handle) resources.setHandle(state.handle);
      if (state.oneShot) resources.setOneShot(state.oneShot);
    }
    return resources;
  }

  /**
   * Join/retry every child retirement that still holds capacity. Each join is
   * bounded; a still-hanging disposal keeps its custody instead of being
   * cancelled, so its eventual completion releases the slot exactly once.
   */
  async retryRetirements(): Promise<void> {
    let firstError: unknown;
    for (const resources of [...this.retainedRetirements]) {
      if (!resources.hasLiveResources) {
        this.retainedRetirements.delete(resources);
        continue;
      }
      try {
        await resources.teardown();
      } catch (error) {
        firstError ??= error;
      }
    }
    if (firstError !== undefined) throw toError(firstError);
  }

  private async runResolved(
    state: AttemptExecutionState,
    resources: SubagentAttemptCustody,
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
        key: resources.childThreadId,
      });
      if (lease) {
        resources.lease = lease;
        state.resourceLease = lease;
      }
      const projectLocation = await resolveAgentProjectLocation(
        state.plan.projectLocation,
        attempt.config.executionEnvironment,
      );
      if (!this.isActive(state, resources, callbacks)) return;
      if (attempt.execution === "one-shot") {
        await this.runOneShot(state, resources, attemptIndex, attempt, projectLocation, callbacks);
        return;
      }
      await this.runStructured(state, resources, attempt, projectLocation, callbacks);
    } catch (error) {
      if (this.isActive(state, resources, callbacks)) {
        callbacks.onSettle("failed", error instanceof Error ? error.message : String(error));
      }
    } finally {
      // Early returns before handle creation must never strand a pending slot.
      resources.releaseUnstarted();
    }
  }

  private isActive(
    state: AttemptExecutionState,
    resources: SubagentAttemptCustody,
    callbacks: AttemptCallbacks,
  ): boolean {
    return (
      this.attempts.get(state) === resources &&
      !resources.retiring &&
      !resources.retired &&
      callbacks.isActive() &&
      !state.cancelRequested
    );
  }

  private async runStructured(
    state: AttemptExecutionState,
    resources: SubagentAttemptCustody,
    attempt: ResolvedSpawnAttempt,
    projectLocation: ProjectLocation,
    callbacks: AttemptCallbacks,
  ): Promise<void> {
    const { adapter, config } = attempt;
    const resumeSessionRef = state.resumeSessionRef;
    const prompt = state.plan.prompt;
    const active = () => this.isActive(state, resources, callbacks);
    try {
      const mcpAccess = await this.host.resolveParentMcpAccess?.(
        resources.parentThreadId,
        { threadId: resources.childThreadId, title: state.label },
        adapter.kind,
        projectLocation,
      );
      if (!active()) return;

      const handle = await resources.acquire(
        async () =>
          adapter.createStructuredSession?.({
            threadId: resources.childThreadId,
            projectLocation,
            config,
            presentationMode: "gui",
            ...(resumeSessionRef ? { sessionRef: resumeSessionRef } : {}),
            // Same contract as SpawnPipeline.createStructuredSession: the shared
            // runtime — not the provider — supplies `baseSpawnEnv`, so a structured
            // subagent child spawns with the provider's updater/telemetry opt-outs.
            ...(adapter.baseSpawnEnv ? { baseSpawnEnv: adapter.baseSpawnEnv } : {}),
            ...(mcpAccess ?? {}),
          }),
        (created) => {
          if (!created) return;
          resources.setHandle(created);
          if (this.attempts.get(state) === resources) {
            state.handle = created;
            if (resources.retiring)
              state.pendingDisposal = { handle: created, custody: resources.disposal };
          }
        },
      );
      if (!handle) {
        if (active()) callbacks.onSettle("failed", "Failed to create subagent session");
        return;
      }
      if (!active()) {
        // A superseded generation must retire its own late acquisition.
        await this.retire(resources);
        return;
      }

      handle.setListener({
        onClose: () => {
          const wasActive = active();
          resources.closed(handle);
          if (wasActive)
            callbacks.onSettle("failed", "Subagent session closed before the turn completed");
        },
        onError: (message) => {
          if (active()) callbacks.onSettle("failed", message);
        },
        onUpdate: (update) => {
          if (active() && update.sessionRef) state.sessionRef = update.sessionRef;
          if (active() && update.status === "working") callbacks.onWorking();
          if (active() && state.turnStarted && update.status === "idle") {
            callbacks.onSettle("completed");
          }
        },
        // Opening a resumed session can replay history. Only the new turn belongs
        // to this run's result, cursor and synthetic tile.
        onRuntimeEvent: (event) => {
          if (active() && state.turnDispatched)
            callbacks.onRuntimeEvent(
              captureRuntimePayloadOrigin(event, adapter.runtimePayloadFormatOwnerKey),
            );
        },
      });

      if (!active()) return;
      if (handle.activate) await resources.start(() => handle.activate!());
      if (!active()) return;
      if (resumeSessionRef && !handle.openThread) {
        throw new Error("This subagent cannot reopen its completed session");
      }
      if (handle.openThread) {
        await resources.start(async () => {
          const sessionId = await handle.openThread!(config, resumeSessionRef);
          if (resumeSessionRef && sessionId !== resumeSessionRef.providerSessionId) {
            throw new Error("Subagent resumed a different session; follow-up was not sent");
          }
          if (active() && sessionId) {
            state.sessionRef = {
              providerSessionId: sessionId,
              discoveredAt: new Date().toISOString(),
            };
          }
        });
      }
      if (!active()) return;
      if (!handle.startTurn) {
        callbacks.onSettle("failed", "Subagent session cannot start a turn");
        return;
      }
      state.turnStarted = true;
      state.turnDispatched = true;
      await handle.startTurn(prompt, config);
      if (active()) state.steerReady = true;
    } catch (error) {
      if (active())
        callbacks.onSettle("failed", error instanceof Error ? error.message : String(error));
    }
  }

  private async runOneShot(
    state: AttemptExecutionState,
    resources: SubagentAttemptCustody,
    attemptIndex: number,
    attempt: ResolvedSpawnAttempt,
    projectLocation: ProjectLocation,
    callbacks: AttemptCallbacks,
  ): Promise<void> {
    const { adapter, config } = attempt;
    const active = () => this.isActive(state, resources, callbacks);
    const prompt = state.plan.prompt;
    const itemId = `attempt-${attemptIndex + 1}-oneshot-out`;
    let opened = false;
    const ensureOpen = () => {
      if (opened) return;
      opened = true;
      callbacks.onRuntimeEvent({
        type: "item.started",
        threadId: resources.childThreadId,
        itemId,
        itemType: "assistant_message",
      });
    };

    await resources.acquire(
      () =>
        runOneShotChild({
          adapter,
          projectLocation,
          model: config.model,
          effort: config.effort,
          prompt,
          onTextDelta: (delta) => {
            if (!active()) return;
            ensureOpen();
            callbacks.onRuntimeEvent({
              type: "content.delta",
              threadId: resources.childThreadId,
              itemId,
              stream: "assistant_text",
              delta,
            });
          },
          onSettle: ({ status, errorMessage }) => {
            if (!active()) return;
            if (opened) {
              callbacks.onRuntimeEvent({
                type: "item.completed",
                threadId: resources.childThreadId,
                itemId,
              });
            }
            callbacks.onSettle(status, errorMessage);
          },
        }),
      (handle) => {
        resources.setOneShot(handle);
        if (this.attempts.get(state) === resources) {
          state.turnDispatched = true;
          state.oneShot = handle;
        }
      },
    );
    if (!active() && !resources.retired) {
      await this.retire(resources);
    }
  }
}
import { captureRuntimePayloadOrigin } from "@/shared/runtimePayloadOriginProtocol";
