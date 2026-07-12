import { randomUUID } from "node:crypto";
import type {
  AgentKind,
  ProjectLocation,
  RuntimeEvent,
  SendThreadInputPayload,
  StartThreadPayload,
  Thread,
  ThreadAttention,
  ThreadConfig,
  ThreadStatus,
  McpLaunchSnapshot,
} from "@/shared/contracts";
import { capabilitiesForPresentation, validateAgentModelSelection } from "@/shared/agentSelection";
import { DEFAULT_TERMINAL_SIZE } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc/events";
import { makeThreadTitle } from "@/shared/threadTitle";
import { buildWorktreeLocation } from "@/shared/worktree";
import { generateWorktreeBranch } from "@/shared/worktreeBranch";
import type { AgentAdapter, ThreadHistory } from "@/supervisor/agents/base";
import { ChildTranscriptBuffer } from "./childTranscriptBuffer";
import type { TranscriptEntry } from "./childTranscriptBuffer";
import { truncate } from "./toolResult";
import { buildUnrestrictedChildConfig, resolveSubagentExecution } from "./types";

/**
 * Max live (session-active) orchestrator child threads per parent. Higher than
 * the ephemeral subagent cap (4) because the motivating use case is an
 * orchestrator working a batch of tickets, one worktree-backed thread each.
 */
export const MAX_CONCURRENT_CHILD_THREADS_PER_PARENT = 8;

/** How long `create_thread` waits for the main process to launch the child. */
export const CHILD_THREAD_LAUNCH_TIMEOUT_MS = 30_000;

/** Rolling per-child assistant-output tail kept for `get_thread`. */
const ASSISTANT_TAIL_MAX_CHARS = 2_000;

/** Per-message body cap for `read_thread` so transcripts can't blow up the caller's context. */
const MESSAGE_TEXT_MAX_CHARS = 4_000;

/**
 * Cap on the durable `finalResult` snapshot captured at turn end. Generous
 * (unlike the rolling tail) so a child's concluding answer survives intact for
 * the orchestrator to collect — even after the child's session is closed.
 */
const FINAL_RESULT_MAX_CHARS = 16_000;

/** Statuses `wait_for_thread` treats as settled (turn finished or needs the caller). */
const SETTLED_STATUSES: ReadonlySet<ThreadStatus> = new Set([
  "idle",
  "finished",
  "needs_approval",
  "needs_reply",
  "error",
  "inactive",
]);

/** A synchronous validation/orchestration failure surfaced as an MCP tool error. */
export class OrchestratorThreadError extends Error {}

/** Live-session view of a child thread, resolved from the thread session manager. */
export interface OrchestratorThreadState {
  status: ThreadStatus;
  attention: ThreadAttention;
  config: ThreadConfig;
  /** Whether the session supports non-interrupting steer while working. */
  supportsSteer: boolean;
}

/**
 * Host surface the orchestrator manager needs from the supervisor's thread
 * session manager. Kept minimal (thin hooks only) so the TSM stays lean.
 */
export interface OrchestratorThreadHost {
  /** Resolve a live parent thread's project and non-recursive MCP context. */
  getParentContext(threadId: string):
    | {
        projectLocation: ProjectLocation;
        config: ThreadConfig;
        mcpLaunchSnapshot: McpLaunchSnapshot;
      }
    | undefined;
  /** Live runtime state of a thread; `undefined` once its session is gone. */
  getThreadState(threadId: string): OrchestratorThreadState | undefined;
  /** Provider transcript when the session's adapter supports `readThread`. */
  readThreadHistory(threadId: string): Promise<ThreadHistory | undefined>;
  /** Start/steer a turn on a live thread (routes through the TSM's normal input path). */
  sendThreadInput(payload: SendThreadInputPayload): Promise<void>;
  /** Interrupt a live thread's current turn (the thread stays addressable). */
  interruptThread(threadId: string): Promise<void>;
  /**
   * Close a child's runtime session (frees its capacity slot). The persisted
   * thread row + its git worktree remain — this does not delete the child's work.
   */
  closeThread(threadId: string): Promise<void>;
}

