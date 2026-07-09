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
import {
  buildAcpBrowserMcpServers,
  gateAcpHttpMcpServers,
  type AcpHttpMcpServer,
} from "./mcpBrowser";
import { buildAcpSubagentMcpServers } from "./mcpSubagent";
import { buildAcpComputerUseMcpServers } from "./mcpComputerUse";
import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import { Readable, Writable } from "node:stream";
import {
  ClientSideConnection,
  CreateElicitationRequest as AcpCreateElicitationRequest,
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
} from "@/shared/contracts";
import type { BrowserMcpHttpConfig } from "@/supervisor/agents/browserMcp";
import type { SubagentMcpHttpConfig } from "@/supervisor/agents/subagentMcp";
import type { ComputerUseMcpHttpConfig } from "@/supervisor/agents/computerUseMcp";
import { areAgentSlashCommandsEqual, isThreadConfigEqual } from "@/shared/contracts";
import { buildPromptContentBlocks } from "@/shared/promptContent";
import {
  closeOpenTurnItems,
  createAcpMapperState,
  mapAcpElicitationRequest,
  mapAcpPermissionRequest,
  mapAcpSessionUpdate,
  type AcpMapperState,
} from "./canonicalMapping";
import { terminateChildProcessTree } from "@/shared/processTree";
import {
  createKnownSessionRef,
  type AgentLaunchOptions,
  type CommandSpec,
  type StartTurnOptions,
  type StructuredSessionHandle,
  type StructuredSessionListener,
  type StructuredSessionUpdate,
} from "../base";
import { mapAcpSlashCommands } from "./probe";
import {
  applyAcpModeUpdateToConfig,
  findSelectConfigOption,
  findThoughtLevelConfig,
  resolveAcpMode,
  resolveModelConfigValue,
} from "./sessionConfig";
import { setUnstableSessionModel } from "./unstableModelCompat";

// ── Helpers ──────────────────────────────────────────────────────

import {
  resolveAcpHostFsPath,
  resolveAcpReadableHostFsPath,
  resolveAcpResourcePath,
  resolveSessionCwd,
  resolveSpawnCwd,
  sliceTextFileContent,
  toAcpResourceUri,
} from "./sessionPaths";

export { resolveAcpReadableHostFsPath, resolveAcpResourcePath, toAcpResourceUri };

import { segmentsToContentBlocks } from "./sessionContentBlocks";
import {
  hasNativeAcpPermissionMode,
  selectAutoApprovedPermissionOption,
} from "./sessionPermissionMode";
import { filterAcpInboundNoise, looksLikeAcpSessionNotification } from "./sessionStreamFilter";
import { maybeCaptureAcpUpdate } from "./sessionDiagnostics";
import { AcpTerminalManager } from "./terminalManager";
import {
  appendInterruptAckTextTail,
  createAcpPromptUsageEvent,
  normalizeAcpStopReason,
  resolveAcpPromptFailureMessage,
  resolveAcpPromptRpcErrorMessage,
  rewriteLoadSessionError,
  shouldEmitAcpPromptRpcErrorItem,
} from "./sessionErrors";
import {
  buildAcpElicitationAnswerEvents,
  normalizeAcpElicitationResponse,
} from "./sessionElicitation";

export { normalizeAcpStopReason, rewriteLoadSessionError };

// ── Session ──────────────────────────────────────────────────────

export interface AcpStructuredSessionOptions {
  /**
   * Hook the adapter passes in when it wants to control the message a failed
   * `session/load` produces. Receives the raw transport error and the
   * sessionId that was being loaded; must return the Error to throw.
   */
  loadSessionErrorRewriter?: (error: unknown, sessionId: string) => Error;
  /**
   * Per-adapter notification preprocessor. When set, every `session/update`
   * is run through it before the shared canonical mapper consumes it. Use to
   * bridge provider-specific wire quirks; the shared mapper itself remains
   * provider-agnostic.
   */
  sessionUpdateTransform?: (notification: SessionNotification) => SessionNotification;
  /**
   * Vendor ACP extension notifications (e.g. Cursor `cursor/task`) that are
   * not surfaced as standard `session/update` messages.
   */
  extensionNotificationHandler?: import("../base/types").AcpExtensionNotificationHandler;
  browserMcp?: BrowserMcpHttpConfig;
  subagentMcp?: SubagentMcpHttpConfig;
  computerUseMcp?: ComputerUseMcpHttpConfig;
}

