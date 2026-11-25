/**
 * Antigravity ACP subagent bridge (`invoke_subagent` and `browser_subagent`).
 *
 * Verified against `agy_acp_server` 1.5.2 on a recorded wire (2026-11-25);
 * 1.4.1-1.5.0 share the same shape.
 *
 *  1. `browser_subagent`: emitted with `kind: "other"` and
 *     `rawInput: { Task, TaskName, RecordingName }`, plus a native
 *     `tool_call_update` when the browser task completes. Normalizing its
 *     `rawInput` to carry `_toolName: "task"` and `subagent_type: "browser"`
 *     lets the shared ACP mapper render it as a subagent card.
 *  2. `invoke_subagent`: the harness reports the call with no arguments, so
 *     the server emits `tool_call` (`title: "Running invoke_subagent"`,
 *     `kind: "other"`, `rawInput: {}`) and closes it within milliseconds with
 *     a receipt (`tool_call_update`, `status: "completed"`, `rawOutput` = the
 *     launch summary). The receipt is not the child's report. When the launch
 *     itself needs approval, it is first announced as a pending `tool_call`
 *     titled `Run invoke_subagent?` whose `rawInput` carries the spec, and
 *     advanced after the answer. The child's own
 *     tool calls are forwarded on the parent session as ordinary, untagged
 *     `tool_call`/`tool_call_update` pairs; the child's text is dropped.
 *
 * Neither the specs nor the child's progress or report is on the wire.
 * Meanwhile, `localharness` writes the full un-truncated parent and child
 * transcripts to:
 *   `<antigravityHome>/brain/<conversationId>/.system_generated/logs/transcript_full.jsonl`
 * (with `transcript.jsonl` alongside it).
 *
 * This module bridges `invoke_subagent` through `AcpExternalSessionUpdateSource`
 * and `AcpSubagentCoordinator` so each launched subagent renders as a detached
 * subagent card with live child tool calls, step counts, token usage, and final
 * report.
 *
 * Lifecycle: reports normally arrive before `end_turn`, but agy can also end
 * the turn while children still run — reports then genuinely land late, so the
 * cards stay open and the bridge keeps polling. `onTurnEnd` bounds that wait:
 * a cancelled/failed turn settles every open card immediately, and after a
 * completed turn the cards settle as failed once every tracked transcript has
 * stayed quiet for `turnEndSettleMs`, so a crashed child can neither pin the
 * thread "working" nor keep the poll loop alive for the rest of the session.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SessionNotification } from "@agentclientprotocol/sdk/unstable";
import type { ProjectLocation } from "@/shared/contracts";
import type { AcpExternalSessionUpdateSource, AcpStructuredSession } from "../acp/session";
import { PORACODE_ACP_COMMAND_STATUS_META_KEY } from "../acp/canonicalMapping/commandStatus";
import {
  PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY,
  PORACODE_ACP_DETACHED_SUBAGENT_META_KEY,
  PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY,
  PORACODE_ACP_SUBAGENT_PROGRESS_META_KEY,
  PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY,
} from "../acp/canonicalMapping/subagents";
import {
  createAcpSubagentCoordinator,
  type AcpSubagentCoordinator,
} from "../acp/subagentCoordinator";
import { readSessionFileText, resolveWslHomeDirectoryAsync, statSessionPaths } from "../base";
import {
  asRecord,
  mapChildTranscriptToolCall,
  parseCreatedSubagents,
  parseInvokeSubagentSpecs,
  parseTranscriptSteps,
  readNonEmptyString,
  type SubagentSpec,
  type TranscriptStep,
  type TranscriptToolCall,
} from "./acpSubagentTranscripts";
import { isAntigravityBackgroundWaitTranscript } from "./acpTurnHold";

const ANTIGRAVITY_BRAIN_SUBDIR = [".gemini", "antigravity-acp", "brain"] as const;
const TRANSCRIPT_FULL_REL = [".system_generated", "logs", "transcript_full.jsonl"] as const;
const TRANSCRIPT_FALLBACK_REL = [".system_generated", "logs", "transcript.jsonl"] as const;
/** agy's `notify_user` shares the generic-call shape but must render as a plain row. */
export const NOTIFY_USER_TITLE = "Notify user";
const DEFAULT_POLL_INTERVAL_MS = 350;
const DEFAULT_RESOLVE_RETRY_MS = 40;
const DEFAULT_MAX_RESOLVE_RETRIES = 8;
/** Runaway guard for transcript reads; real session transcripts are ~1-2 MB. */
const MAX_TRANSCRIPT_BYTES = 32 * 1024 * 1024;
/**
 * A wire notification normally follows its planner step by milliseconds, but
 * a permission prompt can hold the launch for minutes. Anything older than
 * this window is history from an earlier run of this session (transcripts
 * survive `session/load`) and must never bind a fresh notification.
 */
const STALE_PLANNER_MATCH_WINDOW_MS = 5 * 60_000;
/**
 * How long after a completed turn the bridge keeps polling quiet transcripts
 * for late subagent reports before settling the cards as failed.
 */
const DEFAULT_TURN_END_SETTLE_MS = 5 * 60 * 1000;
/** Upper bound on how long a cached parent transcript is served without re-reading. */
const PARENT_READ_MAX_AGE_MS = 5_000;
/**
 * A child `run_command` planner step must be this close to the wire's pending
 * execute receipt: enough for a permission prompt to hold the start, never so
 * wide that history from an earlier turn can bind.
 */
const CHILD_EXECUTE_MATCH_LOOKBACK_MS = 30_000;
/** Transcript timestamps have one-second precision. */
const CHILD_EXECUTE_MATCH_SKEW_MS = 1_000;
/** How long a pending child execute may look for a unique transcript plan. */
const DEFAULT_CHILD_EXECUTE_RESOLVE_WINDOW_MS = 2_000;
/** How long a reserved child execute may recheck after its terminal frame. */
const DEFAULT_CHILD_EXECUTE_TERMINAL_WINDOW_MS = 2_000;
/** Absolute cap for a reserved call, even when no terminal frame ever arrives. */
const DEFAULT_CHILD_EXECUTE_HARD_DEADLINE_MS = 30_000;
/** Runaway guards for buffered child execute wire ids. */
const MAX_BUFFERED_CHILD_EXECUTES = 32;
const MAX_BUFFERED_CHILD_EXECUTE_FRAMES = 16;
/** Bounded routing tombstones for calls that already fell back or sealed. */
const MAX_SETTLED_CHILD_EXECUTE_TOMBSTONES = 256;
/** Bound fallback wire identities retained to suppress one later duplicate. */
const MAX_FALLBACK_CHILD_EXECUTE_IDENTITIES = 64;
/** Bound matured planner-only plan history retained for late reconciliation. */
const MAX_RUN_COMMAND_PLANS = 256;

/** One colonless child execute row as the wire announces it. */
interface BufferedChildExecute {
  toolCallId: string;
  /** Invalidates an in-flight resolution when the call changes. */
  epoch: number;
  receivedAt: number;
  /** Absolute routing deadline; terminal arrival may not extend it past this cap. */
  deadlineAt: number;
  terminalAt?: number;
  terminalStatus?: string;
  exitCode?: number;
  command?: string;
  cwd?: string;
  frames: SessionNotification[];
  state: "looking" | "reserved" | "passthrough" | "sealed";
  reservedPlanKey?: string;
  reservedCardId?: string;
  reservedAt?: number;
}

type RunCommandPlanState = "staged" | "claimed" | "emitted";

/** One `run_command` planner step in a child transcript. */
interface RunCommandPlan {
  key: string;
  conversationId: string;
  stepIndex: number;
  callIndex: number;
  command: string;
  cwd?: string;
  createdAt?: number;
  /** Wall-clock first observation, bounding planner-only staging when untimed. */
  stagedAt: number;
  toolCall: TranscriptToolCall;
  /** The card progress already counted this call. */
  counted: boolean;
  /** The transcript sync already processed this plan's planner step. */
  stepSeen: boolean;
  execution?: {
    createdAt?: number;
    exitCode?: number;
    output?: string;
  };
  /** Wire row already reconciled with this plan (at most one). */
  consumedWireCallId?: string;
  /** Reservation was released by ambiguity; keep its independent child row. */
  protectOnFallback?: boolean;
  state: RunCommandPlanState;
}

const SYSTEM_MESSAGE_SENDER_RE =
  /<SYSTEM_MESSAGE>\s*\[Message\]\s+timestamp=\S+\s+sender=([^\s/]+)\s+priority=\S+\s+content=([\s\S]*?)\s*<\/SYSTEM_MESSAGE>/g;
const ACTIVE_SUBAGENTS_JSON_RE = /You have \d+ active subagent\(s\):\s*(\[[\s\S]*?\])/;

interface ParentPlannerToolCall {
  key: string;
  name: string;
  args: Record<string, unknown>;
  expectedTitle: string;
}

interface TrackedAntigravitySubagent {
  toolCallId: string;
  spec: SubagentSpec;
  title: string;
  conversationId?: string;
  logAbsoluteUri?: string;
  seenStepIndices: Set<number>;
  stepCount: number;
  tokens?: number;
  lastToolName?: string;
  lastDescription?: string;
  reportText?: string;
  lastAssistantText?: string;
  errorText?: string;
  sendMessageSeen: boolean;
  messageSentConfirmed: boolean;
  completed: boolean;
}

export interface AntigravitySubagentBridgeOptions {
  /** Override the Antigravity ACP brain directory (`~/.gemini/antigravity-acp/brain`) for tests. */
  brainRootPath?: string;
  pollIntervalMs?: number;
  resolveRetryMs?: number;
  maxResolveRetries?: number;
  /** See {@link DEFAULT_TURN_END_SETTLE_MS}. */
  turnEndSettleMs?: number;
  /** Override the cached parent-transcript read's max age for tests. */
  parentReadMaxAgeMs?: number;
  /** See {@link DEFAULT_CHILD_EXECUTE_RESOLVE_WINDOW_MS}. */
  childExecuteResolveWindowMs?: number;
  /** See {@link DEFAULT_CHILD_EXECUTE_TERMINAL_WINDOW_MS}. */
  childExecuteTerminalWindowMs?: number;
  /** See {@link DEFAULT_CHILD_EXECUTE_HARD_DEADLINE_MS}. */
  childExecuteHardDeadlineMs?: number;
  /** Attach-time wiring: replayed session/load history is never intercepted. */
  isReplayingHistory?: () => boolean;
}

