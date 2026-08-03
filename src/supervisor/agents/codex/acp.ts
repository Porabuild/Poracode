import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  areAgentSlashCommandsEqual,
  type AgentSlashCommand,
  type PromptSegment,
  type ProjectLocation,
  type ResolvedMcpServer,
  type RuntimeEvent,
  type SessionRef,
  type ThreadConfig,
  type ThreadGoalControl,
  type ThreadServerRequestId,
} from "@/shared/contracts";
import { buildPromptContentBlocks } from "@/shared/promptContent";
import { toWslUncPath } from "@/shared/wsl";
import {
  createKnownSessionRef,
  type AgentLaunchOptions,
  type CreateStructuredSessionInput,
  type StartTurnOptions,
  type StructuredSessionHandle,
  type StructuredSessionListener,
  type StructuredSessionUpdate,
  type ThreadHistory,
} from "../base";
import {
  createCodexMapperState,
  CodexUsageScopeTracker,
  mapCodexNotification,
  type CodexMapperState,
} from "./canonicalMapping";
import {
  deriveCodexStructuredState,
  extractCodexStatusErrorMessage,
  extractThreadField,
  extractTurnField,
  isRecoverableResumeError,
  toCodexSandboxPolicy,
  type CodexThreadStatus,
} from "./acpProtocol";
import {
  buildCodexCollaborationMode,
  buildCodexTurnInput,
  parseCodexGoalCommand,
  type CodexGoalCommand,
} from "./acpTurn";
import { CodexAppServerRpc, isUnsupportedCodexRequestError } from "./appServerRpc";
import type { CodexClientRequestMap } from "./protocol";
import { acquireCodexAppServer } from "./serverPool";
import { buildCodexThreadOverrides } from "./threadOverrides";
import {
  mapCodexSkillsToSlashCommands,
  mapCodexSlashCommands,
  readCodexInitCommands,
} from "./probe";
import { CodexSubAgentRouter } from "./subAgentRouting";

export { deriveCodexStructuredState, parseCodexSocketMessage } from "./acpProtocol";
export type { CodexThreadStatus } from "./acpProtocol";

type TurnStartParams = CodexClientRequestMap["turn/start"]["params"];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// A `thread/status/changed → systemError` notification carries no message, so
// we surface a generic fallback. But Codex often follows it with a specific
// error (a `turn/completed(failed)`, `error`, or legacy `thread/error`
// notification carrying the real reason, e.g. a usage-limit / "remote compact
// task" failure). Defer the generic fallback briefly so a specific error can
// preempt it — otherwise the
// user sees the generic notice *plus* the real error. The delay only postpones
// an error message; the error status icon updates synchronously.
const CODEX_SYSTEM_ERROR_FALLBACK_DELAY_MS = 250;
const CODEX_RESUME_STATUS_REPLAY_SUPPRESSION_MS = 500;
const CODEX_FORK_NOTIFICATION_BUFFER_LIMIT = 100;
const CODEX_DISPOSE_INTERRUPT_TIMEOUT_MS = 2_000;
const CODEX_EVENT_DEBUG_ENV = "PORACODE_DEBUG_CODEX_EVENTS";

type CodexEventDebugDirection =
  | "codex->poracode"
  | "poracode->codex"
  | "poracode:update"
  | "poracode:runtime"
  | "transport";

function isCodexEventDebugEnabled(): boolean {
  const value = process.env[CODEX_EVENT_DEBUG_ENV];
  return value === "1" || value === "true" || value === "all";
}