export class AcpStructuredSession implements StructuredSessionHandle {
  launchOptions: AgentLaunchOptions;

  private loadSessionErrorRewriter: (error: unknown, sessionId: string) => Error =
    rewriteLoadSessionError;

  private sessionUpdateTransform?: (notification: SessionNotification) => SessionNotification;

  private extensionNotificationHandler?: import("../base/types").AcpExtensionNotificationHandler;

  private readonly acpToolCallIdToItemId = new Map<string, string>();
  private readonly child: ChildProcess;
  private readonly connection: ClientSideConnection;
  private readonly cwd: string;
  private readonly projectLocation: ProjectLocation;
  private readonly browserMcp: BrowserMcpHttpConfig | undefined;
  private readonly subagentMcp: SubagentMcpHttpConfig | undefined;
  private readonly computerUseMcp: ComputerUseMcpHttpConfig | undefined;
  /** Poracode thread id (stable identifier we report in RuntimeEvents). */
  private readonly threadId: string;
  private readonly stderrChunks: string[] = [];
  private listener: StructuredSessionListener | undefined;
  private sessionId: string | undefined;
  private isDisposed = false;
  private currentConfig: ThreadConfig | undefined;
  private currentSlashCommands: AgentSlashCommand[] | undefined;
  private currentStatus: ThreadStatus = "idle";
  private currentAttention: ThreadAttention = "none";
  private spawnReady: Promise<void> = Promise.resolve();
  private currentTurnId: string | undefined;
  private stableSessionRef: SessionRef | undefined;
  /**
   * True while a `connection.prompt()` call is in flight (between issue and
   * resolution). Used together with `pendingPromptInterrupt` to close the
   * window where `interruptTurn()` fires before the ACP runtime has actually
   * accepted the prompt — without this, `connection.cancel()` lands on an
   * idle session and is silently dropped, so the steer would be lost.
   * Mirrors Codex's `pendingTurnInterrupt` race guard at codex/acp.ts:264.
   */
  private promptInFlight = false;
  private pendingPromptInterrupt = false;
  private currentTurnInterruptRequested = false;
  private recentInterruptAckTextTail = "";
  /** User-visible error text from an `agent_message_chunk` before `prompt()` settles. */
  private agentSurfacedErrorMessage: string | undefined;
  private availableModeIds: string[] = [];
  private currentConfigOptions: unknown[] = [];
  private modeConfigId: string | undefined;
  private modelConfigValue: string | undefined;
  private thoughtLevelConfigId: string | undefined;
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
    options?: AcpStructuredSessionOptions,
  ) {
    this.child = child;
    this.connection = connection;
    this.projectLocation = projectLocation;
    this.cwd = cwd;
    this.threadId = threadId;
    this.launchOptions = { suppressResumeConfigOverrides: true };
    if (options?.loadSessionErrorRewriter) {
      this.loadSessionErrorRewriter = options.loadSessionErrorRewriter;
    }
    if (options?.sessionUpdateTransform) {
      this.sessionUpdateTransform = options.sessionUpdateTransform;
    }
    if (options?.extensionNotificationHandler) {
      this.extensionNotificationHandler = options.extensionNotificationHandler;
    }
    this.browserMcp = options?.browserMcp;
    this.subagentMcp = options?.subagentMcp;
    this.computerUseMcp = options?.computerUseMcp;
  }

  private shouldAutoApproveSyntheticPermissionRequest(): boolean {
    const config = this.currentConfig;
    const policy = config?.approvalPolicy;
    if (!config || config.mode === "plan" || !policy) return false;
    // Bypass-style policy ids across adapters: legacy "never"/"yolo" and the
    // adapter-agnostic "bypassPermissions" used by Claude, Grok, etc. When the
    // agent has no native ACP mode for the requested policy we resolve the
    // synthetic request ourselves instead of prompting the user.
    if (policy !== "never" && policy !== "yolo" && policy !== "bypassPermissions") return false;
    return !hasNativeAcpPermissionMode(policy, this.availableModeIds);
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

  private rememberSessionOptions(availableModeIds: string[], configOptions: unknown): void {
    this.availableModeIds = availableModeIds;
    this.currentConfigOptions = Array.isArray(configOptions) ? configOptions : [];
    this.modeConfigId = findSelectConfigOption(configOptions, "mode")?.id;
    const modelConfig = findSelectConfigOption(configOptions, "model");
    this.modelConfigValue = modelConfig?.currentValue;
    this.thoughtLevelConfigId = findThoughtLevelConfig(configOptions)?.id;
  }

  private async applyTurnConfig(config: ThreadConfig): Promise<void> {
    if (!this.sessionId) {
      return;
    }

    const previousConfig = this.currentConfig;
    const nextModeId = resolveAcpMode(config, this.availableModeIds);
    const previousModeId = previousConfig
      ? resolveAcpMode(previousConfig, this.availableModeIds)
      : undefined;

    if (nextModeId && nextModeId !== previousModeId && this.modeConfigId) {
      try {
        const result = await this.connection.setSessionConfigOption({
          sessionId: this.sessionId,
          configId: this.modeConfigId,
          value: nextModeId,
        });
        this.rememberSessionOptions(this.availableModeIds, result.configOptions);
        console.log("[acp] mode config set to:", nextModeId);
      } catch (error) {
        console.log(
          "[acp] live mode config change rejected, continuing: %s",
          error instanceof Error ? error.message : String(error),
        );
      }
    } else if (nextModeId && nextModeId !== previousModeId) {
      try {
        await this.connection.setSessionMode({ sessionId: this.sessionId, modeId: nextModeId });
        console.log("[acp] mode set to:", nextModeId);
      } catch (error) {
        console.log(
          "[acp] live mode change rejected, continuing: %s",
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    const modelConfig = resolveModelConfigValue(config, this.currentConfigOptions);
    if (
      config.model !== previousConfig?.model ||
      (modelConfig && modelConfig.value !== this.modelConfigValue)
    ) {
      if (modelConfig) {
        try {
          const result = await this.connection.setSessionConfigOption({
            sessionId: this.sessionId,
            configId: modelConfig.configId,
            value: modelConfig.value,
          });
          this.rememberSessionOptions(this.availableModeIds, result.configOptions);
          console.log("[acp] model config set to:", modelConfig.value);
        } catch (error) {
          console.log(
            "[acp] live model config change rejected, continuing: %s",
            error instanceof Error ? error.message : String(error),
          );
        }
      } else {
        try {
          // Fallback for agents without a "model" config option that still
          // speak the removed pre-1.0 model API (see unstableModelCompat.ts).
          await setUnstableSessionModel(this.connection, {
            sessionId: this.sessionId,
            modelId: config.model,
          });
          console.log("[acp] model set to:", config.model);
        } catch (error) {
          console.log(
            "[acp] live model change rejected, continuing: %s",
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    }

    if (config.effort && this.thoughtLevelConfigId && config.effort !== previousConfig?.effort) {
      try {
        await this.connection.setSessionConfigOption({
          sessionId: this.sessionId,
          configId: this.thoughtLevelConfigId,
          value: config.effort,
        });
        console.log("[acp] effort set to:", config.effort);
      } catch (error) {
        console.log(
          "[acp] live effort change rejected, continuing: %s",
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    this.currentConfig = config;
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
    const stream = filterAcpInboundNoise(ndJsonStream(toAgent, fromAgent));

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
      options,
    );
    session.spawnReady = spawnReady;
    session.stderrChunks.push(...stderrChunks);

    // Handle connection close
    void connection.closed.then(() => {
      if (!session.isDisposed) {
        session.listener?.onClose();
      }
    });

    child.once("exit", (code) => {
      // Quiet path: the structured session is one-shot for adapters whose
      // `liveInputMode === "terminal"` (every adapter today). The runtime
      // disposes us once `openThread` returns, and some agents (OpenCode)
      // exit non-zero on stdin close even when everything went fine —
      // there's nothing actionable to surface in that case.
      const expected = session.isDisposed || session.sessionId !== undefined;
      if (expected) {
        console.log(`[acp] child exited (code ${code})`);
      } else {
        console.log(`[acp] child exited unexpectedly (code ${code})`);
      }
      if (!session.isDisposed) {
        session.listener?.onClose();
      }
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
      clientInfo: { name: "lightcode", version: "0.1.0" },
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
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
  /**
   * Drop HTTP MCP servers when the agent's `initialize` response does not
   * advertise `mcpCapabilities.http === true`. Some ACP agents (e.g. Factory
   * Droid via `droid exec --output-format acp-daemon`) reject `newSession`
   * outright with an internal error when handed an HTTP MCP server they can't
   * support, instead of ignoring it — which would kill the thread launch. This
   * is provider-agnostic: it keys purely off the advertised capability, so
   * agents that DO support HTTP MCP (Cursor, Grok, Gemini) keep their servers.
   */
  private gateHttpMcpServers(servers: AcpHttpMcpServer[]): AcpHttpMcpServer[] {
    const kept = gateAcpHttpMcpServers(servers, this.agentMcpCapabilities);
    if (kept.length < servers.length) {
      console.log(
        "[acp] dropping %d HTTP MCP server(s) — agent does not advertise mcpCapabilities.http; launching without them: %s",
        servers.length - kept.length,
        servers.map((s) => s.name).join(", "),
      );
    }
    return kept;
  }

  async openThread(config: ThreadConfig, sessionRef?: SessionRef): Promise<string> {
    let availableModeIds: string[] = [];
    let configOptions: unknown[] = [];
    this.currentConfig = undefined;
    this.currentSlashCommands = undefined;
    const mcpServers = this.gateHttpMcpServers([
      ...(await buildAcpBrowserMcpServers(
        this.projectLocation,
        config.browserMcp === true,
        this.browserMcp,
      )),
      ...buildAcpSubagentMcpServers(config.subagentMcp === true, this.subagentMcp),
      ...buildAcpComputerUseMcpServers(
        this.projectLocation,
        config.computerUse === true,
        this.computerUseMcp,
      ),
    ]);

    if (sessionRef) {
      if (this.agentSessionCapabilities?.resume !== undefined) {
        console.log("[acp] resuming session:", sessionRef.providerSessionId);
        this.isReplayingHistory = true;
        this.replayHistoryUntil = Infinity;
        try {
          const result = await this.connection.resumeSession({
            sessionId: sessionRef.providerSessionId,
            cwd: this.cwd,
            mcpServers,
          });
          this.adoptSessionRef(sessionRef);
          availableModeIds = result.modes?.availableModes?.map((m) => m.id) ?? [];
          configOptions = result.configOptions ?? [];
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
          const result = await this.connection.loadSession({
            sessionId: sessionRef.providerSessionId,
            cwd: this.cwd,
            mcpServers,
          });
          this.adoptSessionRef(sessionRef);
          availableModeIds = result.modes?.availableModes?.map((m) => m.id) ?? [];
          configOptions = result.configOptions ?? [];
        } catch (error) {
          throw this.loadSessionErrorRewriter(error, sessionRef.providerSessionId);
        } finally {
          this.isReplayingHistory = false;
          this.replayHistoryUntil = Date.now() + 500;
        }
      }
    } else {
      console.log("[acp] creating new session in", this.cwd);
      const result = await this.connection.newSession({
        cwd: this.cwd,
        mcpServers,
      });
      this.sessionId = result.sessionId;
      this.stableSessionRef = createKnownSessionRef(result.sessionId);
      availableModeIds = result.modes?.availableModes?.map((m) => m.id) ?? [];
      configOptions = result.configOptions ?? [];
      console.log("[acp] session created:", this.sessionId, "modes:", availableModeIds);
    }

    this.rememberSessionOptions(availableModeIds, configOptions);
    await this.applyTurnConfig(config);

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

    await this.applyTurnConfig(config);

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

    // Signal working state immediately
    this.emitListenerUpdate({ status: "working", attention: "working" });

    const contentBlocks = await segmentsToContentBlocks(
      prompt,
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

      // Map stopReason to Poracode status
      const normalizedStopReason = normalizeAcpStopReason(result.stopReason, {
        interruptRequested: this.currentTurnInterruptRequested,
        recentAgentText: this.recentInterruptAckTextTail,
      });
      this.emitTurnStatusAfterPrompt(normalizedStopReason);
      this.completeTurn(
        this.ensureMapperState(),
        this.agentSurfacedErrorMessage
          ? "failed"
          : normalizedStopReason === "cancelled"
            ? "cancelled"
            : "completed",
      );
    } catch (error) {
      if (this.isDisposed) return;
      this.emitPromptFailure(error);
    } finally {
      this.promptInFlight = false;
      this.pendingPromptInterrupt = false;
      this.currentTurnInterruptRequested = false;
      this.recentInterruptAckTextTail = "";
      this.agentSurfacedErrorMessage = undefined;
      // The mapper's per-turn item state has been cleared via
      // `closeOpenTurnItems`, so any output snapshots from terminals that
      // belonged to this turn are no longer reachable. Drop them so the cache
      // can't grow across a long-lived session.
      this._terminalManager?.clearReleasedTerminalOutput();
      this.clearAcpToolCallItemIdMap();
    }
  }

  /**
   * Respond to a permission request from the agent.
   */
  async resolveServerRequest(requestId: ThreadServerRequestId, response: unknown): Promise<void> {
    // The permission response is stored and resolved by the pending promise
    // in handlePermissionRequest. The runtime calls this with the user's
    // chosen option.
    const resolver = this.pendingPermissionResolvers.get(requestId);
    if (resolver) {
      this.pendingPermissionResolvers.delete(requestId);
      resolver(response);
      return;
    }
    this.resolvePendingElicitationRequest(requestId, response);
  }

  async interruptTurn(): Promise<void> {
    if (!this.sessionId || this.isDisposed) {
      return;
    }

    this.cancelPendingServerRequests();
    this.currentTurnInterruptRequested = true;
    // Race guard: if interrupt fires before `connection.prompt()` has been
    // entered (e.g. the supervisor stages a steer in the same microtask as
    // a fresh startTurn), set a flag instead of issuing the cancel directly.
    // The cancel would land on an idle session and be silently ignored;
    // `startTurn` checks the flag right before awaiting `prompt()` and fires
    // the cancel from there. Mirrors codex/acp.ts:584-599.
    if (!this.promptInFlight) {
      this.pendingPromptInterrupt = true;
      return;
    }
    await this.connection.cancel({ sessionId: this.sessionId });
  }

  async dispose(): Promise<void> {
    if (this.isDisposed) return;
    this.isDisposed = true;

    this.cancelPendingServerRequests();
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
    const path = resolveAcpReadableHostFsPath(this.projectLocation, params.path);
    const fullContent = await readFile(path, "utf8");
    const content = sliceTextFileContent(fullContent, params.line, params.limit);
    return { content };
  }

  private async handleWriteTextFile(params: WriteTextFileRequest): Promise<WriteTextFileResponse> {
    this.assertRequestSession(params.sessionId);
    const path = resolveAcpHostFsPath(this.projectLocation, params.path);
    await writeFile(path, params.content, "utf8");
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

  private readonly pendingPermissionResolvers = new Map<
    ThreadServerRequestId,
    (response: unknown) => void
  >();
  private readonly pendingElicitationResolvers = new Map<
    ThreadServerRequestId,
    {
      resolve: (response: unknown) => void;
      elicitationId?: string;
      request: CreateElicitationRequest;
    }
  >();
  private readonly pendingElicitationRequestIdsByElicitationId = new Map<
    string,
    ThreadServerRequestId
  >();

  private permissionRequestSeq = 0;
  private elicitationRequestSeq = 0;

  private cancelPendingServerRequests(): void {
    const cancelledIds: ThreadServerRequestId[] = [];
    for (const [requestId, resolver] of this.pendingPermissionResolvers) {
      cancelledIds.push(requestId);
      resolver({ outcome: { outcome: "cancelled" } });
    }
    this.pendingPermissionResolvers.clear();
    for (const [requestId, entry] of this.pendingElicitationResolvers) {
      cancelledIds.push(requestId);
      if (entry.elicitationId !== undefined) {
        this.pendingElicitationRequestIdsByElicitationId.delete(entry.elicitationId);
      }
      entry.resolve({ action: "cancel" });
    }
    this.pendingElicitationResolvers.clear();
    if (cancelledIds.length > 0) {
      this.emitRuntimeEvents(
        cancelledIds.map((requestId) => ({
          type: "request.resolved",
          threadId: this.threadId,
          requestId: String(requestId),
          outcome: "cancelled",
        })),
      );
    }
  }

  private resolvePendingElicitationRequest(
    requestId: ThreadServerRequestId,
    response: unknown,
  ): boolean {
    const entry = this.pendingElicitationResolvers.get(requestId);
    if (!entry) return false;
    this.pendingElicitationResolvers.delete(requestId);
    if (entry.elicitationId !== undefined) {
      this.pendingElicitationRequestIdsByElicitationId.delete(entry.elicitationId);
    }
    entry.resolve(response);
    this.emitRuntimeEvents(
      buildAcpElicitationAnswerEvents({
        threadId: this.threadId,
        itemId: `acp-question-answer-${String(requestId)}`,
        request: entry.request,
        response,
      }),
    );
    return true;
  }

  /**
   * Handle `requestPermission` calls from the agent.
   *
   * Maps ACP permission requests to Poracode's `ThreadServerRequest` system.
   * The agent blocks until we respond — we create a pending promise and emit
   * the request to the UI via the listener.
   */
  private handlePermissionRequest(
    params: RequestPermissionRequest,
  ): Promise<RequestPermissionResponse> {
    if (this.shouldAutoApproveSyntheticPermissionRequest()) {
      const optionId = selectAutoApprovedPermissionOption(params);
      if (optionId) {
        return Promise.resolve({ outcome: { outcome: "selected", optionId } });
      }
    }

    return new Promise<RequestPermissionResponse>((resolve) => {
      const requestId = `acp-perm-${this.permissionRequestSeq++}`;

      this.pendingPermissionResolvers.set(requestId, (response: unknown) => {
        const resp = response as { optionId?: string } | undefined;
        if (resp?.optionId) {
          resolve({ outcome: { outcome: "selected", optionId: resp.optionId } });
        } else {
          resolve({ outcome: { outcome: "cancelled" } });
        }
      });

      // Emit a canonical request.opened — the composer-level runtime-request
      // panel renders it and resolves through `bridge.resolveThreadServerRequest`
      // → `resolveServerRequest()` here.
      const mapperState = this.ensureMapperState();
      this.emitRuntimeEvents([mapAcpPermissionRequest(params, mapperState, String(requestId))]);

      // Also signal that the thread needs approval
      this.emitListenerUpdate({ status: "needs_approval", attention: "needs_approval" });
    });
  }

  private handleElicitationRequest(
    params: CreateElicitationRequest,
  ): Promise<CreateElicitationResponse> {
    return new Promise<CreateElicitationResponse>((resolve) => {
      const requestId = `acp-elicit-${this.elicitationRequestSeq++}`;
      const urlElicitationId = AcpCreateElicitationRequest.isUrl(params)
        ? params.elicitationId
        : undefined;

      this.pendingElicitationResolvers.set(requestId, {
        resolve: (response: unknown) => {
          resolve(normalizeAcpElicitationResponse(response, params));
        },
        request: params,
        ...(urlElicitationId !== undefined ? { elicitationId: urlElicitationId } : {}),
      });

      if (urlElicitationId !== undefined) {
        this.pendingElicitationRequestIdsByElicitationId.set(urlElicitationId, requestId);
      }

      const mapperState = this.ensureMapperState();
      this.emitRuntimeEvents([mapAcpElicitationRequest(params, mapperState, String(requestId))]);
      this.emitListenerUpdate({ status: "needs_reply", attention: "needs_reply" });
    });
  }

  private handleElicitationComplete(params: CompleteElicitationNotification): void {
    const requestId = this.pendingElicitationRequestIdsByElicitationId.get(params.elicitationId);
    if (!requestId) return;
    if (this.resolvePendingElicitationRequest(requestId, { action: "accept" })) {
      this.emitRuntimeEvents([
        {
          type: "request.resolved",
          threadId: this.threadId,
          requestId: String(requestId),
          outcome: "answered",
        },
      ]);
    }
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
  private handleSessionUpdate(rawParams: SessionNotification): void {
    maybeCaptureAcpUpdate(rawParams, this.threadId, this.sessionId, this.cwd);

    const params = this.applySessionUpdateTransform(rawParams);
    const update: SessionUpdate = params.update;

    if (update.sessionUpdate === "available_commands_update") {
      this.updateSlashCommands(mapAcpSlashCommands(update.availableCommands));
      if (this.isReplayingHistory) {
        return;
      }
    }

    // Emit canonical events for chat-mode renderers. The legacy text/status
    // path below stays in place — terminal-mode threads still get all the
    // existing behaviour, and the canonical channel runs in parallel.
    //
    // During session resume/load the agent may replay persisted history as
    // `session/update` notifications. Poracode already has those messages
    // in its own DB, so we skip canonical mapping for the replay window to
    // avoid duplicating every message in the chat pane.
    if (!this.isReplayingHistory && Date.now() >= (this.replayHistoryUntil || 0)) {
      const events = mapAcpSessionUpdate(params, this.ensureMapperState());
      this.rememberAcpToolCallItemId(params, events);
      if (events.length > 0) {
        this.recordAgentSurfacedError(events);
        this.emitRuntimeEvents(events);
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
      }
      // fallthrough
      case "agent_thought_chunk":
      case "user_message_chunk":
        // Agent is producing output — stay in "working" state
        break;

      case "tool_call":
        // Agent started a tool call — working state
        this.emitListenerUpdate({ status: "working", attention: "working" });
        break;

      case "tool_call_update":
        // Tool call status changed — still working
        break;

      case "plan":
        // Agent shared its plan — working state
        break;

      case "available_commands_update":
        break;

      case "current_mode_update":
        if (
          this.currentConfig &&
          "currentModeId" in update &&
          typeof update.currentModeId === "string"
        ) {
          const nextConfig = applyAcpModeUpdateToConfig(this.currentConfig, update.currentModeId);
          if (!isThreadConfigEqual(this.currentConfig, nextConfig)) {
            this.currentConfig = nextConfig;
            const sessionRef = this.currentSessionRef();
            // Mode-change confirmations are metadata, not turn boundaries —
            // preserve the live status so the renderer's working-time clock
            // doesn't reset when the agent echoes back a setSessionMode call.
            this.emitListenerUpdate({
              status: this.currentStatus,
              attention: this.currentAttention,
              config: nextConfig,
              ...(sessionRef ? { sessionRef } : {}),
            });
          }
        }
        break;

      case "config_option_update":
        if (this.currentConfig && "configOptions" in update) {
          this.rememberSessionOptions(this.availableModeIds, update.configOptions);
          const thoughtLevelConfig = findThoughtLevelConfig(update.configOptions);
          if (
            thoughtLevelConfig?.currentValue &&
            thoughtLevelConfig.currentValue !== this.currentConfig.effort
          ) {
            const nextConfig = { ...this.currentConfig, effort: thoughtLevelConfig.currentValue };
            this.currentConfig = nextConfig;
            const sessionRef = this.currentSessionRef();
            this.emitListenerUpdate({
              status: this.currentStatus,
              attention: this.currentAttention,
              config: nextConfig,
              ...(sessionRef ? { sessionRef } : {}),
            });
          }
        }
        break;

      case "session_info_update": {
        // Session metadata (title) updates are not evidence of active work.
        break;
      }

      default:
        break;
    }
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