/**
 * Normalize `browser_subagent` `tool_call` notifications into canonical
 * subagent payloads so the shared mapper renders them as subagent cards.
 */
export function transformAntigravitySubagentSessionUpdate(
  notification: SessionNotification,
): SessionNotification {
  const { update } = notification;
  if (update.sessionUpdate !== "tool_call" && update.sessionUpdate !== "tool_call_update") {
    return notification;
  }
  const rawInput = asRecord(update.rawInput);
  if (!rawInput) return notification;
  if (typeof rawInput._toolName === "string" || typeof rawInput.subagent_type === "string") {
    return notification;
  }
  const task = readNonEmptyString(rawInput, "Task");
  const taskName = readNonEmptyString(rawInput, "TaskName");
  const recordingName = readNonEmptyString(rawInput, "RecordingName");
  if (!task || (!taskName && !recordingName)) {
    return notification;
  }
  const description = taskName ?? recordingName;
  return {
    ...notification,
    update: {
      ...update,
      rawInput: {
        ...rawInput,
        _toolName: "task",
        subagent_type: "browser",
        ...(description ? { name: description, description } : {}),
        prompt: task,
      },
    },
  };
}

/**
 * `agy_acp_server` (1.4.1+) titles a generic tool call `Running <tool name>`
 * (`live_title` in `_stream_live_step`); older builds titled it with the
 * planner call's `toolSummary`. Both forms are name-identical, never positional.
 */
export function antigravityRunningTitleFor(name: string): string {
  return `Running ${name}`;
}

/** Title the server gives `invoke_subagent` while it waits for the client's approval. */
export const ANTIGRAVITY_PENDING_LAUNCH_TITLE = "Run invoke_subagent?";

interface InvokeSubagentLaunch {
  toolCallId: string;
  status: "pending" | "in_progress" | "completed" | "failed" | undefined;
  /** Specs when the wire carries them; empty when they must come from the transcript. */
  specs: SubagentSpec[];
}

/**
 * An `invoke_subagent` launch as the wire announces it. Auto-approved, the
 * server opens it as a running `tool_call` titled `Running invoke_subagent`
 * with empty `rawInput`. When the launch itself needs approval it first opens a
 * pending `tool_call` titled `Run invoke_subagent?` whose `rawInput` carries the
 * `Subagents` spec, and advances the same id once the client approves.
 */
function readInvokeSubagentLaunch(
  update: SessionNotification["update"],
  pendingLaunches?: ReadonlyMap<string, SubagentSpec[]>,
): InvokeSubagentLaunch | undefined {
  if (update.sessionUpdate !== "tool_call" && update.sessionUpdate !== "tool_call_update") {
    return undefined;
  }
  if (update.kind != null && update.kind !== "other") return undefined;
  const record = asRecord(update.rawInput);
  const specs = record ? parseInvokeSubagentSpecs(record) : [];
  const knownPending = pendingLaunches?.has(update.toolCallId) === true;
  if (
    specs.length === 0 &&
    !knownPending &&
    update.title !== ANTIGRAVITY_PENDING_LAUNCH_TITLE &&
    update.title !== antigravityRunningTitleFor("invoke_subagent")
  ) {
    return undefined;
  }
  return { toolCallId: update.toolCallId, status: update.status ?? undefined, specs };
}

export class AntigravitySubagentBridge implements AcpExternalSessionUpdateSource {
  private readonly subagents: AcpSubagentCoordinator;
  private readonly pollIntervalMs: number;
  private readonly resolveRetryMs: number;
  private readonly maxResolveRetries: number;
  private readonly turnEndSettleMs: number;
  private readonly parentReadMaxAgeMs: number;
  private readonly childExecuteResolveWindowMs: number;
  private readonly childExecuteTerminalWindowMs: number;
  private readonly childExecuteHardDeadlineMs: number;
  private brainRootPromise: Promise<string | undefined> | null = null;
  private sessionId = "";
  private disposed = false;
  private resolvingCount = 0;
  private readonly deferredNotifications: SessionNotification[] = [];
  private readonly consumedPlannerCallKeys = new Set<string>();
  private readonly seenParentStepIndices = new Set<number>();
  private readonly trackedSubagents = new Map<string, TrackedAntigravitySubagent>();
  private readonly unassignedSubagents: TrackedAntigravitySubagent[] = [];
  /** Launches awaiting the client's approval, by launch tool-call id. */
  private readonly pendingLaunches = new Map<string, SubagentSpec[]>();
  private readonly subagentsByConversationId = new Map<string, TrackedAntigravitySubagent>();
  /** Colonless child execute rows currently withheld from the shared session. */
  private readonly bufferedChildExecutes = new Map<string, BufferedChildExecute>();
  /** Bounded immutable routing for ids that already sealed or fell back. */
  private readonly settledChildExecuteTombstones = new Map<string, "sealed" | "passthrough">();
  /** Top-level fallback wire identities, for one-row-per-command reconciliation. */
  private readonly fallbackChildExecuteIdentities = new Map<
    string,
    { command: string; cwd: string; receivedAt: number }
  >();
  /** `run_command` plans seen in child transcripts, keyed by conversation/step/call. */
  private readonly runCommandPlans = new Map<string, RunCommandPlan>();
  /** Invalidates in-flight polls when a prompt turn changes or the bridge disposes. */
  private turnEpoch = 0;
  /** Session-confirmed start of the current prompt turn. */
  private currentTurnStartedAt: number | undefined;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pollInFlight = false;
  /** Set when the agent's turn ended with subagent reports still pending. */
  private turnEndedAt: number | undefined;
  /** Last time a tracked transcript produced a new completed step. */
  private lastTranscriptActivityAt: number | undefined;
  /**
   * Latched when a turn is cancelled/failed so a candidate resolution still
   * in flight settles the cards it launches instead of polling a dead turn.
   * Cleared by `onTurnStart`.
   */
  private turnTerminalState: "cancelled" | "failed" | undefined;
  private parentTranscriptCache:
    | {
        sessionBrainDir: string;
        mtimeMs: number | undefined;
        readAt: number;
        steps: TranscriptStep[];
      }
    | undefined;

  constructor(
    private readonly ingest: (notification: SessionNotification) => void,
    private readonly location: ProjectLocation,
    private readonly options: AntigravitySubagentBridgeOptions = {},
  ) {
    this.subagents = createAcpSubagentCoordinator();
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.resolveRetryMs = options.resolveRetryMs ?? DEFAULT_RESOLVE_RETRY_MS;
    this.maxResolveRetries = options.maxResolveRetries ?? DEFAULT_MAX_RESOLVE_RETRIES;
    this.turnEndSettleMs = options.turnEndSettleMs ?? DEFAULT_TURN_END_SETTLE_MS;
    this.parentReadMaxAgeMs = options.parentReadMaxAgeMs ?? PARENT_READ_MAX_AGE_MS;
    this.childExecuteResolveWindowMs =
      options.childExecuteResolveWindowMs ?? DEFAULT_CHILD_EXECUTE_RESOLVE_WINDOW_MS;
    this.childExecuteTerminalWindowMs =
      options.childExecuteTerminalWindowMs ?? DEFAULT_CHILD_EXECUTE_TERMINAL_WINDOW_MS;
    this.childExecuteHardDeadlineMs =
      options.childExecuteHardDeadlineMs ?? DEFAULT_CHILD_EXECUTE_HARD_DEADLINE_MS;
  }

  onSessionUpdate(notification: SessionNotification): boolean | void {
    if (this.disposed) return;
    if (this.options.isReplayingHistory?.() === true) {
      // Replayed session/load history must not launch subagent tracking: the
      // mapped rows are suppressed as duplicates anyway, and interception
      // would fan out duplicate cards whose poll-driven completion can land
      // past the replay window.
      return;
    }
    if (this.routeChildExecuteNotification(notification)) return true;
    if (this.isWireUpdateOwnedByBridge(notification)) return true;
    // Wire chatter between turns (agy emits updates after end_turn) must not
    // re-arm the settle window; only a fresh turn does, via onTurnStart.
    if (!this.sessionId && notification.sessionId.trim()) {
      this.sessionId = notification.sessionId.trim();
    }
    if (this.resolvingCount > 0) {
      this.deferredNotifications.push(notification);
      return true;
    }
    const launch = readInvokeSubagentLaunch(notification.update, this.pendingLaunches);
    if (launch?.status === "pending") {
      // The row and its approval prompt must reach the session untouched.
      this.pendingLaunches.set(launch.toolCallId, launch.specs);
      return;
    }
    if (launch) {
      void this.resolveCandidateToolCall(notification).catch((error) => {
        this.reportError("invoke_subagent launch", error);
      });
      return true;
    }
    if (isCandidateGenericToolCall(notification)) {
      void this.resolveCandidateToolCall(notification).catch((error) => {
        this.reportError("candidate resolution", error);
      });
      return true;
    }
  }

  /**
   * Route every child execute frame through the same matcher, including frames
   * drained from the launch-resolution defer queue. A settled id is immutable:
   * sealed ids stay dropped, passthrough ids stay top-level.
   */
  private routeChildExecuteNotification(notification: SessionNotification): boolean {
    const toolCallId = readToolCallId(notification.update);
    if (!toolCallId) return false;
    const tombstone = this.settledChildExecuteTombstones.get(toolCallId);
    if (tombstone === "sealed") return true;
    const buffered = this.bufferedChildExecutes.get(toolCallId);
    if (buffered) {
      this.appendBufferedChildExecuteFrame(buffered, notification);
      return true;
    }
    if (!this.shouldBufferChildExecuteStart(notification)) return false;
    if (tombstone === "passthrough") {
      // A repeated pending start for an already-fallback row is the same row;
      // the shared session already rendered it.
      return true;
    }
    this.startBufferedChildExecute(toolCallId, notification);
    return true;
  }

  /** Only colonless pending execute starts with a live card enter the buffer. */
  private shouldBufferChildExecuteStart(notification: SessionNotification): boolean {
    const { update } = notification;
    if (update.sessionUpdate !== "tool_call") return false;
    if (update.kind !== "execute" || update.status !== "pending") return false;
    const toolCallId = update.toolCallId;
    if (!toolCallId || toolCallId.includes(":")) return false;
    return this.hasActiveSubagents();
  }