export interface OrchestratorThreadManagerDeps {
  adapters: Map<AgentKind, AgentAdapter>;
  host: OrchestratorThreadHost;
  /** Supervisor event channel — carries `orchestrator-thread-created` to main. */
  emit(event: SupervisorEvent): void;
  /** Create a git worktree (new branch) in the parent's repo; returns its path. */
  createWorktree(input: {
    location: ProjectLocation;
    branch: string;
    baseBranch?: string;
  }): Promise<{ path: string }>;
  /**
   * Remove a git worktree (force + delete branch) — used only to roll back a
   * worktree created by a `create_thread` call that then failed to launch.
   */
  removeWorktree(input: { location: ProjectLocation; path: string }): Promise<void>;
  /** Test hook: overrides {@link CHILD_THREAD_LAUNCH_TIMEOUT_MS}. */
  launchTimeoutMs?: number;
}

/** Arguments accepted by the `create_thread` tool. */
export interface CreateChildThreadRequest {
  agent: string;
  prompt: string;
  title?: string;
  model?: string;
  effort?: string;
  fast?: boolean;
  worktree?: boolean;
  branch?: string;
  baseBranch?: string;
}

export interface CreateChildThreadResult {
  threadId: string;
  title: string;
  worktreePath?: string;
  branch?: string;
}

export interface ChildThreadSummary {
  threadId: string;
  title: string;
  agent: string;
  status: ThreadStatus;
  attention: ThreadAttention;
  createdAt: string;
  worktreePath?: string;
  branch?: string;
  /** Latest failure reason from the child's `thread-state` (cleared while it works). */
  error?: string;
  /** When the child's current turn started (progress signal). */
  turnStartedAt?: string;
}

/** Per-thread settled-state bits returned by `wait_for_thread`. */
export interface ThreadStatusBits {
  status: ThreadStatus;
  attention: ThreadAttention;
  error?: string;
}

interface ChildThreadRecord {
  threadId: string;
  parentThreadId: string;
  agent: string;
  title: string;
  worktreePath?: string;
  branch?: string;
  lastStatus: ThreadStatus;
  lastAttention: ThreadAttention;
  /** Latest failure reason from `thread-state` (cleared when the child works again). */
  lastError: string | undefined;
  /** Durable snapshot of the child's concluding assistant message (survives close). */
  finalResult: string | undefined;
  /** ISO timestamp the child was created. */
  createdAt: string;
  /** ISO timestamp the child's current/last turn began (set on → working). */
  turnStartedAt: string | undefined;
  /** Compact structured transcript for `read_thread` (works without native readThread). */
  transcript: ChildTranscriptBuffer;
}

interface StatusWaiter {
  threadIds: ReadonlySet<string>;
  wake(): void;
}

/** Internal marker so `createThread` can distinguish a launch timeout from a hard failure. */
class LaunchTimeoutError extends OrchestratorThreadError {}

/**
 * Orchestrator lane of the subagents MCP: lets a parent thread create and
 * manage REAL first-class app threads (persisted rows, sidebar-visible,
 * optionally worktree-backed), as opposed to the ephemeral in-memory runs
 * owned by {@link SubagentRunManager}.
 *
 * Thread creation is main-orchestrated: this manager emits an
 * `orchestrator-thread-created` supervisor event carrying the child row + a
 * ready `startThread` payload; the main process resolves the projectId from
 * the parent's DB row, upserts the child, mirrors it to the renderer, and
 * calls back into the supervisor's `startThread` — the exact ordering the
 * proven remote (mobile) start path uses. `create_thread` then resolves once
 * the child's session appears in the thread session manager.
 *
 * The parent→children registry is in-memory only: if the supervisor restarts,
 * the parent's session (and its MCP connection) is gone too. Child threads
 * themselves are durable app threads and survive independently.
 */
export class OrchestratorThreadManager {
  private readonly children = new Map<string, ChildThreadRecord>();
  private readonly waiters = new Set<StatusWaiter>();

