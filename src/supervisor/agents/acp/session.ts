/**
 * ACP (Agent Client Protocol) structured session.
 *
 * Uses the official @agentclientprotocol/sdk to communicate with any
 * ACP-compatible agent CLI (e.g. `gemini --acp`) over stdio.
 *
 * Implements `StructuredSessionHandle` so the supervisor runtime drives
 * its lifecycle identically to the Codex WebSocket session — no runtime
 * changes required.
 */

import { spawn as spawnChild, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import { Readable, Writable } from "node:stream";
import {
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  RequestError,
  type Client,
  type CompleteElicitationNotification,
  type ContentBlock,
  type CreateElicitationRequest,
  type CreateElicitationResponse,
  type CreateTerminalRequest,
  type KillTerminalRequest,
  type McpCapabilities,
  type McpServer as ProtocolMcpServer,
  type PromptCapabilities,
  type ReadTextFileRequest,
  type ReadTextFileResponse,
  type ReleaseTerminalRequest,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
  type SessionCapabilities,
  type SessionUpdate,
  type TerminalOutputRequest,
  type WaitForTerminalExitRequest,
  type WriteTextFileRequest,
  type WriteTextFileResponse,
} from "@agentclientprotocol/sdk";
import type {
  AgentSlashCommand,
  ProjectLocation,
  PromptSegment,
  RuntimeEvent,
  SessionRef,
  ThreadAttention,
  ThreadConfig,
  ThreadServerRequestId,
  ThreadStatus,
  ResolvedMcpServer,
} from "@/shared/contracts";
import { areAgentSlashCommandsEqual } from "@/shared/contracts";
import { buildPromptContentBlocks } from "@/shared/promptContent";
import {
  closeOpenTurnItems,
  createAcpMapperState,
  getDetachedSubAgentToolCallIdForNotification,
  mapAcpGoalSlashCommand,
  mapAcpSessionUpdate,
  type AcpMapperState,
} from "./canonicalMapping";
import { terminateChildProcessTree } from "@/shared/processTree";
import {
  createKnownSessionRef,
  type AgentLaunchOptions,
  type AcpEmptyResponseErrorResolver,
  type CommandSpec,
  type StartTurnOptions,
  type StructuredSessionHandle,
  type StructuredSessionListener,
  type StructuredSessionUpdate,
} from "../base";
import { mapAcpSlashCommands } from "./probe";
import { AcpSessionConfigSync } from "./sessionConfigSync";

// ── Helpers ──────────────────────────────────────────────────────

import { isMissingPathError, toAcpFsRequestError } from "./sessionFsErrors";
import { AcpPlanModeToolTracker } from "./sessionPlanMode";
import {
  isAcpHomeScopeLocation,
  resolveAcpGlobalSkillFallbackHostFsPath,
  resolveAcpReadableHostFsPath,
  resolveAcpResourcePath,
  resolveAcpWritableHostFsPath,
  resolveSessionCwd,
  resolveSpawnCwd,
  sliceTextFileContent,
  toAcpResourceUri,
} from "./sessionPaths";

export {
  isAcpHomeScopeLocation,
  resolveAcpGlobalSkillFallbackHostFsPath,
  resolveAcpReadableHostFsPath,
  resolveAcpResourcePath,
  resolveAcpWritableHostFsPath,
  toAcpResourceUri,
};

import { segmentsToContentBlocks } from "./sessionContentBlocks";
import {
  filterAcpInboundNoise,
  filterAcpStdoutNonJsonLines,
  looksLikeAcpSessionNotification,
} from "./sessionStreamFilter";
import { maybeCaptureAcpUpdate } from "./sessionDiagnostics";
import { AcpTerminalManager } from "./terminalManager";
import {
  appendInterruptAckTextTail,
  createAcpPromptUsageEvent,
  createAcpPromptUsageSpentEvent,
  isAcpPromptCancellationError,
  normalizeAcpStopReason,
  resolveAcpPromptFailureMessage,
  resolveAcpPromptRpcErrorMessage,
  rewriteLoadSessionError,
  shouldEmitAcpPromptRpcErrorItem,
} from "./sessionErrors";
import { AcpSessionRequests } from "./sessionRequests";
import {
  buildAcpMcpServers,
  gateAcpMcpServers,
  resolveAcpMcpCapabilities,
  type AcpMcpCapabilities,
} from "../userMcp";

export { normalizeAcpStopReason, rewriteLoadSessionError };

/**
 * Grace period before a self-started ("orphan") turn counts as finished.
 *
 * These turns resolve no promise of ours, so silence is the only end signal we
 * get. The window only has to outlast model-latency gaps —
 * `armOrphanTurnIdleTimer` separately refuses to close while a tool call is
 * still open, which is what covers the multi-minute cases.
 */
const ORPHAN_TURN_IDLE_MS = 20_000;

/**
 * Old Droid builds reject `session/new` with JSON-RPC invalid-params or
 * internal-error when handed an HTTP MCP server. Retry only those protocol
 * compatibility failures; transport, auth, and other session-open failures
 * must remain visible instead of silently launching without requested MCPs.
 */
function isAssumedMcpCompatibilityError(error: unknown): error is RequestError {
  if (!(error instanceof RequestError) || (error.code !== -32602 && error.code !== -32603)) {
    return false;
  }
  const data = error.data as Record<string, unknown> | null | undefined;
  const evidence = [error.message, data?.message, data?.details, data?.detail, data?.field]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  if (/\bmcp(?:\s+server|servers)?\b/i.test(evidence)) return true;
  return error.code === -32603 && error.message.trim().toLowerCase() === "internal error" && !data;
}

/**
 * Whether a `session/update` that arrives with no turn of ours open is the
 * agent doing real work.
 *
 * Some ACP agents start a whole turn on their own initiative after
 * `session/prompt` has already resolved. Qwen does it to process a backgrounded
 * subagent's report: it settles our prompt and immediately opens a turn under
 * its own `notification<epoch>` prompt id, which can run for tens of minutes,
 * ask questions, and edit files. No stop reason ever follows, so the session has
 * to recognise the work from the notifications themselves.
 *
 * Empty text chunks and metadata-only updates are excluded — that trailing
 * chatter is exactly what must not reopen a turn.
 */
function isOrphanTurnActivity(update: SessionUpdate): boolean {
  switch (update.sessionUpdate) {
    case "agent_message_chunk": {
      const content = (update as { content?: ContentBlock }).content;
      return content?.type !== "text" || content.text.length > 0;
    }
    case "tool_call":
    case "tool_call_update": {
      // A tool notification that arrives already finished is a completion ping,
      // not work in progress. Qwen sends those for background tasks well after
      // a turn has ended, and they must not resurrect one.
      const status = (update as { status?: string }).status;
      return status !== "completed" && status !== "failed";
    }
    case "agent_thought_chunk":
    case "plan":
      return true;
    default:
      return false;
  }
}

// ── Session ──────────────────────────────────────────────────────

export interface AcpStructuredSessionOptions {
  /**
   * Hook the adapter passes in when it wants to control the message a failed
   * `session/load` produces. Receives the raw transport error and the
   * sessionId that was being loaded; must return the Error to throw.
   */
  loadSessionErrorRewriter?: (error: unknown, sessionId: string) => Error;
  emptyResponseErrorResolver?: AcpEmptyResponseErrorResolver;
  /**
   * Per-adapter notification preprocessor. When set, every `session/update`
   * is run through it before the shared canonical mapper consumes it. Use to
   * bridge provider-specific wire quirks; the shared mapper itself remains
   * provider-agnostic.
   */
  sessionUpdateTransform?: (notification: SessionNotification) => SessionNotification;
  /** Paint canonical state for this provider's `/goal` command family. */
  goalCommands?: boolean;
  extensionSessionUpdateTransform?: import("../base/types").AcpExtensionSessionUpdateTransform;
  /**
   * Vendor ACP extension notifications (e.g. Cursor `cursor/task`) that are
   * not surfaced as standard `session/update` messages.
   */
  extensionNotificationHandler?: import("../base/types").AcpExtensionNotificationHandler;
  mcpServers?: readonly ResolvedMcpServer[];
  /**
   * MCP transports the adapter knows this agent supports even though it
   * advertises no `mcpCapabilities` in `initialize`. Poracode's built-in MCP
   * servers (browser, Crossagents, computer use, app controls) are all HTTP,
   * so an agent that stays silent about transports would otherwise get none of
   * them. Applied only when the agent advertises nothing, and the session
   * still falls back to the strictly gated set if opening fails.
   */
  assumedMcpCapabilities?: AcpMcpCapabilities;
  /**
   * Home-relative directories (posix-style, e.g. ".kimi-code") the agent may
   * read and write through the ACP fs bridge even though they sit outside the
   * project root. For providers that keep internal session state (plan files,
   * profiles) under their own home dir and proxy all text IO to the client.
   */
  fsAgentHomeDirs?: readonly string[];
  /**
   * Advertise the `fs.readTextFile` / `fs.writeTextFile` client capabilities
   * (default `true`). Set `false` for providers that mis-handle client fs
   * errors — see `acpFsTextCapability` in the adapter contract.
   */
  fsTextCapability?: boolean;
}

export interface AcpExternalSessionUpdateSource {
  /** Return true when the source will re-ingest this notification after deferred work. */
  onSessionUpdate(notification: SessionNotification): boolean | void;
  dispose(): void;
}

export class AcpStructuredSession implements StructuredSessionHandle {
  launchOptions: AgentLaunchOptions;

  private loadSessionErrorRewriter: (error: unknown, sessionId: string) => Error =
    rewriteLoadSessionError;

  private emptyResponseErrorResolver?: AcpEmptyResponseErrorResolver;

  private sessionUpdateTransform?: (notification: SessionNotification) => SessionNotification;
  private extensionSessionUpdateTransform?: import("../base/types").AcpExtensionSessionUpdateTransform;

  private readonly goalCommands: boolean;

  private extensionNotificationHandler?: import("../base/types").AcpExtensionNotificationHandler;

  private externalSessionUpdateSources?: Set<AcpExternalSessionUpdateSource>;

  private readonly acpToolCallIdToItemId = new Map<string, string>();
  private readonly child: ChildProcess;
  private readonly connection: ClientSideConnection;
  private readonly cwd: string;
  private readonly projectLocation: ProjectLocation;
  private readonly mcpServers: readonly ResolvedMcpServer[];
  private readonly assumedMcpCapabilities: AcpMcpCapabilities | undefined;
  private readonly fsAgentHomeDirs: readonly string[];
  private readonly fsTextCapability: boolean;
  private planModeToolTrackerInstance: AcpPlanModeToolTracker | undefined;
  /** Poracode thread id (stable identifier we report in RuntimeEvents). */
  private readonly threadId: string;
  private readonly stderrChunks: string[];
  private listener: StructuredSessionListener | undefined;
  private sessionId: string | undefined;
  private isDisposed = false;
  private transportClosed = false;
  private transportOutcomeReported = false;
  private currentConfig: ThreadConfig | undefined;
  private currentSlashCommands: AgentSlashCommand[] | undefined;
  private currentStatus: ThreadStatus = "idle";
  private currentAttention: ThreadAttention = "none";
  private spawnReady: Promise<void> = Promise.resolve();
  private currentTurnId: string | undefined;
  /**
   * The foreground ACP prompt has returned `end_turn`, but one or more
   * background subagents launched by that prompt are still active. Keep the
   * original runtime turn open until their terminal updates arrive so the
   * renderer does not flash idle and manufacture extra Working/Worked turns.
   */
  private foregroundTurnAwaitingSubagents = false;
  /** Synthetic turn used while a detached subagent reports out of band. */
  private detachedTurnId: string | undefined;
  private readonly detachedTurnParentToolCallIds = new Set<string>();
  /**
   * Synthetic turn covering work the agent starts by itself, with no prompt of
   * ours in flight and no stop reason to look forward to. See
   * `isOrphanTurnActivity` for why these exist.
   */
  private orphanTurnId: string | undefined;
  private orphanTurnIdleTimer: ReturnType<typeof setTimeout> | undefined;
  private stableSessionRef: SessionRef | undefined;
  /**
   * usage.spent ledger scope: the ACP session id plus an epoch that bumps if
   * the id ever changes, and a `fresh` flag consumed by the first emitted
   * sample (true only for sessions this handle created via `session/new`).
   */
  private usageScopeId: string | undefined;
  private usageEpoch = 0;
  private usageScopeFresh = false;
  /**
   * True while a `connection.prompt()` call is in flight (between issue and
   * resolution). Used together with `pendingPromptInterrupt` to close the
   * window where `interruptTurn()` fires before the ACP runtime has actually
   * accepted the prompt — without this, `connection.cancel()` lands on an
   * idle session and is silently dropped, so the steer would be lost.
   * Mirrors Codex's `pendingTurnInterrupt` race guard at codex/acp.ts:264.
   */
  private promptInFlight = false;
  /**
   * True for the whole of `startTurn`, including the setup awaits before the
   * prompt is issued. Distinct from `promptInFlight`, which must stay tied to
   * the cancel race; this one exists only so an inbound notification can tell
   * that a foreground turn already owns the session.
   */
  private foregroundTurnOpen = false;
  private pendingPromptInterrupt = false;
  private currentTurnInterruptRequested = false;
  private recentInterruptAckTextTail = "";
  /** User-visible error text from an `agent_message_chunk` before `prompt()` settles. */
  private agentSurfacedErrorMessage: string | undefined;
  private currentTurnHadAgentActivity = false;
  private agentPromptCapabilities: PromptCapabilities | undefined;
  private agentSessionCapabilities: SessionCapabilities | undefined;
  private agentMcpCapabilities: McpCapabilities | undefined;
  private mapperState: AcpMapperState | undefined;
  /**
   * Client-hosted ACP terminal subsystem. Lazily created so test harnesses
   * that bypass the constructor (and override `projectLocation`/`cwd` after
   * prototype instantiation) still get a coherent manager on first use.
   */
  private _terminalManager: AcpTerminalManager | undefined;

  private get terminalManager(): AcpTerminalManager {
    if (!this._terminalManager) {
      this._terminalManager = new AcpTerminalManager({
        projectLocation: this.projectLocation,
        cwd: this.cwd,
        assertRequestSession: (sessionId) => this.assertRequestSession(sessionId),
      });
    }
    return this._terminalManager;
  }

  /** Lazily initialized for parity with constructor-bypassing test harnesses. */
  private _sessionConfigSync: AcpSessionConfigSync | undefined;

  private get sessionConfigSync(): AcpSessionConfigSync {
    if (!this._sessionConfigSync) {
      this._sessionConfigSync = new AcpSessionConfigSync(this.connection);
    }
    return this._sessionConfigSync;
  }

  /** Lazily initialized for parity with constructor-bypassing test harnesses. */
  private _sessionRequests: AcpSessionRequests | undefined;

  private get sessionRequests(): AcpSessionRequests {
    if (!this._sessionRequests) {
      this._sessionRequests = new AcpSessionRequests({
        threadId: this.threadId,
        getPermissionContext: () => ({
          config: this.currentConfig,
          availableModeIds: this.sessionConfigSync.availableModeIds,
        }),
        ensureMapperState: () => this.ensureMapperState(),
        emitRuntimeEvents: (events) => this.emitRuntimeEvents(events),
        setRequestAttention: (attention) => {
          this.emitListenerUpdate({ status: attention, attention });
        },
      });
    }
    return this._sessionRequests;
  }
  /**
   * Runtime events that fired before the listener was wired (typical race:
   * the supervisor calls `void startTurn(...)` and then `await`s plugin-env
   * resolution, which lets the turn's microtask emit user_message events
   * before `spawnThread` reaches `setListener`). Replayed on `setListener`.
   */
  private bufferedRuntimeEvents: RuntimeEvent[] = [];
  /**
   * True while `loadSession` is replaying historical `session/update`
   * notifications. Poracode persists thread history in its own DB, so
   * surfacing the replay as new canonical events would duplicate every
   * message in the chat pane. We drop ACP→canonical mapping for the duration
   * and let normal mapping resume once the load completes.
   */
  private isReplayingHistory = false;
  private replayHistoryUntil = 0;

  private constructor(
    child: ChildProcess,
    connection: ClientSideConnection,
    projectLocation: ProjectLocation,
    cwd: string,
    threadId: string,
    stderrChunks: string[],
    options?: AcpStructuredSessionOptions,
  ) {
    this.child = child;
    this.connection = connection;
    this.projectLocation = projectLocation;
    this.cwd = cwd;
    this.threadId = threadId;
    this.stderrChunks = stderrChunks;
    this.launchOptions = { suppressResumeConfigOverrides: true };
    if (options?.loadSessionErrorRewriter) {
      this.loadSessionErrorRewriter = options.loadSessionErrorRewriter;
    }
    if (options?.emptyResponseErrorResolver) {
      this.emptyResponseErrorResolver = options.emptyResponseErrorResolver;
    }
    if (options?.sessionUpdateTransform) {
      this.sessionUpdateTransform = options.sessionUpdateTransform;
    }
    this.goalCommands = options?.goalCommands === true;
    if (options?.extensionSessionUpdateTransform) {
      this.extensionSessionUpdateTransform = options.extensionSessionUpdateTransform;
    }
    if (options?.extensionNotificationHandler) {
      this.extensionNotificationHandler = options.extensionNotificationHandler;
    }
    this.mcpServers = options?.mcpServers ?? [];
    this.assumedMcpCapabilities = options?.assumedMcpCapabilities;
    this.fsAgentHomeDirs = options?.fsAgentHomeDirs ?? [];
    this.fsTextCapability = options?.fsTextCapability !== false;
  }

  /** Initialize the canonical mapper once we have a stable thread id. */
  private ensureMapperState(): AcpMapperState {
    if (!this.mapperState || this.mapperState.threadId !== this.threadId) {
      this.mapperState = createAcpMapperState(this.threadId);
      // Bridge the client-hosted ACP terminal store into the mapper so
      // `ToolCallContent` entries of type `"terminal"` (Gemini's shell tool)
      // get inlined as the canonical `result` payload.
      this.mapperState.resolveTerminalOutput = (terminalId) =>
        this.terminalManager.getTerminalOutput(terminalId);
      this.mapperState.resolveTerminalOutputByCommand = (command) =>
        this.terminalManager.resolveAcpTerminalOutputByCommand(command);
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

  private emitListenerUpdate(update: StructuredSessionUpdate): void {
    this.currentStatus = update.status;
    this.currentAttention = update.attention;
    this.listener?.onUpdate(update);
  }

  private emitCurrentState(listener: StructuredSessionListener): void {
    const sessionRef = this.currentSessionRef();
    listener.onUpdate({
      status: this.currentStatus,
      attention: this.currentAttention,
      ...(this.currentConfig ? { config: this.currentConfig } : {}),
      ...(sessionRef ? { sessionRef } : {}),
      ...(this.currentSlashCommands !== undefined
        ? { slashCommands: this.currentSlashCommands }
        : {}),
    });
  }

  private updateSlashCommands(commands: AgentSlashCommand[]): void {
    if (areAgentSlashCommandsEqual(this.currentSlashCommands, commands)) {
      return;
    }
    this.currentSlashCommands = commands;
    const sessionRef = this.currentSessionRef();
    this.emitListenerUpdate({
      status: this.currentStatus,
      attention: this.currentAttention,
      ...(this.currentConfig ? { config: this.currentConfig } : {}),
      ...(sessionRef ? { sessionRef } : {}),
      slashCommands: commands,
    });
  }

  private currentSessionRef(): SessionRef | undefined {
    if (!this.sessionId) return undefined;
    if (this.stableSessionRef?.providerSessionId !== this.sessionId) {
      this.stableSessionRef = createKnownSessionRef(this.sessionId);
    }
    return this.stableSessionRef;
  }

  private adoptSessionRef(sessionRef: SessionRef): void {
    this.sessionId = sessionRef.providerSessionId;
    this.stableSessionRef = sessionRef;
  }

  /**
   * Spawn the ACP agent process and create a session handle.
   *
   * The `command` should launch the CLI in ACP mode (e.g. `gemini --acp`).
   * The SDK communicates over stdin/stdout using newline-delimited JSON.
   */
  static create(
    command: CommandSpec,
    projectLocation: ProjectLocation,
    threadId: string,
    options?: AcpStructuredSessionOptions,
  ): AcpStructuredSession {
    const sessionCwd = resolveSessionCwd(projectLocation);
    const spawnCwd = command.cwd ?? resolveSpawnCwd(projectLocation);

    const child = spawnChild(command.command, command.args, {
      ...(spawnCwd ? { cwd: spawnCwd } : {}),
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, TERM: "xterm-256color", ...(command.env ?? {}) },
      shell: false,
      windowsHide: true,
    });

    // Track spawn outcome — activate() awaits this before writing to stdin.
    const spawnReady = new Promise<void>((resolve, reject) => {
      child.on("error", (err) => {
        console.log("[acp] spawn error:", err.message);
        reject(new Error(`ACP agent failed to start: ${err.message}`));
      });
      child.on("spawn", resolve);
    });

    // Collect stderr for error diagnostics
    const stderrChunks: string[] = [];
    child.stderr?.on("data", (chunk) => {
      const text = String(chunk);
      console.log("[acp stderr]", text.trimEnd());
      stderrChunks.push(text);
      if (stderrChunks.length > 20) stderrChunks.shift();
    });

    // Wrap Node.js streams into Web Streams for the ACP SDK.
    // The Node.js → Web Stream adapters produce compatible types but
    // tsgo's strict generics require explicit casts.
    const toAgent = Writable.toWeb(child.stdin!) as WritableStream<Uint8Array>;
    const fromAgent = Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>;
    const stream = filterAcpInboundNoise(
      ndJsonStream(toAgent, filterAcpStdoutNonJsonLines(fromAgent)),
    );

    let session: AcpStructuredSession;

    const connection = new ClientSideConnection(
      (_agent): Client => ({
        requestPermission(params: RequestPermissionRequest) {
          return session.handlePermissionRequest(params);
        },
        unstable_createElicitation(params: CreateElicitationRequest) {
          return session.handleElicitationRequest(params);
        },
        unstable_completeElicitation(params: CompleteElicitationNotification) {
          session.handleElicitationComplete(params);
          return Promise.resolve();
        },
        sessionUpdate(params: SessionNotification) {
          session.handleSessionUpdate(params);
          return Promise.resolve();
        },
        async readTextFile(params) {
          return session.handleReadTextFile(params);
        },
        async writeTextFile(params) {
          return session.handleWriteTextFile(params);
        },
        async createTerminal(params: CreateTerminalRequest) {
          return session.handleCreateTerminal(params);
        },
        async terminalOutput(params: TerminalOutputRequest) {
          return session.handleTerminalOutput(params);
        },
        async releaseTerminal(params: ReleaseTerminalRequest) {
          session.handleReleaseTerminal(params);
          return {};
        },
        waitForTerminalExit(params: WaitForTerminalExitRequest) {
          return session.handleWaitForTerminalExit(params);
        },
        async killTerminal(params: KillTerminalRequest) {
          session.handleKillTerminal(params);
          return {};
        },
        extNotification(method: string, params: Record<string, unknown>) {
          session.handleExtNotification(method, params);
          return Promise.resolve();
        },
        extMethod(method: string, params: Record<string, unknown>) {
          session.handleExtNotification(method, params);
          return Promise.resolve({});
        },
      }),
      stream,
    );

    session = new AcpStructuredSession(
      child,
      connection,
      projectLocation,
      sessionCwd,
      threadId,
      stderrChunks,
      options,
    );
    session.spawnReady = spawnReady;

    // The process exit is authoritative when available. Defer the connection
    // close by one turn so an adjacent child exit can provide its exit code.
    void connection.closed.then(() => {
      session.transportClosed = true;
      setImmediate(() => {
        if (session.isDisposed || session.transportOutcomeReported) return;
        const code = child.exitCode;
        session.reportTransportOutcome(
          session.isExpectedTransportExit(code)
            ? undefined
            : code === null
              ? "ACP connection closed unexpectedly."
              : `ACP agent exited unexpectedly (code ${code}).`,
        );
      });
    });

    child.once("exit", (code) => {
      const expected = session.isExpectedTransportExit(code);
      if (expected) {
        console.log(`[acp] child exited (code ${code})`);
      } else {
        console.log(`[acp] child exited unexpectedly (code ${code})`);
      }
      if (session.isDisposed) return;
      session.reportTransportOutcome(
        expected ? undefined : `ACP agent exited unexpectedly (code ${code}).`,
      );
    });

    return session;
  }

  setListener(listener: StructuredSessionListener): void {
    this.listener = listener;

    // Drain any runtime events that landed before the listener was wired
    // (turn.started / user_message from startTurn typically race ahead of
    // spawnThread's setListener call).
    if (listener.onRuntimeEvent && this.bufferedRuntimeEvents.length > 0) {
      const drained = this.bufferedRuntimeEvents;
      this.bufferedRuntimeEvents = [];
      for (const event of drained) {
        listener.onRuntimeEvent(event);
      }
    }

    // Re-emit current state for late listeners
    if (this.sessionId || this.currentConfig || this.currentSlashCommands !== undefined) {
      this.emitCurrentState(listener);
    }
  }

  /**
   * Phase 1: Initialize the ACP protocol handshake.
   */
  async activate(): Promise<void> {
    if (this.isDisposed) {
      throw new Error("ACP session was disposed before activation.");
    }
    await this.spawnReady;

    console.log("[acp] sending initialize...");
    const initResult = await this.connection.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: "poracode", version: "0.1.0" },
      clientCapabilities: {
        fs: {
          readTextFile: this.fsTextCapability,
          writeTextFile: this.fsTextCapability,
        },
        elicitation: { form: {}, url: {} },
        terminal: true,
      },
    });
    this.agentPromptCapabilities = initResult.agentCapabilities?.promptCapabilities;
    this.agentSessionCapabilities = initResult.agentCapabilities?.sessionCapabilities;
    this.agentMcpCapabilities = initResult.agentCapabilities?.mcpCapabilities;
    console.log(
      "[acp] initialized — protocol v%d, agent: %s",
      initResult.protocolVersion,
      initResult.agentInfo?.name ?? "unknown",
    );

    if (initResult.authMethods?.length) {
      console.log("[acp] agent advertised auth methods:", initResult.authMethods.length);
    }
  }

  /**
   * Phase 2: Create or resume an ACP session.
   *
   * The agent's response includes its available modes and models.
   * We store them to map Poracode's `ThreadConfig` to the correct
   * ACP mode/model IDs (which vary per agent).
   */
  /** See {@link gateAcpMcpServers}; adds launch-time logging of what was dropped. */
  private gateMcpServers(
    servers: ProtocolMcpServer[],
    capabilities: AcpMcpCapabilities | undefined,
  ): ProtocolMcpServer[] {
    const kept = gateAcpMcpServers(servers, capabilities);
    if (kept.length < servers.length) {
      console.log(
        "[acp] dropping %d remote MCP server(s) — agent does not advertise the transport capability; launching without them: %s",
        servers.length - kept.length,
        servers.map((server) => server.name).join(", "),
      );
    }
    return kept;
  }

  /**
   * Run a session-open call with the MCP servers the adapter believes the
   * agent supports, falling back once to the strictly advertised-capability
   * set if that fails. Without the fallback an adapter's `assumedMcpCapabilities`
   * would turn a future agent regression into an unopenable thread; with it the
   * worst case is the old behaviour of launching without those servers.
   */
  private async openWithMcpServers<T>(
    open: (mcpServers: ProtocolMcpServer[]) => Promise<T>,
  ): Promise<T> {
    const built = buildAcpMcpServers(this.mcpServers);
    const assumed = this.gateMcpServers(
      built,
      resolveAcpMcpCapabilities(this.agentMcpCapabilities, this.assumedMcpCapabilities),
    );
    const advertised =
      this.agentMcpCapabilities === undefined && this.assumedMcpCapabilities !== undefined
        ? gateAcpMcpServers(built, this.agentMcpCapabilities)
        : assumed;
    if (advertised.length === assumed.length) return open(assumed);

    try {
      return await open(assumed);
    } catch (error) {
      if (!isAssumedMcpCompatibilityError(error)) throw error;
      console.log(
        "[acp] session open failed with %d assumed-transport MCP server(s) (ACP error %d); retrying without them",
        assumed.length - advertised.length,
        error.code,
      );
      return open(advertised);
    }
  }

  /**
   * Track the usage.spent ledger scope. A changed session id ends the old
   * counter lineage — bump the epoch rather than inferring a reset from the
   * cumulative counter. `fresh` marks sessions created via `session/new`
   * (baseline 0); resumed/loaded sessions get a baseline-only first sample.
   */
  private trackUsageScope(sessionId: string, fresh: boolean): void {
    if (this.usageScopeId === sessionId) return;
    if (this.usageScopeId !== undefined) this.usageEpoch += 1;
    this.usageScopeId = sessionId;
    this.usageScopeFresh = fresh;
  }

  async openThread(config: ThreadConfig, sessionRef?: SessionRef): Promise<string> {
    let availableModeIds: string[] = [];
    let agentCurrentModeId: string | undefined;
    let configOptions: unknown[] | null | undefined;
    this.currentConfig = undefined;
    this.currentSlashCommands = undefined;
    this.sessionConfigSync.rememberOptions([], []);

    if (sessionRef) {
      if (this.agentSessionCapabilities?.resume !== undefined) {
        console.log("[acp] resuming session:", sessionRef.providerSessionId);
        this.isReplayingHistory = true;
        this.replayHistoryUntil = Infinity;
        try {
          const result = await this.openWithMcpServers((mcpServers) =>
            this.connection.resumeSession({
              sessionId: sessionRef.providerSessionId,
              cwd: this.cwd,
              mcpServers,
            }),
          );
          this.adoptSessionRef(sessionRef);
          this.trackUsageScope(sessionRef.providerSessionId, false);
          availableModeIds = result.modes?.availableModes?.map((m) => m.id) ?? [];
          agentCurrentModeId = result.modes?.currentModeId;
          configOptions = result.configOptions;
        } catch (error) {
          throw this.loadSessionErrorRewriter(error, sessionRef.providerSessionId);
        } finally {
          this.isReplayingHistory = false;
          this.replayHistoryUntil = Date.now() + 500;
        }
      } else {
        console.log("[acp] loading session:", sessionRef.providerSessionId);
        this.isReplayingHistory = true;
        this.replayHistoryUntil = Infinity;
        try {
          const result = await this.openWithMcpServers((mcpServers) =>
            this.connection.loadSession({
              sessionId: sessionRef.providerSessionId,
              cwd: this.cwd,
              mcpServers,
            }),
          );
          this.adoptSessionRef(sessionRef);
          this.trackUsageScope(sessionRef.providerSessionId, false);
          availableModeIds = result.modes?.availableModes?.map((m) => m.id) ?? [];
          agentCurrentModeId = result.modes?.currentModeId;
          configOptions = result.configOptions;
        } catch (error) {
          throw this.loadSessionErrorRewriter(error, sessionRef.providerSessionId);
        } finally {
          this.isReplayingHistory = false;
          this.replayHistoryUntil = Date.now() + 500;
        }
      }
    } else {
      console.log("[acp] creating new session in", this.cwd);
      const result = await this.openWithMcpServers((mcpServers) =>
        this.connection.newSession({
          cwd: this.cwd,
          mcpServers,
        }),
      );
      this.sessionId = result.sessionId;
      this.stableSessionRef = createKnownSessionRef(result.sessionId);
      this.trackUsageScope(result.sessionId, true);
      availableModeIds = result.modes?.availableModes?.map((m) => m.id) ?? [];
      agentCurrentModeId = result.modes?.currentModeId;
      configOptions = result.configOptions;
      console.log("[acp] session created:", this.sessionId, "modes:", availableModeIds);
    }

    if (Array.isArray(configOptions)) {
      this.sessionConfigSync.rememberOptions(availableModeIds, configOptions);
    } else {
      this.sessionConfigSync.rememberAvailableModes(availableModeIds);
    }
    // `SessionModeState.currentModeId` is the agent's own statement of the mode
    // it is in — authoritative for a resumed session, where it reflects state
    // the agent restored. Recording it keeps `applyTurnConfig` from re-pushing
    // that same mode back at the agent.
    this.sessionConfigSync.rememberCurrentMode(agentCurrentModeId);
    this.planModeToolTracker.reset();
    this.currentConfig = await this.sessionConfigSync.applyTurnConfig(
      this.sessionId,
      config,
      this.currentConfig,
    );

    if (this.sessionId) {
      this.launchOptions = { ...this.launchOptions, resumeThreadId: this.sessionId };
    }
    return this.sessionId!;
  }

  /**
   * Phase 3: Send a prompt to the agent.
   *
   * `prompt()` is async and resolves when the turn completes (the agent
   * returns a `stopReason`). During the turn, `session/update` notifications
   * flow through `handleSessionUpdate` which emits status updates.
   */
  async startTurn(
    prompt: string,
    config: ThreadConfig,
    segments?: PromptSegment[],
    options?: StartTurnOptions,
  ): Promise<void> {
    if (!this.sessionId) {
      throw new Error("ACP session not opened yet.");
    }
    this.currentTurnInterruptRequested = false;
    this.recentInterruptAckTextTail = "";
    this.agentSurfacedErrorMessage = undefined;
    this.currentTurnHadAgentActivity = false;
    this.stderrChunks.length = 0;

    this.currentConfig = await this.sessionConfigSync.applyTurnConfig(
      this.sessionId,
      config,
      this.currentConfig,
    );

    // A real prompt supersedes any agent-initiated turn still in progress, so
    // its items close under that turn instead of leaking into this one. Silent:
    // the `working` paint below covers the handover with no idle flicker.
    this.completeOrphanTurn({ silent: true });
    // Claim turn ownership before the first `await` below. `promptInFlight` only
    // goes true once the prompt is actually issued, and an inbound notification
    // landing in that gap would otherwise open a competing orphan turn.
    this.foregroundTurnOpen = true;

    // Mark a new canonical turn and surface the user-typed message as a
    // user_message item (the prompt itself doesn't generate a session/update).
    // When the runtime has already pushed an optimistic user_message ahead of
    // structured-session setup, we reuse the same item id so the renderer's
    // per-id dedupe drops this duplicate emit.
    this.currentTurnId = `turn-${randomUUID()}`;
    const userItemId = options?.userMessageItemId ?? `user-${this.currentTurnId}`;
    this.emitRuntimeEvents([
      { type: "turn.started", threadId: this.threadId, turnId: this.currentTurnId },
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
    ]);
    if (this.goalCommands) {
      const goalEvents = mapAcpGoalSlashCommand(prompt, this.ensureMapperState());
      if (goalEvents.length > 0) this.emitRuntimeEvents(goalEvents);
    }

    // Signal working state immediately
    this.emitListenerUpdate({ status: "working", attention: "working" });

    // Portable-skills fallback: append to the outbound prompt only — the
    // user_message paint above must stay clean of inlined skill bodies.
    const outboundPrompt = options?.inlineInstructions
      ? `${prompt}\n\n${options.inlineInstructions}`
      : prompt;
    const contentBlocks = await segmentsToContentBlocks(
      outboundPrompt,
      this.projectLocation,
      segments,
      this.agentPromptCapabilities,
    );

    try {
      this.promptInFlight = true;
      // If `interruptTurn()` was called between `startTurn` entry and this
      // point (rare, but possible: the supervisor stages a steer immediately
      // after a previous turn ended), fire the cancel now so the agent
      // doesn't process this prompt.
      if (this.pendingPromptInterrupt && this.sessionId) {
        this.pendingPromptInterrupt = false;
        await this.connection.cancel({ sessionId: this.sessionId });
      }
      const result = await this.connection.prompt({
        sessionId: this.sessionId,
        prompt: contentBlocks,
      });
      const usageEvent = createAcpPromptUsageEvent(this.threadId, result.usage);
      if (usageEvent) this.emitRuntimeEvents([usageEvent]);
      // The same prompt response also carries the session-cumulative counter
      // for the token ledger (absent on most bridges — then nothing is emitted
      // and the provider lands on the profile's unavailable list).
      if (this.usageScopeId) {
        const spentEvent = createAcpPromptUsageSpentEvent(this.threadId, result.usage, {
          scopeId: this.usageScopeId,
          epoch: this.usageEpoch,
          ...(this.usageScopeFresh ? { fresh: true } : {}),
        });
        if (spentEvent) {
          this.emitRuntimeEvents([spentEvent]);
          this.usageScopeFresh = false;
        }
      }

      // Map stopReason to Poracode status
      const normalizedStopReason = normalizeAcpStopReason(result.stopReason, {
        interruptRequested: this.currentTurnInterruptRequested,
        recentAgentText: this.recentInterruptAckTextTail,
      });
      if (
        result.stopReason === "end_turn" &&
        !this.currentTurnInterruptRequested &&
        !this.currentTurnHadAgentActivity
      ) {
        const emptyResponseError = this.emptyResponseErrorResolver?.({
          stopReason: result.stopReason,
          stderr: this.stderrChunks,
        });
        if (emptyResponseError) throw emptyResponseError;
      }
      const mapperState = this.ensureMapperState();
      const turnState = this.agentSurfacedErrorMessage
        ? "failed"
        : normalizedStopReason === "cancelled"
          ? "cancelled"
          : "completed";
      if (
        normalizedStopReason === "end_turn" &&
        turnState === "completed" &&
        mapperState.activeSubAgents.length > 0
      ) {
        this.foregroundTurnAwaitingSubagents = true;
        // Close the foreground response now, while deliberately preserving
        // detached subagent tool calls in the mapper until their reports land.
        this.emitRuntimeEvents(closeOpenTurnItems(mapperState));
      } else {
        this.emitTurnStatusAfterPrompt(normalizedStopReason);
        this.completeTurn(mapperState, turnState);
      }
    } catch (error) {
      if (this.isDisposed) return;
      if (isAcpPromptCancellationError(error, this.currentTurnInterruptRequested)) {
        this.emitListenerUpdate({ status: "idle", attention: "none" });
        this.completeTurn(this.ensureMapperState(), "cancelled");
      } else {
        this.emitPromptFailure(error);
      }
    } finally {
      this.promptInFlight = false;
      this.foregroundTurnOpen = false;
      this.pendingPromptInterrupt = false;
      this.currentTurnInterruptRequested = false;
      this.recentInterruptAckTextTail = "";
      this.agentSurfacedErrorMessage = undefined;
      // The mapper's per-turn item state has been cleared via
      // `closeOpenTurnItems`, so any output snapshots from terminals that
      // belonged to this turn are no longer reachable. Drop them so the cache
      // can't grow across a long-lived session.
      if (!this.foregroundTurnAwaitingSubagents) {
        this.clearCompletedTurnCaches();
      }
    }
  }

  /**
   * Respond to a pending permission or elicitation request from the agent.
   */
  async resolveServerRequest(requestId: ThreadServerRequestId, response: unknown): Promise<void> {
    if (!this.sessionRequests.resolve(requestId, response)) {
      throw new Error(`ACP request ${String(requestId)} is no longer pending`);
    }
  }

  async interruptTurn(): Promise<void> {
    if (!this.sessionId || this.isDisposed) {
      return;
    }

    this.sessionRequests.cancelPending();
    this.currentTurnInterruptRequested = true;
    // Race guard: if interrupt fires before `connection.prompt()` has been
    // entered (e.g. the supervisor stages a steer in the same microtask as
    // a fresh startTurn), set a flag instead of issuing the cancel directly.
    // The cancel would land on an idle session and be silently ignored;
    // `startTurn` checks the flag right before awaiting `prompt()` and fires
    // the cancel from there. Mirrors codex/acp.ts:584-599.
    //
    // An orphan turn has no prompt promise to cancel into, but the agent is
    // genuinely mid-work — `session/cancel` is the only thing that stops it, so
    // it must go out rather than being deferred to a prompt that may never come.
    if (!this.promptInFlight && !this.foregroundTurnAwaitingSubagents && !this.orphanTurnId) {
      this.pendingPromptInterrupt = true;
      return;
    }
    try {
      await this.connection.cancel({ sessionId: this.sessionId });
    } catch (error) {
      // A close callback owns the root failure. A cancel racing that callback
      // is derivative noise, but unrelated provider rejections still surface.
      if (this.isDisposed || this.transportClosed) return;
      throw error;
    }
    if (this.orphanTurnId && !this.promptInFlight) {
      this.completeOrphanTurn({ state: "cancelled" });
    }
  }

  forceCompleteTurn(): void {
    this.completeOrphanTurn({ silent: true });
    if (!this.currentTurnId) return;
    this.foregroundTurnAwaitingSubagents = false;
    this.completeTurn(this.ensureMapperState(), "cancelled");
    this.clearCompletedTurnCaches();
  }

  async dispose(): Promise<void> {
    if (this.isDisposed) return;
    this.isDisposed = true;

    for (const source of this.externalSessionUpdateSources ?? []) source.dispose();
    this.externalSessionUpdateSources?.clear();

    if (this.orphanTurnIdleTimer) {
      clearTimeout(this.orphanTurnIdleTimer);
      this.orphanTurnIdleTimer = undefined;
    }
    this.sessionRequests.cancelPending();
    this._terminalManager?.releaseAllAcpTerminals();

    if (this.sessionId && this.agentSessionCapabilities?.close !== undefined) {
      try {
        await this.connection.closeSession({ sessionId: this.sessionId });
      } catch (error) {
        console.warn("[acp] session/close failed during dispose:", error);
      }
    }

    // Don't send cancel — the ACP process may not be generating,
    // and the connection may already be closing. Just kill the process.

    if (!this.child.killed) {
      terminateChildProcessTree(this.child);
    }
  }

  private reportTransportOutcome(errorMessage: string | undefined): void {
    if (this.transportOutcomeReported) return;
    this.transportOutcomeReported = true;
    if (errorMessage) {
      this.listener?.onError(errorMessage);
    }
    this.listener?.onClose();
  }

  private isExpectedTransportExit(code: number | null): boolean {
    return this.isDisposed || code === 0;
  }

  // ── Resume artifacts ──────────────────────────────────────────

  /**
   * Wait for the session file to appear on disk.
   *
   * Called by the runtime AFTER `startTurn` fires the initial prompt.
   * Gemini's ACP mode persists the session to disk during prompt processing.
   * The TUI needs this file to exist before `--resume <id>` will work.
   *
   * Polls `~/.gemini/tmp/<project>/chats/` for a file containing the session UUID.
   */
  async ensureResumeArtifacts(): Promise<void> {
    if (!this.sessionId) return;

    const projectName = basename(this.cwd);
    const chatsDir = join(homedir(), ".gemini", "tmp", projectName, "chats");
    const uuid8 = this.sessionId.split("-")[0] ?? this.sessionId.slice(0, 8);

    console.log("[acp] waiting for session file (uuid prefix: %s)...", uuid8);

    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      try {
        const { readdirSync } = await import("node:fs");
        const files = readdirSync(chatsDir);
        const match = files.find((f) => f.includes(uuid8) && f.endsWith(".json"));
        if (match) {
          console.log("[acp] session file found:", join(chatsDir, match));
          return;
        }
      } catch {
        // Directory may not exist yet
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    console.log("[acp] session file not found after timeout, proceeding anyway");
  }

  // ── Internal handlers ────────────────────────────────────────

  private assertRequestSession(sessionId: string): void {
    if (!this.sessionId || sessionId !== this.sessionId) {
      throw RequestError.invalidParams({ message: `Unknown ACP session: ${sessionId}` });
    }
  }

  private async handleReadTextFile(params: ReadTextFileRequest): Promise<ReadTextFileResponse> {
    this.assertRequestSession(params.sessionId);
    const path = resolveAcpReadableHostFsPath(
      this.projectLocation,
      params.path,
      this.fsAgentHomeDirs,
    );
    try {
      const fullContent = await readFile(path, "utf8");
      return { content: sliceTextFileContent(fullContent, params.line, params.limit) };
    } catch (error: unknown) {
      const fallbackPath = resolveAcpGlobalSkillFallbackHostFsPath(
        this.projectLocation,
        params.path,
      );
      if (fallbackPath && fallbackPath !== path && isMissingPathError(error)) {
        try {
          const fullContent = await readFile(fallbackPath, "utf8");
          return { content: sliceTextFileContent(fullContent, params.line, params.limit) };
        } catch {
          // Keep the original project-path error so a missing skill stays
          // resource-not-found for the path the agent asked about.
        }
      }
      throw toAcpFsRequestError(error, params.path);
    }
  }

  private async handleWriteTextFile(params: WriteTextFileRequest): Promise<WriteTextFileResponse> {
    this.assertRequestSession(params.sessionId);
    const path = resolveAcpWritableHostFsPath(
      this.projectLocation,
      params.path,
      this.fsAgentHomeDirs,
    );
    await writeFile(path, params.content, "utf8").catch((error: unknown) => {
      throw toAcpFsRequestError(error, params.path);
    });
    return {};
  }

  private handleCreateTerminal(params: CreateTerminalRequest) {
    return this.terminalManager.handleCreateTerminal(params);
  }

  private handleTerminalOutput(params: TerminalOutputRequest) {
    return this.terminalManager.handleTerminalOutput(params);
  }

  private handleReleaseTerminal(params: ReleaseTerminalRequest): void {
    this.terminalManager.handleReleaseTerminal(params);
  }

  private handleWaitForTerminalExit(params: WaitForTerminalExitRequest) {
    return this.terminalManager.handleWaitForTerminalExit(params);
  }

  private handleKillTerminal(params: KillTerminalRequest): void {
    this.terminalManager.handleKillTerminal(params);
  }

  private handlePermissionRequest(
    params: RequestPermissionRequest,
  ): Promise<RequestPermissionResponse> {
    return this.sessionRequests.requestPermission(params);
  }

  private handleElicitationRequest(
    params: CreateElicitationRequest,
  ): Promise<CreateElicitationResponse> {
    return this.sessionRequests.createElicitation(params);
  }

  private handleElicitationComplete(params: CompleteElicitationNotification): void {
    this.sessionRequests.completeElicitation(params);
  }

  /**
   * Handle vendor-extension JSON-RPC notifications (methods outside the ACP
   * spec). The SDK routes anything that isn't `session/update` or
   * `session/elicitation_complete` here; without a handler the connection
   * throws `methodNotFound` and logs every notification as an error.
   *
   * Grok's `_x.ai/session_notification` carries the same `{ sessionId, update }`
   * shape as a standard `session/update`, just with extension-only
   * `sessionUpdate` discriminators (`hook_execution`, etc.). Forward it to the
   * normal handler — the canonical mapper falls through to its `default` arm
   * on unrecognized discriminators, so unknown extensions are swallowed
   * without polluting the chat stream.
   */
  private handleExtNotification(method: string, params: Record<string, unknown>): void {
    if (looksLikeAcpSessionNotification(params)) {
      this.handleSessionUpdate(params as unknown as SessionNotification);
      return;
    }
    if (
      this.extensionSessionUpdateTransform &&
      !this.isReplayingHistory &&
      Date.now() >= (this.replayHistoryUntil || 0)
    ) {
      const recovered = this.extensionSessionUpdateTransform(method, params);
      if (recovered) {
        this.handleSessionUpdate(recovered);
        return;
      }
    }
    if (
      this.extensionNotificationHandler &&
      !this.isReplayingHistory &&
      Date.now() >= (this.replayHistoryUntil || 0)
    ) {
      const events = this.extensionNotificationHandler(method, params, {
        threadId: this.threadId,
        resolveToolCallItemId: (toolCallId) => this.acpToolCallIdToItemId.get(toolCallId),
      });
      if (events.length > 0) {
        this.emitRuntimeEvents(events);
      }
    }
  }

  private rememberAcpToolCallItemId(
    notification: SessionNotification,
    events: RuntimeEvent[],
  ): void {
    const update = notification.update;
    if (update.sessionUpdate !== "tool_call" && update.sessionUpdate !== "tool_call_update") {
      return;
    }
    const toolCallId = (update as { toolCallId?: unknown }).toolCallId;
    if (typeof toolCallId !== "string" || toolCallId.length === 0) return;

    const fromMapper = this.mapperState?.toolCallItems.get(toolCallId)?.itemId;
    if (fromMapper) {
      this.acpToolCallIdToItemId.set(toolCallId, fromMapper);
      return;
    }

    for (const event of events) {
      if (event.type !== "item.started" || event.itemType !== "tool_call") continue;
      this.acpToolCallIdToItemId.set(toolCallId, event.itemId);
      return;
    }
  }

  private clearAcpToolCallItemIdMap(): void {
    this.acpToolCallIdToItemId.clear();
  }

  /**
   * Handle `session/update` notifications from the agent.
   *
   * These are the real-time updates the agent sends while processing
   * a turn: text chunks, tool calls, plan updates, etc.
   */
  private handleSessionUpdate(rawParams: SessionNotification, notifyExternalSources = true): void {
    let deferredByExternalSource = false;
    if (notifyExternalSources) {
      for (const source of this.externalSessionUpdateSources ?? []) {
        try {
          if (source.onSessionUpdate(rawParams) === true) deferredByExternalSource = true;
        } catch (error) {
          console.warn(
            "[acp] external session update source failed:",
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    }
    if (deferredByExternalSource) return;
    maybeCaptureAcpUpdate(rawParams, this.threadId, this.sessionId, this.cwd);

    const params = this.applySessionUpdateTransform(rawParams);
    const update: SessionUpdate = params.update;

    if (
      update.sessionUpdate === "agent_message_chunk" ||
      update.sessionUpdate === "agent_thought_chunk" ||
      update.sessionUpdate === "tool_call" ||
      update.sessionUpdate === "tool_call_update" ||
      update.sessionUpdate === "plan"
    ) {
      this.currentTurnHadAgentActivity = true;
    }

    if (update.sessionUpdate === "available_commands_update") {
      this.updateSlashCommands(mapAcpSlashCommands(update.availableCommands));
      if (this.isReplayingHistory) {
        return;
      }
    }

    const suppressReplayUpdate =
      this.isReplayingHistory || Date.now() < (this.replayHistoryUntil || 0);
    if (suppressReplayUpdate && update.sessionUpdate === "config_option_update") {
      this.sessionConfigSync.rememberConfigOptionUpdate(update);
    }

    // Emit canonical events for chat-mode renderers. The legacy text/status
    // path below stays in place — terminal-mode threads still get all the
    // existing behaviour, and the canonical channel runs in parallel.
    //
    // During session resume/load the agent may replay persisted history as
    // `session/update` notifications. Poracode already has those messages
    // in its own DB, so we skip canonical mapping for the replay window to
    // avoid duplicating every message in the chat pane.
    if (!suppressReplayUpdate) {
      const mapperState = this.ensureMapperState();
      // Whether a turn already owned this notification before we mapped it.
      // Read up front: the blocks below can close a turn on this very update,
      // and an orphan turn must not reopen one in the same breath.
      const turnWasLive =
        this.promptInFlight ||
        this.foregroundTurnOpen ||
        this.foregroundTurnAwaitingSubagents ||
        this.detachedTurnId !== undefined;
      const detachedParentToolCallId =
        !this.promptInFlight && !this.foregroundTurnAwaitingSubagents
          ? getDetachedSubAgentToolCallIdForNotification(mapperState, update)
          : undefined;
      if (detachedParentToolCallId) {
        this.startDetachedTurn(detachedParentToolCallId);
      }
      const events = mapAcpSessionUpdate(params, mapperState);
      this.rememberAcpToolCallItemId(params, events);
      if (events.length > 0) {
        this.recordAgentSurfacedError(events);
        this.emitRuntimeEvents(events);
      }
      for (const toolCallId of this.detachedTurnParentToolCallIds) {
        if (!mapperState.activeSubAgents.some((active) => active.toolCallId === toolCallId)) {
          this.detachedTurnParentToolCallIds.delete(toolCallId);
        }
      }
      if (this.foregroundTurnAwaitingSubagents && mapperState.activeSubAgents.length === 0) {
        this.completeForegroundTurnAfterSubagents(mapperState);
      } else if (this.detachedTurnId && this.detachedTurnParentToolCallIds.size === 0) {
        this.completeDetachedTurn();
      } else if (
        !turnWasLive &&
        detachedParentToolCallId === undefined &&
        isOrphanTurnActivity(update)
      ) {
        this.noteOrphanTurnActivity();
      }
    } else {
      return;
    }

    switch (update.sessionUpdate) {
      case "agent_message_chunk": {
        const content = (update as { content?: ContentBlock }).content;
        if (
          this.currentTurnInterruptRequested &&
          content?.type === "text" &&
          content.text.length > 0
        ) {
          this.recentInterruptAckTextTail = appendInterruptAckTextTail(
            this.recentInterruptAckTextTail,
            content.text,
          );
        }
        break;
      }
      case "agent_thought_chunk":
      case "user_message_chunk":
        // Agent is producing output — stay in "working" state
        break;

      case "tool_call":
        this.observePlanModeToolCall(update);
        // A tool call that belongs to the active prompt confirms working
        // state. Some ACP agents (Qwen notably) deliver background-task
        // notifications after prompt() has already settled; those updates
        // remain visible in the transcript but must not reopen the thread as
        // a steerable turn when there is no request left to cancel.
        if (this.promptInFlight) {
          this.emitListenerUpdate({ status: "working", attention: "working" });
        }
        break;

      case "tool_call_update":
        // Tool call status changed — still working
        this.observePlanModeToolCall(update);
        break;

      case "plan":
        // Agent shared its plan — working state
        break;

      case "available_commands_update":
        break;

      case "current_mode_update":
      case "config_option_update": {
        this.commitAgentConfigChange(
          this.sessionConfigSync.reduceSessionUpdate(this.currentConfig, update),
        );
        break;
      }

      case "session_info_update": {
        // Session metadata (title) updates are not evidence of active work.
        break;
      }

      default:
        break;
    }
  }

  /**
   * Commit a config the agent reported (mode, model, effort) and tell the
   * renderer. Configuration confirmations are metadata, not turn boundaries —
   * the live status is preserved so the renderer's working-time clock does not
   * reset when an agent echoes a configuration change.
   */
  private commitAgentConfigChange(nextConfig: ThreadConfig | undefined): void {
    if (!nextConfig) return;
    this.currentConfig = nextConfig;
    const sessionRef = this.currentSessionRef();
    this.emitListenerUpdate({
      status: this.currentStatus,
      attention: this.currentAttention,
      config: nextConfig,
      ...(sessionRef ? { sessionRef } : {}),
    });
  }

  private get planModeToolTracker(): AcpPlanModeToolTracker {
    return (this.planModeToolTrackerInstance ??= new AcpPlanModeToolTracker());
  }

  /**
   * Follow the agent in and out of plan mode when its tool calls say so. ACP
   * expects an agent to announce its own mode changes with
   * `current_mode_update`, but the spec only says it "can" (and offers no way to
   * read the mode mid-session), so agents that skip it — Kimi Code's
   * `EnterPlanMode` / `ExitPlanMode` — would otherwise leave the composer
   * showing a mode the agent is no longer in. Inference only: no request is sent
   * to the agent.
   *
   * Both directions matter. Adopting the entry without the exit is worse than
   * adopting neither: the thread would keep claiming plan mode after the agent
   * left it, and because the config then already reads `plan`, nothing would
   * re-assert it — an edit could land while the composer still showed Plan.
   *
   * Skipped while replaying a loaded session's history, where
   * `SessionModeState.currentModeId` is the authority and a historical
   * transition may since have been reversed.
   */
  private observePlanModeToolCall(update: SessionUpdate): void {
    if (this.isReplayingHistory || Date.now() < (this.replayHistoryUntil || 0)) return;
    const transition = this.planModeToolTracker.observe(update);
    if (!transition) return;
    console.log(
      "[acp] agent %s plan mode via tool call (no current_mode_update sent)",
      transition === "entered" ? "entered" : "left",
    );
    this.commitAgentConfigChange(
      transition === "entered"
        ? this.sessionConfigSync.reduceModeChange(
            this.currentConfig,
            this.sessionConfigSync.resolvePlanModeId(),
          )
        : this.sessionConfigSync.reduceLeavePlanMode(this.currentConfig),
    );
  }

  /**
   * Feed a provider-recovered update through the normal ACP mapping path.
   * Some ACP adapters can reconstruct notifications that their server omits
   * from an auxiliary provider-native event log.
   */
  ingestExternalSessionUpdate(notification: SessionNotification): void {
    if (this.isDisposed) return;
    this.handleSessionUpdate(notification, false);
  }

  attachExternalSessionUpdateSource(source: AcpExternalSessionUpdateSource): void {
    this.externalSessionUpdateSources ??= new Set();
    this.externalSessionUpdateSources.add(source);
  }

  private recordAgentSurfacedError(events: RuntimeEvent[]): void {
    for (const event of events) {
      if (event.type !== "error") continue;
      this.agentSurfacedErrorMessage = event.message;
      this.emitListenerUpdate({
        status: "error",
        attention: "error",
        errorMessage: event.message,
      });
      return;
    }
  }

  private emitTurnStatusAfterPrompt(normalizedStopReason: string): void {
    if (this.agentSurfacedErrorMessage) {
      this.emitListenerUpdate({
        status: "error",
        attention: "error",
        errorMessage: this.agentSurfacedErrorMessage,
      });
      return;
    }
    const { status, attention } = this.mapStopReason(normalizedStopReason);
    this.emitListenerUpdate({ status, attention });
  }

  private startDetachedTurn(parentToolCallId: string): void {
    // Attributed subagent reporting is the more specific story, so it takes
    // over from a generic orphan turn rather than running alongside it. Silent:
    // the detached turn paints `working` itself just below.
    this.completeOrphanTurn({ silent: true });
    this.detachedTurnParentToolCallIds.add(parentToolCallId);
    if (this.detachedTurnId) return;
    this.detachedTurnId = `turn-${randomUUID()}`;
    this.emitRuntimeEvents([
      { type: "turn.started", threadId: this.threadId, turnId: this.detachedTurnId },
    ]);
    this.emitListenerUpdate({ status: "working", attention: "working" });
  }

  private completeDetachedTurn(): void {
    if (!this.detachedTurnId) return;
    this.emitRuntimeEvents([
      {
        type: "turn.completed",
        threadId: this.threadId,
        turnId: this.detachedTurnId,
        state: "completed",
      },
    ]);
    this.detachedTurnId = undefined;
    this.detachedTurnParentToolCallIds.clear();
    this.emitListenerUpdate({ status: "idle", attention: "none" });
  }

  /**
   * Open (or keep alive) the synthetic turn that covers agent-initiated work.
   * The first activity update paints `working` so the thread gets a spinner,
   * a live timer, and a Stop button; every later one pushes the idle deadline
   * out.
   */
  private noteOrphanTurnActivity(): void {
    if (!this.orphanTurnId) {
      this.orphanTurnId = `turn-${randomUUID()}`;
      this.emitRuntimeEvents([
        { type: "turn.started", threadId: this.threadId, turnId: this.orphanTurnId },
      ]);
      this.emitListenerUpdate({ status: "working", attention: "working" });
    }
    this.armOrphanTurnIdleTimer();
  }

  private armOrphanTurnIdleTimer(): void {
    if (this.orphanTurnIdleTimer) clearTimeout(this.orphanTurnIdleTimer);
    this.orphanTurnIdleTimer = setTimeout(() => {
      this.orphanTurnIdleTimer = undefined;
      if (this.isDisposed || !this.orphanTurnId) return;
      // Sitting inside a long tool call is not idleness — a test run or build
      // can go minutes without emitting anything. Detached subagent calls are
      // held open on purpose, so they never count as "still running here".
      const insideToolCall = [...this.ensureMapperState().toolCallItems.values()].some(
        (item) => !item.detached,
      );
      if (insideToolCall) {
        this.armOrphanTurnIdleTimer();
        return;
      }
      this.completeOrphanTurn();
    }, ORPHAN_TURN_IDLE_MS);
  }

  /**
   * Close the orphan turn. `silent` keeps the status untouched for the
   * supersede path, where a real prompt is about to paint `working` itself.
   */
  private completeOrphanTurn(options?: {
    silent?: boolean;
    state?: "completed" | "cancelled";
  }): void {
    if (this.orphanTurnIdleTimer) {
      clearTimeout(this.orphanTurnIdleTimer);
      this.orphanTurnIdleTimer = undefined;
    }
    const turnId = this.orphanTurnId;
    if (!turnId) return;
    this.orphanTurnId = undefined;
    this.emitRuntimeEvents([
      ...closeOpenTurnItems(this.ensureMapperState()),
      {
        type: "turn.completed",
        threadId: this.threadId,
        turnId,
        state: options?.state ?? "completed",
      },
    ]);
    this.clearCompletedTurnCaches();
    if (!options?.silent) {
      this.emitListenerUpdate({ status: "idle", attention: "none" });
    }
  }

  private completeForegroundTurnAfterSubagents(mapperState: AcpMapperState): void {
    if (!this.foregroundTurnAwaitingSubagents) return;
    this.foregroundTurnAwaitingSubagents = false;
    this.completeTurn(mapperState, "completed");
    this.emitListenerUpdate({ status: "idle", attention: "none" });
    this.clearCompletedTurnCaches();
  }

  private clearCompletedTurnCaches(): void {
    this._terminalManager?.clearReleasedTerminalOutput();
    this.clearAcpToolCallItemIdMap();
  }

  private completeTurn(
    mapperState: AcpMapperState,
    turnState: "completed" | "cancelled" | "failed",
  ): void {
    if (!this.currentTurnId) return;
    this.emitRuntimeEvents([
      ...closeOpenTurnItems(mapperState),
      {
        type: "turn.completed",
        threadId: this.threadId,
        turnId: this.currentTurnId,
        state: turnState,
      },
    ]);
  }

  private emitPromptFailure(error: unknown): void {
    const headerMessage = resolveAcpPromptFailureMessage(error, this.agentSurfacedErrorMessage);
    const rpcMessage = resolveAcpPromptRpcErrorMessage(error);
    this.emitListenerUpdate({
      status: "error",
      attention: "error",
      errorMessage: headerMessage,
    });
    const mapperState = this.ensureMapperState();
    const events: RuntimeEvent[] = [...closeOpenTurnItems(mapperState)];
    if (shouldEmitAcpPromptRpcErrorItem(error, this.agentSurfacedErrorMessage)) {
      events.push({ type: "error", threadId: this.threadId, message: rpcMessage });
    }
    if (this.currentTurnId) {
      events.push({
        type: "turn.completed",
        threadId: this.threadId,
        turnId: this.currentTurnId,
        state: "failed",
      });
    }
    this.emitRuntimeEvents(events);
  }

  private mapStopReason(stopReason: string): { status: ThreadStatus; attention: ThreadAttention } {
    switch (stopReason) {
      case "end_turn":
      case "cancelled":
        return { status: "idle", attention: "none" };
      case "max_tokens":
      case "max_turn_requests":
      case "refusal":
        return { status: "error", attention: "error" };
      default:
        return { status: "idle", attention: "none" };
    }
  }

  private applySessionUpdateTransform(notification: SessionNotification): SessionNotification {
    if (!this.sessionUpdateTransform) return notification;
    try {
      return this.sessionUpdateTransform(notification);
    } catch (error) {
      console.error(
        "[acp] sessionUpdateTransform threw — using original notification:",
        error instanceof Error ? error.message : String(error),
      );
      return notification;
    }
  }
}