  private rememberSettledChildExecute(toolCallId: string, state: "sealed" | "passthrough"): void {
    this.settledChildExecuteTombstones.delete(toolCallId);
    this.settledChildExecuteTombstones.set(toolCallId, state);
    while (this.settledChildExecuteTombstones.size > MAX_SETTLED_CHILD_EXECUTE_TOMBSTONES) {
      const oldest = this.settledChildExecuteTombstones.keys().next().value;
      if (oldest === undefined) break;
      this.settledChildExecuteTombstones.delete(oldest);
    }
  }

  /**
   * A late wire start may only be reconciled with an already emitted synthetic
   * row when the same ownership/ambiguity evidence used for buffered starts
   * proves the row is that child's. A matching parent command or any staged
   * competing plan leaves the wire row top-level instead of hiding it.
   */
  private shouldSealLateWireAgainstEmittedPlan(
    call: BufferedChildExecute,
    parentSteps: readonly TranscriptStep[] | undefined,
  ): boolean {
    const turnStartAt = this.currentTurnStartedAt;
    if (!call.command || !call.cwd || !parentSteps || turnStartAt === undefined) return false;
    if (
      this.openBufferedChildExecutes().filter((peer) => sameWireExecuteIdentity(peer, call))
        .length !== 1
    ) {
      return false;
    }
    if (this.hasMatchingParentRunCommand(parentSteps, call, turnStartAt)) return false;
    const matching: RunCommandPlan[] = [];
    for (const plan of this.runCommandPlans.values()) {
      if (!planMatchesBufferedExecute(plan, call)) continue;
      if (plan.state === "staged") return false;
      if (plan.state === "emitted") matching.push(plan);
    }
    if (matching.length !== 1) return false;
    const plan = matching[0]!;
    if (plan.consumedWireCallId && plan.consumedWireCallId !== call.toolCallId) return false;
    if (
      plan.createdAt !== undefined &&
      plan.createdAt < turnStartAt - CHILD_EXECUTE_MATCH_SKEW_MS
    ) {
      return false;
    }
    const entry = this.subagentsByConversationId.get(plan.conversationId);
    return Boolean(entry && !entry.completed);
  }

  /**
   * Wire updates the bridge owns, so the shared session must not render them.
   * `agy_acp_server` (1.4.1+) closes the launch call within milliseconds with a
   * receipt whose `rawOutput` is the launch summary, not the child's report,
   * and forwards the child's own tool calls on the parent session, untagged.
   * Rendered, the receipt would complete the card while the child still runs
   * and the child rows would duplicate the transcript-synced ones. A child row
   * is matched exactly, never positionally: the server ids every tool call
   * `<conversationId>:<n>`, and the transcript reports each launched child's
   * `conversationId`.
   */
  private isWireUpdateOwnedByBridge(notification: SessionNotification): boolean {
    const { update } = notification;
    if (update.sessionUpdate !== "tool_call" && update.sessionUpdate !== "tool_call_update") {
      return false;
    }
    const toolCallId = update.toolCallId;
    if (this.settledChildExecuteTombstones.get(toolCallId) === "sealed") return true;
    if (this.trackedSubagents.has(toolCallId)) return true;
    const separator = toolCallId.lastIndexOf(":");
    if (separator <= 0) return false;
    return this.subagentsByConversationId.has(toolCallId.slice(0, separator));
  }

  private startBufferedChildExecute(toolCallId: string, notification: SessionNotification): void {
    if (this.openBufferedChildExecutes().length >= MAX_BUFFERED_CHILD_EXECUTES) {
      // Runaway routing: the wire shape is not what the matcher expects, so
      // fall every open call back to ordinary top-level rows and stop buffering.
      this.flushAllBufferedChildExecutes();
      this.ingest(withTopLevelMeta(notification));
      this.rememberSettledChildExecute(toolCallId, "passthrough");
      return;
    }
    const identity = readWireExecuteIdentity(notification.update);
    const receivedAt = Date.now();
    this.bufferedChildExecutes.set(toolCallId, {
      toolCallId,
      epoch: 0,
      receivedAt,
      deadlineAt: receivedAt + this.childExecuteHardDeadlineMs,
      ...identity,
      frames: [notification],
      state: "looking",
    });
    this.ensurePolling();
  }

  private appendBufferedChildExecuteFrame(
    call: BufferedChildExecute,
    notification: SessionNotification,
  ): void {
    const { update } = notification;
    call.frames.push(notification);
    call.epoch += 1;
    const identity = readWireExecuteIdentity(update);
    if (identity.command) call.command = identity.command;
    if (identity.cwd) call.cwd = identity.cwd;
    if (update.sessionUpdate === "tool_call_update") {
      if (update.status === "completed" || update.status === "failed") {
        if (call.terminalAt === undefined) call.terminalAt = Date.now();
        call.terminalStatus = update.status;
      }
      const exitCode = readWireExitCode(update.rawOutput);
      if (exitCode !== undefined) call.exitCode = exitCode;
    }
    if (call.frames.length > MAX_BUFFERED_CHILD_EXECUTE_FRAMES) {
      this.flushBufferedChildExecute(call);
      return;
    }
    this.ensurePolling();
  }

  private openBufferedChildExecutes(): BufferedChildExecute[] {
    return [...this.bufferedChildExecutes.values()].filter(
      (call) => call.state === "looking" || call.state === "reserved",
    );
  }

  /**
   * The fallback every unresolved call takes: ordinary top-level rows, with the
   * routing frozen as passthrough so later frames are never re-buffered.
   */
  private flushBufferedChildExecute(
    call: BufferedChildExecute,
    options?: { forceFailed?: boolean },
  ): void {
    if (call.state === "sealed" || call.state === "passthrough") return;
    call.state = "passthrough";
    call.epoch += 1;
    if (call.frames.length > 0) {
      for (const frame of call.frames) {
        this.ingest(withTopLevelMeta(frame));
      }
      call.frames = [];
    }
    if (options?.forceFailed && call.terminalAt === undefined) {
      this.ingestTerminalUpdate(call, "failed");
    }
    if (!call.reservedPlanKey && call.command && call.cwd) {
      this.fallbackChildExecuteIdentities.set(call.toolCallId, {
        command: call.command,
        cwd: call.cwd,
        receivedAt: call.receivedAt,
      });
      while (this.fallbackChildExecuteIdentities.size > MAX_FALLBACK_CHILD_EXECUTE_IDENTITIES) {
        const oldest = this.fallbackChildExecuteIdentities.keys().next().value;
        if (oldest === undefined) break;
        this.fallbackChildExecuteIdentities.delete(oldest);
      }
    }
    this.suppressPlansForBufferedExecute(call);
    this.bufferedChildExecutes.delete(call.toolCallId);
    this.rememberSettledChildExecute(call.toolCallId, "passthrough");
  }

  private flushAllBufferedChildExecutes(options?: { forceFailed?: boolean }): void {
    for (const call of this.openBufferedChildExecutes()) {
      this.flushBufferedChildExecute(call, options);
    }
  }

  /** Ambiguity is shared by every open wire row with the same identity. */
  private flushConflictingBufferedExecutes(call: BufferedChildExecute): void {
    for (const peer of this.openBufferedChildExecutes()) {
      if (peer !== call && !sameWireExecuteIdentity(peer, call)) continue;
      this.releaseBufferedChildExecuteReservation(peer);
      this.flushBufferedChildExecute(peer);
    }
  }

  private releaseBufferedChildExecuteReservation(call: BufferedChildExecute): void {
    if (!call.reservedPlanKey) return;
    const plan = this.runCommandPlans.get(call.reservedPlanKey);
    if (plan?.state === "staged") plan.protectOnFallback = true;
    delete call.reservedPlanKey;
    delete call.reservedCardId;
  }

  /** Only a still-proven reservation is a duplicate of the fallback wire row. */
  private suppressPlansForBufferedExecute(call: BufferedChildExecute): void {
    if (!call.reservedPlanKey) return;
    const plan = this.runCommandPlans.get(call.reservedPlanKey);
    if (plan?.state === "staged" && !plan.protectOnFallback) plan.state = "emitted";
  }

  private ingestTerminalUpdate(
    call: BufferedChildExecute,
    status: "failed",
    parentToolCallId?: string,
  ): void {
    this.ingest({
      sessionId: this.sessionId,
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: call.toolCallId,
        status,
        _meta: parentToolCallId
          ? {
              [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: parentToolCallId,
              [PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY]: parentToolCallId,
            }
          : { [PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY]: true },
      },
    });
  }

  onTurnStart(): void {
    // A fresh prompt turn re-arms everything a previous turn's end latched.
    this.turnEndedAt = undefined;
    this.turnTerminalState = undefined;
    this.turnEpoch += 1;
    this.currentTurnStartedAt = Date.now();
  }

  onTurnEnd(state: "completed" | "cancelled" | "failed"): void {
    if (this.disposed) return;
    this.pendingLaunches.clear();
    if (state === "completed") {
      this.turnTerminalState = undefined;
      if (!this.hasActiveSubagents()) {
        this.settleBufferedChildExecutes();
        return;
      }
      // Reports genuinely arrive after end_turn when agy answers without
      // waiting for children, so keep polling; the inactivity bound in
      // pollOnce settles cards whose reports never come.
      this.turnEndedAt = Date.now();
      this.ensurePolling();
      return;
    }
    // Latch the terminal state even with nothing tracked yet: a candidate
    // resolution can still be in flight and launch cards after this turn.
    this.turnTerminalState = state;
    this.settleBufferedChildExecutes();
    this.settleUncompletedSubagents(state);
  }

  /** Trigger an immediate transcript poll (exported for deterministic tests). */
  async flush(): Promise<void> {
    await this.pollOnce();
  }

  dispose(): void {
    this.disposed = true;
    this.turnEpoch += 1;
    this.turnEndedAt = undefined;
    this.pendingLaunches.clear();
    this.bufferedChildExecutes.clear();
    this.settledChildExecuteTombstones.clear();
    this.runCommandPlans.clear();
    this.stopPolling();
    this.deferredNotifications.length = 0;
  }

  private reportError(context: string, error: unknown): void {
    console.warn(
      `[antigravity] subagent bridge ${context} failed:`,
      error instanceof Error ? error.message : String(error),
    );
  }

  private async resolveCandidateToolCall(notification: SessionNotification): Promise<void> {
    this.resolvingCount += 1;
    try {
      await this.resolveCandidateSafely(notification);
      while (!this.disposed && this.deferredNotifications.length > 0) {
        const next = this.deferredNotifications.shift()!;
        await this.resolveCandidateSafely(next);
      }
    } finally {
      this.resolvingCount -= 1;
    }
  }

