import { createHash, randomUUID } from "node:crypto";
import type {
  ProjectLocation,
  PromptSegment,
  ResolvedMcpServer,
  RuntimeEvent,
  SessionRef,
  ThreadAttention,
  ThreadConfig,
  ThreadStatus,
} from "@/shared/contracts";
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
import { resolveSessionCwd } from "../acp/sessionPaths";
import { resolveWslHomeDirectoryAsync } from "../base/processRuntime";
import { createContextUsageEvent } from "../contextUsage";
import { buildCursorSdkMcpServers } from "../userMcp";
import {
  closeCursorSdkOpenItems,
  createCursorSdkMapperState,
  mapCursorSdkInteractionUpdate,
  mapCursorSdkMessage,
  mapCursorSdkRunResult,
  startCursorSdkTurn,
  type CursorSdkMapperState,
} from "./sdkCanonicalMapping";
import { readCursorSdkContextUsage } from "./sdkContextUsage";
import {
  buildCursorSdkModelSelection,
  type CursorSdkModel,
  type CursorSdkModelSelection,
} from "./sdkModels";
import { buildCursorSdkUserMessage } from "./sdkPrompt";
import { CursorSdkWorkerRpcError, spawnCursorSdkWorker } from "./sdkWorkerClient";
import type {
  CursorSdkWorkerAgentMessage,
  CursorSdkWorkerAgentOptions,
  CursorSdkWorkerEvent,
  CursorSdkWorkerInitializeInput,
  CursorSdkWorkerInitializeResult,
  CursorSdkWorkerProbeResult,
  CursorSdkWorkerStartInput,
  CursorSdkWorkerStartResult,
} from "./sdkWorkerProtocol";
import { CURSOR_SDK_SESSION_PREFIX, cursorSdkSessionId } from "./structuredRuntime";

interface CursorSdkWorkerHandle {
  initialize(input: CursorSdkWorkerInitializeInput): Promise<CursorSdkWorkerInitializeResult>;
  start(input: CursorSdkWorkerStartInput): Promise<CursorSdkWorkerStartResult>;
  cancel(runId?: string): Promise<unknown>;
  reload(): Promise<void>;
  listMessages(input?: { limit?: number; offset?: number }): Promise<CursorSdkWorkerAgentMessage[]>;
  listModels(apiKey?: string): Promise<CursorSdkWorkerProbeResult>;
  onEvent(listener: (event: CursorSdkWorkerEvent) => void): () => void;
  onTransportError(listener: (error: Error) => void): () => void;
  dispose(): Promise<void>;
}

interface CursorSdkWorkerSpawnInput {
  projectLocation: ProjectLocation;
  configuredPath?: string;
  env?: Record<string, string>;
}

interface CursorSdkSafetyPosture {
  autoReview: boolean;
  sandboxEnabled: boolean;
}

interface CursorSdkWorkerListeners {
  active: boolean;
  pendingTransportError?: Error;
  unsubscribeEvents(): void;
  unsubscribeTransport(): void;
}

interface CursorSdkReplacementOperation {
  cancelled: boolean;
  cancellation: Promise<void>;
  promise: Promise<void>;
  cancel(): void;
}

export interface CursorSdkSessionDependencies {
  spawnWorker(input: CursorSdkWorkerSpawnInput): Promise<CursorSdkWorkerHandle>;
  newId(): string;
}

const DEFAULT_DEPENDENCIES: CursorSdkSessionDependencies = {
  spawnWorker: async (input) => spawnCursorSdkWorker(input),
  newId: randomUUID,
};

interface ActiveTurn {
  turnId: string;
  worker?: CursorSdkWorkerHandle;
  runId?: string;
  startRequest?: Promise<CursorSdkWorkerStartResult>;
  cancelRequested: boolean;
  cancelSent: boolean;
  settled: boolean;
  completion: Promise<void>;
  resolveCompletion(): void;
}

function createActiveTurn(turnId: string): ActiveTurn {
  let resolveCompletion!: () => void;
  const completion = new Promise<void>((resolve) => {
    resolveCompletion = resolve;
  });
  return {
    turnId,
    cancelRequested: false,
    cancelSent: false,
    settled: false,
    completion,
    resolveCompletion,
  };
}

