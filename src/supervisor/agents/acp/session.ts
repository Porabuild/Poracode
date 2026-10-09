import { captureAcpConfigApplicationOwner } from "./sessionConfigOwnership";
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
import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import { isDeepStrictEqual } from "node:util";
import { Readable, Writable } from "node:stream";
import {
  ClientSideConnection,
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
  BackgroundTask,
  ProjectLocation,
  PromptSegment,
  RuntimeEvent,
  SessionConfigOptions,
  SessionRef,
  ThreadAttention,
  ThreadConfig,
  ThreadServerRequestId,
  ThreadStatus,
  ResolvedMcpServer,
  McpTransportKind,
} from "@/shared/contracts";
import { areAgentSlashCommandsEqual, isThreadConfigEqual } from "@/shared/contracts";
import { toErrorMessage } from "@/shared/errorMessage";
import { assertBoundedJson } from "@/shared/jsonBounds";
import { msg } from "@/shared/messages";
import { buildPromptContentBlocks } from "@/shared/promptContent";
import type { AcpTextStreamExtension } from "./canonicalMapping/textStreamExtension";
import { applyClientFileReadExtension } from "./canonicalMapping/textStreamExtension";
import {
  closeOpenTurnItems,
  createAcpMapperState,
  getDetachedSubAgentToolCallIdForNotification,
  mapAcpGoalSlashCommand,
  mapAcpSessionUpdate,
  type AcpMapperState,
} from "./canonicalMapping";
import { awaitProcessTermination } from "@/shared/awaitProcessTermination";
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
import type { AcpSelectBooleanConfigBinding } from "./modelConfigOptions";
import { AcpConfigSelectionError, AcpSessionConfigSync } from "./sessionConfigSync";
import {
  CONFIG_OPTIONS_SNAPSHOT_MAX_BYTES,
  AcpLiveConfigControl,
  type AcpUnlistedSelectValueGuard,
} from "./sessionConfigControl";
import {
  AcpOpenedSessionSetupStaleError,
  runAcpOpenedSessionSetup,
  type AcpConfigureOpenedSession,
  type AcpOpenedSessionKind,
} from "./sessionOpenedSetup";
import { describeConfigOptionsWithRoles } from "./sessionConfigOptions";

// ── Helpers ──────────────────────────────────────────────────────

