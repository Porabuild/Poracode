import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  areAgentSlashCommandsEqual,
  type AgentSlashCommand,
  type PromptSegment,
  type RuntimeEvent,
  type SessionRef,
  type ThreadConfig,
  type ThreadServerRequestId,
} from "@/shared/contracts";
import { buildPromptContentBlocks } from "@/shared/promptContent";
import { terminateChildProcessTree } from "@/shared/processTree";
import { toWslUncPath } from "@/shared/wsl";
import { resolveNodeForDistro } from "../../wsl/runtime";
import {
  createKnownSessionRef,
  type AgentLaunchOptions,
  type CommandSpec,
  type CreateStructuredSessionInput,
  type StartTurnOptions,
  type StructuredSessionHandle,
  type StructuredSessionListener,
  type ThreadHistory,
} from "../base";
import { buildCodexAppServerCommand } from "./argv";
import {
  createCodexMapperState,
  mapCodexNotification,
  mapCodexServerRequest,
  translateCodexCanonicalResponse,
  type CodexMapperState,
} from "./canonicalMapping";
import {
  deriveCodexStructuredState,
  extractCodexStatusErrorMessage,
  extractThreadField,
  extractTurnField,
  isRecoverableResumeError,
  parseCodexSocketMessage,
  toCodexSandboxPolicy,
  type CodexThreadStatus,
} from "./acpProtocol";
import { buildCodexQuestionAnswerEvents } from "./acpQuestionAnswer";
import {
  buildCodexCollaborationMode,
  buildCodexTurnInput,
  parseCodexGoalCommand,
  type CodexGoalCommand,
} from "./acpTurn";
import { CodexStdioTransport } from "./stdioTransport";
import { mapCodexSlashCommands, readCodexInitCommands } from "./probe";

export { deriveCodexStructuredState, parseCodexSocketMessage } from "./acpProtocol";
export type { CodexThreadStatus } from "./acpProtocol";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function spawnAppServer(command: CommandSpec): ChildProcess {
  return spawn(command.command, command.args, {
    cwd: command.cwd ?? process.cwd(),
    env: {
      ...process.env,
      ...command.env,
      TERM: "xterm-256color",
    },
    stdio: ["pipe", "pipe", "pipe"],
    shell: false,
    windowsHide: true,
  });
}

function toSessionRef(threadId: string): SessionRef {
  return createKnownSessionRef(threadId);
}

// ── Structured Session ──────────────────────────────────────────
//
// Lifecycle for a new thread:
//   1. create()       → spawn app-server and attach stdio JSON-RPC
//   2. activate()     → initialize handshake with the server
//   3. openThread()   → thread/start on the server, get Codex thread ID
//   4. startTurn()    → fire turns through the structured server
//
// Lifecycle for resuming a saved thread:
//   1. create()       → spawn app-server and attach stdio JSON-RPC
//   2. activate()     → initialize handshake
//   3. openThread()   → thread/resume with saved session ID

// eslint-disable-next-line no-unused-vars -- planned: structured SDK session support
export class CodexStructuredSession implements StructuredSessionHandle {
  launchOptions: AgentLaunchOptions;