  constructor(private readonly deps: OrchestratorThreadManagerDeps) {}

  /** Agent kinds eligible for `create_thread` (full structured/GUI sessions). */
  private structuredAgentKinds(): string[] {
    const kinds: string[] = [];
    for (const [kind, adapter] of this.deps.adapters) {
      if (resolveSubagentExecution(adapter) === "structured") kinds.push(kind);
    }
    return kinds;
  }

  /**
   * Create a first-class child thread (optionally in a fresh git worktree) and
   * initiate its launch. Resolves once the child's session is live in the
   * thread session manager; does NOT wait for the child's first turn to finish.
   */
  async createThread(
    parentThreadId: string,
    request: CreateChildThreadRequest,
  ): Promise<CreateChildThreadResult> {
    const prompt = request.prompt?.trim();
    if (!prompt) throw new OrchestratorThreadError("prompt is required");
    const adapter = this.deps.adapters.get(request.agent as AgentKind);
    if (!adapter) {
      throw new OrchestratorThreadError(
        `Unknown provider: ${request.agent}. Call list_agents for the available providers.`,
      );
    }
    if (resolveSubagentExecution(adapter) !== "structured") {
      throw new OrchestratorThreadError(
        `Provider ${request.agent} only supports one-shot subagent runs and cannot host a full thread. ` +
          `Providers eligible for create_thread: ${this.structuredAgentKinds().join(", ") || "none"}.`,
      );
    }
    const parent = this.deps.host.getParentContext(parentThreadId);
    if (!parent) throw new OrchestratorThreadError("Parent thread is no longer active");
    const live = this.liveChildCount(parentThreadId);
    if (live >= MAX_CONCURRENT_CHILD_THREADS_PER_PARENT) {
      throw new OrchestratorThreadError(
        `You already have ${live} live child thread(s) — the max is ${MAX_CONCURRENT_CHILD_THREADS_PER_PARENT}. ` +
          "A finished child keeps holding its slot until you free it: call close_thread on a completed thread " +
          "(check list_threads / wait_for_thread for which are done) to make room, then retry create_thread. " +
          "Waiting does not free a slot — only close_thread (or the child's session ending) does.",
      );
    }

    const capabilities = capabilitiesForPresentation(adapter.capabilities, "gui");
    const model = request.model ?? capabilities.models[0]?.id;
    if (!model) {
      throw new OrchestratorThreadError(`Provider ${request.agent} has no available models`);
    }
    const selectionError = validateAgentModelSelection(capabilities, {
      model,
      ...(request.effort ? { reasoning: request.effort } : {}),
      ...(request.fast === true ? { fast: true } : {}),
    });
    if (selectionError) throw new OrchestratorThreadError(selectionError);

    // A custom branch/base_branch implies the caller wants a worktree.
    let worktreePath: string | undefined;
    let branch: string | undefined;
    if (request.worktree || request.branch || request.baseBranch) {
      branch = request.branch?.trim() || generateWorktreeBranch();
      const baseBranch = request.baseBranch?.trim();
      try {
        const created = await this.deps.createWorktree({
          location: parent.projectLocation,
          branch,
          ...(baseBranch ? { baseBranch } : {}),
        });
        worktreePath = created.path;
      } catch (error) {
        // No child thread exists yet — turn the raw git failure into actionable
        // guidance (branch collisions poison ticket-keyed retries otherwise).
        throw describeWorktreeFailure(error, branch);
      }
    }

    const threadId = randomUUID();
    const customTitle = request.title?.trim();
    const title = customTitle || makeThreadTitle(prompt) || "New thread";
    // Child uses the target provider's unrestricted posture and inherits the
    // parent's non-recursive MCPs. Subagents MCP is intentionally omitted so
    // children cannot spawn grandchildren.
    const childConfig = buildUnrestrictedChildConfig(
      {
        model,
        ...(request.effort ? { effort: request.effort } : {}),
        ...(request.fast === true ? { fast: true } : {}),
      },
      capabilities,
      parent.config,
    );
    const childLocation = worktreePath
      ? buildWorktreeLocation(parent.projectLocation, worktreePath)
      : parent.projectLocation;

    const now = new Date().toISOString();
    const thread: Omit<Thread, "projectId"> = {
      id: threadId,
      title,
      agentKind: request.agent as AgentKind,
      config: childConfig,
      status: "launching",
      attention: "none",
      canResumeWithConfig: false,
      archived: false,
      done: false,
      starred: false,
      presentationMode: "gui",
      threadStatusSource: "server",
      ...(worktreePath ? { worktreePath } : {}),
      ...(branch ? { worktreeBranch: branch } : {}),
      parentThreadId,
      createdAt: now,
      updatedAt: now,
      activeTurnStartedAt: now,
    };
    const start: StartThreadPayload = {
      threadId,
      projectLocation: childLocation,
      agentKind: request.agent as AgentKind,
      config: childConfig,
      prompt,
      initialSize: DEFAULT_TERMINAL_SIZE,
      presentationMode: "gui",
      ...parent.mcpLaunchSnapshot,
    };

    const record: ChildThreadRecord = {
      threadId,
      parentThreadId,
      agent: request.agent,
      title,
      ...(worktreePath ? { worktreePath } : {}),
      ...(branch ? { branch } : {}),
      lastStatus: "launching",
      lastAttention: "none",
      lastError: undefined,
      finalResult: undefined,
      createdAt: now,
      turnStartedAt: undefined,
      transcript: new ChildTranscriptBuffer(),
    };
    this.children.set(threadId, record);

    // Hard failure in the create/launch handoff (emit throws) → no session can
    // appear: roll back the worktree WE created this call and forget the record.
    try {
      this.deps.emit({
        type: "orchestrator-thread-created",
        parentThreadId,
        thread,
        start,
        ...(worktreePath ? { isNewWorktree: true } : {}),
        ...(customTitle ? { hasCustomTitle: true } : {}),
      });
    } catch (error) {
      await this.cleanupFailedLaunch(
        threadId,
        worktreePath ? { location: parent.projectLocation, path: worktreePath } : undefined,
      );
      throw error;
    }

    try {
      await this.waitForLaunch(
        threadId,
        this.deps.launchTimeoutMs ?? CHILD_THREAD_LAUNCH_TIMEOUT_MS,
      );
    } catch (error) {
      if (error instanceof LaunchTimeoutError) {
        // The child may still come up (main can finish startThread after we stop
        // waiting). KEEP the record so list_threads can surface it if it appears,
        // and KEEP the worktree. A never-launched record can't wedge the cap:
        // liveChildCount is gated on getThreadState, undefined until a session exists.
        throw new OrchestratorThreadError(
          `Child thread ${threadId} has not confirmed launch yet — it may still be starting in the app. ` +
            "Do NOT recreate it blindly: check list_threads first (it appears there once/if it launches) " +
            "so you don't create a duplicate." +
            (branch ? ` Its worktree (branch "${branch}") is preserved.` : ""),
        );
      }
      // Any other failure before a session exists → treat as a hard failure.
      await this.cleanupFailedLaunch(
        threadId,
        worktreePath ? { location: parent.projectLocation, path: worktreePath } : undefined,
      );
      throw error;
    }

    return {
      threadId,
      title,
      ...(worktreePath ? { worktreePath } : {}),
      ...(branch ? { branch } : {}),
    };
  }