  /**
   * Resolve one notification without ever rejecting: on failure the original
   * notification is re-ingested as a plain top-level row so it is never lost
   * and the deferred queue keeps draining in order.
   */
  private async resolveCandidateSafely(notification: SessionNotification): Promise<void> {
    try {
      if (this.routeChildExecuteNotification(notification)) return;
      if (this.isWireUpdateOwnedByBridge(notification)) return;
      const launch = readInvokeSubagentLaunch(notification.update, this.pendingLaunches);
      if (launch?.status === "pending") {
        this.pendingLaunches.set(launch.toolCallId, launch.specs);
        this.ingest(notification);
        return;
      }
      if (launch && this.pendingLaunches.has(launch.toolCallId)) {
        await this.resolveApprovedLaunch(notification);
        return;
      }
      if (launch?.specs.length && notification.update.sessionUpdate === "tool_call") {
        // Auto-approved with the spec on the wire: no transcript lookup needed.
        this.launchSubagents(
          launch.toolCallId,
          notification.update.title ?? undefined,
          launch.specs,
        );
        await this.pollOnceQuietly();
        this.ensurePolling();
        return;
      }
      if (launch && notification.update.sessionUpdate === "tool_call_update") {
        // A running launch the bridge does not track: not ours to replace.
        this.ingest(notification);
        return;
      }
      if (!isCandidateGenericToolCall(notification)) {
        this.ingest(notification);
        return;
      }
      await this.resolveSingleCandidate(notification);
    } catch (error) {
      this.reportError("candidate resolution", error);
      if (this.disposed || notification.update.sessionUpdate !== "tool_call") return;
      try {
        this.ingest(withTopLevelMeta(notification));
      } catch (fallbackError) {
        this.reportError("fallback ingest", fallbackError);
      }
    }
  }

  /**
   * The client answered the launch's approval and the server advanced the same
   * tool call. A running launch gets its subagent cards BESIDE the launch row:
   * the shared mapper turns a `tool_call` for an existing row into an update,
   * so the row cannot become the card the way an auto-approved launch does.
   */
  private async resolveApprovedLaunch(notification: SessionNotification): Promise<void> {
    const { update } = notification;
    if (update.sessionUpdate !== "tool_call" && update.sessionUpdate !== "tool_call_update") {
      this.ingest(notification);
      return;
    }
    const toolCallId = update.toolCallId;
    const wireSpecs = this.pendingLaunches.get(toolCallId) ?? [];
    this.pendingLaunches.delete(toolCallId);
    if (update.status !== "in_progress") {
      // Denied or failed before it ran: nothing to track.
      this.ingest(notification);
      return;
    }
    let specs = wireSpecs;
    if (specs.length === 0) {
      const sessionId = notification.sessionId.trim() || this.sessionId;
      const matched = sessionId
        ? await this.findMatchingPlannerToolCall(sessionId, update.title ?? "")
        : undefined;
      if (matched?.name === "invoke_subagent") {
        this.consumedPlannerCallKeys.add(matched.key);
        specs = parseInvokeSubagentSpecs(matched.args);
      }
    }
    if (specs.length > 0) this.launchSubagents(toolCallId, undefined, specs, true);
    this.ingest(notification);
    if (specs.length === 0) return;
    if (this.turnTerminalState) {
      this.settleUncompletedSubagents(this.turnTerminalState);
      return;
    }
    await this.pollOnceQuietly();
    this.ensurePolling();
  }

  private async resolveSingleCandidate(notification: SessionNotification): Promise<void> {
    if (this.disposed || notification.update.sessionUpdate !== "tool_call") return;
    const sessionId = notification.sessionId.trim() || this.sessionId;
    if (sessionId && !this.sessionId) {
      this.sessionId = sessionId;
    }

    const title = notification.update.title ?? "";
    const matched = await this.findMatchingPlannerToolCall(sessionId, title);
    if (this.disposed) return;

    if (matched?.name === "invoke_subagent") {
      this.consumedPlannerCallKeys.add(matched.key);
      const specs = parseInvokeSubagentSpecs(matched.args);
      if (specs.length > 0) {
        this.launchSubagents(notification.update.toolCallId, notification.update.title, specs);
        if (this.turnTerminalState) {
          // The turn that launched these was cancelled/failed while the
          // planner match was being resolved; settle the cards instead of
          // polling a dead turn forever.
          this.settleUncompletedSubagents(this.turnTerminalState);
          return;
        }
        // The launch already consumed the notification; a poll failure must
        // not re-ingest it.
        await this.pollOnceQuietly();
        this.ensurePolling();
        return;
      }
    }

    if (matched) {
      this.consumedPlannerCallKeys.add(matched.key);
    }

    this.ingest(withTopLevelMeta(notification));
    if (this.hasActiveSubagents()) {
      await this.pollOnceQuietly();
    }
  }

  private async findMatchingPlannerToolCall(
    sessionId: string,
    title: string,
  ): Promise<ParentPlannerToolCall | undefined> {
    if (!sessionId) return undefined;
    const brainRoot = await this.resolveBrainRoot();
    if (!brainRoot) return undefined;

    const sessionBrainDir = appendBrainPath(brainRoot, sessionId);
    for (let attempt = 0; attempt <= this.maxResolveRetries; attempt += 1) {
      if (this.disposed) return undefined;
      const steps = await this.readTranscriptSteps(sessionBrainDir);
      if (!steps) {
        const stats = await statSessionPaths(this.location, [sessionBrainDir]);
        const dirExists = stats.get(sessionBrainDir)?.exists === true;
        if (!dirExists) return undefined;
      } else {
        const candidate = this.matchUnconsumedGenericCall(steps, title);
        if (candidate) return candidate;
      }
      if (attempt < this.maxResolveRetries) {
        await delay(this.resolveRetryMs);
      }
    }
    return undefined;
  }

  private matchUnconsumedGenericCall(
    steps: readonly TranscriptStep[],
    title: string,
  ): ParentPlannerToolCall | undefined {
    const now = Date.now();
    const genericCalls: ParentPlannerToolCall[] = [];
    for (const step of steps) {
      if (step.type !== "PLANNER_RESPONSE" || !Array.isArray(step.tool_calls)) continue;
      const createdAt = step.created_at ? Date.parse(step.created_at) : Number.NaN;
      if (Number.isFinite(createdAt) && now - createdAt > STALE_PLANNER_MATCH_WINDOW_MS) {
        // History from an earlier run of this (resumed) session.
        continue;
      }
      for (const [callIndex, tc] of step.tool_calls.entries()) {
        if (!isTranscriptGenericToolName(tc.name)) continue;
        const key = `${step.step_index}:${callIndex}`;
        if (this.consumedPlannerCallKeys.has(key)) continue;
        const expectedTitle =
          readNonEmptyString(tc.args, "toolSummary") ??
          readNonEmptyString(tc.args, "toolAction") ??
          tc.name;
        genericCalls.push({
          key,
          name: tc.name,
          args: tc.args,
          expectedTitle,
        });
      }
    }
    // Only a title- or name-identical planner call may be intercepted: a
    // positional fallback could bind the notification to a different tool's
    // call and fan out subagent cards for work that never launched.
    return genericCalls.find(
      (call) =>
        call.expectedTitle === title ||
        call.name === title ||
        title === antigravityRunningTitleFor(call.name),
    );
  }

  private launchSubagents(
    baseToolCallId: string,
    fallbackTitle: string | undefined,
    specs: readonly SubagentSpec[],
    besideLaunchRow = false,
  ): void {
    this.currentTurnStartedAt ??= Date.now();
    for (const [index, spec] of specs.entries()) {
      const toolCallId =
        !besideLaunchRow && index === 0 ? baseToolCallId : `${baseToolCallId}:subagent:${index}`;
      const title = spec.role ?? spec.typeName ?? fallbackTitle ?? "Subagent";
      const rawInput = this.subagents.canonicalInput(toolCallId, {
        ...(spec.role ? { name: spec.role, description: spec.role } : {}),
        subagent_type: spec.typeName,
        ...(spec.prompt ? { prompt: spec.prompt } : {}),
        ...(spec.model ? { model: spec.model } : {}),
        background: true,
      });
      const entry: TrackedAntigravitySubagent = {
        toolCallId,
        spec,
        title,
        seenStepIndices: new Set(),
        stepCount: 0,
        sendMessageSeen: false,
        messageSentConfirmed: false,
        completed: false,
      };
      this.trackedSubagents.set(toolCallId, entry);
      this.unassignedSubagents.push(entry);

      this.ingest({
        sessionId: this.sessionId,
        update: {
          sessionUpdate: "tool_call",
          toolCallId,
          title,
          kind: "other",
          status: "in_progress",
          rawInput,
          _meta: {
            [PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY]: true,
            [PORACODE_ACP_DETACHED_SUBAGENT_META_KEY]: true,
          },
        },
      });
    }
  }

  /**
   * Latest parent-transcript steps for the turn-hold detector
   * (`acpTurnHold.ts`). Serves a cached read until the file changes (or
   * {@link PARENT_READ_MAX_AGE_MS} passes) so polling while a long command
   * runs costs a stat, not a parse - but only for a transcript that is not
   * waiting: every observation that can lead to a hold comes from a read in
   * that poll, so a coarse mtime can never serve a stale "waiting". Undefined
   * while the transcript is unreadable.
   */
  async readParentTranscriptSteps(): Promise<TranscriptStep[] | undefined> {
    if (!this.sessionId) return undefined;
    const brainRoot = await this.resolveBrainRoot();
    if (!brainRoot) return undefined;
    const sessionBrainDir = appendBrainPath(brainRoot, this.sessionId);
    const fullPath = appendBrainPath(sessionBrainDir, ...TRANSCRIPT_FULL_REL);
    const stat = (await statSessionPaths(this.location, [fullPath])).get(fullPath);
    const mtimeMs = stat?.exists ? stat.mtimeMs : undefined;
    const cached = this.parentTranscriptCache;
    if (
      cached &&
      cached.sessionBrainDir === sessionBrainDir &&
      cached.mtimeMs === mtimeMs &&
      Date.now() - cached.readAt <= this.parentReadMaxAgeMs
    ) {
      return cached.steps;
    }
    const steps = await this.readTranscriptSteps(sessionBrainDir);
    this.parentTranscriptCache =
      steps && !isAntigravityBackgroundWaitTranscript(steps)
        ? { sessionBrainDir, mtimeMs, readAt: Date.now(), steps }
        : undefined;
    return steps;
  }