import {
  acpAdditionalDirectoriesParams,
  snapshotAcpAdditionalDirectories,
  validateAcpAdditionalDirectories,
} from "./sessionWorkspaceRoots";
import { isMissingPathError, toAcpFsRequestError } from "./sessionFsErrors";
import { createAcpLocalImageResolver } from "./sessionLocalImages";
import { AcpPlanModeToolTracker } from "./sessionPlanMode";
import { readTextFileContent } from "./sessionTextFileRead";
import {
  assertAcpCanonicalHostFsPath,
  isAcpHomeScopeLocation,
  resolveAcpGlobalSkillFallbackHostFsPath,
  resolveAcpReadableHostFsPath,
  resolveAcpResourcePath,
  resolveAcpWritableHostFsPath,
  resolveSessionCwd,
  resolveSpawnCwd,
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
import { looksLikeAcpSessionNotification } from "./sessionStreamFilter";
import { createAcpInboundStream, ACP_STDOUT_QUEUED_BYTES } from "./sessionInboundStream";
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
import { isFatalAcpQuotaError } from "./acpUserVisibleErrors";
import { AcpSessionRequests } from "./sessionRequests";
import { AcpExtensionRequests } from "./sessionExtensionRequests";
import { AcpSessionActionError, AcpSessionActionRegistry } from "./sessionActions";
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
 * chatter is exactly what must not reopen a turn. The raw shape alone is not
 * the whole answer, though: the caller additionally checks the update's
 * canonical effects, so a batch that only replays text into already-allocated
 * items (see `isReplacementOnlyDeltaBatch`) counts as history revision, not
 * work.
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

/**
 * Whether a mapped update batch is replacement-only: nonempty, and every event
 * repaints text of an already-allocated item (`content.delta` with
 * `replace: true`) — no item allocated, nothing appended. A provider that
 * re-sends a full-text snapshot after its prompt settled lands here, and that
 * is history revision, not new work: opening an orphan turn for it would paint
 * a phantom "working" thread over an already-completed answer. Real appends
 * stream a plain `content.delta` or allocate via `item.started`, and
 * tools/plan updates produce item lifecycle events, so none of them match.
 */
function isReplacementOnlyDeltaBatch(events: RuntimeEvent[]): boolean {
  return (
    events.length > 0 &&
    events.every((event) => event.type === "content.delta" && event.replace === true)
  );
}

// ── Session ──────────────────────────────────────────────────────

export interface AcpSessionBehavior {
  /** Require advertised, confirmed configuration selections before admitting a prompt. */
  strictConfigSelection?: boolean;
  /**
   * Bind the `fast` ThreadConfig toggle onto one exact native select the agent
   * advertises under non-boolean value ids: `configId` is the select's wire id
   * and `enabled`/`disabled` its two exact advertised value ids. The binding is
   * honored only when a select with exactly those two distinct values is
   * retained — a missing id, a non-select or boolean-typed control, or a select
   * with extra values never claims the toggle. Values keep their native wire
   * spelling everywhere; the shared side maps booleans onto the declared pair
   * instead of rewriting anything to `true`/`false`. Absent keeps the default
   * boolean-pair fast classification.
   */
  fastConfigBinding?: AcpSelectBooleanConfigBinding;
  /**
   * Provider-owned proof that the model the session currently acknowledges
   * itself carries the requested graded effort, so strict target validation
   * does not demand an independent reasoning select from every model. See
   * `AcpConfigSyncBehavior.modelCarriesEffort` — this is the same declaration
   * surfaced at session level for the adapter.
   */
  modelCarriesEffort?: (config: ThreadConfig, sessionOptions: unknown) => boolean;
  /**
   * Allow live config-option writes while a foreground prompt is open. The
   * ACP spec permits configuration changes while an agent is generating, but
   * the default stays reject — a provider whose agent mishandles mid-turn
   * config changes keeps the compatible guard, and one that has qualified
   * the behavior opts in here.
   */
  allowConfigWritesDuringPrompt?: boolean;
  /** Prompt usage may describe one call instead of a session-cumulative counter. */
  promptUsageCounterKind?: "cumulative" | "per-call";
  /** False when prompt consumption cannot measure context-window occupancy. */
  promptUsageReportsContext?: boolean;
  /** Stop painting message and thought chunks as soon as the user cancels. */
  suppressOutputAfterInterrupt?: boolean;
  /** Keep noisy provider diagnostics out of the parent process console. */
  suppressStderrLogging?: boolean;
}

export interface AcpStructuredSessionOptions {
  /** User-approved roots, snapshotted before spawn; no live scope mutation. */
  additionalDirectories?: readonly ProjectLocation[];
  /** Resolve the provider's session mode when its permission modes differ from the terminal client. */
  resolveMode?: typeof import("./sessionConfig").resolveAcpMode;
  /** Provider-owned mapping for model catalogs whose variants use opaque wire IDs. */
  resolveModelConfig?: typeof import("./sessionConfig").resolveModelConfigValue;
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
  /** Vendor capability requests sent on ACP initialize. */
  initializeMeta?: Record<string, unknown>;
  /**
   * Extra keys merged into `initialize.clientCapabilities._meta`. Agents that
   * gate Session Config Options on an undocumented client capability
   * advertise them here.
   */
  clientCapabilitiesMeta?: Record<string, unknown>;
  /**
   * Vendor ACP extension notifications (e.g. Cursor `cursor/task`) that are
   * not surfaced as standard `session/update` messages.
   */
  extensionNotificationHandler?: import("../base/types").AcpExtensionNotificationHandler;
  /**
   * Provider-owned handler for agent-initiated ACP extension *requests* —
   * the typed, bounded counterpart of {@link extensionNotificationHandler}.
   * Requests the handler does not claim are answered with a real
   * `method not found` error (unless they carry a standard session-update
   * payload, which keeps flowing through the notification pipeline).
   */
  extensionRequestHandler?: import("../base/types").AcpExtensionRequestHandler;
  /** Pending extension request bound; see `AcpExtensionRequests`. */
  extensionRequestTimeoutMs?: number;
  /**
   * Outbound session actions the provider declares for this session, invoked
   * by neutral id through the structured session handle.
   */
  sessionActions?:
    | readonly import("../base/types").AcpSessionActionDescriptor[]
    | import("../base/types").AcpSessionActionBuilder;
  /** Advertise the ACP boolean config-option client capability. Default off. */
  booleanConfigOptions?: boolean;
  /**
   * Provider-supplied normalizer applied to every ingested config-option
   * list (open/load/resume, `config_option_update`, setter replies) before
   * the session retains or reduces it. Default: pass-through. See
   * `CreateStructuredSessionInput.acpConfigOptionsNormalizer`.
   */
  configOptionsNormalizer?: import("../base/types").AcpConfigOptionsNormalizer;
  /**
   * Provider-declared setup for one opened session, invoked once per
   * successful open — after the `session/new`, `session/load`, or
   * `session/resume` result's session id is adopted and the agent's native
   * config options and current mode are retained, and before the standard
   * launch config application or any prompt. The context carries the open
   * kind, the exact native session id, a detached bounded raw open-response
   * for provider-owned metadata parsing, a fenced reader for the detached
   * current options, and the fenced `setConfigOption` writer (the shared
   * validated, echo-confirmed live control). Callbacks are bound to this
   * incarnation: after a reopen — even one reusing the same native id — a
   * dispose, or a transport close, retained references fail with a typed
   * stale error and can never touch the newer session. The context also
   * expires when the hook ends. A hook exception rejects the open before
   * launch configuration or prompting; the adopted native ref remains
   * available for failed-start custody. Hook activity never emits a turn.
   * Absent: the open flow is unchanged.
   */
  configureOpenedSession?: AcpConfigureOpenedSession;
  /**
   * Behavior opt-in for live config writes: admit a select value that the
   * exact current option does not advertise. The predicate is consulted only
   * after the standard strict membership check failed, only for select-typed
   * options, and only for string values; it receives a detached option
   * snapshot and must return exactly `true` for the send to proceed — false
   * or a throw fails the write before anything is sent. The single-writer
   * lock, timeout/unknown-outcome handling, and echo confirmation apply
   * unchanged to predicate-approved writes, and no option row or alias is
   * manufactured. Absent: advertised select membership stays strictly
   * required.
   */
  allowUnlistedSelectValue?: AcpUnlistedSelectValueGuard;
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
   * MCP transports relayed optimistically: sent on the first open attempt and
   * excluded from the compatibility-failure retry set. For agents that fail
   * session-open on a transport the ACP schema gives them no way to decline
   * (stdio has no capability flag) — see `acpOptimisticMcpTransports` in the
   * adapter contract.
   */
  optimisticMcpTransports?: readonly McpTransportKind[];
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
  /** Client terminal operations are unavailable when execution belongs to another filesystem. */
  terminalCapability?: boolean;
  /** Provider-specific lifecycle behavior layered over the shared ACP transport. */
  behavior?: AcpSessionBehavior;
  /**
   * Provider hook for agent-text quirks the shared canonical mapper must not
   * know about (e.g. Antigravity's background-task reports embedded in
   * assistant prose).
   */
  textStreamExtension?: AcpTextStreamExtension;
  /**
   * Parse one line of the agent's stderr diagnostics into a turn-hold signal.
   *
   * Some agents keep `session/prompt` unresolved while detached background
   * work is still running: the model has finished its reply, but the stop
   * reason only arrives once every background task exits — never, for a task
   * that doesn't (a dev server, a watcher). The ACP stream itself carries no
   * boundary between "still responding" and "only background tasks remain",
   * so a provider whose agent publishes that boundary on stderr declares a
   * parser here. Returning `"background-wait"` completes the open runtime
   * turn: still-running command items stay open as detached rows (their
   * terminal `tool_call_update` lands later, out of band), the thread paints
   * idle, and the prompt's eventual late resolution is adopted silently
   * instead of double-closing the turn.
   */
  stderrTurnSignalParser?: (line: string) => "background-wait" | undefined;
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

  private readonly resolveModelConfig: AcpStructuredSessionOptions["resolveModelConfig"];
  private readonly resolveMode: AcpStructuredSessionOptions["resolveMode"];

  private emptyResponseErrorResolver?: AcpEmptyResponseErrorResolver;

  private sessionUpdateTransform?: (notification: SessionNotification) => SessionNotification;
  private extensionSessionUpdateTransform?: import("../base/types").AcpExtensionSessionUpdateTransform;

  private readonly initializeMeta: Record<string, unknown> | undefined;
  private readonly clientCapabilitiesMeta: Record<string, unknown> | undefined;
  private readonly behavior: AcpSessionBehavior;
  private readonly textStreamExtension: AcpTextStreamExtension | undefined;
  private readonly stderrTurnSignalParser:
    | ((line: string) => "background-wait" | undefined)
    | undefined;

  private readonly goalCommands: boolean;

  private extensionNotificationHandler?: import("../base/types").AcpExtensionNotificationHandler;

  private readonly extensionRequestHandler?:
    | import("../base/types").AcpExtensionRequestHandler
    | undefined;
  private readonly extensionRequestTimeoutMs: number | undefined;
  private readonly sessionActionDescriptors:
    | readonly import("../base/types").AcpSessionActionDescriptor[]
    | import("../base/types").AcpSessionActionBuilder
    | undefined;
  private readonly booleanConfigOptions: boolean;
  private readonly configOptionsNormalizer:
    | import("../base/types").AcpConfigOptionsNormalizer
    | undefined;
  private readonly configureOpenedSession: AcpConfigureOpenedSession | undefined;
  private readonly allowUnlistedSelectValue: AcpUnlistedSelectValueGuard | undefined;

  private externalSessionUpdateSources?: Set<AcpExternalSessionUpdateSource>;

  private readonly acpToolCallIdToItemId = new Map<string, string>();
  private readonly child: ChildProcess;
  private readonly connection: ClientSideConnection;
  private readonly cwd: string;
  private readonly projectLocation: ProjectLocation;
  private readonly additionalDirectories: readonly ProjectLocation[];
  private readonly mcpServers: readonly ResolvedMcpServer[];
  private readonly assumedMcpCapabilities: AcpMcpCapabilities | undefined;
  private readonly optimisticMcpTransports: readonly McpTransportKind[] | undefined;
  private readonly fsAgentHomeDirs: readonly string[];
  private readonly fsTextCapability: boolean;
  private readonly terminalCapability: boolean;
  /** Reads referenced local images for the canonical mapper (per-session cache). */
  private readonly resolveLocalImage: (pathOrFileUri: string) => string | undefined;
  private planModeToolTrackerInstance: AcpPlanModeToolTracker | undefined;
  /** Poracode thread id (stable identifier we report in RuntimeEvents). */
  private readonly threadId: string;
  private readonly stderrChunks: string[];
  private listener: StructuredSessionListener | undefined;
  private sessionId: string | undefined;
  /**
   * Bumped on every re-open and on dispose. Config writes and actions fence
   * against the captured (sessionId, generation) pair, so a reopen that
   * reuses the same native session id still fences a stale write out of the
   * new incarnation.
   */
  private sessionGeneration = 0;
  private isDisposed = false;
  private disposal: Promise<void> | undefined;
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
  private suppressAgentOutputUntilNextTurn = false;
  /**
   * The provider signalled (via `stderrTurnSignalParser`) that the in-flight
   * `session/prompt` is now held open only for detached background work. The
   * runtime turn has already been completed and painted idle; the prompt's
   * eventual resolution must be adopted silently instead of closing a turn.
   */
  private promptHeldForBackgroundWork = false;
  /**
   * Serializes `startTurn` calls. ACP allows one `session/prompt` per session
   * at a time, and an agent that holds the prompt open for background work
   * (see `stderrTurnSignalParser`) is already idle from the user's point of
   * view — a new message must queue behind the held prompt rather than race a
   * second prompt onto the wire (the agent would queue it server-side anyway,
   * with no updates until the background work ends).
   */
  private startTurnChain: Promise<void> = Promise.resolve();
  private recentInterruptAckTextTail = "";
  /** User-visible error text from an `agent_message_chunk` before `prompt()` settles. */
  private agentSurfacedErrorMessage: string | undefined;
  private currentTurnHadAgentActivity = false;
  private agentPromptCapabilities: PromptCapabilities | undefined;
  private agentSessionCapabilities: SessionCapabilities | undefined;
  private agentMcpCapabilities: McpCapabilities | undefined;
  private mapperState: AcpMapperState | undefined;
  /**
   * Last `background_tasks.changed` list emitted by this session. Any
   * text-stream extension may produce that event; the session only mirrors
   * it for snapshot/getBackgroundTasks consumers.
   */
  private reportedBackgroundTasks: readonly BackgroundTask[] = [];
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
        additionalDirectories: this.additionalDirectories ?? [],
        assertRequestSession: (sessionId) => this.assertRequestSession(sessionId),
        getSessionGeneration: () => this.sessionGeneration ?? 0,
      });
    }
    return this._terminalManager;
  }

  /** Lazily initialized for parity with constructor-bypassing test harnesses. */
  private _sessionConfigSync: AcpSessionConfigSync | undefined;

  private get sessionConfigSync(): AcpSessionConfigSync {
    if (!this._sessionConfigSync) {
      this._sessionConfigSync = new AcpSessionConfigSync(
        this.connection,
        this.resolveMode,
        this.resolveModelConfig,
        {
          strictConfigSelection: this.behavior?.strictConfigSelection ?? false,
          ...(this.behavior?.fastConfigBinding
            ? { fastConfigBinding: this.behavior.fastConfigBinding }
            : {}),
          ...(this.behavior?.modelCarriesEffort
            ? { modelCarriesEffort: this.behavior.modelCarriesEffort }
            : {}),
        },
        ...(this.configOptionsNormalizer ? [this.configOptionsNormalizer] : []),
      );
      // Every successful normalized ingest — session open/load/resume, an
      // agent-owned `config_option_update`, and setter echoes — republishes
      // the detached inventory over the structured listener, the same path
      // config values and slash commands ride. Replayed historical updates
      // stay suppressed like every mapped replay artifact; the load result's
      // own ingest (outside the replay window) publishes the authoritative
      // list.
      this._sessionConfigSync.onOptionsIngested = () => {
        if (
          this.isDisposed ||
          this.isReplayingHistory ||
          Date.now() < (this.replayHistoryUntil || 0)
        ) {
          return;
        }
        this.publishRetainedSessionConfigOptions();
      };
    }
    return this._sessionConfigSync;
  }

  /** One owner guard covers queue admission, wire results and the final config commit. */
  private async applyCurrentConfig(config: ThreadConfig): Promise<void> {
    const assertCurrent = captureAcpConfigApplicationOwner(() => ({
      sessionId: this.sessionId,
      generation: this.sessionGeneration ?? 0,
      disposed: this.isDisposed ?? false,
      transportClosed: this.transportClosed ?? false,
    }));
    try {
      const confirmed = await this.sessionConfigSync.applyTurnConfig(
        this.sessionId,
        config,
        this.currentConfig,
        assertCurrent,
      );
      assertCurrent();
      // Intermediate full-list notifications can report old toggle values
      // while setters are still applying. Publish the final authoritative
      // result too: a setter may confirm only in its RPC reply, with no later
      // notification to repair that earlier renderer update.
      const reported = confirmed
        ? (this.sessionConfigSync.reduceConfigOptions(
            confirmed,
            this.sessionConfigSync.listRetainedConfigOptions(),
          ) ?? confirmed)
        : undefined;
      if (reported && !isThreadConfigEqual(this.currentConfig, reported)) {
        this.commitAgentConfigChange(reported);
      } else {
        this.currentConfig = reported;
      }
    } catch (error) {
      assertCurrent();
      if (error instanceof AcpConfigSelectionError && error.confirmedConfig) {
        this.commitAgentConfigChange(error.confirmedConfig);
      }
      throw error;
    }
  }

  /** Lazily initialized for parity with constructor-bypassing test harnesses. */
  private _configControl: AcpLiveConfigControl | undefined;

  private get configControl(): AcpLiveConfigControl {
    if (!this._configControl) {
      this._configControl = new AcpLiveConfigControl({
        connection: this.connection,
        configSync: this.sessionConfigSync,
        configWrites: this.sessionConfigSync.configWrites,
        getOwner: () => ({
          sessionId: this.sessionId ?? "",
          generation: this.sessionGeneration ?? 0,
          disposed: this.isDisposed,
          transportClosed: this.transportClosed,
        }),
        isBooleanCapabilityNegotiated: () => this.booleanConfigOptions === true,
        isForegroundPromptOpen: () => this.foregroundTurnOpen || this.promptInFlight,
        allowDuringPrompt: () => this.behavior?.allowConfigWritesDuringPrompt === true,
        ...(this.allowUnlistedSelectValue
          ? { allowUnlistedSelectValue: this.allowUnlistedSelectValue }
          : {}),
        getCurrentConfig: () => this.currentConfig,
        onConfigReconciled: (next) => this.commitAgentConfigChange(next),
      });
    }
    return this._configControl;
  }

  /** Lazily initialized so unused lifecycles never allocate. */
  private _extensionRequests: AcpExtensionRequests | undefined;

  private get extensionRequests(): AcpExtensionRequests {
    if (!this._extensionRequests) {
      this._extensionRequests = new AcpExtensionRequests({
        threadId: this.threadId,
        getSessionId: () => this.sessionId,
        ...(this.extensionRequestHandler ? { handler: this.extensionRequestHandler } : {}),
        ...(this.extensionRequestTimeoutMs !== undefined
          ? { requestTimeoutMs: this.extensionRequestTimeoutMs }
          : {}),
      });
    }
    return this._extensionRequests;
  }

  /** Lazily initialized; absent when the provider declares no session actions. */
  private _sessionActionRegistry: AcpSessionActionRegistry | undefined;

  private get sessionActionRegistry(): AcpSessionActionRegistry | undefined {
    if (!this._sessionActionRegistry && this.sessionActionDescriptors) {
      this._sessionActionRegistry = new AcpSessionActionRegistry({
        threadId: this.threadId,
        getSessionId: () => this.sessionId,
        actions:
          typeof this.sessionActionDescriptors === "function"
            ? this.sessionActionDescriptors({
                request: async (method, params, options) => {
                  options?.signal?.throwIfAborted();
                  if (this.isDisposed || !this.sessionId) {
                    throw new AcpSessionActionError("unavailable", "ACP session is not open.");
                  }
                  const result = await this.connection.extMethod(method, params);
                  options?.signal?.throwIfAborted();
                  return result;
                },
                // Live config surface for descriptor composition: the same
                // validated, fenced seam the shared session drives its own
                // config paths through.
                getConfigOptions: () => this.configControl.getConfigOptions(),
                setConfigOption: (configId, value, options) =>
                  this.configControl.setConfigOption(configId, value, options),
              })
            : this.sessionActionDescriptors,
      });
    }
    return this._sessionActionRegistry;
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
    this.resolveMode = options?.resolveMode;
    this.resolveModelConfig = options?.resolveModelConfig;
    this.child = child;
    this.connection = connection;
    this.projectLocation = Object.freeze({ ...projectLocation });
    this.additionalDirectories = options?.additionalDirectories ?? Object.freeze([]);
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
    this.initializeMeta = options?.initializeMeta;
    this.clientCapabilitiesMeta = options?.clientCapabilitiesMeta;
    this.behavior = options?.behavior ?? {};
    this.textStreamExtension = options?.textStreamExtension;
    this.stderrTurnSignalParser = options?.stderrTurnSignalParser;
    if (options?.extensionNotificationHandler) {
      this.extensionNotificationHandler = options.extensionNotificationHandler;
    }
    this.extensionRequestHandler = options?.extensionRequestHandler;
    this.extensionRequestTimeoutMs = options?.extensionRequestTimeoutMs;
    this.sessionActionDescriptors = options?.sessionActions;
    this.booleanConfigOptions = options?.booleanConfigOptions === true;
    this.configOptionsNormalizer = options?.configOptionsNormalizer;
    this.configureOpenedSession = options?.configureOpenedSession;
    this.allowUnlistedSelectValue = options?.allowUnlistedSelectValue;
    this.mcpServers = options?.mcpServers ?? [];
    this.assumedMcpCapabilities = options?.assumedMcpCapabilities;
    this.optimisticMcpTransports = options?.optimisticMcpTransports;
    this.fsAgentHomeDirs = options?.fsAgentHomeDirs ?? [];
    this.fsTextCapability = options?.fsTextCapability !== false;
    this.terminalCapability = options?.terminalCapability !== false;
    this.resolveLocalImage = createAcpLocalImageResolver(this.projectLocation);
  }

  /** Initialize the canonical mapper once we have a stable thread id. */
  private ensureMapperState(): AcpMapperState {
    if (!this.mapperState || this.mapperState.threadId !== this.threadId) {
      this.mapperState = createAcpMapperState(this.threadId, this.textStreamExtension);
      // Bridge the client-hosted ACP terminal store into the mapper so
      // `ToolCallContent` entries of type `"terminal"` (Gemini's shell tool)
      // get inlined as the canonical `result` payload.
      this.mapperState.resolveTerminalOutput = (terminalId) =>
        this.terminalManager.getTerminalOutput(terminalId);
      this.mapperState.resolveTerminalOutputByCommand = (command) =>
        this.terminalManager.resolveAcpTerminalOutputByCommand(command);
      // Agents that report an image result by reference (a `uri`-only image
      // block, or only a read-kind tool call's `locations`) need a filesystem
      // read the pure mapper can't do itself.
      this.mapperState.resolveLocalImage = this.resolveLocalImage;
    }
    return this.mapperState;
  }

  private emitRuntimeEvents(events: RuntimeEvent[]): void {
    if (events.length === 0) return;
    for (const event of events) {
      if (event.type === "background_tasks.changed") {
        this.reportedBackgroundTasks = event.tasks;
      }
    }
    if (!this.listener?.onRuntimeEvent) {
      this.bufferedRuntimeEvents.push(...events);
      return;
    }
    for (const event of events) {
      this.listener.onRuntimeEvent(event);
    }
  }

  getBackgroundTasks(): readonly BackgroundTask[] {
    return this.reportedBackgroundTasks;
  }

  private emitListenerUpdate(update: StructuredSessionUpdate): void {
    this.currentStatus = update.status;
    this.currentAttention = update.attention;
    this.listener?.onUpdate(update);
  }

  private emitCurrentState(listener: StructuredSessionListener): void {
    const sessionRef = this.getSessionRef();
    listener.onUpdate({
      status: this.currentStatus,
      attention: this.currentAttention,
      ...(this.currentConfig ? { config: this.currentConfig } : {}),
      ...(sessionRef ? { sessionRef } : {}),
      ...(this.currentSlashCommands !== undefined
        ? { slashCommands: this.currentSlashCommands }
        : {}),
      ...(this.pushedSessionConfigOptions !== undefined
        ? {
            sessionConfigOptions: structuredClone(
              this.pushedSessionConfigOptions,
            ) as SessionConfigOptions,
          }
        : {}),
    });
  }

  private updateSlashCommands(commands: AgentSlashCommand[]): void {
    if (areAgentSlashCommandsEqual(this.currentSlashCommands, commands)) {
      return;
    }
    this.currentSlashCommands = commands;
    const sessionRef = this.getSessionRef();
    this.emitListenerUpdate({
      status: this.currentStatus,
      attention: this.currentAttention,
      ...(this.currentConfig ? { config: this.currentConfig } : {}),
      ...(sessionRef ? { sessionRef } : {}),
      slashCommands: commands,
    });
  }

  /**
   * The config-option inventory this handle last published to the listener —
   * `null` once retired for a new incarnation. `undefined` only before the
   * first publication, so a handle whose agent never spoke replays nothing.
   */
  private pushedSessionConfigOptions: SessionConfigOptions | null | undefined;

  private publishRetainedSessionConfigOptions(): void {
    // Detached and bounded like the live-control snapshot: the published
    // copy never aliases retained state, and an oversized inventory never
    // travels the listener — the previously published inventory stays
    // authoritative rather than inventing a truncation.
    const described = describeConfigOptionsWithRoles(
      this.sessionConfigSync.listRetainedConfigOptions(),
      this.behavior?.fastConfigBinding,
    );
    let inventory: SessionConfigOptions;
    try {
      inventory = structuredClone(described) as SessionConfigOptions;
      assertBoundedJson(inventory, CONFIG_OPTIONS_SNAPSHOT_MAX_BYTES);
    } catch (error) {
      console.warn(
        "[acp] session config options exceed the detached push bound; keeping the previous inventory: %s",
        toErrorMessage(error),
      );
      return;
    }
    this.publishSessionConfigOptions(inventory);
  }

  private publishSessionConfigOptions(inventory: SessionConfigOptions | null): void {
    if (
      this.pushedSessionConfigOptions !== undefined &&
      isDeepStrictEqual(this.pushedSessionConfigOptions, inventory)
    ) {
      return;
    }
    // The dedupe baseline is its own copy: a listener mutating the delivered
    // array can never poison the comparison or later replays.
    this.pushedSessionConfigOptions = structuredClone(inventory) as SessionConfigOptions;
    const sessionRef = this.getSessionRef();
    this.emitListenerUpdate({
      status: this.currentStatus,
      attention: this.currentAttention,
      ...(this.currentConfig ? { config: this.currentConfig } : {}),
      ...(sessionRef ? { sessionRef } : {}),
      sessionConfigOptions: inventory,
    });
  }

  getSessionRef(): SessionRef | undefined {
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
    options = {
      ...options,
      additionalDirectories: snapshotAcpAdditionalDirectories(
        projectLocation,
        options?.additionalDirectories,
      ),
    };
    const sessionCwd = resolveSessionCwd(projectLocation);
    const spawnCwd = command.cwd ?? resolveSpawnCwd(projectLocation);

    const child = spawnChild(command.command, command.args, {
      ...(spawnCwd ? { cwd: spawnCwd } : {}),
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, TERM: "xterm-256color", ...(command.env ?? {}) },
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
    });

    // Track spawn outcome — activate() awaits this before writing to stdin.
    const spawnReady = new Promise<void>((resolve, reject) => {
      child.on("error", (err) => {
        console.log("[acp] spawn error:", err.message);
        reject(new Error(`ACP agent failed to start: ${err.message}`));
      });
      child.on("spawn", resolve);
    });

    let session: AcpStructuredSession;

    // Collect stderr for error diagnostics
    const stderrChunks: string[] = [];
    let stderrLineTail = "";
    child.stderr?.on("data", (chunk) => {
      const text = String(chunk);
      if (!options?.behavior?.suppressStderrLogging) {
        console.log("[acp stderr]", text.trimEnd());
      }
      stderrChunks.push(text);
      if (stderrChunks.length > 20) stderrChunks.shift();
      if (options?.stderrTurnSignalParser) {
        stderrLineTail += text;
        let newlineIdx;
        while ((newlineIdx = stderrLineTail.indexOf("\n")) !== -1) {
          const line = stderrLineTail.slice(0, newlineIdx);
          stderrLineTail = stderrLineTail.slice(newlineIdx + 1);
          session.handleStderrTurnSignalLine(line);
        }
      }
    });

    // Wrap Node.js streams into Web Streams for the ACP SDK.
    // The Node.js → Web Stream adapters produce compatible types but
    // tsgo's strict generics require explicit casts.
    const toAgent = Writable.toWeb(child.stdin!) as WritableStream<Uint8Array>;
    const fromAgent = Readable.toWeb(child.stdout!, {
      strategy: {
        highWaterMark: ACP_STDOUT_QUEUED_BYTES,
        size: (chunk: Uint8Array) => chunk.byteLength,
      },
    }) as ReadableStream<Uint8Array>;
    const stream = createAcpInboundStream(toAgent, fromAgent);

    const connection = new ClientSideConnection(
      (_agent): Client => ({
        requestPermission(params: RequestPermissionRequest) {
          return session.handlePermissionRequest(params);
        },
        createElicitation(params: CreateElicitationRequest) {
          return session.handleElicitationRequest(params);
        },
        completeElicitation(params: CompleteElicitationNotification) {
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
          return session.handleExtMethod(method, params);
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
    if (
      this.sessionId ||
      this.currentConfig ||
      this.currentSlashCommands !== undefined ||
      this.pushedSessionConfigOptions !== undefined
    ) {
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
        terminal: this.terminalCapability !== false,
        // Only advertised when the provider declares it: the shared session
        // records boolean config options it observes but cannot yet drive a
        // generic boolean control, so the default stays off.
        ...(this.booleanConfigOptions ? { session: { configOptions: { boolean: {} } } } : {}),
        ...(this.clientCapabilitiesMeta ? { _meta: this.clientCapabilitiesMeta } : {}),
      },
      ...(this.initializeMeta ? { _meta: this.initializeMeta } : {}),
    });
    this.agentPromptCapabilities = initResult.agentCapabilities?.promptCapabilities;
    this.agentSessionCapabilities = initResult.agentCapabilities?.sessionCapabilities;
    this.agentMcpCapabilities = initResult.agentCapabilities?.mcpCapabilities;
    acpAdditionalDirectoriesParams(this.additionalDirectories ?? [], this.agentSessionCapabilities);
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
    const capabilities = resolveAcpMcpCapabilities(
      this.agentMcpCapabilities,
      this.assumedMcpCapabilities,
    );
    const built = buildAcpMcpServers(this.mcpServers);
    const attempted = this.gateMcpServers(built, capabilities);
    const optimisticTransports = this.optimisticMcpTransports;
    let fallback: ProtocolMcpServer[];
    if (optimisticTransports !== undefined && optimisticTransports.length > 0) {
      // Optimistic transports ride along on the first attempt only; the retry
      // set excludes them so a compatibility failure can still open the
      // session without them.
      fallback = gateAcpMcpServers(
        buildAcpMcpServers(
          this.mcpServers.filter((server) => !optimisticTransports.includes(server.transport.type)),
        ),
        capabilities,
      );
    } else if (
      this.agentMcpCapabilities === undefined &&
      this.assumedMcpCapabilities !== undefined
    ) {
      fallback = gateAcpMcpServers(built, this.agentMcpCapabilities);
    } else {
      fallback = attempted;
    }
    if (fallback.length === attempted.length) return open(attempted);

    try {
      return await open(attempted);
    } catch (error) {
      if (!isAssumedMcpCompatibilityError(error)) throw error;
      console.log(
        "[acp] session open failed with %d assumed-transport MCP server(s) (ACP error %d); retrying without them",
        attempted.length - fallback.length,
        error.code,
      );
      return open(fallback);
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
    // A re-open changes the session identity: pending extension requests and
    // in-flight session actions belong to the previous generation.
    this._extensionRequests?.reset();
    this._sessionActionRegistry?.abortPending();
    this.sessionGeneration = (this.sessionGeneration ?? 0) + 1;
    // The whole open is fenced to this generation. Every await below — the
    // new/load/resume RPC, the provider open hook, and the launch config
    // application — re-asserts it before adopting anything, so a concurrent
    // re-open (or a dispose or transport close) can never let a superseded
    // open mutate the newer incarnation's config, inventory, or launch
    // custody.
    const openGeneration = this.sessionGeneration ?? 0;
    const assertOpenGeneration = (): void => {
      if (
        (this.sessionGeneration ?? 0) !== openGeneration ||
        this.isDisposed ||
        this.transportClosed
      ) {
        throw new AcpOpenedSessionSetupStaleError();
      }
    };
    const workspaceParams = () =>
      acpAdditionalDirectoriesParams(
        this.additionalDirectories ?? [],
        this.agentSessionCapabilities,
      );
    workspaceParams();
    if (this.additionalDirectories?.length) {
      await validateAcpAdditionalDirectories(this.additionalDirectories);
      assertOpenGeneration();
    }
    let availableModeIds: string[] = [];
    let agentCurrentModeId: string | undefined;
    let configOptions: unknown[] | null | undefined;
    // Which open call produced the session, and its raw wire result — the
    // provider open hook's detached-metadata input. One value per branch.
    let openResponse: unknown;
    let openKind: AcpOpenedSessionKind;
    this.currentConfig = undefined;
    this.currentSlashCommands = undefined;
    // A re-open is a new incarnation of this handle: the previous negotiated
    // inventory is retired explicitly — never `[]`, which would claim the
    // fresh agent authoritatively advertises nothing before it has spoken.
    this.sessionConfigSync.clearRetainedOptions();
    this.publishSessionConfigOptions(null);

    if (sessionRef) {
      if (this.agentSessionCapabilities?.resume != null) {
        console.log("[acp] resuming session:", sessionRef.providerSessionId);
        this.isReplayingHistory = true;
        this.replayHistoryUntil = Infinity;
        try {
          const result = await this.openWithMcpServers((mcpServers) =>
            this.connection.resumeSession({
              sessionId: sessionRef.providerSessionId,
              cwd: this.cwd,
              ...workspaceParams(),
              mcpServers,
            }),
          );
          // The RPC resolved after this open was superseded — adopt nothing:
          // the successor incarnation owns the id, inventory, and launch
          // custody, and the old result must not overwrite any of it.
          assertOpenGeneration();
          this.adoptSessionRef(sessionRef);
          this.trackUsageScope(sessionRef.providerSessionId, false);
          availableModeIds = result.modes?.availableModes?.map((m) => m.id) ?? [];
          agentCurrentModeId = result.modes?.currentModeId;
          configOptions = result.configOptions;
          openResponse = result;
          openKind = "resume";
        } catch (error) {
          // A superseded open rejects as the typed stale error; it is not a
          // resume failure of the successor's session.
          if (error instanceof AcpOpenedSessionSetupStaleError) throw error;
          throw this.loadSessionErrorRewriter(error, sessionRef.providerSessionId);
        } finally {
          // A superseded open must not clear the successor's replay window.
          if ((this.sessionGeneration ?? 0) === openGeneration) {
            this.isReplayingHistory = false;
            this.replayHistoryUntil = Date.now() + 500;
          }
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
              ...workspaceParams(),
              mcpServers,
            }),
          );
          // The RPC resolved after this open was superseded — adopt nothing:
          // the successor incarnation owns the id, inventory, and launch
          // custody, and the old result must not overwrite any of it.
          assertOpenGeneration();
          this.adoptSessionRef(sessionRef);
          this.trackUsageScope(sessionRef.providerSessionId, false);
          availableModeIds = result.modes?.availableModes?.map((m) => m.id) ?? [];
          agentCurrentModeId = result.modes?.currentModeId;
          configOptions = result.configOptions;
          openResponse = result;
          openKind = "load";
        } catch (error) {
          // A superseded open rejects as the typed stale error; it is not a
          // load failure of the successor's session.
          if (error instanceof AcpOpenedSessionSetupStaleError) throw error;
          throw this.loadSessionErrorRewriter(error, sessionRef.providerSessionId);
        } finally {
          // A superseded open must not clear the successor's replay window.
          if ((this.sessionGeneration ?? 0) === openGeneration) {
            this.isReplayingHistory = false;
            this.replayHistoryUntil = Date.now() + 500;
          }
        }
      }
    } else {
      console.log("[acp] creating new session in", this.cwd);
      const result = await this.openWithMcpServers((mcpServers) =>
        this.connection.newSession({
          cwd: this.cwd,
          ...workspaceParams(),
          mcpServers,
        }),
      );
      // The RPC resolved after this open was superseded — adopt nothing: the
      // successor incarnation owns the id, inventory, and launch custody.
      assertOpenGeneration();
      this.sessionId = result.sessionId;
      this.stableSessionRef = createKnownSessionRef(result.sessionId);
      this.trackUsageScope(result.sessionId, true);
      availableModeIds = result.modes?.availableModes?.map((m) => m.id) ?? [];
      agentCurrentModeId = result.modes?.currentModeId;
      configOptions = result.configOptions;
      openResponse = result;
      openKind = "new";
      console.log("[acp] session created:", this.sessionId, "modes:", availableModeIds);
    }

    let inventoryIngested = false;
    if (Array.isArray(configOptions)) {
      inventoryIngested = this.sessionConfigSync.rememberOptions(availableModeIds, configOptions);
    } else {
      this.sessionConfigSync.rememberAvailableModes(availableModeIds);
    }
    // `SessionModeState.currentModeId` is the agent's own statement of the mode
    // it is in — authoritative for a resumed session, where it reflects state
    // the agent restored. Recording it keeps `applyTurnConfig` from re-pushing
    // that same mode back at the agent.
    this.sessionConfigSync.rememberCurrentMode(agentCurrentModeId);
    this.planModeToolTracker.reset();
    // Provider-declared open hook (fail closed): this open's identity is
    // adopted and the native options/current mode are retained, and no
    // launch config push or prompt has touched the session yet. Fenced to
    // this incarnation; any hook failure — a throw, a stale incarnation, or
    // an undetachable/out-of-bounds open response — rejects this open instead
    // of falling back to the default config path, which could apply the
    // launch config or prompt on the wrong repo/platform/persona. The
    // allocated native session ref stays adopted, so the supervisor's
    // unpublished-start custody still sees it through `getSessionRef`. Hook
    // activity never synthesizes a prompt or turn.
    assertOpenGeneration();
    await runAcpOpenedSessionSetup({
      kind: openKind,
      sessionId: this.sessionId!,
      openResponse,
      hook: this.configureOpenedSession,
      getOwner: () => ({
        sessionId: this.sessionId ?? "",
        generation: this.sessionGeneration ?? 0,
        disposed: this.isDisposed,
        transportClosed: this.transportClosed,
      }),
      readConfigOptions: () => this.configControl.getConfigOptions(),
      writeConfigOption: (configId, value, callOptions) =>
        this.configControl.setConfigOption(configId, value, callOptions),
    });
    assertOpenGeneration();
    await this.applyCurrentConfig(config);
    assertOpenGeneration();
    // The RPC result is authoritative even inside the trailing history-replay
    // grace window. Publish after launch setters settle so their current values
    // are included; historical notifications remain suppressed independently.
    if (inventoryIngested) this.publishRetainedSessionConfigOptions();
    assertOpenGeneration();

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
    // Serialize turns. A prompt held open for background work (see
    // `stderrTurnSignalParser`) leaves the thread idle while `session/prompt`
    // is still pending, so a follow-up message queues behind it here instead
    // of racing a second prompt onto a session that only takes one at a time.
    const previousTurn = this.startTurnChain;
    let releaseTurn!: () => void;
    this.startTurnChain = new Promise((resolve) => {
      releaseTurn = resolve;
    });
    try {
      // Only queue when a prompt is actually pending — the fast path must
      // start synchronously so interrupt staging keeps its existing timing.
      if (this.promptInFlight) {
        await previousTurn;
        if (this.isDisposed) return;
      }
      await this.runStartTurn(prompt, config, segments, options);
    } finally {
      releaseTurn();
    }
  }

  private async runStartTurn(
    prompt: string,
    config: ThreadConfig,
    segments?: PromptSegment[],
    options?: StartTurnOptions,
  ): Promise<void> {
    if (!this.sessionId) {
      throw new Error("ACP session not opened yet.");
    }
    this.currentTurnInterruptRequested = false;
    // A fresh turn ends the previous turn's output suppression. An idle
    // interrupt must not cancel a subsequently submitted prompt.
    this.suppressAgentOutputUntilNextTurn = false;
    this.recentInterruptAckTextTail = "";
    this.agentSurfacedErrorMessage = undefined;
    this.currentTurnHadAgentActivity = false;
    this.stderrChunks.length = 0;

    await this.applyCurrentConfig(config);

    // A real prompt supersedes any agent-initiated turn still in progress, so
    // its items close under that turn instead of leaking into this one. Silent:
    // the `working` paint below covers the handover with no idle flicker.
    this.completeOrphanTurn({ silent: true });
    // Same for a foreground turn still awaiting detached subagent reports:
    // the wait has no prompt left to anchor it. Detached tool calls stay in
    // the mapper and can still report as detached turns.
    if (this.foregroundTurnAwaitingSubagents) {
      this.foregroundTurnAwaitingSubagents = false;
      this.completeTurn(this.ensureMapperState(), "completed");
    }
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
    // A background handoff may finish the foreground turn before the prompt
    // returns. Consumption still belongs to this accepted prompt attempt.
    const usageSampleTurnId = this.currentTurnId;
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
      // Stop may arrive while configuration setters are awaited. The provider
      // is still idle then: a cancel sent before prompt cannot cancel future
      // work. Close this accepted turn without issuing a prompt instead.
      this.pendingPromptInterrupt = false;
      if (this.currentTurnInterruptRequested) {
        this.emitTurnStatusAfterPrompt("cancelled");
        this.completeTurn(this.ensureMapperState(), "cancelled");
        return;
      }
      this.promptInFlight = true;
      const result = await this.connection.prompt({
        sessionId: this.sessionId,
        prompt: contentBlocks,
      });
      if (this.behavior?.promptUsageReportsContext !== false) {
        const usageEvent = createAcpPromptUsageEvent(this.threadId, result.usage);
        if (usageEvent) this.emitRuntimeEvents([usageEvent]);
      }
      // Counter semantics are provider-declared; consumption and context
      // occupancy are independent. Missing usage emits neither a zero nor a
      // fabricated token total.
      if (this.usageScopeId) {
        const spentEvent = createAcpPromptUsageSpentEvent(this.threadId, result.usage, {
          scopeId: this.usageScopeId,
          epoch: this.usageEpoch,
          ...(this.usageScopeFresh ? { fresh: true } : {}),
          ...(this.behavior?.promptUsageCounterKind === "per-call"
            ? {
                counterKind: "per-call" as const,
                sampleId: `acp-prompt-v1:${this.usageScopeId}:${this.usageEpoch}:${usageSampleTurnId}`,
                turnId: usageSampleTurnId,
              }
            : {}),
        });
        if (spentEvent) {
          this.emitRuntimeEvents([spentEvent]);
          this.usageScopeFresh = false;
        }
      }

      if (this.promptHeldForBackgroundWork) {
        // The runtime turn was already completed when the background-wait
        // signal arrived (see `stderrTurnSignalParser`). This late resolution
        // only has to close the synthetic turn that wrapped the agent's
        // post-task report, if the report opened one.
        this.completeOrphanTurn();
        return;
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
        if (mapperState.activeSubAgents.length === 0) {
          // `closeOpenTurnItems` purges subagent tool calls that never
          // received a terminal update (Antigravity ends turns this way), so
          // no report can ever complete the wait — finish now instead of
          // pinning `working` until the user force-stops the thread.
          this.foregroundTurnAwaitingSubagents = false;
          this.emitTurnStatusAfterPrompt(normalizedStopReason);
          this.completeTurn(mapperState, turnState);
        }
      } else {
        this.emitTurnStatusAfterPrompt(normalizedStopReason);
        this.completeTurn(mapperState, turnState);
      }
    } catch (error) {
      if (this.isDisposed) return;
      if (this.promptHeldForBackgroundWork) {
        // The turn already completed at the background-wait signal, so a late
        // rejection (transport loss, cancel acknowledgement) has no open turn
        // to fail. Close any synthetic report turn and stay idle.
        this.completeOrphanTurn({ state: "cancelled" });
        return;
      }
      if (this.agentSurfacedErrorMessage) {
        // Quota/provider failures already sealed the turn; a later transport
        // abort from session/cancel must not overwrite that error with idle.
        if (this.currentTurnId) this.completeTurn(this.ensureMapperState(), "failed");
      } else if (isAcpPromptCancellationError(error, this.currentTurnInterruptRequested)) {
        this.emitListenerUpdate({ status: "idle", attention: "none" });
        this.completeTurn(this.ensureMapperState(), "cancelled");
      } else {
        this.emitPromptFailure(error);
      }
    } finally {
      this.promptInFlight = false;
      this.promptHeldForBackgroundWork = false;
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

  /** Neutral catalog of the session actions this provider declared. */
  listSessionActions(): readonly import("../base/types").AcpSessionActionInfo[] {
    return this.sessionActionRegistry?.listActions() ?? [];
  }

  /**
   * Invoke a declared session action by neutral id with a validated payload.
   * Addresses only registered actions — there is no raw-method variant.
   */
  invokeSessionAction(actionId: string, payload: unknown): Promise<Record<string, unknown>> {
    const registry = this.sessionActionRegistry;
    if (!registry) {
      return Promise.reject(
        new AcpSessionActionError("unknown_action", `Unknown session action: ${actionId}`, {
          actionId,
        }),
      );
    }
    return registry.invoke(actionId, payload);
  }

  async interruptTurn(): Promise<void> {
    if (!this.sessionId || this.isDisposed) {
      return;
    }

    this.sessionRequests.cancelPending();
    // Extension requests and session actions blocked on this turn's work
    // cannot be answered by an interrupted agent.
    this._extensionRequests?.cancelPending();
    this._sessionActionRegistry?.abortPending();
    this.currentTurnInterruptRequested = true;
    // Before prompt submission, stage Stop instead of sending a cancel to an
    // idle provider. The current startTurn will close without issuing prompt;
    // an interrupt while idle does not cancel a subsequent fresh turn.
    //
    // An orphan turn has no prompt promise to cancel into, but the agent is
    // genuinely mid-work — `session/cancel` is the only thing that stops it, so
    // it must go out rather than being deferred to a prompt that may never come.
    if (!this.promptInFlight && !this.foregroundTurnAwaitingSubagents && !this.orphanTurnId) {
      this.pendingPromptInterrupt = true;
      return;
    }
    // A real cancel is going out against work that was streaming output, so
    // suppress the trailing message/thought chunks the agent still emits after
    // it. The staged-idle path above has no provider work to suppress; the
    // next fresh turn's output must remain visible.
    if (this.behavior.suppressOutputAfterInterrupt) {
      this.suppressAgentOutputUntilNextTurn = true;
    }
    const closeAwaitingForegroundTurn =
      this.foregroundTurnAwaitingSubagents && !this.promptInFlight;
    try {
      const cancelRequest = this.connection.cancel({ sessionId: this.sessionId });
      if (closeAwaitingForegroundTurn) {
        this.completeForegroundTurnAfterSubagents(this.ensureMapperState(), "cancelled");
      }
      await cancelRequest;
    } catch (error) {
      if (closeAwaitingForegroundTurn) {
        this.completeForegroundTurnAfterSubagents(this.ensureMapperState(), "cancelled");
        return;
      }
      // A close callback owns the root failure. A cancel racing that callback
      // is derivative noise, but unrelated provider rejections still surface.
      if (this.isDisposed || this.transportClosed) return;
      throw error;
    }
    if (this.orphanTurnId && (!this.promptInFlight || this.promptHeldForBackgroundWork)) {
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

  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    const firstDisposal = !this.isDisposed;
    this.isDisposed = true;
    const disposal = Promise.resolve()
      .then(async () => {
        if (firstDisposal) this.closeSessionResources();
        await awaitProcessTermination(this.child, {
          ownedProcessGroup: process.platform !== "win32",
        });
      })
      .catch((error: unknown) => {
        this.disposal = undefined;
        throw error;
      });
    this.disposal = disposal;
    return disposal;
  }

  private closeSessionResources(): void {
    // Fence in-flight config writes out of this incarnation before resources
    // are torn down.
    this.sessionGeneration = (this.sessionGeneration ?? 0) + 1;
    if (this.reportedBackgroundTasks.length > 0) {
      this.emitRuntimeEvents([
        { type: "background_tasks.changed", threadId: this.threadId, tasks: [] },
      ]);
    }

    for (const source of this.externalSessionUpdateSources ?? []) source.dispose();
    this.externalSessionUpdateSources?.clear();

    this._extensionRequests?.dispose();
    this._sessionActionRegistry?.dispose();

    if (this.orphanTurnIdleTimer) {
      clearTimeout(this.orphanTurnIdleTimer);
      this.orphanTurnIdleTimer = undefined;
    }
    this.sessionRequests.cancelPending();
    this._terminalManager?.releaseAllAcpTerminals();

    if (this.sessionId && this.agentSessionCapabilities?.close !== undefined) {
      try {
        // This optional RPC may never answer; process termination remains authoritative.
        void this.connection.closeSession({ sessionId: this.sessionId }).catch((error: unknown) => {
          console.warn("[acp] session/close failed during dispose:", error);
        });
      } catch (error) {
        console.warn("[acp] session/close failed during dispose:", error);
      }
    }
  }

  private reportTransportOutcome(errorMessage: string | undefined): void {
    if (this.transportOutcomeReported) return;
    this.transportOutcomeReported = true;
    this.sessionRequests.cancelPending();
    this._extensionRequests?.cancelPending("ACP transport closed");
    this._sessionActionRegistry?.abortPending();
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
    if (
      this.isDisposed ||
      this.transportClosed ||
      !this.sessionId ||
      sessionId !== this.sessionId
    ) {
      throw RequestError.invalidParams({ message: `Unknown ACP session: ${sessionId}` });
    }
  }

  /** An awaited client FS request must still belong to the same incarnation. */
  private assertFileRequestOwner(sessionId: string, generation: number): void {
    this.assertRequestSession(sessionId);
    if ((this.sessionGeneration ?? 0) !== generation) {
      throw RequestError.invalidParams({ message: msg("thread.sessionActionUnavailable") });
    }
  }

  /**
   * A served `fs/readTextFile` is the one exact signal that the tool call
   * behind it has its data. See `AcpTextStreamExtension.handleClientFileRead`.
   */
  private notifyClientFileRead(agentPath: string): void {
    if (!this.textStreamExtension?.handleClientFileRead) return;
    const events = applyClientFileReadExtension(this.ensureMapperState(), agentPath);
    if (events.length > 0) this.emitRuntimeEvents(events);
  }

  private async handleReadTextFile(params: ReadTextFileRequest): Promise<ReadTextFileResponse> {
    if (this.fsTextCapability === false) throw RequestError.methodNotFound("fs/read_text_file");
    this.assertRequestSession(params.sessionId);
    const generation = this.sessionGeneration ?? 0;
    const path = resolveAcpReadableHostFsPath(
      this.projectLocation,
      params.path,
      this.fsAgentHomeDirs,
      this.additionalDirectories,
    );
    try {
      await assertAcpCanonicalHostFsPath(
        this.projectLocation,
        path,
        "read",
        this.fsAgentHomeDirs,
        this.additionalDirectories,
      );
      this.assertFileRequestOwner(params.sessionId, generation);
      const content = await readTextFileContent(path, params.line, params.limit);
      this.assertFileRequestOwner(params.sessionId, generation);
      this.notifyClientFileRead(params.path);
      return { content };
    } catch (error: unknown) {
      const fallbackPath = resolveAcpGlobalSkillFallbackHostFsPath(
        this.projectLocation,
        params.path,
      );
      if (fallbackPath && fallbackPath !== path && isMissingPathError(error)) {
        try {
          await assertAcpCanonicalHostFsPath(
            this.projectLocation,
            fallbackPath,
            "read",
            this.fsAgentHomeDirs,
            this.additionalDirectories,
          );
          this.assertFileRequestOwner(params.sessionId, generation);
          const content = await readTextFileContent(fallbackPath, params.line, params.limit);
          this.assertFileRequestOwner(params.sessionId, generation);
          this.notifyClientFileRead(params.path);
          return { content };
        } catch {
          // Keep the original project-path error so a missing skill stays
          // resource-not-found for the path the agent asked about.
        }
      }
      throw toAcpFsRequestError(error, params.path);
    }
  }

  private async handleWriteTextFile(params: WriteTextFileRequest): Promise<WriteTextFileResponse> {
    if (this.fsTextCapability === false) throw RequestError.methodNotFound("fs/write_text_file");
    this.assertRequestSession(params.sessionId);
    const generation = this.sessionGeneration ?? 0;
    const path = resolveAcpWritableHostFsPath(
      this.projectLocation,
      params.path,
      this.fsAgentHomeDirs,
      this.additionalDirectories,
    );
    try {
      await assertAcpCanonicalHostFsPath(
        this.projectLocation,
        path,
        "write",
        this.fsAgentHomeDirs,
        this.additionalDirectories,
      );
      this.assertFileRequestOwner(params.sessionId, generation);
      await writeFile(path, params.content, "utf8");
      this.assertFileRequestOwner(params.sessionId, generation);
    } catch (error: unknown) {
      throw toAcpFsRequestError(error, params.path);
    }
    return {};
  }

  private handleCreateTerminal(params: CreateTerminalRequest) {
    if (this.terminalCapability === false) throw RequestError.methodNotFound("terminal/create");
    return this.terminalManager.handleCreateTerminal(params);
  }

  private handleTerminalOutput(params: TerminalOutputRequest) {
    if (this.terminalCapability === false) throw RequestError.methodNotFound("terminal/output");
    return this.terminalManager.handleTerminalOutput(params);
  }

  private handleReleaseTerminal(params: ReleaseTerminalRequest): void {
    if (this.terminalCapability === false) throw RequestError.methodNotFound("terminal/release");
    this.terminalManager.handleReleaseTerminal(params);
  }

  private handleWaitForTerminalExit(params: WaitForTerminalExitRequest) {
    if (this.terminalCapability === false)
      throw RequestError.methodNotFound("terminal/wait_for_exit");
    return this.terminalManager.handleWaitForTerminalExit(params);
  }

  private handleKillTerminal(params: KillTerminalRequest): void {
    if (this.terminalCapability === false) throw RequestError.methodNotFound("terminal/kill");
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
   * Handle vendor-extension JSON-RPC *requests* (methods outside the ACP
   * spec that expect a response).
   *
   * The provider's typed request handler gets the first claim and answers
   * with an explicit handled/unhandled outcome. Unclaimed requests fall back
   * to the historical behavior for payloads that carry a standard
   * session-notification shape (they keep flowing through the notification
   * pipeline and are acknowledged with an empty success); everything else is
   * answered with a real `method not found` error. A request must never
   * receive a fabricated success merely because nobody understood it.
   */
  private async handleExtMethod(
    method: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const resolution = await this.extensionRequests.handleRequest(method, params);
    if (resolution.handled) {
      return resolution.result;
    }
    if (looksLikeAcpSessionNotification(params)) {
      this.handleExtNotification(method, params);
      return {};
    }
    throw RequestError.methodNotFound(method);
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
    if (this.isDisposed || this.transportClosed) return;
    if (looksLikeAcpSessionNotification(params)) {
      this.handleSessionUpdate(params as unknown as SessionNotification);
      return;
    }
    if (
      this.extensionSessionUpdateTransform &&
      !this.isReplayingHistory &&
      Date.now() >= (this.replayHistoryUntil || 0)
    ) {
      const recovered = this.extensionSessionUpdateTransform(method, params, {
        request: (requestMethod, requestParams) =>
          this.connection.extMethod(requestMethod, requestParams),
      });
      if (recovered && typeof (recovered as Promise<unknown>).then === "function") {
        void (
          recovered as Promise<SessionNotification | readonly SessionNotification[] | undefined>
        )
          .then((notifications) => this.ingestExtensionSessionUpdates(notifications))
          .catch((error: unknown) => {
            console.warn(
              "[acp] extension session update transform failed:",
              error instanceof Error ? error.message : String(error),
            );
          });
        return;
      }
      if (
        this.ingestExtensionSessionUpdates(
          recovered as SessionNotification | readonly SessionNotification[] | undefined,
        )
      ) {
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
        ...(this.sessionId ? { sessionId: this.sessionId } : {}),
        ...(this.currentTurnId ? { turnId: this.currentTurnId } : {}),
        resolveToolCallItemId: (toolCallId) => this.acpToolCallIdToItemId.get(toolCallId),
      });
      if (events.length > 0) {
        this.emitRuntimeEvents(events);
      }
    }
  }

  private ingestExtensionSessionUpdates(
    notifications: SessionNotification | readonly SessionNotification[] | undefined,
  ): boolean {
    if (!notifications) return false;
    if (this.isDisposed || this.isReplayingHistory || Date.now() < (this.replayHistoryUntil || 0)) {
      return true;
    }
    for (const notification of Array.isArray(notifications) ? notifications : [notifications]) {
      this.handleSessionUpdate(notification);
    }
    return true;
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
    const suppressInterruptedOutput =
      this.suppressAgentOutputUntilNextTurn &&
      (update.sessionUpdate === "agent_message_chunk" ||
        update.sessionUpdate === "agent_thought_chunk");
    if (!suppressReplayUpdate) {
      const mapperState = this.ensureMapperState();
      // Whether a turn already owned this notification before we mapped it.
      // Read up front: the blocks below can close a turn on this very update,
      // and an orphan turn must not reopen one in the same breath.
      const promptOwnsNotifications = this.promptInFlight && !this.promptHeldForBackgroundWork;
      const turnWasLive =
        promptOwnsNotifications ||
        this.foregroundTurnOpen ||
        this.foregroundTurnAwaitingSubagents ||
        this.detachedTurnId !== undefined;
      const detachedParentToolCallId =
        !promptOwnsNotifications && !this.foregroundTurnAwaitingSubagents
          ? getDetachedSubAgentToolCallIdForNotification(mapperState, update)
          : undefined;
      if (detachedParentToolCallId) {
        this.startDetachedTurn(detachedParentToolCallId);
      }
      const events = mapAcpSessionUpdate(params, mapperState, {
        ...(suppressInterruptedOutput ? { suppressAgentOutput: true } : {}),
      });
      this.rememberAcpToolCallItemId(params, events);
      if (events.length > 0) {
        this.emitRuntimeEvents(events);
        this.recordAgentSurfacedError(events);
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
        !suppressInterruptedOutput &&
        isOrphanTurnActivity(update) &&
        // The raw update shape still calls this "activity"; the canonical
        // effects computed just above get the final word. A batch that only
        // replayed text into already-allocated items revised history instead
        // of doing new work — it must not open or keep alive an orphan turn.
        !isReplacementOnlyDeltaBatch(events)
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
        if (this.promptInFlight && !this.promptHeldForBackgroundWork) {
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
    const sessionRef = this.getSessionRef();
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
      if (isFatalAcpQuotaError(event.message) && this.promptInFlight && this.sessionId) {
        // Antigravity retries 429s without resolving session/prompt. Fail the
        // turn now and cancel so the in-flight prompt cannot pin `working`.
        this.completeTurn(this.ensureMapperState(), "failed");
        void this.connection.cancel({ sessionId: this.sessionId }).catch((error: unknown) => {
          console.warn(
            "[acp] cancel after quota error failed:",
            error instanceof Error ? error.message : String(error),
          );
        });
      }
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
      // Sitting inside a long *command* is not idleness — a test run or build
      // can go minutes without emitting anything. Detached subagent calls are
      // held open on purpose. Read/search tool_calls that never receive a
      // terminal update (Antigravity `client_view_file` / `view_file`) must
      // not pin the orphan turn forever.
      const insideLiveCommand = [...this.ensureMapperState().toolCallItems.values()].some(
        (item) => !item.detached && item.itemType === "command_execution",
      );
      if (insideLiveCommand) {
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

  /** Feed one line of agent stderr diagnostics to the provider's turn-signal parser. */
  private handleStderrTurnSignalLine(line: string): void {
    if (!this.stderrTurnSignalParser || this.isDisposed) return;
    let signal: "background-wait" | undefined;
    try {
      signal = this.stderrTurnSignalParser(line);
    } catch (error) {
      console.warn(
        "[acp] stderr turn-signal parser failed:",
        error instanceof Error ? error.message : String(error),
      );
      return;
    }
    if (signal === "background-wait") this.completeTurnForBackgroundWait();
  }

  /**
   * The agent reported (out of band, on stderr) that its reply is finished and
   * `session/prompt` now stays open only for detached background tasks — which
   * may never exit. Complete the runtime turn as if the stop reason had
   * arrived: keep the still-running command rows open as detached items so the
   * tasks' late terminal `tool_call_update`s can land on them, paint idle, and
   * let the held prompt resolve silently later (`promptHeldForBackgroundWork`).
   */
  private completeTurnForBackgroundWait(): void {
    if (!this.promptInFlight || this.promptHeldForBackgroundWork) return;
    if (
      !this.currentTurnId ||
      this.currentTurnInterruptRequested ||
      this.agentSurfacedErrorMessage
    ) {
      return;
    }
    const mapperState = this.ensureMapperState();
    // Anything still executing at this boundary is background work by
    // definition — the agent said the reply itself is done.
    for (const item of mapperState.toolCallItems.values()) {
      if (item.itemType === "command_execution") item.detached = true;
    }
    this.promptHeldForBackgroundWork = true;
    this.foregroundTurnOpen = false;
    this.emitListenerUpdate({ status: "idle", attention: "none" });
    this.completeTurn(mapperState, "completed");
  }

  private completeForegroundTurnAfterSubagents(
    mapperState: AcpMapperState,
    state: "completed" | "cancelled" = "completed",
  ): void {
    if (!this.foregroundTurnAwaitingSubagents) return;
    this.foregroundTurnAwaitingSubagents = false;
    this.completeTurn(mapperState, state);
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
    const turnId = this.currentTurnId;
    this.currentTurnId = undefined;
    this.emitRuntimeEvents([
      ...closeOpenTurnItems(mapperState),
      {
        type: "turn.completed",
        threadId: this.threadId,
        turnId,
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
      const turnId = this.currentTurnId;
      this.currentTurnId = undefined;
      events.push({
        type: "turn.completed",
        threadId: this.threadId,
        turnId,
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
