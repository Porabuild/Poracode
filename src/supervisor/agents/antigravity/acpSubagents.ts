/**
 * Antigravity ACP subagent bridge (`invoke_subagent` and `browser_subagent`).
 *
 * `agy_acp_server` (1.4.x) handles subagents in two distinct ways:
 *  1. `browser_subagent`: emitted with `kind: "other"` and
 *     `rawInput: { Task, TaskName, RecordingName }`, plus a native
 *     `tool_call_update` when the browser task completes. Normalizing its
 *     `rawInput` to carry `_toolName: "task"` and `subagent_type: "browser"`
 *     lets the shared ACP mapper render it as a subagent card.
 *  2. `invoke_subagent`: routed through `_extract_generic_tool_call` in
 *     `agy_acp_server/tools.py`, which strips `args.Subagents` (`rawInput: {}`),
 *     emits a single `tool_call` (`kind: "other"`, `status: "in_progress"`),
 *     and never emits `tool_call_update` for `INVOKE_SUBAGENT`, child steps,
 *     or completion (`<SYSTEM_MESSAGE>`).
 *
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
import type { SessionNotification } from "@agentclientprotocol/sdk";
import type { ProjectLocation } from "@/shared/contracts";
import type { AcpExternalSessionUpdateSource, AcpStructuredSession } from "../acp/session";
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
} from "./acpSubagentTranscripts";

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

export class AntigravitySubagentBridge implements AcpExternalSessionUpdateSource {
  private readonly subagents: AcpSubagentCoordinator;
  private readonly pollIntervalMs: number;
  private readonly resolveRetryMs: number;
  private readonly maxResolveRetries: number;
  private readonly turnEndSettleMs: number;
  private brainRootPromise: Promise<string | undefined> | null = null;
  private sessionId = "";
  private disposed = false;
  private resolvingCount = 0;
  private readonly deferredNotifications: SessionNotification[] = [];
  private readonly consumedPlannerCallKeys = new Set<string>();
  private readonly seenParentStepIndices = new Set<number>();
  private readonly trackedSubagents = new Map<string, TrackedAntigravitySubagent>();
  private readonly unassignedSubagents: TrackedAntigravitySubagent[] = [];
  private readonly subagentsByConversationId = new Map<string, TrackedAntigravitySubagent>();
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
    // Wire chatter between turns (agy emits updates after end_turn) must not
    // re-arm the settle window; only a fresh turn does, via onTurnStart.
    if (!this.sessionId && notification.sessionId.trim()) {
      this.sessionId = notification.sessionId.trim();
    }
    if (this.resolvingCount > 0) {
      this.deferredNotifications.push(notification);
      return true;
    }
    if (isCandidateGenericToolCall(notification)) {
      void this.resolveCandidateToolCall(notification).catch((error) => {
        this.reportError("candidate resolution", error);
      });
      return true;
    }
  }

  onTurnStart(): void {
    // A fresh prompt turn re-arms everything a previous turn's end latched.
    this.turnEndedAt = undefined;
    this.turnTerminalState = undefined;
  }

  onTurnEnd(state: "completed" | "cancelled" | "failed"): void {
    if (this.disposed) return;
    if (state === "completed") {
      this.turnTerminalState = undefined;
      if (!this.hasActiveSubagents()) return;
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
    this.settleUncompletedSubagents(state);
  }

  /** Trigger an immediate transcript poll (exported for deterministic tests). */
  async flush(): Promise<void> {
    await this.pollOnce();
  }

  dispose(): void {
    this.disposed = true;
    this.turnEndedAt = undefined;
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
    // Only a title-identical planner call may be intercepted: a positional
    // fallback could bind the notification to a different tool's call and fan
    // out subagent cards for work that never launched.
    return genericCalls.find((call) => call.expectedTitle === title || call.name === title);
  }

  private launchSubagents(
    baseToolCallId: string,
    fallbackTitle: string | undefined,
    specs: readonly SubagentSpec[],
  ): void {
    for (const [index, spec] of specs.entries()) {
      const toolCallId = index === 0 ? baseToolCallId : `${baseToolCallId}:subagent:${index}`;
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
    try {
      const brainRoot = await this.resolveBrainRoot();
      if (!brainRoot) return;
      const sessionBrainDir = appendBrainPath(brainRoot, this.sessionId);
      const parentSteps = await this.readTranscriptSteps(sessionBrainDir);
      const pendingCompletions = new Map<string, string>();

      let sawNewActivity = false;
      if (parentSteps) {
        sawNewActivity = this.processParentSteps(parentSteps, pendingCompletions);
      }

      for (const entry of this.trackedSubagents.values()) {
        if (entry.completed || !entry.conversationId) continue;
        const childActivity = await this.syncChildTranscript(brainRoot, entry);
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
        this.seenParentStepIndices.add(step.step_index);
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
    brainRoot: string,
    entry: TrackedAntigravitySubagent,
  ): Promise<boolean> {
    if (!entry.conversationId) return false;
    const childBrainDir = appendBrainPath(brainRoot, entry.conversationId);
    let steps = await this.readTranscriptSteps(childBrainDir);
    if (!steps && entry.logAbsoluteUri) {
      steps = await this.readTranscriptStepsFromUri(entry.logAbsoluteUri);
    }
    if (!steps || steps.length === 0) return false;

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
  if (notification.update.sessionUpdate !== "tool_call") return notification;
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
 * Tools routed through `_extract_generic_tool_call` in `agy_acp_server/tools.py`
 * (`kind: "other"`, `rawInput: {}`).
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

function appendBrainPath(root: string, ...parts: string[]): string {
  if (root.startsWith("/")) {
    return [root.replace(/\/+$/u, ""), ...parts].join("/");
  }
  return join(root, ...parts);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