  private async readChildTranscriptSteps(
    brainRoot: string,
    entry: TrackedAntigravitySubagent,
  ): Promise<TranscriptStep[] | undefined> {
    if (!entry.conversationId) return undefined;
    const childBrainDir = appendBrainPath(brainRoot, entry.conversationId);
    const steps = await this.readTranscriptSteps(childBrainDir);
    if (steps) return steps;
    return entry.logAbsoluteUri ? this.readTranscriptStepsFromUri(entry.logAbsoluteUri) : undefined;
  }

  /**
   * Rebuild the child `run_command` plan registry from the current transcript
   * snapshot. Plan state survives refreshes so a claimed/emitted row is never
   * staged again.
   */
  private refreshRunCommandPlans(
    childStepsByCard: ReadonlyMap<string, TranscriptStep[] | undefined>,
  ): void {
    for (const entry of this.trackedSubagents.values()) {
      if (entry.completed || !entry.conversationId) continue;
      const steps = childStepsByCard.get(entry.toolCallId);
      if (!steps || steps.length === 0) continue;
      const conversationId = entry.conversationId;
      const executions = associateRunCommandExecutions(steps, conversationId);
      const sorted = [...steps].sort((left, right) => left.step_index - right.step_index);
      for (const step of sorted) {
        if (step.type !== "PLANNER_RESPONSE" || !Array.isArray(step.tool_calls)) continue;
        for (const [callIndex, tc] of step.tool_calls.entries()) {
          if (tc.name !== "run_command") continue;
          const command = readRunCommandText(tc.args);
          if (!command) continue;
          const key = runCommandPlanKey(conversationId, step.step_index, callIndex);
          const createdAt = parseTimestamp(step.created_at);
          const cwd = readRunCommandCwd(tc.args);
          const execution = executions.get(key);
          const existing = this.runCommandPlans.get(key);
          this.runCommandPlans.set(key, {
            key,
            conversationId,
            stepIndex: step.step_index,
            callIndex,
            command,
            ...(cwd ? { cwd } : {}),
            ...(createdAt !== undefined ? { createdAt } : {}),
            stagedAt: existing?.stagedAt ?? Date.now(),
            toolCall: tc,
            counted: existing?.counted ?? false,
            stepSeen: existing?.stepSeen ?? entry.seenStepIndices.has(step.step_index),
            ...(existing?.consumedWireCallId
              ? { consumedWireCallId: existing.consumedWireCallId }
              : {}),
            ...(existing?.protectOnFallback ? { protectOnFallback: true } : {}),
            ...(execution ? { execution } : {}),
            state: existing?.state ?? "staged",
          });
        }
      }
    }
    if (this.runCommandPlans.size > MAX_RUN_COMMAND_PLANS) {
      for (const [key, plan] of this.runCommandPlans) {
        if (this.runCommandPlans.size <= MAX_RUN_COMMAND_PLANS) break;
        if (plan.state === "staged") continue;
        this.runCommandPlans.delete(key);
      }
      while (this.runCommandPlans.size > MAX_RUN_COMMAND_PLANS) {
        const oldest = this.runCommandPlans.keys().next().value;
        if (oldest === undefined) break;
        this.runCommandPlans.delete(oldest);
      }
    }
  }

  /**
   * Resolve every buffered child execute against one parent/child snapshot.
   * A call binds only when the snapshot names exactly one wire id, one child
   * plan, readable owners, and no competing parent plan.
   */
  private resolveBufferedChildExecutes(
    parentSteps: readonly TranscriptStep[] | undefined,
    childStepsByCard: ReadonlyMap<string, TranscriptStep[] | undefined>,
  ): void {
    for (const call of this.openBufferedChildExecutes()) {
      const now = Date.now();
      if (now >= call.deadlineAt) {
        this.flushBufferedChildExecute(call);
        continue;
      }
      if (call.state === "looking" && now - call.receivedAt >= this.childExecuteResolveWindowMs) {
        this.flushBufferedChildExecute(call);
        continue;
      }
      if (this.shouldSealLateWireAgainstEmittedPlan(call, parentSteps)) {
        for (const plan of this.runCommandPlans.values()) {
          if (plan.state !== "emitted" || !planMatchesBufferedExecute(plan, call)) continue;
          if (!plan.consumedWireCallId) plan.consumedWireCallId = call.toolCallId;
          break;
        }
        call.state = "sealed";
        this.bufferedChildExecutes.delete(call.toolCallId);
        this.rememberSettledChildExecute(call.toolCallId, "sealed");
        continue;
      }
      const match = this.matchBufferedChildExecute(call, parentSteps, childStepsByCard);
      if (match.kind === "unique") {
        const cardId = this.subagentsByConversationId.get(match.plan.conversationId)?.toolCallId;
        if (!cardId) {
          this.flushBufferedChildExecute(call);
          continue;
        }
        if (call.state === "looking") {
          call.state = "reserved";
          call.epoch += 1;
          call.reservedAt = now;
        }
        call.reservedPlanKey = match.plan.key;
        call.reservedCardId = cardId;
        if (this.canBindChildExecute(call, match.plan)) {
          this.bindBufferedChildExecute(call, match.plan);
          continue;
        }
      }
      if (match.kind === "ambiguous") {
        this.flushConflictingBufferedExecutes(call);
        continue;
      }
      if (
        call.state === "reserved" &&
        call.terminalAt !== undefined &&
        now - call.terminalAt >= this.childExecuteTerminalWindowMs
      ) {
        this.flushBufferedChildExecute(call);
      }
    }
  }

  private matchBufferedChildExecute(
    call: BufferedChildExecute,
    parentSteps: readonly TranscriptStep[] | undefined,
    childStepsByCard: ReadonlyMap<string, TranscriptStep[] | undefined>,
  ): { kind: "none" } | { kind: "ambiguous" } | { kind: "unique"; plan: RunCommandPlan } {
    if (!call.command || !call.cwd || !parentSteps) return { kind: "none" };
    const turnStartAt = this.currentTurnStartedAt ?? readCurrentParentTurnStart(parentSteps);
    if (turnStartAt === undefined) return { kind: "none" };
    const activeEntries = [...this.trackedSubagents.values()].filter((entry) => !entry.completed);
    if (activeEntries.length === 0) return { kind: "none" };
    for (const entry of activeEntries) {
      if (!entry.conversationId || childStepsByCard.get(entry.toolCallId) === undefined) {
        // An owner that cannot be read keeps the snapshot open until deadline.
        return { kind: "none" };
      }
    }

    const peerWireCalls = this.openBufferedChildExecutes().filter((peer) =>
      sameWireExecuteIdentity(peer, call),
    );
    if (peerWireCalls.length !== 1) return { kind: "ambiguous" };

    if (
      this.hasMatchingParentRunCommand(
        parentSteps,
        { command: call.command, cwd: call.cwd, receivedAt: call.receivedAt },
        turnStartAt,
      )
    ) {
      return { kind: "ambiguous" };
    }

    const candidates: RunCommandPlan[] = [];
    for (const plan of this.runCommandPlans.values()) {
      if (plan.state !== "staged") continue;
      if (plan.command !== call.command) continue;
      if (!plan.cwd || plan.cwd !== call.cwd) continue;
      const entry = this.subagentsByConversationId.get(plan.conversationId);
      if (!entry || entry.completed) continue;
      if (plan.createdAt === undefined) {
        // An untimed planner row in this turn could be the command; it cannot
        // be excluded, so the snapshot is ambiguous.
        return { kind: "ambiguous" };
      }
      if (plan.createdAt < turnStartAt - CHILD_EXECUTE_MATCH_SKEW_MS) continue;
      if (!timestampWithinMatchWindow(plan.createdAt, call.receivedAt)) continue;
      candidates.push(plan);
    }
    if (candidates.length === 0) return { kind: "none" };
    if (candidates.length > 1) return { kind: "ambiguous" };
    return { kind: "unique", plan: candidates[0]! };
  }

  private hasMatchingParentRunCommand(
    parentSteps: readonly TranscriptStep[],
    identity: { command?: string; cwd?: string; receivedAt: number },
    turnStartAt: number,
  ): boolean {
    let turnFloor = -1;
    for (const step of parentSteps) {
      if (step.type === "USER_INPUT" && step.step_index > turnFloor) {
        turnFloor = step.step_index;
      }
    }
    for (const step of parentSteps) {
      if (step.type !== "PLANNER_RESPONSE" || step.step_index <= turnFloor) continue;
      if (!Array.isArray(step.tool_calls)) continue;
      for (const tc of step.tool_calls) {
        if (tc.name !== "run_command") continue;
        if (readRunCommandText(tc.args) !== identity.command) continue;
        const cwd = readRunCommandCwd(tc.args);
        if (!cwd || cwd !== identity.cwd) continue;
        const createdAt = parseTimestamp(step.created_at);
        if (createdAt !== undefined && createdAt < turnStartAt - CHILD_EXECUTE_MATCH_SKEW_MS) {
          continue;
        }
        if (createdAt === undefined || timestampWithinMatchWindow(createdAt, identity.receivedAt)) {
          return true;
        }
      }
    }
    return false;
  }

  private canBindChildExecute(call: BufferedChildExecute, plan: RunCommandPlan): boolean {
    if (call.terminalAt === undefined || call.terminalStatus === undefined) return false;
    if (call.terminalStatus === "failed") {
      // Denied or failed: unique planner ownership is the only evidence.
      return true;
    }
    if (call.terminalStatus !== "completed" || !plan.execution) return false;
    return call.exitCode === undefined || plan.execution.exitCode === call.exitCode;
  }

  private bindBufferedChildExecute(
    call: BufferedChildExecute,
    plan: RunCommandPlan,
    options?: { forceFailed?: boolean },
  ): void {
    const entry = this.subagentsByConversationId.get(plan.conversationId);
    if (!entry || entry.completed) {
      this.flushBufferedChildExecute(call, options);
      return;
    }
    call.state = "sealed";
    call.epoch += 1;
    call.reservedPlanKey = plan.key;
    call.reservedCardId = entry.toolCallId;
    plan.state = "claimed";
    plan.consumedWireCallId = call.toolCallId;
    for (const frame of call.frames) {
      this.ingest(withSubagentActivityMeta(frame, entry.toolCallId));
    }
    call.frames = [];
    if (options?.forceFailed && call.terminalAt === undefined) {
      this.ingestTerminalUpdate(call, "failed", entry.toolCallId);
    }
    this.bufferedChildExecutes.delete(call.toolCallId);
    this.rememberSettledChildExecute(call.toolCallId, "sealed");
  }