function stringifyCodexEventDebugPayload(payload: unknown): string {
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function toSessionRef(threadId: string): SessionRef {
  return createKnownSessionRef(threadId);
}

function isPlainActiveStatus(status: CodexThreadStatus): boolean {
  if (status.type !== "active") {
    return false;
  }
  const flags = new Set(status.activeFlags ?? []);
  return !flags.has("waitingOnApproval") && !flags.has("waitingOnUserInput");
}

function readNotificationThreadId(
  params: Record<string, unknown> | undefined,
  fallbackThreadId: string | undefined,
): string | undefined {
  if (params && typeof params.threadId === "string") {
    return params.threadId;
  }
  const thread =
    params && typeof params.thread === "object" && params.thread !== null
      ? (params.thread as Record<string, unknown>)
      : undefined;
  if (typeof thread?.id === "string") {
    return thread.id;
  }
  const turn =
    params && typeof params.turn === "object" && params.turn !== null
      ? (params.turn as Record<string, unknown>)
      : undefined;
  if (typeof turn?.threadId === "string") {
    return turn.threadId;
  }
  return fallbackThreadId;
}

// ── Structured Session ──────────────────────────────────────────
//
// Lifecycle for a new thread:
//   1. create()       → acquire the shared app-server and attach a JSON-RPC channel
//   2. activate()     → initialize handshake with the server
//   3. openThread()   → thread/start on the server, get Codex thread ID
//   4. startTurn()    → fire turns through the structured server
//
// Lifecycle for resuming a saved thread:
//   1. create()       → acquire the shared app-server and attach a JSON-RPC channel
//   2. activate()     → initialize handshake
//   3. openThread()   → thread/resume with saved session ID

// eslint-disable-next-line no-unused-vars -- planned: structured SDK session support
export class CodexStructuredSession implements StructuredSessionHandle {
  launchOptions: AgentLaunchOptions;

  private readonly rpc: CodexAppServerRpc;
  private readonly threadId: string;
  private readonly projectLocation: ProjectLocation;
  private readonly mcpServers: readonly ResolvedMcpServer[];
  private readonly releaseAppServer: () => void;
  private listener: StructuredSessionListener | undefined;
  private isDisposed = false;
  private activated = false;
  private remoteThreadId: string | undefined;
  private rolloutPath: string | undefined;
  private rolloutCreatedAt: string | undefined;
  private rolloutCwd: string | undefined;
  private rolloutCliVersion: string | undefined;
  private rolloutSource: Record<string, unknown> | undefined;
  private rolloutModelProvider: string | undefined;
  private wslDistro: string | undefined;
  private currentThreadStatus: CodexThreadStatus = { type: "idle" };
  private currentConfig: ThreadConfig | undefined;
  private activeTurnId: string | undefined;
  private currentSlashCommands: AgentSlashCommand[] | undefined;
  private currentBaseSlashCommands: AgentSlashCommand[] = [];
  private currentSkillSlashCommands: AgentSlashCommand[] = [];
  private pendingTurnInterrupt = false;
  // Sticky-error gate: once a turn fails, derived status updates from
  // `thread/status/changed` (which Codex emits as `idle` after an aborted
  // turn) must not overwrite the error state. Cleared on the next user turn.
  private errorSticky = false;
  // Error messages already surfaced for the current turn. Codex can report one
  // underlying failure (e.g. a usage limit) through several channels — the
  // turn/start rejection, a `turn/completed(failed)` notification, and a
  // `error` notification — each carrying the same text. Deduping here
  // keeps the user from seeing the same error two or three times. Cleared on
  // the next user turn.
  private readonly seenErrorMessages = new Set<string>();
  // Pending deferred generic system-error fallback (see
  // CODEX_SYSTEM_ERROR_FALLBACK_DELAY_MS). Cancelled if a specific error
  // arrives first, on the next user turn, or on dispose.
  private pendingSystemErrorFallback: ReturnType<typeof setTimeout> | undefined;
  private mapperState: CodexMapperState | undefined;
  private subAgentRouter: CodexSubAgentRouter | undefined;
  private forkNotificationBuffer:
    | Array<{
        method: string;
        params: Record<string, unknown> | undefined;
        threadId: string;
      }>
    | undefined;
  /**
   * Codex can report a plain `active` status while `thread/resume` is only
   * attaching to an existing saved thread. Treat that as history-load noise
   * until `thread/read` confirms the real remote state.
   */
  private readonly resumeActiveStatusSuppressionUntil = new Map<string, number>();
  /**
   * Runtime events emitted before the listener was wired. Replayed on
   * `setListener` — same race as `AcpStructuredSession`.
   */
  private bufferedRuntimeEvents: RuntimeEvent[] = [];
  private constructor(
    rpc: CodexAppServerRpc,
    threadId: string,
    projectLocation: ProjectLocation,
    mcpServers: readonly ResolvedMcpServer[],
    releaseAppServer: () => void,
    wslDistro?: string,
  ) {
    this.rpc = rpc;
    this.threadId = threadId;
    this.projectLocation = projectLocation;
    this.mcpServers = mcpServers;
    this.releaseAppServer = releaseAppServer;
    this.wslDistro = wslDistro;
    this.launchOptions = {
      suppressResumeConfigOverrides: true,
    };
  }

  private ensureMapperState(): CodexMapperState {
    if (!this.mapperState) {
      this.mapperState = createCodexMapperState(this.threadId);
    }
    return this.mapperState;
  }

  private ensureSubAgentRouter(): CodexSubAgentRouter {
    this.subAgentRouter ??= new CodexSubAgentRouter(this.threadId, this.wslDistro);
    return this.subAgentRouter;
  }

  private emitRuntimeEvents(events: RuntimeEvent[]): void {
    if (events.length === 0) return;
    const forwarded: RuntimeEvent[] = [];
    for (const event of events) {
      if (event.type === "error") {
        // Collapse duplicate error notifications within a single turn so one
        // underlying failure does not surface multiple identical toasts.
        if (this.seenErrorMessages.has(event.message)) continue;
        this.seenErrorMessages.add(event.message);
        // A concrete error preempts the deferred generic system-error fallback.
        this.clearPendingSystemErrorFallback();
      }
      forwarded.push(event);
    }
    if (forwarded.length === 0) return;
    for (const event of forwarded) {
      this.logCodexEventDebug("poracode:runtime", event);
    }
    if (!this.listener?.onRuntimeEvent) {
      this.bufferedRuntimeEvents.push(...forwarded);
      return;
    }
    for (const event of forwarded) {
      this.listener.onRuntimeEvent(event);
    }
  }

  private scheduleSystemErrorFallback(message: string): void {
    this.clearPendingSystemErrorFallback();
    this.pendingSystemErrorFallback = setTimeout(() => {
      this.pendingSystemErrorFallback = undefined;
      if (this.isDisposed) return;
      this.emitRuntimeEvents([{ type: "error", threadId: this.threadId, message }]);
    }, CODEX_SYSTEM_ERROR_FALLBACK_DELAY_MS);
  }

  private clearPendingSystemErrorFallback(): void {
    if (this.pendingSystemErrorFallback !== undefined) {
      clearTimeout(this.pendingSystemErrorFallback);
      this.pendingSystemErrorFallback = undefined;
    }
  }

  private beginResumeActiveStatusSuppression(threadId: string): void {
    this.resumeActiveStatusSuppressionUntil.set(threadId, Number.POSITIVE_INFINITY);
  }

  private settleResumeActiveStatusSuppression(
    threadId: string,
    confirmedStatus?: CodexThreadStatus,
  ): void {
    if (!this.resumeActiveStatusSuppressionUntil.has(threadId)) {
      return;
    }
    if (confirmedStatus && isPlainActiveStatus(confirmedStatus)) {
      this.resumeActiveStatusSuppressionUntil.delete(threadId);
      return;
    }
    const suppressUntil = Date.now() + CODEX_RESUME_STATUS_REPLAY_SUPPRESSION_MS;
    this.resumeActiveStatusSuppressionUntil.set(threadId, suppressUntil);
    setTimeout(() => {
      if (this.resumeActiveStatusSuppressionUntil.get(threadId) === suppressUntil) {
        this.resumeActiveStatusSuppressionUntil.delete(threadId);
      }
    }, CODEX_RESUME_STATUS_REPLAY_SUPPRESSION_MS);
  }

  private shouldSuppressResumeActiveStatus(threadId: string, status: CodexThreadStatus): boolean {
    const suppressUntil = this.resumeActiveStatusSuppressionUntil.get(threadId);
    if (suppressUntil === undefined) {
      return false;
    }
    if (Date.now() > suppressUntil) {
      this.resumeActiveStatusSuppressionUntil.delete(threadId);
      return false;
    }
    return isPlainActiveStatus(status);
  }

  private isResumeReplaySuppressed(threadId: string | undefined): boolean {
    if (!threadId) {
      return false;
    }
    const suppressUntil = this.resumeActiveStatusSuppressionUntil.get(threadId);
    if (suppressUntil === undefined) {
      return false;
    }
    if (Date.now() > suppressUntil) {
      this.resumeActiveStatusSuppressionUntil.delete(threadId);
      return false;
    }
    return true;
  }

  private async dispatchCodexGoalCommand(
    threadId: string,
    command: CodexGoalCommand,
  ): Promise<void> {
    switch (command.kind) {
      case "set":
        await this.rpc.request("thread/goal/set", {
          threadId,
          objective: command.objective,
          status: "active",
        });
        return;
      case "clear":
        await this.rpc.request("thread/goal/clear", { threadId });
        return;
      case "pause":
        await this.rpc.request("thread/goal/set", { threadId, status: "paused" });
        return;
      case "resume":
        await this.rpc.request("thread/goal/set", { threadId, status: "active" });
        return;
      case "view":
        // The active goal item is already in the chat via `thread/goal/updated`
        // notifications. `/goal` alone is acknowledged with the user_message
        // and a settled idle status — no RPC is required.
        return;
    }
  }

  async controlGoal(control: ThreadGoalControl): Promise<void> {
    const threadId = await this.waitForRemoteThreadId();
    await this.dispatchCodexGoalCommand(
      threadId,
      control.action === "edit"
        ? { kind: "set", objective: control.objective }
        : { kind: control.action },
    );
  }

  private updateSlashCommands(commands: AgentSlashCommand[]): void {
    if (areAgentSlashCommandsEqual(this.currentSlashCommands, commands)) {
      return;
    }
    this.currentSlashCommands = commands;
    this.emitUpdate({
      ...deriveCodexStructuredState(this.currentThreadStatus),
      ...(this.remoteThreadId ? { sessionRef: toSessionRef(this.remoteThreadId) } : {}),
      slashCommands: commands,
    });
  }

  private rebuildSlashCommands(): void {
    this.updateSlashCommands([
      ...(this.currentBaseSlashCommands ?? []),
      ...(this.currentSkillSlashCommands ?? []),
    ]);
  }

  private async refreshSkillSlashCommands(forceReload: boolean): Promise<void> {
    const projectCwd = this.projectLocation
      ? this.projectLocation.kind === "wsl"
        ? this.projectLocation.linuxPath
        : this.projectLocation.path
      : undefined;
    const result = await this.rpc.request("skills/list", {
      ...(projectCwd ? { cwds: [projectCwd] } : {}),
      forceReload,
    });
    this.currentSkillSlashCommands = mapCodexSkillsToSlashCommands(result);
    this.rebuildSlashCommands();
  }

  static async create(
    input: CreateStructuredSessionInput,
    wslExecPath?: string,
  ): Promise<CodexStructuredSession> {
    const acquired = await acquireCodexAppServer(input, wslExecPath);
    const wslDistro =
      input.projectLocation.kind === "wsl" ? input.projectLocation.distro : undefined;
    const rpc = new CodexAppServerRpc(acquired.connection, input.threadId);
    const session = new CodexStructuredSession(
      rpc,
      input.threadId,
      input.projectLocation,
      input.mcpServers ?? [],
      acquired.dispose,
      wslDistro,
    );
    session.attachRpcHandlers();

    return session;
  }

  setListener(listener: StructuredSessionListener): void {
    this.listener = listener;

    // Drain runtime events that arrived before the listener was wired.
    if (listener.onRuntimeEvent && this.bufferedRuntimeEvents.length > 0) {
      const drained = this.bufferedRuntimeEvents;
      this.bufferedRuntimeEvents = [];
      for (const event of drained) {
        listener.onRuntimeEvent(event);
      }
    }

    // Re-emit meaningful state so the listener doesn't miss updates that fired
    // before attachment. Plain `idle` from thread creation is already the
    // runtime default and should not participate in live turn status.
    const shouldReplayStatus = this.currentThreadStatus.type !== "idle";
    if (this.activated && this.remoteThreadId && shouldReplayStatus) {
      const sessionRef = toSessionRef(this.remoteThreadId);
      this.emitUpdate({
        ...deriveCodexStructuredState(this.currentThreadStatus),
        sessionRef,
        ...(this.currentSlashCommands !== undefined
          ? { slashCommands: this.currentSlashCommands }
          : {}),
      });
    } else if (this.currentSlashCommands !== undefined) {
      this.emitUpdate({
        ...deriveCodexStructuredState(this.currentThreadStatus),
        slashCommands: this.currentSlashCommands,
      });
    }
  }

  async activate(): Promise<void> {
    if (this.activated) {
      throw new Error("CodexStructuredSession already activated.");
    }
    if (this.isDisposed) {
      throw new Error("CodexStructuredSession was disposed before activation.");
    }
    this.activated = true;

    await this.initialize();
  }

  async openThread(config: ThreadConfig, sessionRef?: SessionRef): Promise<string> {
    // `mode` does not exist on `thread/start` or `thread/resume`; plan mode is
    // a per-turn override sent via `collaborationMode` on `turn/start`.
    this.currentConfig = config;
    const threadOverrides = buildCodexThreadOverrides(config, {
      projectLocation: this.projectLocation,
      mcpServers: this.mcpServers,
    });

    let threadId: string;
    // `fresh` marks a brand-new provider thread (usage ledger baseline 0). A
    // resumed thread carries inherited history — its first cumulative sample
    // is a baseline that counts nothing. A failed resume falling back to
    // `thread/start` DID create a new thread, so it is fresh again.
    let createdNewThread = false;

    if (sessionRef) {
      this.beginResumeActiveStatusSuppression(sessionRef.providerSessionId);
      try {
        await this.rpc.request("thread/resume", {
          ...threadOverrides,
          threadId: sessionRef.providerSessionId,
        });
        threadId = sessionRef.providerSessionId;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (!isRecoverableResumeError(msg)) {
          this.resumeActiveStatusSuppressionUntil.delete(sessionRef.providerSessionId);
          throw error;
        }
        this.resumeActiveStatusSuppressionUntil.delete(sessionRef.providerSessionId);
        console.log("[codex] thread/resume failed (%s), falling back to thread/start", msg);
        const result = await this.rpc.request("thread/start", threadOverrides);
        threadId = extractThreadField(result, "id") ?? "";
        if (!threadId) {
          throw new Error("thread/start fallback response did not contain a thread id.", {
            cause: error,
          });
        }
        createdNewThread = true;
        this.extractRolloutMeta(result);
      }
    } else {
      const result = await this.rpc.request("thread/start", threadOverrides);
      threadId = extractThreadField(result, "id") ?? "";
      if (!threadId) {
        throw new Error("thread/start response did not contain a thread id.");
      }
      createdNewThread = true;
      this.extractRolloutMeta(result);
    }

    this.remoteThreadId = threadId;
    this.rpc.claimThread(threadId);
    this.ensureMapperState().usageScope = new CodexUsageScopeTracker(threadId, createdNewThread);
    this.launchOptions = { ...this.launchOptions, resumeThreadId: threadId };
    if (!createdNewThread) {
      try {
        const { goal } = await this.rpc.request("thread/goal/get", { threadId });
        if (goal) {
          this.emitRuntimeEvents(
            mapCodexNotification(
              "thread/goal/updated",
              { threadId, goal },
              this.ensureMapperState(),
              this.wslDistro,
            ),
          );
        }
      } catch (error) {
        if (!isUnsupportedCodexRequestError(error)) {
          console.warn("[codex] Failed to hydrate thread goal after resume:", error);
        }
      }
    }
    if (sessionRef) {
      void this.syncRemoteThreadState(threadId, toSessionRef(threadId));
    }

    return threadId;
  }

  private extractRolloutMeta(result: unknown): void {
    const thread =
      result && typeof result === "object" && "thread" in result
        ? ((result as Record<string, unknown>).thread as Record<string, unknown> | undefined)
        : undefined;
    const rawPath = extractThreadField(result, "path") ?? undefined;
    this.rolloutPath = rawPath && this.wslDistro ? toWslUncPath(this.wslDistro, rawPath) : rawPath;
    this.rolloutCreatedAt =
      thread && typeof thread.createdAt === "number"
        ? new Date(thread.createdAt * 1000).toISOString()
        : new Date().toISOString();
    this.rolloutCwd = typeof thread?.cwd === "string" ? thread.cwd : undefined;
    this.rolloutCliVersion = typeof thread?.cliVersion === "string" ? thread.cliVersion : undefined;
    this.rolloutSource =
      thread && typeof thread.source === "object" && thread.source !== null
        ? (thread.source as Record<string, unknown>)
        : undefined;
    this.rolloutModelProvider =
      typeof thread?.modelProvider === "string" ? thread.modelProvider : undefined;
  }

  async waitForRolloutFile(timeoutMs = 10_000): Promise<void> {
    if (!this.rolloutPath) {
      return;
    }
    const { existsSync } = await import("node:fs");
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (existsSync(this.rolloutPath)) {
        return;
      }
      await sleep(200);
    }
  }

  async ensureResumeArtifacts(): Promise<void> {
    if (!this.rolloutPath || !this.remoteThreadId) {
      return;
    }

    const { existsSync } = await import("node:fs");
    if (existsSync(this.rolloutPath)) {
      return;
    }

    await mkdir(dirname(this.rolloutPath), { recursive: true });

    const sessionMeta = JSON.stringify({
      timestamp: new Date().toISOString(),
      type: "session_meta",
      payload: {
        id: this.remoteThreadId,
        ...(this.rolloutCreatedAt ? { timestamp: this.rolloutCreatedAt } : {}),
        ...(this.rolloutCwd ? { cwd: this.rolloutCwd } : {}),
        originator: "poracode",
        ...(this.rolloutCliVersion ? { cli_version: this.rolloutCliVersion } : {}),
        ...(this.rolloutSource ? { source: this.rolloutSource } : {}),
        ...(this.rolloutModelProvider ? { model_provider: this.rolloutModelProvider } : {}),
      },
    });

    try {
      await writeFile(this.rolloutPath, `${sessionMeta}\n`, {
        encoding: "utf8",
        flag: "wx",
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
  }

  async startTurn(
    prompt: string,
    config: ThreadConfig,
    segments?: PromptSegment[],
    options?: StartTurnOptions,
  ): Promise<void> {
    this.currentConfig = config;
    // New user turn clears any sticky error from a previous failed turn, along
    // with the per-turn error dedupe state and any pending fallback timer.
    this.errorSticky = false;
    this.seenErrorMessages.clear();
    this.clearPendingSystemErrorFallback();
    const threadId = await this.waitForRemoteThreadId();
    this.ensureSubAgentRouter().setDefaultModelSettings(config.model, config.effort ?? "medium");
    this.resumeActiveStatusSuppressionUntil.delete(threadId);

    const turnId = `turn-${randomUUID()}`;
    const userItemId = options?.userMessageItemId ?? `user-${turnId}`;
    const goalCommand = parseCodexGoalCommand(prompt);

    const userEvents: RuntimeEvent[] = [
      {
        type: "item.started",
        threadId: this.threadId,
        itemId: userItemId,
        itemType: "user_message",
        payload: {
          content: buildPromptContentBlocks(prompt, segments),
        },
      },
      { type: "item.completed", threadId: this.threadId, itemId: userItemId },
    ];

    if (goalCommand) {
      const canStartModelTurn = goalCommand.kind === "set" || goalCommand.kind === "resume";
      const expectsModelTurn = canStartModelTurn && config.mode !== "plan";
      this.emitRuntimeEvents([
        { type: "turn.started", threadId: this.threadId, turnId },
        ...userEvents,
      ]);
      try {
        await this.dispatchCodexGoalCommand(threadId, goalCommand);
      } catch (error) {
        this.pendingTurnInterrupt = false;
        const message = error instanceof Error ? error.message : String(error);
        this.emitRuntimeEvents([
          { type: "error", threadId: this.threadId, message },
          { type: "turn.completed", threadId: this.threadId, turnId, state: "completed" },
        ]);
        this.emitUpdate({ status: "idle", attention: "none" });
        return;
      }
      if (expectsModelTurn || (canStartModelTurn && this.activeTurnId)) {
        return;
      }
      this.pendingTurnInterrupt = false;
      this.emitRuntimeEvents([
        { type: "turn.completed", threadId: this.threadId, turnId, state: "completed" },
      ]);
      this.emitUpdate({ status: "idle", attention: "none" });
      return;
    }

    this.emitRuntimeEvents(userEvents);

    this.currentThreadStatus = { type: "active", activeFlags: [] };
    this.emitUpdate({ status: "working", attention: "working" });

    const input = buildCodexTurnInput(prompt, segments, options?.inlineInstructions);
    const sandboxPolicy = toCodexSandboxPolicy(config.sandboxMode);
    const collaborationMode = buildCodexCollaborationMode(config);
    try {
      const result = await this.rpc.request("turn/start", {
        threadId,
        input,
        model: config.model,
        ...(config.effort ? { effort: config.effort } : {}),
        summary: "auto",
        ...(config.approvalPolicy
          ? {
              approvalPolicy: config.approvalPolicy as NonNullable<
                TurnStartParams["approvalPolicy"]
              >,
            }
          : {}),
        ...(config.approvalsReviewer
          ? {
              approvalsReviewer: config.approvalsReviewer as NonNullable<
                TurnStartParams["approvalsReviewer"]
              >,
            }
          : {}),
        ...(sandboxPolicy
          ? { sandboxPolicy: sandboxPolicy as NonNullable<TurnStartParams["sandboxPolicy"]> }
          : {}),
        collaborationMode,
        // Fast toggle is authoritative and the server tier is sticky, so force it
        // every turn: "fast" selects the Fast lane, null clears it to the default.
        serviceTier: config.fast === true ? "fast" : null,
      });
      this.activeTurnId = extractTurnField(result, "id");
      if (this.pendingTurnInterrupt && this.activeTurnId) {
        this.pendingTurnInterrupt = false;
        await this.rpc.request("turn/interrupt", {
          threadId,
          turnId: this.activeTurnId,
        });
      }
    } catch (error) {
      this.pendingTurnInterrupt = false;
      if (this.isDisposed) return;
      const message = error instanceof Error ? error.message : String(error);
      this.errorSticky = true;
      this.emitUpdate({ status: "error", attention: "error", errorMessage: message });
      this.emitRuntimeEvents([{ type: "error", threadId: this.threadId, message }]);
      throw error;
    }
  }

  async interruptTurn(): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    const threadId = await this.waitForRemoteThreadId();
    if (!this.activeTurnId) {
      this.pendingTurnInterrupt = true;
      return;
    }

    await this.rpc.request("turn/interrupt", {
      threadId,
      turnId: this.activeTurnId,
    });
  }

  async rollbackThread(numTurns: number, config?: ThreadConfig): Promise<ThreadHistory> {
    if (!Number.isInteger(numTurns) || numTurns <= 0) {
      throw new Error(`rollbackThread: numTurns must be a positive integer (got ${numTurns}).`);
    }
    const threadId = await this.waitForRemoteThreadId();
    this.forkNotificationBuffer = undefined;

    const rollbackLegacy = async (reason: string): Promise<ThreadHistory> => {
      this.forkNotificationBuffer = undefined;
      console.log(`[codex] ${reason}; falling back to thread/rollback.`);
      try {
        await this.rpc.request("thread/rollback", {
          threadId,
          numTurns,
        });
      } catch (error) {
        if (isUnsupportedCodexRequestError(error)) {
          throw new Error(
            "Codex cannot roll back this thread because neither thread/fork nor thread/rollback is supported.",
            { cause: error },
          );
        }
        throw error;
      }
      this.pendingTurnInterrupt = false;
      this.activeTurnId = undefined;
      await this.syncRemoteThreadState(threadId, toSessionRef(threadId));
      return {
        providerSessionId: threadId,
        messages: [],
      };
    };

    const readResult = await this.rpc.request("thread/read", {
      threadId,
      includeTurns: true,
    });
    const turns = readResult.thread?.turns;
    if (!Array.isArray(turns)) {
      return rollbackLegacy("thread/read omitted turn history");
    }
    if (turns.length <= numTurns) {
      return rollbackLegacy("thread/fork has no retained turn");
    }

    const retainedTurn = turns.at(turns.length - numTurns - 1);
    if (!retainedTurn || typeof retainedTurn.id !== "string") {
      return rollbackLegacy("thread/read omitted the retained turn id");
    }

    let forkResult: CodexClientRequestMap["thread/fork"]["result"];
    const rollbackConfig = config ?? this.currentConfig;
    if (!rollbackConfig) {
      throw new Error("Cannot roll back a Codex thread before its configuration is initialized.");
    }
    this.currentConfig = rollbackConfig;
    const threadOverrides = buildCodexThreadOverrides(rollbackConfig, {
      projectLocation: this.projectLocation,
      mcpServers: this.mcpServers,
    });
    this.forkNotificationBuffer = [];
    try {
      forkResult = await this.rpc.request("thread/fork", {
        ...threadOverrides,
        threadId,
        lastTurnId: retainedTurn.id,
      });
    } catch (error) {
      this.forkNotificationBuffer = undefined;
      if (!isUnsupportedCodexRequestError(error)) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      return rollbackLegacy(`thread/fork is unsupported (${message})`);
    }

    const newThreadId = forkResult.thread?.id;
    if (!newThreadId) {
      this.forkNotificationBuffer = undefined;
      throw new Error("thread/fork response did not contain a thread id.");
    }

    this.remoteThreadId = newThreadId;
    this.rpc.claimThread(newThreadId);
    this.launchOptions = { ...this.launchOptions, resumeThreadId: newThreadId };
    // The fork created a NEW provider thread carrying inherited history: bump
    // the usage scope epoch so the first sample on it is a baseline, and do it
    // BEFORE replaying buffered notifications so their samples land in the new
    // scope.
    this.mapperState?.usageScope?.replaceScope(newThreadId);
    this.replayForkNotifications(newThreadId);
    await this.rpc
      .request("thread/unsubscribe", { threadId }, CODEX_DISPOSE_INTERRUPT_TIMEOUT_MS)
      .catch((error) => {
        console.log("[codex] failed to unsubscribe old thread after fork:", error);
      });
    this.pendingTurnInterrupt = false;
    this.activeTurnId = undefined;
    await this.syncRemoteThreadState(newThreadId, toSessionRef(newThreadId));
    return {
      providerSessionId: newThreadId,
      messages: [],
    };
  }

  async resolveServerRequest(requestId: ThreadServerRequestId, response: unknown): Promise<void> {
    this.rpc.resolveServerRequest(requestId, response);
  }

  ownsProviderSession(providerSessionId: string): boolean {
    return this.rpc.ownsThread(providerSessionId);
  }

  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;

    this.clearPendingSystemErrorFallback();
    if (this.remoteThreadId) {
      if (this.activeTurnId) {
        await this.rpc
          .request(
            "turn/interrupt",
            {
              threadId: this.remoteThreadId,
              turnId: this.activeTurnId,
            },
            CODEX_DISPOSE_INTERRUPT_TIMEOUT_MS,
          )
          .catch(() => undefined);
      }
      // Re-check ownership *after* the interrupt round-trip: a force-stopped
      // session is replaced while this teardown drains, and the replacement
      // resubscribes to the same provider thread on the shared app-server.
      // Unsubscribing then would silence the live session's notifications and
      // strand it on "working" with no output.
      if (this.rpc.ownsThread(this.remoteThreadId)) {
        await this.rpc
          .request(
            "thread/unsubscribe",
            { threadId: this.remoteThreadId },
            CODEX_DISPOSE_INTERRUPT_TIMEOUT_MS,
          )
          .catch(() => undefined);
      }
    }
    this.rpc.dispose(new Error("Codex app-server session disposed."));
    this.releaseAppServer();
  }

  private attachRpcHandlers(): void {
    this.rpc.setListener({
      onNotification: (method, params) => this.handleNotification(method, params),
      onRuntimeEvents: (events) => this.emitRuntimeEvents(events),
      onClose: () => {
        if (!this.isDisposed) {
          this.listener?.onClose();
        }
      },
      onError: () => {
        if (!this.isDisposed) {
          this.listener?.onError("Codex app-server connection failed.");
        }
      },
      onDebug: (direction, payload) => this.logCodexEventDebug(direction, payload),
    });
  }

  private handleNotification(method: string, params: Record<string, unknown> | undefined): void {
    if (method === "skills/changed") {
      void this.refreshSkillSlashCommands(true).catch((error) => {
        if (!this.isDisposed) console.warn("[codex] failed to refresh skills after change:", error);
      });
      return;
    }
    const notificationThreadId = readNotificationThreadId(params, this.remoteThreadId);
    if (
      this.forkNotificationBuffer &&
      notificationThreadId &&
      this.remoteThreadId !== undefined &&
      notificationThreadId !== this.remoteThreadId
    ) {
      if (this.forkNotificationBuffer.length < CODEX_FORK_NOTIFICATION_BUFFER_LIMIT) {
        this.forkNotificationBuffer.push({ method, params, threadId: notificationThreadId });
      }
      return;
    }
    const suppressResumeReplay = this.isResumeReplaySuppressed(notificationThreadId);
    const childEvents = this.ensureSubAgentRouter().routeChildNotification(
      method,
      params,
      this.remoteThreadId,
    );
    if (childEvents !== undefined) {
      if (childEvents.length > 0) this.emitRuntimeEvents(childEvents);
      return;
    }
    if (
      notificationThreadId &&
      this.remoteThreadId !== undefined &&
      notificationThreadId !== this.remoteThreadId
    ) {
      return;
    }

    // Translate to canonical chat events for chat-mode renderers. Runs
    // alongside the existing status-derivation logic below — terminal mode
    // is unaffected.
    const mappedRuntimeEvents = suppressResumeReplay
      ? []
      : mapCodexNotification(method, params, this.ensureMapperState(), this.wslDistro);
    const runtimeEvents = this.ensureSubAgentRouter().observeMainNotification(
      method,
      params,
      mappedRuntimeEvents,
    );
    if (runtimeEvents.length > 0) this.emitRuntimeEvents(runtimeEvents);

    if (method === "thread/started" && params && "thread" in params) {
      const thread = params.thread;
      if (!thread || typeof thread !== "object" || !("id" in thread)) {
        return;
      }

      const threadId = String(thread.id);

      // Ignore thread/started for threads we didn't create (e.g. the TUI's own thread).
      if (this.remoteThreadId !== undefined && this.remoteThreadId !== threadId) {
        return;
      }

      this.remoteThreadId = threadId;
      const nextSessionRef = toSessionRef(threadId);
      const nextStatus: CodexThreadStatus =
        "status" in thread && thread.status && typeof thread.status === "object"
          ? (thread.status as CodexThreadStatus)
          : { type: "idle" };
      if (this.shouldSuppressResumeActiveStatus(threadId, nextStatus)) {
        return;
      }
      this.currentThreadStatus = nextStatus;
      if (nextStatus.type !== "idle") {
        this.emitDerivedUpdate(nextSessionRef);
      }
      return;
    }

    if (
      method === "thread/status/changed" &&
      params &&
      "threadId" in params &&
      "status" in params
    ) {
      if (!this.isCurrentThreadNotification(String(params.threadId))) {
        return;
      }
      const nextStatus = params.status as CodexThreadStatus;
      // A systemError status alone gives the renderer a red icon but no
      // message. If Codex didn't already send a paired `error`
      // notification or a turn/start rejection (which set `errorSticky`),
      // surface a fallback runtime error event so `ThreadErrorDock`
      // renders something instead of leaving the user with an empty dock.
      // The fallback is *deferred* (not emitted synchronously) so a
      // specific error Codex sends moments later — e.g. a usage-limit
      // "remote compact task" failure — can preempt the generic notice.
      // Set `errorSticky` *after* `emitDerivedUpdate` so the derived
      // `onUpdate` call still fires — `emitDerivedUpdate` short-circuits
      // when `errorSticky` is already true.
      const shouldFallbackEmit =
        nextStatus.type === "systemError" &&
        this.currentThreadStatus.type !== "systemError" &&
        !this.errorSticky;
      if (this.shouldSuppressResumeActiveStatus(String(params.threadId), nextStatus)) {
        return;
      }
      this.currentThreadStatus = nextStatus;
      this.emitDerivedUpdate();
      if (shouldFallbackEmit) {
        this.errorSticky = true;
        this.scheduleSystemErrorFallback(extractCodexStatusErrorMessage(params.status));
      }
      return;
    }

    if (method === "turn/started" && params) {
      if (suppressResumeReplay) {
        return;
      }
      const incomingThreadId = "threadId" in params ? String(params.threadId) : this.remoteThreadId;
      if (incomingThreadId && !this.isCurrentThreadNotification(incomingThreadId)) {
        return;
      }

      this.activeTurnId =
        extractTurnField(params, "id") ??
        (typeof params.turnId === "string" ? params.turnId : this.activeTurnId);
      this.currentThreadStatus = { type: "active", activeFlags: [] };
      this.emitUpdate({
        status: "working",
        attention: "working",
      });
      return;
    }

    // `turn/aborted` is retained only for older app-server compatibility.
    if (method === "turn/completed" || method === "turn/aborted") {
      if (suppressResumeReplay) {
        return;
      }
      const incomingThreadId = readNotificationThreadId(params, this.remoteThreadId);
      if (!incomingThreadId) return;
      if (!this.isCurrentThreadNotification(incomingThreadId)) {
        return;
      }

      this.pendingTurnInterrupt = false;
      this.activeTurnId = undefined;
      this.currentThreadStatus = { type: "idle" };
      if (!this.errorSticky) {
        this.emitUpdate({ status: "idle", attention: "none" });
      }
      return;
    }

    if (method === "account/rateLimits/updated" && params && "rateLimits" in params) {
      return;
    }

    if (method === "thread/closed") {
      this.listener?.onClose();
    }
  }

  private async initialize(): Promise<void> {
    // Cold start runs through an interactive login shell + Rust binary load +
    // first-launch Gatekeeper checks on macOS, which can exceed the default
    // 5s timeout. The probe path uses 12s for the same handshake.
    const initResult = await this.rpc.request(
      "initialize",
      {
        clientInfo: {
          name: "poracode",
          version: "0.1.0",
        },
        capabilities: {
          experimentalApi: true,
          requestAttestation: false,
        },
      },
      30_000,
    );

    this.currentBaseSlashCommands = mapCodexSlashCommands(readCodexInitCommands(initResult));
    this.rebuildSlashCommands();

    this.rpc.notify("initialized");
    try {
      await this.refreshSkillSlashCommands(false);
    } catch (error) {
      console.warn("[codex] skills/list failed:", error);
    }
  }

  private isCurrentThreadNotification(threadId: string): boolean {
    return this.remoteThreadId === undefined || this.remoteThreadId === threadId;
  }

  private replayForkNotifications(threadId: string): void {
    const notifications = this.forkNotificationBuffer ?? [];
    this.forkNotificationBuffer = undefined;
    for (const notification of notifications) {
      // tokenUsage samples are scope-keyed (the mapper resolves scopeId from
      // the notification's own scope tracker), so replay them even when they
      // were captured mid-fork for another thread (e.g. a child subagent
      // thread) — dropping them would punch a gap in that scope's counter.
      if (
        notification.threadId === threadId ||
        notification.method === "thread/tokenUsage/updated"
      ) {
        this.handleNotification(notification.method, notification.params);
      }
    }
  }

  private async waitForRemoteThreadId(): Promise<string> {
    for (let attempt = 0; attempt < 400; attempt += 1) {
      if (this.remoteThreadId) {
        return this.remoteThreadId;
      }
      await sleep(50);
    }

    throw new Error("Codex remote thread is not ready yet.");
  }

  private emitDerivedUpdate(sessionRef?: SessionRef): void {
    if (this.errorSticky) {
      // Preserve error status until the user starts a new turn. Still forward
      // sessionRef updates if present so resume metadata is not lost.
      if (sessionRef) {
        this.emitUpdate({ status: "error", attention: "error", sessionRef });
      }
      return;
    }
    const next = deriveCodexStructuredState(this.currentThreadStatus);
    this.emitUpdate({
      status: next.status,
      attention: next.attention,
      ...(sessionRef ? { sessionRef } : {}),
    });
  }

  private async syncRemoteThreadState(threadId: string, sessionRef?: SessionRef): Promise<void> {
    let confirmedStatus: CodexThreadStatus | undefined;
    try {
      const result = await this.rpc.request("thread/read", {
        threadId,
        includeTurns: false,
      });

      if (!result || typeof result !== "object" || !("thread" in result)) {
        return;
      }

      const thread = result.thread;
      if (!thread || typeof thread !== "object") {
        return;
      }

      if ("status" in thread && thread.status && typeof thread.status === "object") {
        confirmedStatus = thread.status as CodexThreadStatus;
        this.currentThreadStatus = confirmedStatus;
      }
      this.emitDerivedUpdate(sessionRef);
    } catch {
      // Ignore best-effort sync failures and continue using notifications.
    } finally {
      this.settleResumeActiveStatusSuppression(threadId, confirmedStatus);
    }
  }

  private emitUpdate(update: StructuredSessionUpdate): void {
    this.logCodexEventDebug("poracode:update", update);
    this.listener?.onUpdate(update);
  }

  private logCodexEventDebug(direction: CodexEventDebugDirection, payload: unknown): void {
    if (!isCodexEventDebugEnabled()) {
      return;
    }
    const remote = this.remoteThreadId ? ` remoteThreadId=${this.remoteThreadId}` : "";
    console.log(
      `[codex-events] ${new Date().toISOString()} ${direction} localThreadId=${this.threadId}${remote} ${stringifyCodexEventDebugPayload(payload)}`,
    );
  }
}