  /** Forget a failed child and roll back the worktree this call created (best effort). */
  private async cleanupFailedLaunch(
    threadId: string,
    worktree: { location: ProjectLocation; path: string } | undefined,
  ): Promise<void> {
    this.children.delete(threadId);
    if (!worktree) return;
    try {
      await this.deps.removeWorktree(worktree);
    } catch (cleanupError) {
      // Never mask the original failure with a cleanup error.
      console.warn(
        `[orchestrator] failed to remove worktree ${worktree.path} after a failed launch:`,
        cleanupError,
      );
    }
  }

  /**
   * Close a finished child's runtime session to free a capacity slot. The
   * persisted thread row + its worktree stay in the app for the human, and the
   * record is retained so post-close get_thread/read_thread still return the
   * captured final result.
   */
  async closeThread(parentThreadId: string, threadId: string): Promise<void> {
    this.requireChild(parentThreadId, threadId);
    await this.deps.host.closeThread(threadId);
  }

  /** Children of `parentThreadId` with their current status. */
  listThreads(parentThreadId: string): ChildThreadSummary[] {
    const out: ChildThreadSummary[] = [];
    for (const record of this.children.values()) {
      if (record.parentThreadId !== parentThreadId) continue;
      out.push(this.summarize(record));
    }
    return out;
  }