  /**
   * Shutdown paths cannot await a fresh transcript snapshot, so only a call
   * already reserved against a plan is replayed parented. Anything else falls
   * back top-level and closes as failed.
   */
  private settleBufferedChildExecutes(): void {
    for (const call of this.openBufferedChildExecutes()) {
      const plan = call.reservedPlanKey
        ? this.runCommandPlans.get(call.reservedPlanKey)
        : undefined;
      if (
        call.state === "reserved" &&
        plan &&
        plan.state === "staged" &&
        call.terminalStatus !== "completed"
      ) {
        this.bindBufferedChildExecute(call, plan, { forceFailed: true });
        continue;
      }
      this.flushBufferedChildExecute(call, { forceFailed: true });
    }
  }

  /** Settle only calls already reserved to this card, never by command alone. */
  private settleBufferedChildExecutesForCard(cardId: string): void {
    for (const call of this.openBufferedChildExecutes()) {
      if (call.state !== "reserved" || call.reservedCardId !== cardId) continue;
      const plan = call.reservedPlanKey
        ? this.runCommandPlans.get(call.reservedPlanKey)
        : undefined;
      if (plan && call.terminalStatus !== "completed") {
        this.bindBufferedChildExecute(call, plan, { forceFailed: true });
      } else {
        this.flushBufferedChildExecute(call, { forceFailed: true });
      }
    }
  }

  /**
   * Emit a child `run_command` row once its execution step corroborates it (or
   * its planner-only staging window closes) and no open wire row can claim it.
   */
  private emitReadyRunCommandPlans(parentSteps: readonly TranscriptStep[] | undefined): void {
    for (const plan of this.runCommandPlans.values()) {
      if (plan.state !== "staged") continue;
      const entry = this.subagentsByConversationId.get(plan.conversationId);
      if (!entry || entry.completed) continue;
      if (this.hasOpenWireCallForPlan(plan)) continue;
      if (this.isPlanRepresentedByFallbackWire(plan, parentSteps)) {
        plan.state = "emitted";
        this.countRunCommandPlan(entry, plan);
        continue;
      }
      if (this.shouldDeferRunCommandPlan(plan)) continue;
      this.emitRunCommandPlan(entry, plan);
    }
  }

  /**
   * A timed-out top-level wire row already represents exactly one later plan
   * when no parent plan offers a competing owner. Ambiguous or parent-owned
   * identities keep the synthetic child row instead.
   */
  private isPlanRepresentedByFallbackWire(
    plan: RunCommandPlan,
    parentSteps: readonly TranscriptStep[] | undefined,
  ): boolean {
    if (plan.protectOnFallback) return false;
    if (!parentSteps || this.currentTurnStartedAt === undefined) return false;
    const fallback = [...this.fallbackChildExecuteIdentities.values()].filter((identity) =>
      planMatchesWireIdentity(plan, identity, identity.receivedAt),
    );
    if (fallback.length !== 1) return false;
    const identity = fallback[0]!;
    const candidatePlans = [...this.runCommandPlans.values()].filter((candidate) => {
      if (candidate.state === "claimed") return false;
      if (!planMatchesWireIdentity(candidate, identity, identity.receivedAt)) return false;
      const owner = this.subagentsByConversationId.get(candidate.conversationId);
      return Boolean(owner && !owner.completed);
    });
    if (candidatePlans.length !== 1) return false;
    return !this.hasMatchingParentRunCommand(
      parentSteps,
      { command: identity.command, cwd: identity.cwd, receivedAt: identity.receivedAt },
      this.currentTurnStartedAt,
    );
  }

  /** Drain a card's remaining staged command rows before closing its card. */
  private drainRunCommandPlansForCard(entry: TrackedAntigravitySubagent): void {
    for (const plan of this.runCommandPlans.values()) {
      if (plan.conversationId !== entry.conversationId || plan.state !== "staged") continue;
      // Planner-only rows may still be represented by an open wire row; let
      // that row fall back top-level instead of emitting an unproven duplicate.
      if (!plan.execution && this.hasOpenWireCallForPlan(plan)) continue;
      this.emitRunCommandPlan(entry, plan);
    }
  }

  private hasOpenWireCallForPlan(plan: RunCommandPlan): boolean {
    return this.openBufferedChildExecutes().some((call) => planMatchesBufferedExecute(plan, call));
  }