function sdkMode(config: ThreadConfig): "agent" | "plan" {
  return config.mode === "plan" ? "plan" : "agent";
}

function sdkAutoReview(config: ThreadConfig): boolean {
  return config.approvalPolicy !== "never";
}

function sdkSandboxEnabled(config: ThreadConfig): boolean {
  return config.sandboxMode !== "danger-full-access";
}

function sdkSafetyPosture(config: ThreadConfig): CursorSdkSafetyPosture {
  return {
    autoReview: sdkAutoReview(config),
    sandboxEnabled: sdkSandboxEnabled(config),
  };
}

function sameSdkSafetyPosture(
  left: CursorSdkSafetyPosture,
  right: CursorSdkSafetyPosture,
): boolean {
  return left.autoReview === right.autoReview && left.sandboxEnabled === right.sandboxEnabled;
}

function createReplacementOperation(): CursorSdkReplacementOperation {
  let resolveCancellation!: () => void;
  const cancellation = new Promise<void>((resolve) => {
    resolveCancellation = resolve;
  });
  const operation: CursorSdkReplacementOperation = {
    cancelled: false,
    cancellation,
    promise: Promise.resolve(),
    cancel: () => {
      if (operation.cancelled) return;
      operation.cancelled = true;
      resolveCancellation();
    },
  };
  return operation;
}

/**
 * Give every fresh local SDK agent a stable Cursor-shaped identity before the
 * provider creates any durable state. If Poracode or the worker exits after
 * Agent.create() but before the returned session ref is persisted, retrying
 * the same thread can safely resume this identity instead of orphaning a
 * second conversation.
 */