  /** Status + attention + recent output tail + durable final result for one owned child. */
  getThread(
    parentThreadId: string,
    threadId: string,
  ): ChildThreadSummary & { recentOutput?: string; finalResult?: string } {
    const record = this.requireChild(parentThreadId, threadId);
    // Derive the recent-output tail lazily from the transcript's last assistant
    // message (a cold read) instead of maintaining a second per-token accumulator.
    const tail = record.transcript.lastAssistantMessage().slice(-ASSISTANT_TAIL_MAX_CHARS).trim();
    const finalResult = record.finalResult?.trim();
    return {
      ...this.summarize(record),
      ...(tail ? { recentOutput: tail } : {}),
      ...(finalResult ? { finalResult } : {}),
    };
  }

  /**
   * Transcript tail for an owned child. Prefers the session's native
   * `readThread` (highest fidelity, e.g. opencode) while it's live; otherwise
   * serves the buffered structured transcript built from the child's runtime
   * events — so Claude/Codex/ACP children (and closed sessions) still return
   * something useful. Falls back to a graceful note only when nothing is buffered.
   * Message/entry bodies are truncated so the result can't blow up the caller's context.
   */
  async readThread(
    parentThreadId: string,
    threadId: string,
    lastMessages: number,
  ): Promise<
    | { status: ThreadStatus; source: "note"; note: string }
    | {
        status: ThreadStatus;
        source: "native";
        messageCount: number;
        messages: Array<{ role: "user" | "assistant"; text: string }>;
      }
    | {
        status: ThreadStatus;
        source: "buffer";
        entryCount: number;
        entries: TranscriptEntry[];
      }
  > {
    const record = this.requireChild(parentThreadId, threadId);
    const status = this.currentStatus(record);
    const count = Math.min(Math.max(Math.trunc(lastMessages) || 20, 1), 100);
    const history = this.deps.host.getThreadState(threadId)
      ? await this.deps.host.readThreadHistory(threadId)
      : undefined;
    if (history) {
      const messages = history.messages.slice(-count).map((message) => ({
        role: message.role,
        text: truncate(renderHistoryParts(message.parts), MESSAGE_TEXT_MAX_CHARS),
      }));
      return { status, source: "native", messageCount: history.messages.length, messages };
    }
    const entries = record.transcript.snapshot(count);
    if (entries.length > 0) {
      return { status, source: "buffer", entryCount: record.transcript.size, entries };
    }
    return {
      status,
      source: "note",
      note:
        "No transcript is available yet for this thread (it has produced no recorded messages, tool calls, or errors). " +
        "Use get_thread for its status and recent output.",
    };
  }