  private readonly appServer: ChildProcess;
  private readonly transport: CodexStdioTransport;
  private readonly threadId: string;
  private listener: StructuredSessionListener | undefined;
  private isDisposed = false;
  private activated = false;
  private requestSequence = 0;
  private remoteThreadId: string | undefined;
  private rolloutPath: string | undefined;
  private rolloutCreatedAt: string | undefined;
  private rolloutCwd: string | undefined;
  private rolloutCliVersion: string | undefined;
  private rolloutSource: Record<string, unknown> | undefined;
  private rolloutModelProvider: string | undefined;
  private wslDistro: string | undefined;
  private currentThreadStatus: CodexThreadStatus = { type: "idle" };
  private activeTurnId: string | undefined;
  private currentSlashCommands: AgentSlashCommand[] | undefined;
  private pendingTurnInterrupt = false;
  // Sticky-error gate: once a turn fails, derived status updates from
  // `thread/status/changed` (which Codex emits as `idle` after an aborted
  // turn) must not overwrite the error state. Cleared on the next user turn.
  private errorSticky = false;
  private mapperState: CodexMapperState | undefined;
  /**
   * Runtime events emitted before the listener was wired. Replayed on
   * `setListener` — same race as `AcpStructuredSession`.
   */
  private bufferedRuntimeEvents: RuntimeEvent[] = [];
  private readonly pendingRequests = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (reason?: unknown) => void;
      timeout: NodeJS.Timeout;
    }
  >();
  /**
   * Inbound JSON-RPC requests the app-server is waiting on us to answer.
   * The canonical request panel resolves with `{ optionId }`; we need the
   * original method + params to translate that back into the Codex-native
   * result shape in {@link resolveServerRequest}.
   */
  private readonly inboundRequests = new Map<
    string,
    { id: string | number; method: string; params: Record<string, unknown> | undefined }
  >();

  private constructor(
    appServer: ChildProcess,
    transport: CodexStdioTransport,
    threadId: string,
    wslDistro?: string,
  ) {
    this.appServer = appServer;
    this.transport = transport;
    this.threadId = threadId;
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

  private emitRuntimeEvents(events: RuntimeEvent[]): void {
    if (events.length === 0) return;
    if (!this.listener?.onRuntimeEvent) {
      this.bufferedRuntimeEvents.push(...events);
      return;
    }
    for (const event of events) {
      this.listener.onRuntimeEvent(event);
    }
  }

  private async dispatchCodexGoalCommand(
    threadId: string,
    command: CodexGoalCommand,
  ): Promise<void> {
    switch (command.kind) {
      case "set":
        await this.request("thread/goal/set", {
          threadId,
          objective: command.objective,
          status: "active",
        });
        return;
      case "clear":
        await this.request("thread/goal/clear", { threadId });
        return;
      case "pause":
        await this.request("thread/goal/set", { threadId, status: "paused" });
        return;
      case "resume":
        await this.request("thread/goal/set", { threadId, status: "active" });
        return;
      case "view":
        // The active goal item is already in the chat via `thread/goal/updated`
        // notifications. `/goal` alone is acknowledged with the user_message
        // and a settled idle status — no RPC is required.
        return;
    }
  }

  private updateSlashCommands(commands: AgentSlashCommand[]): void {
    if (areAgentSlashCommandsEqual(this.currentSlashCommands, commands)) {
      return;
    }
    this.currentSlashCommands = commands;
    this.listener?.onUpdate({
      ...deriveCodexStructuredState(this.currentThreadStatus),
      ...(this.remoteThreadId ? { sessionRef: toSessionRef(this.remoteThreadId) } : {}),
      slashCommands: commands,
    });
  }

  static async create(
    input: CreateStructuredSessionInput,
    wslExecPath?: string,
  ): Promise<CodexStructuredSession> {
    const wslNodePath =
      input.projectLocation.kind === "wsl"
        ? (await resolveNodeForDistro(input.projectLocation.distro)).nodePath
        : undefined;
    const appServer = spawnAppServer(
      buildCodexAppServerCommand(input.projectLocation, {
        ...(wslExecPath !== undefined ? { wslExecPath } : {}),
        ...(wslNodePath !== undefined ? { wslNodePath } : {}),
        browserMcpEnabled: input.config.browserMcp === true,
        ...(input.browserMcp !== undefined ? { browserMcp: input.browserMcp } : {}),
      }),
    );
    const transport = new CodexStdioTransport(appServer);

    const spawnError = await new Promise<Error | undefined>((resolve) => {
      appServer.once("error", (error) => resolve(error));
      setImmediate(() => resolve(undefined));
    });
    if (spawnError) {
      throw new Error(`Codex app-server failed to spawn: ${spawnError.message}`);
    }
    if (appServer.exitCode !== null) {
      throw new Error(`Codex app-server exited early.${transport.formatOutput()}`);
    }

    const wslDistro =
      input.projectLocation.kind === "wsl" ? input.projectLocation.distro : undefined;
    const session = new CodexStructuredSession(appServer, transport, input.threadId, wslDistro);
    session.attachTransportHandlers();

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

    // Re-emit current state so the listener doesn't miss updates that
    // fired before the listener was attached.
    if (this.activated && this.remoteThreadId) {
      const sessionRef = toSessionRef(this.remoteThreadId);
      listener.onUpdate({
        ...deriveCodexStructuredState(this.currentThreadStatus),
        sessionRef,
        ...(this.currentSlashCommands !== undefined
          ? { slashCommands: this.currentSlashCommands }
          : {}),
      });
    } else if (this.currentSlashCommands !== undefined) {
      listener.onUpdate({
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
    const threadOverrides = {
      model: config.model,
      ...(config.approvalPolicy ? { approvalPolicy: config.approvalPolicy } : {}),
      ...(config.sandboxMode ? { sandbox: config.sandboxMode } : {}),
      config: {
        ...(config.effort ? { model_reasoning_effort: config.effort } : {}),
        model_reasoning_summary: "auto",
      },
    };

    const startParams = {
      ...threadOverrides,
      experimentalRawEvents: false,
      persistExtendedHistory: true,
    };

    let threadId: string;

    if (sessionRef) {
      try {
        await this.request("thread/resume", {
          ...threadOverrides,
          threadId: sessionRef.providerSessionId,
          persistExtendedHistory: true,
        });
        threadId = sessionRef.providerSessionId;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (!isRecoverableResumeError(msg)) {
          throw error;
        }
        console.log("[codex] thread/resume failed (%s), falling back to thread/start", msg);
        const result = await this.request("thread/start", startParams);
        threadId = extractThreadField(result, "id") ?? "";
        if (!threadId) {
          throw new Error("thread/start fallback response did not contain a thread id.", {
            cause: error,
          });
        }
        this.extractRolloutMeta(result);
      }
    } else {
      const result = await this.request("thread/start", startParams);
      threadId = extractThreadField(result, "id") ?? "";
      if (!threadId) {
        throw new Error("thread/start response did not contain a thread id.");
      }
      this.extractRolloutMeta(result);
    }

    this.remoteThreadId = threadId;
    this.launchOptions = { ...this.launchOptions, resumeThreadId: threadId };

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
        originator: "lightcode",
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
    // New user turn clears any sticky error from a previous failed turn.
    this.errorSticky = false;
    const threadId = await this.waitForRemoteThreadId();

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
      this.emitRuntimeEvents([
        { type: "turn.started", threadId: this.threadId, turnId },
        ...userEvents,
      ]);
      try {
        await this.dispatchCodexGoalCommand(threadId, goalCommand);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.emitRuntimeEvents([
          { type: "error", threadId: this.threadId, message },
          { type: "turn.completed", threadId: this.threadId, turnId, state: "completed" },
        ]);
        this.listener?.onUpdate({ status: "idle", attention: "none" });
        return;
      }
      this.emitRuntimeEvents([
        { type: "turn.completed", threadId: this.threadId, turnId, state: "completed" },
      ]);
      this.listener?.onUpdate({ status: "idle", attention: "none" });
      return;
    }

    this.emitRuntimeEvents(userEvents);

    this.listener?.onUpdate({ status: "working", attention: "working" });

    const input = buildCodexTurnInput(prompt, segments);
    const sandboxPolicy = toCodexSandboxPolicy(config.sandboxMode);
    const collaborationMode = buildCodexCollaborationMode(config);
    try {
      const result = await this.request("turn/start", {
        threadId,
        input,
        model: config.model,
        ...(config.effort ? { effort: config.effort } : {}),
        summary: "auto",
        ...(config.approvalPolicy ? { approvalPolicy: config.approvalPolicy } : {}),
        ...(sandboxPolicy ? { sandboxPolicy } : {}),
        collaborationMode,
        // Fast toggle is authoritative and the server tier is sticky, so force it
        // every turn: "fast" selects the Fast lane, null clears it to the default.
        serviceTier: config.fast === true ? "fast" : null,
      });
      this.activeTurnId = extractTurnField(result, "id");
      if (this.pendingTurnInterrupt && this.activeTurnId) {
        this.pendingTurnInterrupt = false;
        await this.request("turn/interrupt", {
          threadId,
          turnId: this.activeTurnId,
        });
      }
    } catch (error) {
      if (this.isDisposed) return;
      const message = error instanceof Error ? error.message : String(error);
      this.errorSticky = true;
      this.listener?.onUpdate({ status: "error", attention: "error", errorMessage: message });
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

    await this.request("turn/interrupt", {
      threadId,
      turnId: this.activeTurnId,
    });
  }

  async rollbackThread(numTurns: number): Promise<ThreadHistory> {
    if (!Number.isInteger(numTurns) || numTurns <= 0) {
      throw new Error(`rollbackThread: numTurns must be a positive integer (got ${numTurns}).`);
    }
    const threadId = await this.waitForRemoteThreadId();
    await this.request("thread/rollback", {
      threadId,
      numTurns,
    });
    this.pendingTurnInterrupt = false;
    this.activeTurnId = undefined;
    await this.syncRemoteThreadState(threadId, toSessionRef(threadId));
    return {
      providerSessionId: threadId,
      messages: [],
    };
  }

  async resolveServerRequest(requestId: ThreadServerRequestId, response: unknown): Promise<void> {
    const inbound = this.inboundRequests.get(String(requestId));
    this.inboundRequests.delete(String(requestId));
    const result = inbound
      ? translateCodexCanonicalResponse(inbound.method, inbound.params, response)
      : response;
    this.transport.write({
      jsonrpc: "2.0",
      id: inbound?.id ?? requestId,
      result,
    });
    if (inbound?.method === "item/tool/requestUserInput") {
      this.emitRuntimeEvents(
        buildCodexQuestionAnswerEvents({
          threadId: this.threadId,
          params: inbound.params,
          response,
        }),
      );
    }
  }

  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;

    this.transport.dispose();

    this.rejectPendingRequests(new Error("Codex app-server session disposed."));

    if (!this.appServer.killed) {
      terminateChildProcessTree(this.appServer);
    }
  }

  private attachTransportHandlers(): void {
    this.transport.setListener({
      onMessage: (payload) => {
        const message = parseCodexSocketMessage(payload);

        if (message.kind === "response") {
          const pending = this.pendingRequests.get(message.id);
          if (!pending) {
            return;
          }

          this.pendingRequests.delete(message.id);
          clearTimeout(pending.timeout);

          if (message.error !== undefined) {
            const err = message.error;
            const errMsg =
              typeof err === "object" && err !== null && "message" in err
                ? String((err as Record<string, unknown>).message)
                : String(err);
            pending.reject(new Error(errMsg));
          } else {
            pending.resolve(message.result);
          }
          return;
        }

        if (message.kind === "request") {
          const canonical = mapCodexServerRequest(
            this.threadId,
            String(message.id),
            message.method,
            message.params,
          );
          if (canonical) {
            this.inboundRequests.set(String(message.id), {
              id: message.id,
              method: message.method,
              params: message.params,
            });
            this.emitRuntimeEvents([canonical]);
          } else {
            console.warn(
              `[codex] no canonical mapping for app-server request method "${message.method}"; replying method not found.`,
            );
            this.transport.write({
              jsonrpc: "2.0",
              id: message.id,
              error: {
                code: -32601,
                message: `Unsupported Codex app-server request method "${message.method}".`,
              },
            });
          }
          return;
        }

        if (message.kind !== "notification") {
          return;
        }

        const { method, params } = message;

        // Translate to canonical chat events for chat-mode renderers. Runs
        // alongside the existing status-derivation logic below — terminal mode
        // is unaffected.
        const runtimeEvents = mapCodexNotification(method, params, this.ensureMapperState());
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
          this.currentThreadStatus =
            "status" in thread && thread.status && typeof thread.status === "object"
              ? (thread.status as CodexThreadStatus)
              : { type: "idle" };
          this.emitDerivedUpdate(nextSessionRef);
          void this.syncRemoteThreadState(threadId, nextSessionRef);
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
          // message. If Codex didn't already send a paired `thread/error`
          // notification or a turn/start rejection (which set `errorSticky`),
          // surface a fallback runtime error event so `ThreadErrorDock`
          // renders something instead of leaving the user with an empty dock.
          // Set `errorSticky` *after* `emitDerivedUpdate` so the derived
          // `onUpdate` call still fires — `emitDerivedUpdate` short-circuits
          // when `errorSticky` is already true.
          const shouldFallbackEmit =
            nextStatus.type === "systemError" &&
            this.currentThreadStatus.type !== "systemError" &&
            !this.errorSticky;
          if (shouldFallbackEmit) {
            const fallbackMessage = extractCodexStatusErrorMessage(params.status);
            this.emitRuntimeEvents([
              { type: "error", threadId: this.threadId, message: fallbackMessage },
            ]);
          }
          this.currentThreadStatus = nextStatus;
          this.emitDerivedUpdate();
          if (shouldFallbackEmit) {
            this.errorSticky = true;
          }
          return;
        }

        if (method === "turn/started" && params) {
          const incomingThreadId =
            "threadId" in params ? String(params.threadId) : this.remoteThreadId;
          if (incomingThreadId && !this.isCurrentThreadNotification(incomingThreadId)) {
            return;
          }

          this.activeTurnId =
            extractTurnField(params, "id") ??
            (typeof params.turnId === "string" ? params.turnId : this.activeTurnId);
          this.listener?.onUpdate({
            status: "working",
            attention: "working",
          });
          return;
        }

        if ((method === "turn/completed" || method === "turn/aborted") && params) {
          const incomingThreadId =
            "threadId" in params ? String(params.threadId) : this.remoteThreadId;
          if (!incomingThreadId) return;
          if (!this.isCurrentThreadNotification(incomingThreadId)) {
            return;
          }

          this.pendingTurnInterrupt = false;
          this.activeTurnId = undefined;
          void this.syncRemoteThreadState(incomingThreadId);
          return;
        }

        if (method === "account/rateLimits/updated" && params && "rateLimits" in params) {
          return;
        }

        if (method === "thread/closed") {
          this.listener?.onClose();
        }
      },
      onClose: () => {
        this.rejectPendingRequests(
          new Error(`Codex app-server exited.${this.transport.formatOutput()}`),
        );
        if (!this.isDisposed) {
          this.listener?.onClose();
        }
      },
      onError: (error) => {
        this.rejectPendingRequests(error);
        if (!this.isDisposed) {
          this.listener?.onError("Codex app-server connection failed.");
        }
      },
    });
  }

  private async initialize(): Promise<void> {
    // Cold start runs through an interactive login shell + Rust binary load +
    // first-launch Gatekeeper checks on macOS, which can exceed the default
    // 5s timeout. The probe path uses 12s for the same handshake.
    const initResult = await this.request(
      "initialize",
      {
        clientInfo: {
          name: "lightcode",
          version: "0.1.0",
        },
        capabilities: {
          experimentalApi: true,
        },
      },
      30_000,
    );

    const commands = mapCodexSlashCommands(readCodexInitCommands(initResult));
    if (commands.length > 0) {
      this.updateSlashCommands(commands);
    }

    this.transport.write({
      jsonrpc: "2.0",
      method: "initialized",
    });
  }

  private isCurrentThreadNotification(threadId: string): boolean {
    return this.remoteThreadId === undefined || this.remoteThreadId === threadId;
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
        this.listener?.onUpdate({ status: "error", attention: "error", sessionRef });
      }
      return;
    }
    const next = deriveCodexStructuredState(this.currentThreadStatus);
    this.listener?.onUpdate({
      status: next.status,
      attention: next.attention,
      ...(sessionRef ? { sessionRef } : {}),
    });
  }

  private async syncRemoteThreadState(threadId: string, sessionRef?: SessionRef): Promise<void> {
    try {
      const result = await this.request("thread/read", {
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
        this.currentThreadStatus = thread.status as CodexThreadStatus;
      }
      this.emitDerivedUpdate(sessionRef);
    } catch {
      // Ignore best-effort sync failures and continue using notifications.
    }
  }

  private request(
    method: string,
    params: Record<string, unknown>,
    timeoutMs = 30_000,
  ): Promise<unknown> {
    const id = `lightcode-${this.requestSequence++}`;

    const pending = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Timed out waiting for Codex app-server response to ${method}.`));
      }, timeoutMs);

      this.pendingRequests.set(id, {
        resolve,
        reject,
        timeout,
      });
    });

    this.transport.write({
      jsonrpc: "2.0",
      id,
      method,
      params,
    });

    return pending;
  }

  private rejectPendingRequests(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }
}