export function cursorSdkAgentId(threadId: string): string {
  const digest = createHash("sha256")
    .update("poracode/cursor-sdk/agent-id\0", "utf8")
    .update(threadId, "utf8")
    .digest("hex");
  const versioned = `5${digest.slice(13, 16)}`;
  const variant = ((Number.parseInt(digest[16]!, 16) & 0x3) | 0x8).toString(16);
  return `agent-${digest.slice(0, 8)}-${digest.slice(8, 12)}-${versioned}-${variant}${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function nativeAgentId(sessionRef: SessionRef | undefined): string | undefined {
  const id = sessionRef?.providerSessionId;
  if (!id) return undefined;
  return id.startsWith(CURSOR_SDK_SESSION_PREFIX) ? id.slice(CURSOR_SDK_SESSION_PREFIX.length) : id;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return typeof error === "string" && error.trim()
    ? error
    : "Cursor SDK run failed without an error message.";
}

function canResumeWithoutModelCatalog(error: unknown): boolean {
  if (!(error instanceof CursorSdkWorkerRpcError)) return true;
  return error.code !== "auth_missing" && error.code !== "auth_invalid";
}

function messageParts(message: unknown): ReadonlyArray<unknown> {
  if (!message || typeof message !== "object") return [message];
  const content = (message as { content?: unknown }).content;
  return Array.isArray(content) ? content : [message];
}

/**
 * Provider-local structured session for a user-installed `@cursor/sdk`.
 *
 * The SDK itself stays in an isolated Node worker. This class owns only
 * provider-neutral lifecycle state and the translation into Poracode's
 * canonical runtime events.
 */
export class CursorSdkSession implements StructuredSessionHandle {
  launchOptions: AgentLaunchOptions = { suppressResumeConfigOverrides: true };

  private readonly mapperState: CursorSdkMapperState;
  private listener: StructuredSessionListener | undefined;
  private worker: CursorSdkWorkerHandle | undefined;
  private workerListeners: CursorSdkWorkerListeners | undefined;
  private workerSafetyPosture: CursorSdkSafetyPosture | undefined;
  private bufferedRuntimeEvents: RuntimeEvent[] = [];
  private modelCatalog: readonly CursorSdkModel[] = [];
  private mcpServers: readonly ResolvedMcpServer[];
  private currentConfig: ThreadConfig;
  private currentStatus: ThreadStatus = "idle";
  private currentAttention: ThreadAttention = "none";
  private sessionId: string | undefined;
  private stableSessionRef: SessionRef | undefined;
  private activeTurn: ActiveTurn | undefined;
  private replacementOperation: CursorSdkReplacementOperation | undefined;
  private disposePromise: Promise<void> | undefined;
  private forceStaleRunOnNextSend = false;
  private pendingTransportError: string | undefined;
  private closeReported = false;
  private activated = false;
  private disposed = false;
  private contextUsageRefreshGeneration = 0;

  private get apiKey(): string | undefined {
    // The shared GUI session factory normally leaves `input.env` absent and
    // structured runtimes inherit the supervisor process environment. Keep an
    // explicit scoped override authoritative (notably for WSL/SSH and tests),
    // but also honor the ordinary CURSOR_API_KEY used to launch Poracode.
    // Passing it over worker RPC is required: SDK 1.0.24 can list models from
    // its ambient env while its local agent child later rejects the same key
    // unless Agent.create()/resume() receives it explicitly.
    const saved =
      typeof this.input.agentSettings?.sdkApiKey === "string"
        ? this.input.agentSettings.sdkApiKey.trim()
        : "";
    const value =
      saved || this.input.env?.CURSOR_API_KEY?.trim() || process.env.CURSOR_API_KEY?.trim();
    return value ? value : undefined;
  }

  private constructor(
    private readonly input: CreateStructuredSessionInput,
    private readonly dependencies: CursorSdkSessionDependencies,
  ) {
    this.currentConfig = input.config;
    this.mcpServers = input.mcpServers ?? [];
    this.mapperState = createCursorSdkMapperState(input.threadId);
  }

  static create(
    input: CreateStructuredSessionInput,
    dependencies: Partial<CursorSdkSessionDependencies> = {},
  ): Promise<CursorSdkSession> {
    return Promise.resolve(
      new CursorSdkSession(input, {
        ...DEFAULT_DEPENDENCIES,
        ...dependencies,
      }),
    );
  }

  setListener(listener: StructuredSessionListener): void {
    this.listener = listener;
    if (listener.onRuntimeEvent && this.bufferedRuntimeEvents.length > 0) {
      const buffered = this.bufferedRuntimeEvents;
      this.bufferedRuntimeEvents = [];
      for (const event of buffered) listener.onRuntimeEvent(event);
    }
    listener.onUpdate(this.currentUpdate());
    if (this.pendingTransportError) {
      const message = this.pendingTransportError;
      this.pendingTransportError = undefined;
      try {
        listener.onError(message);
      } finally {
        this.reportClose();
      }
    }
  }

  async activate(): Promise<void> {
    if (this.disposed) {
      throw new Error("Cursor SDK session was disposed before activation.");
    }
    if (this.activated) {
      throw new Error("Cursor SDK session is already active.");
    }
    this.activated = true;
    let worker: CursorSdkWorkerHandle | undefined;
    let listeners: CursorSdkWorkerListeners | undefined;
    try {
      worker = await this.dependencies.spawnWorker(this.workerSpawnInput());
      listeners = this.attachWorkerListeners(worker);
      if (listeners.pendingTransportError) throw listeners.pendingTransportError;
      this.worker = worker;
      this.workerListeners = listeners;
      listeners.active = true;
    } catch (error) {
      this.detachWorkerListeners(listeners);
      if (worker) await this.bestEffortDispose(worker);
      this.activated = false;
      throw error;
    }
  }

  async openThread(config: ThreadConfig, sessionRef?: SessionRef): Promise<string> {
    const worker = this.requireWorker();
    this.currentConfig = config;

    const resumeAgentId = nativeAgentId(sessionRef);
    // Catalog lookup authenticates the externally-installed SDK and gives us
    // the parameter definitions needed for lossless model selection. A
    // resumed local conversation must still be readable during a temporary
    // catalog outage; its existing model id/params remain self-describing.
    let resumeWithoutCatalog = false;
    try {
      const probe = this.apiKey ? await worker.listModels(this.apiKey) : await worker.listModels();
      this.modelCatalog = probe.models;
    } catch (error) {
      if (!resumeAgentId || !canResumeWithoutModelCatalog(error)) throw error;
      this.modelCatalog = [];
      resumeWithoutCatalog = true;
    }
    const createOptions = this.buildAgentOptions(config);
    const initializeOptions = { ...createOptions };
    // Agent.resume() already receives the durable provider identity as its
    // first argument. `AgentOptions.agentId` is a create-only recovery key;
    // forwarding Poracode's deterministic fresh-thread id on resume could
    // conflict with an older SDK agent that has a different native id.
    if (resumeAgentId) delete initializeOptions.agentId;
    // Passing a model to Agent.resume() makes the SDK perform another catalog
    // lookup. Leave it absent after the preliminary lookup failed so the SDK
    // can use the durable checkpoint's model and the thread remains readable.
    if (resumeWithoutCatalog) delete initializeOptions.model;
    const initialized = await worker.initialize({
      ...(this.apiKey ? { apiKey: this.apiKey } : {}),
      ...(resumeAgentId ? { resumeAgentId } : {}),
      createOptions: initializeOptions,
    });
    this.forceStaleRunOnNextSend =
      resumeAgentId !== undefined || initialized.recoveredExisting === true;
    this.workerSafetyPosture = sdkSafetyPosture(config);
    this.sessionId = initialized.agentId;
    this.mapperState.agentId = initialized.agentId;
    const initializedModel = initialized.model?.id ?? createOptions.model?.id;
    if (initializedModel) this.mapperState.model = initializedModel;
    const prefixedId = cursorSdkSessionId(initialized.agentId);
    this.stableSessionRef = createKnownSessionRef(prefixedId);
    this.launchOptions = {
      ...this.launchOptions,
      resumeThreadId: prefixedId,
    };
    this.emitUpdate({
      status: "idle",
      attention: "none",
      config,
      sessionRef: this.stableSessionRef,
    });
    void this.refreshContextUsage();
    return prefixedId;
  }

  async startTurn(
    prompt: string,
    config: ThreadConfig,
    segments?: PromptSegment[],
    options?: StartTurnOptions,
  ): Promise<void> {
    this.requireOpenedWorker();
    if (this.activeTurn && !this.activeTurn.settled) {
      throw new Error("Cursor SDK cannot start a second turn while one is running.");
    }

    this.currentConfig = config;
    const turn = createActiveTurn(`turn-${this.dependencies.newId()}`);
    this.activeTurn = turn;
    this.emitRuntimeEvents(
      startCursorSdkTurn(this.mapperState, turn.turnId, options?.userMessageItemId),
    );
    this.emitUpdate({ status: "working", attention: "working", config });

    try {
      const message = await buildCursorSdkUserMessage(
        prompt,
        segments,
        this.input.projectLocation,
        options?.inlineInstructions,
      );
      if (turn.settled) return;
      if (turn.cancelRequested || this.disposed) {
        this.completeTurnWithoutWorker(turn, "cancelled");
        return;
      }

      await this.rebindWorkerForSafetyPosture(config);
      if (turn.settled) return;
      if (turn.cancelRequested || this.disposed) {
        this.completeTurnWithoutWorker(turn, "cancelled");
        return;
      }

      // The SDK snapshots ambient Cursor hooks, MCP configuration, and
      // subagent definitions on its Agent handle. Refresh immediately before
      // every new turn so an already-open Poracode thread observes edits made
      // since its previous send.
      const worker = this.requireOpenedWorker();
      turn.worker = worker;
      await worker.reload();
      if (turn.settled) return;
      if (turn.cancelRequested || this.disposed) {
        this.completeTurnWithoutWorker(turn, "cancelled");
        return;
      }

      const startRequest = worker.start({
        message,
        options: this.buildSendOptions(config, turn.turnId),
      });
      turn.startRequest = startRequest;
      const started = await startRequest;
      this.forceStaleRunOnNextSend = false;
      turn.runId = started.runId;
      this.mapperState.currentRunId = started.runId;
      if (turn.settled) {
        if (turn.cancelRequested) await this.sendTurnCancel(turn);
        return;
      }
      if (this.activeTurn !== turn || this.disposed) {
        await this.sendTurnCancel(turn);
        return;
      }
      if (turn.cancelRequested) await this.sendTurnCancel(turn);
      await turn.completion;
    } catch (error) {
      if (turn.settled || this.disposed) return;
      this.failTurn(turn, errorMessage(error));
    }
  }

  async interruptTurn(): Promise<void> {
    const turn = this.activeTurn;
    if (!turn || turn.settled || this.disposed) return;
    turn.cancelRequested = true;
    if (turn.runId) {
      await this.sendTurnCancel(turn);
      return;
    }
    if (turn.startRequest) {
      try {
        const started = await turn.startRequest;
        turn.runId = started.runId;
        await this.sendTurnCancel(turn);
      } catch {
        // startTurn owns command failures and will close the canonical turn.
      }
    }
  }

  forceCompleteTurn(): void {
    const turn = this.activeTurn;
    if (!turn || turn.settled) {
      this.emitRuntimeEvents(closeCursorSdkOpenItems(this.mapperState));
      return;
    }
    turn.cancelRequested = true;
    void this.sendTurnCancel(turn);
    this.completeTurnWithoutWorker(turn, "cancelled");
  }

  async updateMcpServers(mcpServers: readonly ResolvedMcpServer[]): Promise<void> {
    this.mcpServers = mcpServers;
  }

  async readThread(): Promise<ThreadHistory> {
    const worker = this.requireOpenedWorker();
    const messages = await worker.listMessages();
    return {
      providerSessionId: cursorSdkSessionId(this.sessionId!),
      messages: messages.map((entry) => ({
        messageId: entry.uuid,
        role: entry.type,
        parts: messageParts(entry.message),
        info: entry,
      })),
    };
  }

  dispose(): Promise<void> {
    this.disposePromise ??= this.disposeOnce();
    return this.disposePromise;
  }

  private async disposeOnce(): Promise<void> {
    this.disposed = true;
    const replacementOperation = this.replacementOperation;
    replacementOperation?.cancel();
    const worker = this.worker;
    const turn = this.activeTurn;
    if (turn && !turn.settled) {
      turn.cancelRequested = true;
      if (turn.runId && turn.worker) {
        await this.sendTurnCancel(turn);
      }
      this.completeTurnWithoutWorker(turn, "cancelled");
    } else {
      this.emitRuntimeEvents(closeCursorSdkOpenItems(this.mapperState));
    }
    this.detachWorkerListeners(this.workerListeners);
    this.workerListeners = undefined;
    this.worker = undefined;
    this.workerSafetyPosture = undefined;
    const [workerDisposal] = await Promise.allSettled([
      worker ? worker.dispose() : Promise.resolve(),
      replacementOperation ? replacementOperation.promise.catch(() => {}) : Promise.resolve(),
    ]);
    this.reportClose();
    if (workerDisposal.status === "rejected") throw workerDisposal.reason;
  }

  private buildAgentOptions(config: ThreadConfig): CursorSdkWorkerAgentOptions {
    const safetyPosture = sdkSafetyPosture(config);
    return {
      model: this.modelSelection(config),
      name: `poracode/${this.input.threadId.slice(0, 8)}`,
      local: {
        cwd: resolveSessionCwd(this.input.projectLocation),
        settingSources: ["all"],
        autoReview: safetyPosture.autoReview,
        sandboxOptions: { enabled: safetyPosture.sandboxEnabled },
      },
      mcpServers: buildCursorSdkMcpServers(this.mcpServers),
      mode: sdkMode(config),
      agentId: cursorSdkAgentId(this.input.threadId),
    };
  }

  private buildSendOptions(
    config: ThreadConfig,
    idempotencyKey: string,
  ): NonNullable<CursorSdkWorkerStartInput["options"]> {
    return {
      model: this.modelSelection(config),
      mode: sdkMode(config),
      mcpServers: buildCursorSdkMcpServers(this.mcpServers),
      idempotencyKey,
      ...(this.forceStaleRunOnNextSend ? { local: { force: true } } : {}),
    };
  }

  private modelSelection(config: ThreadConfig): CursorSdkModelSelection {
    return buildCursorSdkModelSelection(config, this.modelCatalog);
  }

  private workerSpawnInput(): CursorSdkWorkerSpawnInput {
    return {
      projectLocation: this.input.projectLocation,
      ...(this.input.env ? { env: this.input.env } : {}),
    };
  }

  private async rebindWorkerForSafetyPosture(config: ThreadConfig): Promise<void> {
    const nextSafetyPosture = sdkSafetyPosture(config);
    if (
      !this.workerSafetyPosture ||
      sameSdkSafetyPosture(this.workerSafetyPosture, nextSafetyPosture)
    ) {
      return;
    }

    if (this.replacementOperation) {
      await this.replacementOperation.promise;
      return;
    }

    const operation = createReplacementOperation();
    this.replacementOperation = operation;
    operation.promise = Promise.resolve()
      .then(() => this.performSafetyPostureRebind(config, nextSafetyPosture, operation))
      .finally(() => {
        if (this.replacementOperation === operation) {
          this.replacementOperation = undefined;
        }
      });
    await operation.promise;
  }

  private async performSafetyPostureRebind(
    config: ThreadConfig,
    nextSafetyPosture: CursorSdkSafetyPosture,
    operation: CursorSdkReplacementOperation,
  ): Promise<void> {
    const previousWorker = this.requireOpenedWorker();
    const previousSessionId = this.sessionId!;
    const createOptions = { ...this.buildAgentOptions(config) };
    delete createOptions.agentId;
    let replacementWorker: CursorSdkWorkerHandle | undefined;
    let replacementListeners: CursorSdkWorkerListeners | undefined;
    let committed = false;

    try {
      replacementWorker = await this.dependencies.spawnWorker(this.workerSpawnInput());
      if (operation.cancelled || this.disposed) {
        throw new Error("Cursor SDK session was disposed while applying safety settings.");
      }
      if (this.requireOpenedWorker() !== previousWorker) {
        throw new Error("Cursor SDK worker changed while applying safety settings.");
      }
      const initialized = await Promise.race([
        replacementWorker.initialize({
          ...(this.apiKey ? { apiKey: this.apiKey } : {}),
          resumeAgentId: previousSessionId,
          createOptions,
        }),
        operation.cancellation.then(() => {
          throw new Error("Cursor SDK session was disposed while applying safety settings.");
        }),
      ]);
      if (initialized.agentId !== previousSessionId) {
        throw new Error("Cursor SDK replacement returned a different agent identity.");
      }
      if (operation.cancelled || this.disposed) {
        throw new Error("Cursor SDK session was disposed while applying safety settings.");
      }
      if (this.requireOpenedWorker() !== previousWorker || this.sessionId !== previousSessionId) {
        throw new Error("Cursor SDK worker changed while applying safety settings.");
      }
      replacementListeners = this.attachWorkerListeners(replacementWorker);
      if (replacementListeners.pendingTransportError) {
        throw replacementListeners.pendingTransportError;
      }

      const previousListeners = this.workerListeners;
      if (previousListeners) previousListeners.active = false;
      this.worker = replacementWorker;
      this.workerListeners = replacementListeners;
      replacementListeners.active = true;
      this.workerSafetyPosture = nextSafetyPosture;
      this.forceStaleRunOnNextSend = true;
      this.mapperState.agentId = initialized.agentId;
      const initializedModel = initialized.model?.id ?? createOptions.model?.id;
      if (initializedModel) this.mapperState.model = initializedModel;
      committed = true;

      this.detachWorkerListeners(previousListeners);
      await this.bestEffortDispose(previousWorker);
    } catch (error) {
      if (!committed) {
        this.detachWorkerListeners(replacementListeners);
        if (replacementWorker) await this.bestEffortDispose(replacementWorker);
      }
      throw error;
    }
  }

  private attachWorkerListeners(worker: CursorSdkWorkerHandle): CursorSdkWorkerListeners {
    const listeners: CursorSdkWorkerListeners = {
      active: false,
      unsubscribeEvents: () => {},
      unsubscribeTransport: () => {},
    };
    try {
      listeners.unsubscribeEvents = worker.onEvent((event) => {
        if (!listeners.active || this.worker !== worker) return;
        this.handleWorkerEvent(worker, event);
      });
      listeners.unsubscribeTransport = worker.onTransportError((error) => {
        if (!listeners.active) {
          listeners.pendingTransportError ??= error;
          return;
        }
        if (this.worker !== worker) return;
        this.handleWorkerTransportError(error);
      });
      return listeners;
    } catch (error) {
      this.detachWorkerListeners(listeners);
      throw error;
    }
  }

  private detachWorkerListeners(listeners: CursorSdkWorkerListeners | undefined): void {
    if (!listeners) return;
    listeners.active = false;
    listeners.unsubscribeEvents();
    listeners.unsubscribeTransport();
  }

  private async bestEffortDispose(worker: CursorSdkWorkerHandle): Promise<void> {
    try {
      await worker.dispose();
    } catch {
      // A replacement is already authoritative, or the candidate never became authoritative.
    }
  }

  private handleWorkerEvent(worker: CursorSdkWorkerHandle, event: CursorSdkWorkerEvent): void {
    const turn = this.activeTurn;
    if (!turn || turn.settled || turn.worker !== worker || this.disposed) return;
    if (this.mapperState.terminalRunIds.has(event.runId)) {
      // A normalized terminal status can precede the worker's authoritative
      // result envelope. Keep that result so the startTurn promise and shared
      // runtime state settle, but discard duplicate/stale stream content.
      if (turn.runId !== event.runId || event.type === "delta" || event.type === "message") {
        return;
      }
    }
    if (turn.runId && event.runId !== turn.runId) return;
    turn.runId = event.runId;
    this.mapperState.currentRunId = event.runId;

    if (turn.cancelRequested && !turn.cancelSent) void this.sendTurnCancel(turn);

    if (event.type === "delta") {
      this.emitRuntimeEvents(mapCursorSdkInteractionUpdate(event.update, this.mapperState));
      return;
    }
    if (event.type === "message") {
      this.emitRuntimeEvents(mapCursorSdkMessage(event.message, this.mapperState));
      return;
    }
    if (event.type === "result") {
      this.emitRuntimeEvents(mapCursorSdkRunResult(event.result, this.mapperState));
      this.settleTurn(turn, event.result.status, event.result.error?.message);
      return;
    }
    this.emitRuntimeEvents(
      mapCursorSdkRunResult(
        {
          id: event.runId,
          status: "error",
          error: {
            message: event.error.message,
            ...(event.error.code ? { code: event.error.code } : {}),
          },
        },
        this.mapperState,
      ),
    );
    this.settleTurn(turn, "error", event.error.message);
  }

  private handleWorkerTransportError(error: Error): void {
    if (this.disposed || this.pendingTransportError || this.closeReported) return;
    const message = errorMessage(error);
    const turn = this.activeTurn;
    if (turn && !turn.settled) {
      this.failTurn(turn, message);
    } else {
      this.emitUpdate({
        status: "error",
        attention: "error",
        errorMessage: message,
      });
    }
    this.detachWorkerListeners(this.workerListeners);
    this.workerListeners = undefined;
    if (this.listener) {
      try {
        this.listener.onError(message);
      } finally {
        this.reportClose();
      }
    } else {
      this.pendingTransportError = message;
    }
  }

  private settleTurn(
    turn: ActiveTurn,
    status: "finished" | "error" | "cancelled",
    failureMessage?: string,
  ): void {
    if (turn.settled) return;
    turn.settled = true;
    if (this.activeTurn === turn) this.activeTurn = undefined;
    if (status === "error") {
      this.emitUpdate({
        status: "error",
        attention: "error",
        ...(failureMessage ? { errorMessage: failureMessage } : {}),
      });
    } else {
      this.emitUpdate({ status: "idle", attention: "none" });
    }
    void this.refreshContextUsage();
    turn.resolveCompletion();
  }

  private failTurn(turn: ActiveTurn, message: string): void {
    const runId = turn.runId ?? turn.turnId;
    this.emitRuntimeEvents(
      mapCursorSdkRunResult(
        {
          id: runId,
          status: "error",
          error: { message },
        },
        this.mapperState,
      ),
    );
    this.settleTurn(turn, "error", message);
  }

  private completeTurnWithoutWorker(turn: ActiveTurn, state: "cancelled" | "failed"): void {
    if (turn.settled) return;
    const runId = turn.runId ?? turn.turnId;
    this.emitRuntimeEvents(
      mapCursorSdkRunResult(
        {
          id: runId,
          status: state === "cancelled" ? "cancelled" : "error",
          ...(state === "failed"
            ? { error: { message: "Cursor SDK turn was force-completed." } }
            : {}),
        },
        this.mapperState,
      ),
    );
    this.settleTurn(turn, state === "cancelled" ? "cancelled" : "error");
  }

  private async sendTurnCancel(turn: ActiveTurn): Promise<void> {
    const worker = turn.worker;
    if (!worker || turn.cancelSent || !turn.runId) return;
    turn.cancelSent = true;
    await this.bestEffortCancel(worker, turn.runId);
  }

  private async bestEffortCancel(worker: CursorSdkWorkerHandle, runId: string): Promise<void> {
    try {
      await worker.cancel(runId);
    } catch {
      // Result/error delivery is authoritative; cancellation is best-effort.
    }
  }

  private currentSessionRef(): SessionRef | undefined {
    if (!this.sessionId) return undefined;
    this.stableSessionRef ??= createKnownSessionRef(cursorSdkSessionId(this.sessionId));
    return this.stableSessionRef;
  }

  private reportClose(): void {
    if (this.closeReported || !this.listener) return;
    this.closeReported = true;
    this.listener.onClose();
  }

  private currentUpdate(): StructuredSessionUpdate {
    return {
      status: this.currentStatus,
      attention: this.currentAttention,
      config: this.currentConfig,
      ...(this.currentSessionRef() ? { sessionRef: this.currentSessionRef()! } : {}),
    };
  }

  private emitUpdate(update: StructuredSessionUpdate): void {
    this.currentStatus = update.status;
    this.currentAttention = update.attention;
    const sessionRef = this.currentSessionRef();
    this.listener?.onUpdate({
      ...update,
      ...(update.config ? {} : { config: this.currentConfig }),
      ...(update.sessionRef ? {} : sessionRef ? { sessionRef } : {}),
    });
  }

  private emitRuntimeEvents(events: readonly RuntimeEvent[]): void {
    if (events.length === 0) return;
    if (!this.listener?.onRuntimeEvent) {
      this.bufferedRuntimeEvents.push(...events);
      return;
    }
    for (const event of events) this.listener.onRuntimeEvent(event);
  }

  /**
   * The public SDK only reports billed per-turn spend; the context-window
   * occupancy the Cursor app displays is read best-effort from the SDK's
   * private checkpoint store. Failures leave context usage unavailable.
   */
  private async refreshContextUsage(): Promise<void> {
    const agentId = this.sessionId;
    if (!agentId || this.disposed) return;
    const generation = ++this.contextUsageRefreshGeneration;
    const cwd = resolveSessionCwd(this.input.projectLocation);
    try {
      const projectLocation = this.input.projectLocation;
      const wslDistro = projectLocation.kind === "wsl" ? projectLocation.distro : undefined;
      const wslHome = wslDistro ? await resolveWslHomeDirectoryAsync(wslDistro) : undefined;
      if (wslDistro && !wslHome) return;
      const usage = await readCursorSdkContextUsage({
        cwd,
        agentId,
        ...(wslDistro && wslHome ? { homeDir: toWslUncPath(wslDistro, wslHome) } : {}),
      });
      if (
        !usage ||
        this.disposed ||
        this.sessionId !== agentId ||
        generation !== this.contextUsageRefreshGeneration
      ) {
        return;
      }
      const event = createContextUsageEvent(this.input.threadId, {
        usedTokens: usage.usedTokens,
        ...(usage.maxTokens !== undefined ? { maxTokens: usage.maxTokens } : {}),
        ...(usage.categories.length > 0 ? { breakdown: usage.categories } : {}),
      });
      if (event) this.emitRuntimeEvents([event]);
    } catch {
      // Context usage is supplemental; the public per-turn spend stream remains authoritative.
    }
  }

  private requireWorker(): CursorSdkWorkerHandle {
    if (this.pendingTransportError) {
      throw new Error(this.pendingTransportError);
    }
    if (this.disposed || this.closeReported || !this.worker) {
      throw new Error("Cursor SDK session is not active.");
    }
    return this.worker;
  }

  private requireOpenedWorker(): CursorSdkWorkerHandle {
    const worker = this.requireWorker();
    if (!this.sessionId) {
      throw new Error("Cursor SDK session has not opened an agent.");
    }
    return worker;
  }
}

export function createCursorSdkSession(
  input: CreateStructuredSessionInput,
  dependencies?: Partial<CursorSdkSessionDependencies>,
): Promise<CursorSdkSession> {
  return CursorSdkSession.create(input, dependencies);
}