  /**
   * Deliver a message to an owned child: start a turn when it's settled, steer
   * when it's working and the session supports steering, or interrupt-then-send
   * when `interrupt` is set. Errors when the child is busy and can't be steered.
   */
  async sendToThread(
    parentThreadId: string,
    threadId: string,
    message: string,
    interrupt: boolean,
  ): Promise<{ delivery: "started_turn" | "steered" | "interrupted_and_sent" }> {
    this.requireChild(parentThreadId, threadId);
    const prompt = message.trim();
    if (!prompt) throw new OrchestratorThreadError("message is required");
    const state = this.deps.host.getThreadState(threadId);
    if (!state) {
      throw new OrchestratorThreadError(
        `Thread ${threadId} is not running (its session was closed in the app), so it cannot receive input.`,
      );
    }
    if (state.status === "needs_approval") {
      // A tool-permission prompt is pending; this tool has no requestId to
      // resolve it. Sending here would silently start a NEW turn (false success)
      // rather than approving the tool. `needs_reply` is different (a question) —
      // that falls through to the normal start-a-turn path below.
      throw new OrchestratorThreadError(
        `Thread ${threadId} is blocked waiting for a tool-permission approval that send_to_thread cannot resolve. ` +
          "A human must approve or deny it in the app UI. Subagent threads request Full access, but the " +
          "provider can still surface an approval prompt that this tool cannot answer. This is not a message prompt.",
      );
    }
    const payload: SendThreadInputPayload = { threadId, prompt, config: state.config };
    const busy = state.status === "working" || state.status === "launching";
    if (busy && interrupt) {
      await this.deps.host.interruptThread(threadId);
      await this.waitWhileWorking(threadId, 5_000);
      await this.deps.host.sendThreadInput(payload);
      return { delivery: "interrupted_and_sent" };
    }
    if (busy) {
      if (state.status === "working" && state.supportsSteer) {
        await this.deps.host.sendThreadInput(payload);
        return { delivery: "steered" };
      }
      throw new OrchestratorThreadError(
        `Thread ${threadId} is ${state.status} and does not support steering. ` +
          "Retry with interrupt=true, or wait_for_thread first.",
      );
    }
    await this.deps.host.sendThreadInput(payload);
    return { delivery: "started_turn" };
  }

  /**
   * Block until ANY listed child settles (idle | finished | needs_approval |
   * needs_reply | error, or its session is gone) or the timeout elapses.
   * Returns immediately when one is already settled. Event-driven (woken by
   * `thread-state` supervisor events), no tight polling.
   */
  async waitForThreads(
    parentThreadId: string,
    threadIds: string[],
    timeoutMs: number,
  ): Promise<{
    statuses: Record<string, ThreadStatusBits>;
    settled: string[];
    timedOut: boolean;
  }> {
    if (threadIds.length < 1 || threadIds.length > 8) {
      throw new OrchestratorThreadError("thread_ids must list between 1 and 8 threads");
    }
    const records = threadIds.map((id) => this.requireChild(parentThreadId, id));
    const settledResult = await this.waitUntil(threadIds, timeoutMs, () => {
      const snap = this.snapshotStatuses(records);
      return snap.settled.length > 0 ? snap : undefined;
    });
    if (settledResult) return { ...settledResult, timedOut: false };
    return { ...this.snapshotStatuses(records), timedOut: true };
  }

  /** Current status/settled snapshot for a set of child records. */
  private snapshotStatuses(records: ChildThreadRecord[]): {
    statuses: Record<string, ThreadStatusBits>;
    settled: string[];
  } {
    const statuses: Record<string, ThreadStatusBits> = {};
    const settled: string[] = [];
    for (const record of records) {
      const bits = this.statusBits(record);
      statuses[record.threadId] = bits;
      if (SETTLED_STATUSES.has(bits.status)) settled.push(record.threadId);
    }
    return { statuses, settled };
  }

  /** Interrupt an owned child's current turn; the thread stays addressable. */
  async interruptThread(parentThreadId: string, threadId: string): Promise<void> {
    this.requireChild(parentThreadId, threadId);
    if (!this.deps.host.getThreadState(threadId)) {
      throw new OrchestratorThreadError(
        `Thread ${threadId} is not running (its session was closed in the app).`,
      );
    }
    await this.deps.host.interruptThread(threadId);
  }