  private emitRunCommandPlan(entry: TrackedAntigravitySubagent, plan: RunCommandPlan): void {
    plan.state = "emitted";
    delete plan.protectOnFallback;
    this.countRunCommandPlan(entry, plan);
    const mapped = mapChildTranscriptToolCall(plan.toolCall);
    const execution = plan.execution;
    const exitCode = execution?.exitCode;
    // Planner-only rows have no corroborated exit status; a non-zero exit is a
    // real failure. Neither may be reported as success.
    const status =
      execution === undefined
        ? "failed"
        : exitCode === undefined
          ? "completed"
          : exitCode === 0
            ? "completed"
            : "failed";
    const output = execution?.output;
    this.ingest({
      sessionId: this.sessionId,
      update: {
        sessionUpdate: "tool_call",
        toolCallId: `${entry.toolCallId}:step:${plan.stepIndex}:${plan.callIndex}`,
        title: mapped.title,
        kind: mapped.kind,
        status,
        rawInput: mapped.rawInput,
        ...(output ? { rawOutput: output } : {}),
        ...(output
          ? { content: [{ type: "content", content: { type: "text", text: output } }] }
          : {}),
        ...(mapped.locations ? { locations: mapped.locations } : {}),
        _meta: {
          [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: entry.toolCallId,
          [PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY]: entry.toolCallId,
          ...(exitCode !== undefined
            ? { [PORACODE_ACP_COMMAND_STATUS_META_KEY]: { exitCode } }
            : {}),
        },
      },
    });
    if (!entry.completed) this.emitProgressUpdate(entry);
  }

  private countRunCommandPlan(entry: TrackedAntigravitySubagent, plan: RunCommandPlan): void {
    if (plan.counted) return;
    plan.counted = true;
    entry.stepCount += 1;
    entry.lastToolName = plan.toolCall.name;
    entry.lastDescription = mapChildTranscriptToolCall(plan.toolCall).description;
  }

  /**
   * A child `run_command` row waits for an open wire candidate to resolve and
   * for a bounded staging window. An unclaimed planner row emits after that
   * window even without a RUN_COMMAND execution step.
   */
  private shouldDeferRunCommandPlan(plan: RunCommandPlan): boolean {
    if (plan.state !== "staged") return true;
    for (const call of this.openBufferedChildExecutes()) {
      if (planMatchesBufferedExecute(plan, call)) return true;
    }
    const anchor = plan.execution?.createdAt ?? plan.createdAt ?? plan.stagedAt;
    return anchor !== undefined && Date.now() - anchor < this.childExecuteResolveWindowMs;
  }

  private hasActiveSubagents(): boolean {
    for (const entry of this.trackedSubagents.values()) {
      if (!entry.completed) return true;
    }
    return false;
  }

  private ensurePolling(): void {
    if (this.disposed || this.pollTimer || !this.hasActiveSubagents()) return;
    this.pollTimer = setInterval(() => {
      void this.pollOnceQuietly();
    }, this.pollIntervalMs);
  }

  private stopPolling(): void {
    if (!this.pollTimer) return;
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  /** Poll failures must neither kill the interval nor strand ingested work. */
  private async pollOnceQuietly(): Promise<void> {
    try {
      await this.pollOnce();
    } catch (error) {
      this.reportError("transcript poll", error);
    }
  }

  private async pollOnce(): Promise<void> {
    if (this.disposed || this.pollInFlight || !this.sessionId) return;
    this.pollInFlight = true;
    const pollEpoch = this.turnEpoch;
    try {
      const brainRoot = await this.resolveBrainRoot();
      if (!brainRoot) return;
      const sessionBrainDir = appendBrainPath(brainRoot, this.sessionId);
      const parentSteps = await this.readTranscriptSteps(sessionBrainDir);
      const pendingCompletions = new Map<string, string>();
      const deferredReportStepIndices: number[] = [];

      let sawNewActivity = false;
      if (parentSteps) {
        sawNewActivity = this.processParentSteps(
          parentSteps,
          pendingCompletions,
          deferredReportStepIndices,
        );
      }

      // Read every active/binding child transcript before matching a wire row
      // or completing a card: uniqueness has to be decided on one snapshot.
      const childStepsByCard = new Map<string, TranscriptStep[] | undefined>();
      for (const entry of this.trackedSubagents.values()) {
        if (entry.completed || !entry.conversationId) continue;
        childStepsByCard.set(
          entry.toolCallId,
          await this.readChildTranscriptSteps(brainRoot, entry),
        );
      }
      // A poll that spanned a prompt turn change must not match or close rows
      // against the previous turn's snapshot.
      if (this.disposed || this.turnEpoch !== pollEpoch) return;
      for (const stepIndex of deferredReportStepIndices) {
        this.seenParentStepIndices.add(stepIndex);
      }
      this.refreshRunCommandPlans(childStepsByCard);
      this.resolveBufferedChildExecutes(parentSteps, childStepsByCard);
      this.emitReadyRunCommandPlans(parentSteps);

      for (const entry of this.trackedSubagents.values()) {
        if (entry.completed || !entry.conversationId) continue;
        const childActivity = await this.syncChildTranscript(
          entry,
          childStepsByCard.get(entry.toolCallId),
        );
        sawNewActivity = sawNewActivity || childActivity;
        const parentMessage = pendingCompletions.get(entry.conversationId);
        if (!entry.completed && parentMessage !== undefined) {
          if (!entry.reportText && parentMessage.trim()) {
            entry.reportText = parentMessage.trim();
          }
          this.completeSubagent(entry, "completed");
        }
      }

      if (sawNewActivity) {
        this.lastTranscriptActivityAt = Date.now();
      }

      if (this.turnEndedAt !== undefined && this.hasActiveSubagents()) {
        const quietSince = Math.max(this.turnEndedAt, this.lastTranscriptActivityAt ?? 0);
        if (Date.now() - quietSince >= this.turnEndSettleMs) {
          // The turn is over and no transcript moved: the children are gone
          // and agy will not deliver their reports anymore.
          this.settleUncompletedSubagents("failed");
        }
      }

      if (!this.hasActiveSubagents()) {
        this.settleBufferedChildExecutes();
        this.stopPolling();
      }
    } finally {
      this.pollInFlight = false;
    }
  }

  /** Returns true when any previously unseen parent step was processed. */
  private processParentSteps(
    steps: readonly TranscriptStep[],
    pendingCompletions: Map<string, string>,
    deferredReportStepIndices: number[],
  ): boolean {
    const sorted = [...steps].sort((a, b) => a.step_index - b.step_index);
    let sawNew = false;
    for (const step of sorted) {
      if (step.status && step.status !== "DONE") continue;
      if (this.seenParentStepIndices.has(step.step_index)) continue;

      if (step.type === "INVOKE_SUBAGENT" && typeof step.content === "string") {
        this.seenParentStepIndices.add(step.step_index);
        sawNew = true;
        for (const created of parseCreatedSubagents(step.content)) {
          this.bindConversationId(created.conversationId, created.logAbsoluteUri);
        }
        continue;
      }

      if (step.type === "GENERIC" && typeof step.content === "string") {
        const activeMatch = ACTIVE_SUBAGENTS_JSON_RE.exec(step.content);
        if (activeMatch?.[1]) {
          this.seenParentStepIndices.add(step.step_index);
          sawNew = true;
          this.applyManageSubagentsList(activeMatch[1]);
        }
        continue;
      }

      if (step.type === "SYSTEM_MESSAGE" && typeof step.content === "string") {
        // Commit this report only after the poll epoch fence: a turn change
        // while child reads are in flight must re-deliver it next poll.
        deferredReportStepIndices.push(step.step_index);
        sawNew = true;
        for (const match of step.content.matchAll(SYSTEM_MESSAGE_SENDER_RE)) {
          const sender = match[1]?.trim();
          const messageContent = match[2]?.trim() ?? "";
          if (sender) {
            pendingCompletions.set(sender, messageContent);
          }
        }
      }
    }
    return sawNew;
  }

  private bindConversationId(conversationId: string, logAbsoluteUri?: string): void {
    if (this.subagentsByConversationId.has(conversationId)) return;
    const next = this.takeUnassignedSubagent();
    if (!next) return;
    this.registerConversationId(next, conversationId, logAbsoluteUri);
  }

  private applyManageSubagentsList(rawJson: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      return;
    }
    if (!Array.isArray(parsed)) return;
    for (const rawItem of parsed) {
      const item = asRecord(rawItem);
      if (!item) continue;
      const conversationId = readNonEmptyString(item, "conversationId");
      const role = readNonEmptyString(item, "role");
      const transcript = readNonEmptyString(item, "transcript");
      if (!conversationId || this.subagentsByConversationId.has(conversationId)) continue;
      const entry = this.takeUnassignedSubagent(role);
      if (entry) {
        this.registerConversationId(entry, conversationId, transcript);
      }
    }
  }

  private takeUnassignedSubagent(role?: string): TrackedAntigravitySubagent | undefined {
    if (this.unassignedSubagents.length === 0) return undefined;
    const matchIndex = role
      ? this.unassignedSubagents.findIndex((entry) => entry.spec.role === role)
      : -1;
    const [entry] = this.unassignedSubagents.splice(matchIndex >= 0 ? matchIndex : 0, 1);
    return entry;
  }

  private registerConversationId(
    entry: TrackedAntigravitySubagent,
    conversationId: string,
    logAbsoluteUri?: string,
  ): void {
    entry.conversationId = conversationId;
    if (logAbsoluteUri) {
      entry.logAbsoluteUri = logAbsoluteUri;
    }
    this.subagentsByConversationId.set(conversationId, entry);
  }

  /** Returns true when any previously unseen child step was processed. */
  private async syncChildTranscript(
    entry: TrackedAntigravitySubagent,
    steps: TranscriptStep[] | undefined,
  ): Promise<boolean> {
    if (!entry.conversationId) return false;
    if (!steps || steps.length === 0) return false;
    const conversationId = entry.conversationId;

    const unseen = steps
      .filter(
        (step) =>
          !entry.seenStepIndices.has(step.step_index) && (!step.status || step.status === "DONE"),
      )
      .sort((a, b) => a.step_index - b.step_index);

    if (unseen.length === 0) return false;

    let progressDirty = false;
    for (const step of unseen) {
      entry.seenStepIndices.add(step.step_index);

      if (step.type === "PLANNER_RESPONSE") {
        const stepTokens =
          (step.input_tokens ?? 0) + (step.cache_read_tokens ?? 0) + (step.output_tokens ?? 0);
        if (stepTokens > 0 && stepTokens !== entry.tokens) {
          entry.tokens = stepTokens;
          progressDirty = true;
        }

        if (typeof step.thinking === "string" && step.thinking.trim() && !entry.completed) {
          this.ingest({
            sessionId: this.sessionId,
            update: {
              sessionUpdate: "agent_thought_chunk",
              content: { type: "text", text: step.thinking },
              _meta: {
                [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: entry.toolCallId,
                [PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY]: entry.toolCallId,
              },
            },
          });
        }

        const toolCalls = step.tool_calls ?? [];
        for (const [callIndex, tc] of toolCalls.entries()) {
          if (tc.name === "send_message") {
            const msg =
              readNonEmptyString(tc.args, "Message") ?? readNonEmptyString(tc.args, "message");
            if (msg) {
              entry.reportText = msg;
            }
            entry.sendMessageSeen = true;
            continue;
          }
          if (entry.completed) continue;
          const mapped = mapChildTranscriptToolCall(tc);
          const childToolCallId = `${entry.toolCallId}:step:${step.step_index}:${callIndex}`;

          if (tc.name === "run_command") {
            const plan = this.runCommandPlans.get(
              runCommandPlanKey(conversationId, step.step_index, callIndex),
            );
            if (plan) {
              if (plan.state !== "staged" || this.shouldDeferRunCommandPlan(plan)) {
                this.countRunCommandPlan(entry, plan);
                continue;
              }
              plan.state = "emitted";
              this.countRunCommandPlan(entry, plan);
              const mappedRun = mapChildTranscriptToolCall(tc);
              this.ingest({
                sessionId: this.sessionId,
                update: {
                  sessionUpdate: "tool_call",
                  toolCallId: childToolCallId,
                  title: mappedRun.title,
                  kind: mappedRun.kind,
                  status: "completed",
                  rawInput: mappedRun.rawInput,
                  ...(mappedRun.locations ? { locations: mappedRun.locations } : {}),
                  _meta: {
                    [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: entry.toolCallId,
                    [PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY]: entry.toolCallId,
                  },
                },
              });
              progressDirty = true;
              continue;
            }
          }

          entry.stepCount += 1;
          entry.lastToolName = tc.name;
          entry.lastDescription = mapped.description;
          progressDirty = true;

          this.ingest({
            sessionId: this.sessionId,
            update: {
              sessionUpdate: "tool_call",
              toolCallId: childToolCallId,
              title: mapped.title,
              kind: mapped.kind,
              status: "completed",
              rawInput: mapped.rawInput,
              ...(mapped.locations ? { locations: mapped.locations } : {}),
              _meta: {
                [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: entry.toolCallId,
                [PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY]: entry.toolCallId,
              },
            },
          });
        }

        if (typeof step.content === "string" && step.content.trim() && toolCalls.length === 0) {
          entry.lastAssistantText = step.content.trim();
        }
        continue;
      }

      if (step.type === "GENERIC" && typeof step.content === "string") {
        if (step.content.includes("Message sent to ")) {
          entry.messageSentConfirmed = true;
        }
        continue;
      }

      if (step.type === "ERROR_MESSAGE" && typeof step.content === "string") {
        const err = step.content.trim();
        if (err) {
          entry.errorText = err;
        }
      }
    }

    if (!entry.completed && entry.sendMessageSeen && entry.messageSentConfirmed) {
      this.completeSubagent(entry, "completed");
      return true;
    }

    if (!entry.completed && progressDirty) {
      this.emitProgressUpdate(entry);
    }
    return true;
  }

  private emitProgressUpdate(entry: TrackedAntigravitySubagent): void {
    const canonicalInput = this.subagents.canonicalInput(entry.toolCallId);
    this.ingest({
      sessionId: this.sessionId,
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: entry.toolCallId,
        status: "in_progress",
        ...(canonicalInput ? { rawInput: canonicalInput } : {}),
        _meta: {
          [PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY]: entry.toolCallId,
          [PORACODE_ACP_SUBAGENT_PROGRESS_META_KEY]: this.buildProgressMeta(entry),
        },
      },
    });
  }

  private completeSubagent(
    entry: TrackedAntigravitySubagent,
    status: "completed" | "failed" | "cancelled",
  ): void {
    if (entry.completed) return;
    // A buffered child execute must not outlive the card it belongs to.
    this.settleBufferedChildExecutesForCard(entry.toolCallId);
    // Corroborated planner rows must land before the card's completion row.
    this.drainRunCommandPlansForCard(entry);
    entry.completed = true;

    const finalText = entry.reportText ?? entry.lastAssistantText ?? entry.errorText;
    const notifications = this.subagents.complete({
      sessionId: this.sessionId,
      toolCallId: entry.toolCallId,
      status,
      ...(finalText ? { result: finalText, childOutput: finalText } : {}),
      terminalMeta: {
        [PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY]: entry.toolCallId,
        [PORACODE_ACP_SUBAGENT_PROGRESS_META_KEY]: this.buildProgressMeta(entry),
      },
    });
    for (const notification of notifications) {
      this.ingest(notification);
    }
  }

  /**
   * Settle every card whose subagent never reported. Surfaces the last thing
   * the child produced (or its recorded error) as the result payload.
   */
  private settleUncompletedSubagents(status: "failed" | "cancelled"): void {
    this.turnEndedAt = undefined;
    for (const entry of this.trackedSubagents.values()) {
      if (!entry.completed) {
        this.completeSubagent(entry, status);
      }
    }
    this.settleBufferedChildExecutes();
    this.stopPolling();
  }

  private buildProgressMeta(entry: TrackedAntigravitySubagent): Record<string, unknown> {
    const description = entry.lastDescription ?? entry.spec.role ?? entry.title;
    return {
      ...(entry.lastToolName ? { lastToolName: entry.lastToolName } : {}),
      ...(description ? { description } : {}),
      stepCount: entry.stepCount,
      ...(entry.tokens !== undefined ? { tokens: entry.tokens } : {}),
      ...(entry.spec.model ? { model: entry.spec.model } : {}),
    };
  }

  private async resolveBrainRoot(): Promise<string | undefined> {
    if (this.options.brainRootPath) return this.options.brainRootPath;
    if (!this.brainRootPromise) {
      const homePromise =
        this.location.kind === "wsl"
          ? resolveWslHomeDirectoryAsync(this.location.distro)
          : Promise.resolve(homedir());
      this.brainRootPromise = homePromise.then((home) =>
        home ? appendBrainPath(home, ...ANTIGRAVITY_BRAIN_SUBDIR) : undefined,
      );
    }
    return this.brainRootPromise;
  }

  private async readTranscriptSteps(
    brainSessionDir: string,
  ): Promise<TranscriptStep[] | undefined> {
    const fullPath = appendBrainPath(brainSessionDir, ...TRANSCRIPT_FULL_REL);
    const fullText = await readSessionFileText(this.location, fullPath, MAX_TRANSCRIPT_BYTES);
    if (fullText !== undefined) {
      return parseTranscriptSteps(fullText);
    }
    const fallbackPath = appendBrainPath(brainSessionDir, ...TRANSCRIPT_FALLBACK_REL);
    const fallbackText = await readSessionFileText(
      this.location,
      fallbackPath,
      MAX_TRANSCRIPT_BYTES,
    );
    if (fallbackText !== undefined) {
      return parseTranscriptSteps(fallbackText);
    }
    return undefined;
  }

  private async readTranscriptStepsFromUri(uri: string): Promise<TranscriptStep[] | undefined> {
    let filePath = uri;
    if (uri.startsWith("file://")) {
      try {
        filePath = fileURLToPath(uri);
      } catch {
        return undefined;
      }
    }
    const fullCandidate = filePath.replace(/transcript\.jsonl$/i, "transcript_full.jsonl");
    if (fullCandidate !== filePath) {
      const fullText = await readSessionFileText(
        this.location,
        fullCandidate,
        MAX_TRANSCRIPT_BYTES,
      );
      if (fullText !== undefined) return parseTranscriptSteps(fullText);
    }
    const text = await readSessionFileText(this.location, filePath, MAX_TRANSCRIPT_BYTES);
    return text !== undefined ? parseTranscriptSteps(text) : undefined;
  }
}

export function attachAntigravitySubagentBridge(
  session: AcpStructuredSession,
  location: ProjectLocation,
  options?: AntigravitySubagentBridgeOptions,
): AntigravitySubagentBridge {
  const bridge = new AntigravitySubagentBridge(
    (notification) => session.ingestExternalSessionUpdate(notification),
    location,
    {
      ...options,
      isReplayingHistory: () => session.historyReplayActive,
    },
  );
  session.attachExternalSessionUpdateSource(bridge);
  return bridge;
}

/** agy's generic tool calls carry no usable `rawInput` (`{}` or nothing). */
export function isEmptyGenericRawInput(rawInput: unknown): boolean {
  const record = asRecord(rawInput);
  if (!record) return true;
  return Object.keys(record).length === 0;
}

function isCandidateGenericToolCall(notification: SessionNotification): boolean {
  const { update } = notification;
  if (update.sessionUpdate !== "tool_call") return false;
  if (update.kind !== "other") return false;
  if (update.title === NOTIFY_USER_TITLE) return false;
  const meta = asRecord(update._meta);
  if (
    meta &&
    (meta[PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY] === true ||
      typeof meta[PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY] === "string")
  ) {
    return false;
  }
  return isEmptyGenericRawInput(update.rawInput);
}

function withTopLevelMeta(notification: SessionNotification): SessionNotification {
  if (
    notification.update.sessionUpdate !== "tool_call" &&
    notification.update.sessionUpdate !== "tool_call_update"
  ) {
    return notification;
  }
  const existingMeta = asRecord(notification.update._meta) ?? {};
  return {
    ...notification,
    update: {
      ...notification.update,
      _meta: {
        ...existingMeta,
        [PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY]: true,
      },
    },
  };
}

/**
 * Transcript planner tool calls that are never bridged: they carry their own
 * arguments and render as ordinary rows. Every other name is a "generic" call
 * that the wire reports with an empty `rawInput`.
 */
const NON_GENERIC_TOOL_NAMES = new Set([
  "view_file",
  "client_view_file",
  "list_dir",
  "view_file_outline",
  "view_code_item",
  "write_to_file",
  "replace_file_content",
  "multi_replace_file_content",
  "client_edit_file",
  "run_command",
  "command_status",
  "send_command_input",
  "grep_search",
  "find_by_name",
  "browser_subagent",
  "task_boundary",
  "notify_user",
]);

function isTranscriptGenericToolName(name: string): boolean {
  return Boolean(name) && !NON_GENERIC_TOOL_NAMES.has(name);
}

function readToolCallId(update: SessionNotification["update"]): string | undefined {
  if (update.sessionUpdate !== "tool_call" && update.sessionUpdate !== "tool_call_update") {
    return undefined;
  }
  return update.toolCallId;
}

function readWireExecuteIdentity(update: SessionNotification["update"]): {
  command?: string;
  cwd?: string;
} {
  if (update.sessionUpdate !== "tool_call" && update.sessionUpdate !== "tool_call_update") {
    return {};
  }
  const raw = asRecord(update.rawInput) ?? asRecord(update.rawOutput);
  if (!raw) return {};
  const command =
    readNonEmptyString(raw, "CommandLine") ??
    readNonEmptyString(raw, "command_line") ??
    readNonEmptyString(raw, "command");
  const cwd =
    readNonEmptyString(raw, "Cwd") ??
    readNonEmptyString(raw, "working_dir") ??
    readNonEmptyString(raw, "cwd");
  return {
    ...(command ? { command } : {}),
    ...(cwd ? { cwd } : {}),
  };
}

function readWireExitCode(rawOutput: unknown): number | undefined {
  const raw = asRecord(rawOutput);
  if (!raw) return undefined;
  if (typeof raw.exitCode === "number") return raw.exitCode;
  return typeof raw.exit_code === "number" ? raw.exit_code : undefined;
}

function readRunCommandText(args: Record<string, unknown>): string | undefined {
  return (
    readNonEmptyString(args, "CommandLine") ??
    readNonEmptyString(args, "command_line") ??
    readNonEmptyString(args, "command")
  );
}

function readRunCommandCwd(args: Record<string, unknown>): string | undefined {
  return (
    readNonEmptyString(args, "Cwd") ??
    readNonEmptyString(args, "working_dir") ??
    readNonEmptyString(args, "cwd")
  );
}

function parseTimestamp(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readCurrentParentTurnStart(steps: readonly TranscriptStep[]): number | undefined {
  let latestIndex = -1;
  let latest: number | undefined;
  for (const step of steps) {
    if (step.type !== "USER_INPUT" || step.step_index <= latestIndex) continue;
    latestIndex = step.step_index;
    latest = parseTimestamp(step.created_at);
  }
  return latest;
}

function timestampWithinMatchWindow(timestamp: number, receivedAt: number): boolean {
  return (
    timestamp >= receivedAt - CHILD_EXECUTE_MATCH_LOOKBACK_MS &&
    timestamp <= receivedAt + CHILD_EXECUTE_MATCH_SKEW_MS
  );
}

function runCommandPlanKey(conversationId: string, stepIndex: number, callIndex: number): string {
  return `${conversationId}\u0000${stepIndex}\u0000${callIndex}`;
}

function planMatchesBufferedExecute(plan: RunCommandPlan, call: BufferedChildExecute): boolean {
  return planMatchesWireIdentity(plan, call, call.receivedAt);
}

function planMatchesWireIdentity(
  plan: RunCommandPlan,
  identity: { command?: string; cwd?: string },
  receivedAt: number,
): boolean {
  if (!identity.command || !identity.cwd) return false;
  if (plan.command !== identity.command || !plan.cwd || plan.cwd !== identity.cwd) return false;
  if (plan.createdAt === undefined) return true;
  return timestampWithinMatchWindow(plan.createdAt, receivedAt);
}

function sameWireExecuteIdentity(left: BufferedChildExecute, right: BufferedChildExecute): boolean {
  return (
    left.command !== undefined &&
    left.command === right.command &&
    left.cwd !== undefined &&
    left.cwd === right.cwd
  );
}

/**
 * A `RUN_COMMAND` step corroborates only the single `run_command` call in the
 * planner step immediately before it; an intervening planner step supersedes
 * that plan.
 */
function associateRunCommandExecutions(
  steps: readonly TranscriptStep[],
  conversationId: string,
): Map<string, { createdAt?: number; exitCode?: number; output?: string }> {
  const executions = new Map<string, { createdAt?: number; exitCode?: number; output?: string }>();
  const sorted = [...steps].sort((left, right) => left.step_index - right.step_index);
  let precedingPlans: string[] = [];
  for (const step of sorted) {
    if (step.type === "PLANNER_RESPONSE") {
      precedingPlans = [];
      for (const [callIndex, tc] of (step.tool_calls ?? []).entries()) {
        if (tc.name !== "run_command" || !readRunCommandText(tc.args)) continue;
        precedingPlans.push(runCommandPlanKey(conversationId, step.step_index, callIndex));
      }
      continue;
    }
    if (step.type !== "RUN_COMMAND") continue;
    if (step.status && step.status !== "DONE") continue;
    if (precedingPlans.length === 1 && precedingPlans[0]) {
      const createdAt = parseTimestamp(step.created_at);
      executions.set(precedingPlans[0], {
        ...(createdAt !== undefined ? { createdAt } : {}),
        ...(step.exit_code !== undefined ? { exitCode: step.exit_code } : {}),
        ...(step.content?.trim() ? { output: step.content.trim() } : {}),
      });
    }
    precedingPlans = [];
  }
  return executions;
}

function withSubagentActivityMeta(
  notification: SessionNotification,
  parentToolCallId: string,
): SessionNotification {
  const { update } = notification;
  if (update.sessionUpdate !== "tool_call" && update.sessionUpdate !== "tool_call_update") {
    return notification;
  }
  const existingMeta = asRecord(update._meta) ?? {};
  return {
    ...notification,
    update: {
      ...update,
      _meta: {
        ...existingMeta,
        [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: parentToolCallId,
        [PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY]: parentToolCallId,
      },
    },
  };
}

function appendBrainPath(root: string, ...parts: string[]): string {
  if (root.startsWith("/")) {
    return [root.replace(/\/+$/u, ""), ...parts].join("/");
  }
  return join(root, ...parts);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