  /**
   * Tap on the supervisor's outbound event stream (wired in the runtime's
   * `emit` plumbing): tracks child status transitions, wakes waiters, and keeps
   * a bounded assistant-output tail per child. Cheap no-op for non-child events.
   */
  observeSupervisorEvent(event: SupervisorEvent): void {
    switch (event.type) {
      case "thread-state": {
        const record = this.children.get(event.threadId);
        if (record) {
          const wasWorking = record.lastStatus === "working";
          record.lastStatus = event.status;
          record.lastAttention = event.attention;
          if (event.status === "working" || event.status === "launching") {
            // A fresh turn started — stale failure reasons no longer apply.
            record.lastError = undefined;
            if (event.status === "working" && !wasWorking) {
              record.turnStartedAt = new Date().toISOString();
            }
          } else {
            if (event.errorMessage) record.lastError = event.errorMessage;
            // Fallback capture of the final result if no turn.completed was seen.
            if (event.status === "idle" || event.status === "finished") {
              this.captureFinalResult(record);
            }
          }
        }
        // Common case is zero waiters (no orchestrator wait in flight) — skip
        // the loop entirely. wake() only deletes the current waiter, which is
        // safe to do while iterating a Set directly (no defensive copy needed).
        if (this.waiters.size > 0) {
          for (const waiter of this.waiters) {
            if (waiter.threadIds.has(event.threadId)) waiter.wake();
          }
        }
        return;
      }
      case "thread-runtime-event":
        this.trackRuntimeEvents(event.threadId, [event.event]);
        return;
      case "thread-runtime-events":
        this.trackRuntimeEvents(event.threadId, event.events);
        return;
      case "thread-runtime-events-multi":
        for (const batch of event.batches) this.trackRuntimeEvents(batch.threadId, batch.events);
        return;
      default:
        return;
    }
  }

  private trackRuntimeEvents(threadId: string, events: ReadonlyArray<RuntimeEvent>): void {
    const record = this.children.get(threadId);
    if (!record) return;
    for (const event of events) {
      record.transcript.ingest(event);
      if (event.type === "turn.completed") this.captureFinalResult(record);
    }
  }

  /** Snapshot the child's concluding assistant message as a durable final result. */
  private captureFinalResult(record: ChildThreadRecord): void {
    const text = record.transcript.lastAssistantMessage().trim();
    if (text) record.finalResult = truncate(text, FINAL_RESULT_MAX_CHARS);
  }

  private summarize(record: ChildThreadRecord): ChildThreadSummary {
    const live = this.deps.host.getThreadState(record.threadId);
    return {
      threadId: record.threadId,
      title: record.title,
      agent: record.agent,
      status: live?.status ?? "inactive",
      attention: live?.attention ?? record.lastAttention,
      createdAt: record.createdAt,
      ...(record.worktreePath ? { worktreePath: record.worktreePath } : {}),
      ...(record.branch ? { branch: record.branch } : {}),
      ...(record.lastError ? { error: record.lastError } : {}),
      ...(record.turnStartedAt ? { turnStartedAt: record.turnStartedAt } : {}),
    };
  }

  /** Status + attention + failure reason bits used by `wait_for_thread` (subset of the summary). */
  private statusBits(record: ChildThreadRecord): ThreadStatusBits {
    const { status, attention, error } = this.summarize(record);
    return { status, attention, ...(error ? { error } : {}) };
  }

  /** Live session status, or `inactive` once the child's session is gone. */
  private currentStatus(record: ChildThreadRecord): ThreadStatus {
    return this.deps.host.getThreadState(record.threadId)?.status ?? "inactive";
  }

  private liveChildCount(parentThreadId: string): number {
    let count = 0;
    for (const record of this.children.values()) {
      if (record.parentThreadId !== parentThreadId) continue;
      if (this.deps.host.getThreadState(record.threadId)) count += 1;
    }
    return count;
  }

  private requireChild(parentThreadId: string, threadId: string): ChildThreadRecord {
    const record = this.children.get(threadId);
    if (!record || record.parentThreadId !== parentThreadId) {
      throw new OrchestratorThreadError(
        `Unknown thread_id: ${threadId}. Only threads you created via create_thread are addressable (see list_threads).`,
      );
    }
    return record;
  }

  /**
   * Resolve once the child's session appears in the thread session manager
   * (the launch loops back through main → supervisor `startThread`). Woken by
   * the child's first `thread-state` event, with a coarse 500ms re-check as a
   * safety net; throws with diagnostics on timeout.
   */
  private async waitForLaunch(threadId: string, timeoutMs: number): Promise<void> {
    // 500ms re-check caps the wait between event wakes as a safety net for the
    // race where the session appears before a waiter is registered.
    const launched = await this.waitUntil(
      [threadId],
      timeoutMs,
      () => (this.deps.host.getThreadState(threadId) ? true : undefined),
      500,
    );
    if (!launched) {
      throw new LaunchTimeoutError(
        `Child thread did not confirm launch within ${Math.round(timeoutMs / 1000)}s. ` +
          "The desktop app may be slow or unavailable, or the parent thread's project could not be resolved.",
      );
    }
  }

  /** Best-effort wait for a thread to leave `working` (used after an interrupt). */
  private async waitWhileWorking(threadId: string, timeoutMs: number): Promise<void> {
    await this.waitUntil([threadId], timeoutMs, () => {
      const state = this.deps.host.getThreadState(threadId);
      return !state || state.status !== "working" ? true : undefined;
    });
  }

  /**
   * Event-driven wait: re-evaluate `poll` on each `thread-state` wake for the
   * given ids (plus an optional `maxChunkMs` re-check cap) until it returns a
   * value, or the deadline elapses. Returns the polled value, or `undefined` on
   * timeout. Shared loop scaffolding for the wait_for/launch/while-working paths.
   */
  private async waitUntil<T>(
    threadIds: string[],
    timeoutMs: number,
    poll: () => T | undefined,
    maxChunkMs = Number.POSITIVE_INFINITY,
  ): Promise<T | undefined> {
    const deadline = Date.now() + Math.max(0, timeoutMs);
    for (;;) {
      const value = poll();
      if (value !== undefined) return value;
      const remaining = deadline - Date.now();
      if (remaining <= 0) return undefined;
      await this.waitForWake(threadIds, Math.min(maxChunkMs, remaining));
    }
  }

  /** Sleep until a `thread-state` event lands for one of `threadIds`, or `timeoutMs`. */
  private waitForWake(threadIds: string[], timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const waiter: StatusWaiter = {
        threadIds: new Set(threadIds),
        wake: () => {
          if (timer) clearTimeout(timer);
          this.waiters.delete(waiter);
          resolve();
        },
      };
      this.waiters.add(waiter);
      timer = setTimeout(() => waiter.wake(), Math.max(0, timeoutMs));
    });
  }
}

/**
 * Turn a raw `createWorktree` git failure into actionable guidance. Branch
 * collisions are the common trap: ticket-keyed branch names permanently poison
 * retries, so name the branch and tell the model how to recover.
 */
function describeWorktreeFailure(error: unknown, branch: string): OrchestratorThreadError {
  const message = error instanceof Error ? error.message : String(error);
  const collision =
    /already exists|already checked out|already used by worktree|cannot lock ref|not a valid branch name|fatal: a branch named/i.test(
      message,
    );
  if (collision) {
    return new OrchestratorThreadError(
      `Could not create a worktree for branch "${branch}" — it likely already exists ` +
        "(often from a previous thread for the same ticket). Retry create_thread with a different `branch` name, " +
        "or close/clean up the earlier thread that owns this branch first. " +
        `Underlying git error: ${message}`,
    );
  }
  return new OrchestratorThreadError(
    `Could not create a worktree for branch "${branch}": ${message}. ` +
      "Retry create_thread with a different `branch` name.",
  );
}

/** Best-effort plain-text projection of provider-shaped history parts. */
function renderHistoryParts(parts: ReadonlyArray<unknown>): string {
  const chunks: string[] = [];
  for (const part of parts) {
    if (typeof part === "string") {
      if (part.trim()) chunks.push(part);
      continue;
    }
    if (part && typeof part === "object") {
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string" && text.trim()) {
        chunks.push(text);
        continue;
      }
      const summary = JSON.stringify(part);
      if (summary && summary !== "{}") chunks.push(truncate(summary, 500));
    }
  }
  return chunks.join("\n");
}
