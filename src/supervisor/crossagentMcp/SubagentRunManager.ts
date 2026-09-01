import { randomBytes } from "node:crypto";
import { authoritativeAssistantText } from "@/shared/assistantMessageText";
import type {
  AgentCapability,
  AgentKind,
  ProjectLocation,
  RuntimeEvent,
  ThreadConfig,
  ThreadServerRequestId,
  ToolCallPayload,
} from "@/shared/contracts";
import type { AgentAdapter } from "@/supervisor/agents/base";
import { ForwardedRuntimeItemTracker } from "./ForwardedRuntimeItemTracker";
import { SubagentAttemptRunner, type AttemptExecutionState } from "./SubagentAttemptRunner";
import { SubagentSpawnError } from "./errors";
import { prepareSubagentRun, type PreparedSubagentRun } from "./spawnPlan";
import type {
  SubagentAttemptResult,
  SubagentRunSummary,
  SpawnAgentRequest,
  SubagentRunHost,
  SubagentRunStatus,
  SubagentWaitOptions,
  SubagentWaitResult,
} from "./types";

/**
 * Default `wait_for_agent` / `run_agent` blocking timeout. Blocking waits must
 * finish under every MCP client's own tool-call kill timer, or the client
 * aborts the HTTP call and the caller sees an opaque transport error instead
 * of the graceful `status: "running"` re-poll result. Known ceilings: Codex
 * `tool_timeout_sec` and Gemini's per-server `timeout` (both set to 300s in
 * their `mcpCrossagent.ts` builders — keep in sync), and undici's 300s
 * default headers timeout for fetch-based clients (Claude SDK).
 */
export const DEFAULT_WAIT_TIMEOUT_MS = 120_000;
/** Hard cap on caller-supplied `timeout_s` — see {@link DEFAULT_WAIT_TIMEOUT_MS}. */
export const MAX_WAIT_TIMEOUT_MS = 240_000;
/** Max concurrent live children per parent thread. */
export const MAX_CONCURRENT_CHILDREN_PER_PARENT = 4;
/** Bound terminal result retention for long-lived parent threads. */
const MAX_RETAINED_RUNS_PER_PARENT = 50;
/**
 * Tail cap on the incremental output a wait/status call returns while a run is
 * still in progress. Mid-run text is process narration the parent rarely needs
 * verbatim; a long-polling parent otherwise re-ingests the child's entire
 * growing transcript on every check (observed at 100k+ tokens per poll).
 */
export const MAX_RUNNING_OUTPUT_TAIL_CHARS = 1_000;
/** Tail cap on the incremental output returned once a run has settled. */
const MAX_SETTLED_OUTPUT_TAIL_CHARS = 16_000;
/** Tail cap on the per-attempt outputs echoed inside `attempts`. */
const MAX_ATTEMPT_OUTPUT_TAIL_CHARS = 2_000;

/** Keep the newest `maxChars` of `text`, prefixing a marker for the omitted prefix. */
function clipOutputTail(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const omitted = text.length - maxChars;
  return `[…${omitted} earlier chars omitted — pass full_output=true for the complete output]\n${text.slice(-maxChars)}`;
}

export interface SubagentRunManagerDeps {
  adapters: Map<AgentKind, AgentAdapter>;
  host: SubagentRunHost;
  /**
   * Settings-filtered provider capabilities from the same status pipeline that
   * serves the roster. `null` explicitly denies a provider; `undefined` falls
   * back to live adapter capabilities when no cached status exists.
   */
  getStatusCapabilities?: (kind: AgentKind) => AgentCapability | null | undefined;
}

interface RunRecord extends AttemptExecutionState {
  runId: string;
  createdAt: number;
  parentThreadId: string;
  childThreadId: string;
  label: string;
  background: boolean;
  plan: PreparedSubagentRun;
  attemptIndex: number;
  attemptSettled: boolean;
  attemptResults: SubagentAttemptResult[];
  status: SubagentRunStatus;
  /** Assistant text accumulated for the current attempt. */
  output: string;
  /** Assistant text accumulated across every fallback attempt. */
  cursorOutput: string;
  /**
   * Per-item spans of `output`, in arrival order, so an authoritative
   * item.updated payload (a Claude display hook rewriting or suppressing
   * already-streamed text) can replace exactly its item's contribution.
   * `cursorOutput` is deliberately not rebuilt: callers hold character
   * offsets into it, so it stays an append-only live tail — the same rule
   * the chat applies (stream while live, authoritative payload once final).
   */
  outputSegments: Array<{ itemId: string; text: string; override?: string }>;
  /** Direct child items started under the synthetic Agent row. */
  stepCount: number;
  /**
   * Child-side ids of forwarded `request.opened` events still awaiting a
   * resolution. Drained on settle/cancel via synthetic `request.resolved`
   * events so the parent's request panel doesn't show a stale prompt.
   */
  pendingRequestIds: Set<string>;
  forwardedRuntimeItems: ForwardedRuntimeItemTracker;
  cancelRequested: boolean;
  turnStarted: boolean;
  turnDispatched: boolean;
  error:
    | {
        message: string;
        may_have_side_effects: boolean;
      }
    | undefined;
  settled: boolean;
  settledPromise: Promise<void>;
  resolveSettled: () => void;
}

export { SubagentSpawnError } from "./errors";

/** Prefix used for a child's re-tagged item ids inside the parent stream. */
function childItemPrefix(runId: string, attemptIndex: number): string {
  return `${runId}:${attemptIndex + 1}:`;
}

/** Synthetic parent tool_call item id that hosts the subagent's child items. */
function syntheticItemId(runId: string): string {
  return `sub:${runId}`;
}

/**
 * Delimiter joining a runId to a child's server-request id when a forwarded
 * `request.opened` is namespaced into the parent stream. A double-colon can't
 * appear in a hex runId, and parsing splits on the FIRST occurrence, so an
 * original request id that itself contains "::" still round-trips intact.
 */
const REQUEST_ID_SEPARATOR = "::";

/** Namespace a child request id under its run for the parent stream. */
function namespacedRequestId(runId: string, requestId: string): string {
  return `${runId}${REQUEST_ID_SEPARATOR}${requestId}`;
}

/**
 * Recover `{ runId, requestId }` from a namespaced id. Returns `undefined` when
 * the id isn't a namespaced subagent request (non-string, or no delimiter),
 * signalling the caller to fall through to the normal session resolve path.
 */
function parseNamespacedRequestId(
  namespaced: ThreadServerRequestId,
): { runId: string; requestId: string } | undefined {
  if (typeof namespaced !== "string") return undefined;
  const idx = namespaced.indexOf(REQUEST_ID_SEPARATOR);
  if (idx <= 0) return undefined;
  return {
    runId: namespaced.slice(0, idx),
    requestId: namespaced.slice(idx + REQUEST_ID_SEPARATOR.length),
  };
}

/**
 * Owns cross-provider subagent child runs. Each child is a real provider
 * structured session created directly from the adapter registry (NOT a
 * thread-store thread), whose item-level runtime events are re-tagged and
 * merged into the spawning parent thread's stream under a synthetic sub-agent
 * tool_call tile.
 */
export class SubagentRunManager {
  private readonly runs = new Map<string, RunRecord>();
  private readonly attemptRunner: SubagentAttemptRunner;

  constructor(private readonly deps: SubagentRunManagerDeps) {
    this.attemptRunner = new SubagentAttemptRunner(deps.host);
  }

  /** Validate and start one child run, returning its id immediately. */
  spawn(parentThreadId: string, request: SpawnAgentRequest): { runId: string } {
    return this.spawnMany(parentThreadId, [request])[0]!;
  }

  /**
   * Atomically validate and start several runs. Every child is launched before
   * control returns, so callers can fan out without serial MCP round trips.
   */
  spawnMany(
    parentThreadId: string,
    requests: readonly SpawnAgentRequest[],
  ): Array<{ runId: string }> {
    if (requests.length === 0) throw new SubagentSpawnError("tasks must not be empty");
    const parent = this.requireParent(parentThreadId);
    const active = this.activeCountForParent(parentThreadId);
    if (active + requests.length > MAX_CONCURRENT_CHILDREN_PER_PARENT) {
      throw new SubagentSpawnError(
        `Too many concurrent subagents (max ${MAX_CONCURRENT_CHILDREN_PER_PARENT}, ${active} already running).`,
      );
    }
    const plans = requests.map((request) => prepareSubagentRun(this.deps, parent, request));
    return plans.map((plan) => this.startRun(parentThreadId, plan));
  }

  private startRun(parentThreadId: string, plan: PreparedSubagentRun): { runId: string } {
    const runId = randomBytes(6).toString("hex");
    const firstAttempt = plan.attempts[0]!;
    const childThreadId = this.childThreadId(parentThreadId, runId, 0);

    let resolveSettled!: () => void;
    const settledPromise = new Promise<void>((resolve) => {
      resolveSettled = resolve;
    });
    const record: RunRecord = {
      runId,
      createdAt: Date.now(),
      parentThreadId,
      childThreadId,
      label: firstAttempt.label,
      background: plan.background,
      plan,
      attemptIndex: 0,
      attemptSettled: false,
      attemptResults: [],
      status: "running",
      output: "",
      cursorOutput: "",
      outputSegments: [],
      stepCount: 0,
      handle: undefined,
      oneShot: undefined,
      pendingRequestIds: new Set<string>(),
      forwardedRuntimeItems: new ForwardedRuntimeItemTracker(),
      cancelRequested: false,
      turnStarted: false,
      turnDispatched: false,
      error: undefined,
      settled: false,
      settledPromise,
      resolveSettled,
    };
    this.runs.set(runId, record);

    // Emit the synthetic parent tile so the delegated-agent renderer picks it up.
    const startPayload: ToolCallPayload = {
      name: firstAttempt.label,
      status: "running",
      isCrossagent: true,
      crossagentStatus: "running",
    };
    this.deps.host.appendRuntimeEvent(parentThreadId, {
      type: "item.started",
      threadId: parentThreadId,
      itemId: syntheticItemId(runId),
      itemType: "tool_call",
      payload: startPayload,
    });

    void this.runAttempt(record, 0);

    return { runId };
  }

  /** Block until the run settles or the timeout elapses. */
  async waitFor(
    runId: string,
    timeoutMs: number,
    parentThreadId?: string,
    options?: SubagentWaitOptions,
  ): Promise<SubagentWaitResult> {
    const record = this.ownedRun(runId, parentThreadId);
    if (!record) {
      return { status: "failed", output: `Unknown run_id: ${runId}` };
    }
    if (record.status !== "running") {
      return this.waitResult(record, options);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      record.settledPromise,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, Math.max(0, timeoutMs));
      }),
    ]);
    if (timer) clearTimeout(timer);
    return this.waitResult(record, options);
  }

  /** Wait for several already-running children concurrently under one deadline. */
  async waitForMany(
    runIds: readonly string[],
    timeoutMs: number,
    parentThreadId?: string,
    options?: SubagentWaitOptions | ((runId: string) => SubagentWaitOptions),
  ): Promise<Array<{ run_id: string } & SubagentWaitResult>> {
    return await Promise.all(
      runIds.map(async (runId) => ({
        run_id: runId,
        ...(await this.waitFor(
          runId,
          timeoutMs,
          parentThreadId,
          typeof options === "function" ? options(runId) : options,
        )),
      })),
    );
  }

  getStatus(
    runId: string,
    parentThreadId?: string,
    options?: SubagentWaitOptions,
  ): SubagentWaitResult {
    const record = this.ownedRun(runId, parentThreadId);
    if (!record) return { status: "failed", output: `Unknown run_id: ${runId}` };
    return this.waitResult(record, options);
  }

  listRuns(parentThreadId: string): SubagentRunSummary[] {
    const out: SubagentRunSummary[] = [];
    for (const record of this.runs.values()) {
      if (record.parentThreadId !== parentThreadId) continue;
      out.push({
        run_id: record.runId,
        name: record.label,
        status: record.status,
        background: record.background,
        attempt: record.attemptIndex + 1,
        attempt_count: record.plan.attempts.length,
      });
    }
    return out;
  }

  /** Interrupt + dispose a single run. */
  async cancel(runId: string, parentThreadId?: string): Promise<void> {
    const record = this.ownedRun(runId, parentThreadId);
    if (!record) return;
    record.cancelRequested = true;
    this.settle(record, "cancelled", undefined, { teardown: false });
    await this.attemptRunner.teardown(record);
  }

  /**
   * Route a resolution for a forwarded child request back to its handle.
   * `namespacedRequestId` is the `${runId}::${requestId}` id the parent stream
   * carried. Returns `false` when it isn't a subagent request (no delimiter, or
   * an unknown run) so the caller can fall through to the normal session path;
   * `true` once the owning run is found (best-effort resolve on its handle).
   */
  resolveChildServerRequest(requestId: ThreadServerRequestId, response: unknown): boolean {
    const parsed = parseNamespacedRequestId(requestId);
    if (!parsed) return false;
    const record = this.runs.get(parsed.runId);
    if (!record) return false;
    record.pendingRequestIds.delete(parsed.requestId);
    if (record.handle?.resolveServerRequest) {
      void record.handle.resolveServerRequest(parsed.requestId, response).catch(() => {});
    }
    return true;
  }

  /**
   * Cancel every live child of a parent and evict all of its run records.
   * Called on parent thread interrupt and close.
   */
  cancelAllForThread(parentThreadId: string): void {
    for (const record of [...this.runs.values()]) {
      if (record.parentThreadId !== parentThreadId) continue;
      record.cancelRequested = true;
      this.settle(record, "cancelled");
      this.runs.delete(record.runId);
    }
  }

  /** Cancel turn-scoped runs while leaving explicitly detached background work alive. */
  cancelForegroundForThread(parentThreadId: string): void {
    for (const record of this.runs.values()) {
      if (
        record.parentThreadId !== parentThreadId ||
        record.background ||
        record.status !== "running"
      ) {
        continue;
      }
      record.cancelRequested = true;
      this.settle(record, "cancelled");
    }
  }

  private ownedRun(runId: string, parentThreadId?: string): RunRecord | undefined {
    const record = this.runs.get(runId);
    return record && (!parentThreadId || record.parentThreadId === parentThreadId)
      ? record
      : undefined;
  }

  /**
   * Build a caller-facing wait/status result. The caller owns the incremental
   * cursor, so retrying the same read is idempotent. `fullOutput` bypasses both
   * the cursor and the clip for the rare case the complete transcript is
   * genuinely needed.
   */
  private waitResult(record: RunRecord, options?: SubagentWaitOptions): SubagentWaitResult {
    const fullOutput = options?.fullOutput === true;
    const incremental = !fullOutput && options?.afterOutputChars !== undefined;
    const source =
      incremental || (fullOutput && options?.currentAttemptOnly !== true)
        ? record.cursorOutput
        : record.output;
    const total = record.cursorOutput.length;
    const offset = incremental ? Math.min(Math.max(0, options.afterOutputChars!), total) : 0;
    const delta = source.slice(offset);
    const tailCap =
      record.status === "running" ? MAX_RUNNING_OUTPUT_TAIL_CHARS : MAX_SETTLED_OUTPUT_TAIL_CHARS;
    const output = fullOutput ? delta : clipOutputTail(delta, tailCap);
    const isCompleteTranscript = fullOutput || (offset === 0 && delta.length <= tailCap);
    return {
      status: record.status,
      output,
      ...(incremental || !isCompleteTranscript ? { total_output_chars: total } : {}),
      ...(record.error ? { error: record.error } : {}),
      ...(record.plan.attempts.length > 1
        ? {
            attempts: record.attemptResults.map((attempt) => ({
              ...attempt,
              output: fullOutput
                ? attempt.output
                : clipOutputTail(attempt.output, MAX_ATTEMPT_OUTPUT_TAIL_CHARS),
            })),
          }
        : {}),
    };
  }

  private requireParent(parentThreadId: string): {
    projectLocation: ProjectLocation;
    config: ThreadConfig;
  } {
    const parent = this.deps.host.getParentContext(parentThreadId);
    if (!parent) throw new SubagentSpawnError("Parent thread is no longer active");
    return parent;
  }

  private activeCountForParent(parentThreadId: string): number {
    let count = 0;
    for (const record of this.runs.values()) {
      if (record.parentThreadId === parentThreadId && record.status === "running") count += 1;
    }
    return count;
  }

  private childThreadId(parentThreadId: string, runId: string, attemptIndex: number): string {
    return `${parentThreadId}::sub::${runId}::attempt::${attemptIndex + 1}`;
  }

  private runAttempt(record: RunRecord, attemptIndex: number): void {
    if (record.cancelRequested || record.settled) return;
    const attempt = record.plan.attempts[attemptIndex];
    if (!attempt) {
      this.settle(record, "failed", "No subagent attempt is available");
      return;
    }

    record.attemptIndex = attemptIndex;
    record.attemptSettled = false;
    record.childThreadId = this.childThreadId(record.parentThreadId, record.runId, attemptIndex);
    record.label = attempt.label;
    record.output = "";
    record.outputSegments = [];
    record.error = undefined;
    record.turnStarted = false;
    record.turnDispatched = false;
    record.handle = undefined;
    record.oneShot = undefined;

    if (attemptIndex > 0) {
      this.deps.host.appendRuntimeEvent(record.parentThreadId, {
        type: "item.updated",
        threadId: record.parentThreadId,
        itemId: syntheticItemId(record.runId),
        payload: {
          name: attempt.label,
          status: "running",
          isCrossagent: true,
          progress: { stepCount: record.stepCount },
        },
      });
    }

    this.attemptRunner.run(record, attemptIndex, attempt, {
      isActive: () => this.isCurrentAttempt(record, attemptIndex),
      onRuntimeEvent: (event) => this.onChildEvent(record, attemptIndex, event),
      onSettle: (status, errorMessage) =>
        this.finishAttempt(record, attemptIndex, status, errorMessage),
    });
  }

  /**
   * A Claude display hook delivers its rewrite as an authoritative
   * item.updated payload after the text already streamed into `output`.
   * Replace that item's span so waitResult/settle report the final text (or
   * drop suppressed text) instead of the superseded stream.
   */
  private applyAuthoritativeOutput(
    record: RunRecord,
    event: Extract<RuntimeEvent, { type: "item.updated" }>,
  ): void {
    const authoritative = authoritativeAssistantText(event.payload);
    if (authoritative === null) return;
    const segment = record.outputSegments.find((s) => s.itemId === event.itemId);
    if (segment) segment.override = authoritative;
    else record.outputSegments.push({ itemId: event.itemId, text: "", override: authoritative });
    record.output = record.outputSegments.map((s) => s.override ?? s.text).join("");
  }

  /**
   * Consume a child event: accumulate assistant output, drive lifecycle from
   * turn completion, and forward item-level + server-request events onto the
   * parent stream. Server requests are re-tagged (threadId → parent, requestId
   * namespaced under the run) so a child asking for permission/user input
   * surfaces in the parent's request panel and its resolution routes back via
   * {@link resolveChildServerRequest}. Turn/session/context events are NOT
   * forwarded — they belong to the child's own lifecycle and would corrupt the
   * parent thread's turn state if replayed under the parent threadId.
   */
  private onChildEvent(record: RunRecord, attemptIndex: number, event: RuntimeEvent): void {
    if (record.settled || record.attemptSettled || record.attemptIndex !== attemptIndex) {
      return;
    }
    switch (event.type) {
      case "content.delta":
        if (event.stream === "assistant_text") {
          record.output += event.delta;
          record.cursorOutput += event.delta;
          const segment = record.outputSegments.find((s) => s.itemId === event.itemId);
          if (segment) segment.text += event.delta;
          else record.outputSegments.push({ itemId: event.itemId, text: event.delta });
        }
        this.deps.host.appendRuntimeEvent(
          record.parentThreadId,
          this.retag(record, attemptIndex, event),
        );
        return;
      case "item.started":
        if (!event.parentItemId) {
          record.stepCount += 1;
          this.deps.host.appendRuntimeEvent(record.parentThreadId, {
            type: "item.updated",
            threadId: record.parentThreadId,
            itemId: syntheticItemId(record.runId),
            payload: { progress: { stepCount: record.stepCount } },
          });
        }
        {
          const forwarded = this.retag(record, attemptIndex, event) as Extract<
            RuntimeEvent,
            { type: "item.started" }
          >;
          record.forwardedRuntimeItems.start(forwarded);
          this.deps.host.appendRuntimeEvent(record.parentThreadId, forwarded);
        }
        return;
      case "item.updated": {
        this.applyAuthoritativeOutput(record, event);
        const forwarded = this.retag(record, attemptIndex, event) as Extract<
          RuntimeEvent,
          { type: "item.updated" }
        >;
        record.forwardedRuntimeItems.update(forwarded);
        this.deps.host.appendRuntimeEvent(record.parentThreadId, forwarded);
        return;
      }
      case "item.completed": {
        const forwarded = this.retag(record, attemptIndex, event) as Extract<
          RuntimeEvent,
          { type: "item.completed" }
        >;
        record.forwardedRuntimeItems.complete(forwarded.itemId);
        this.deps.host.appendRuntimeEvent(record.parentThreadId, forwarded);
        return;
      }
      case "request.opened":
        record.pendingRequestIds.add(event.requestId);
        this.deps.host.appendRuntimeEvent(
          record.parentThreadId,
          this.retag(record, attemptIndex, event),
        );
        return;
      case "request.resolved":
        record.pendingRequestIds.delete(event.requestId);
        this.deps.host.appendRuntimeEvent(
          record.parentThreadId,
          this.retag(record, attemptIndex, event),
        );
        return;
      case "turn.completed":
        this.finishAttempt(
          record,
          attemptIndex,
          event.state === "completed" ? "completed" : "failed",
          event.state === "completed" ? undefined : `Subagent turn ${event.state}`,
        );
        return;
      default:
        return;
    }
  }

  /**
   * Re-tag a child event so it merges into the parent stream: point threadId at
   * the parent, prefix every child itemId, nest top-level child items under the
   * synthetic tile (deeper items keep their prefixed parent), and namespace
   * server-request ids under the run so resolutions route back to the child.
   */
  private retag(record: RunRecord, attemptIndex: number, event: RuntimeEvent): RuntimeEvent {
    const prefix = childItemPrefix(record.runId, attemptIndex);
    if (event.type === "request.opened" || event.type === "request.resolved") {
      return {
        ...event,
        threadId: record.parentThreadId,
        requestId: namespacedRequestId(record.runId, event.requestId),
      };
    }
    if (event.type === "item.started") {
      return {
        ...event,
        threadId: record.parentThreadId,
        itemId: prefix + event.itemId,
        parentItemId: event.parentItemId
          ? prefix + event.parentItemId
          : syntheticItemId(record.runId),
      };
    }
    if (
      event.type === "item.updated" ||
      event.type === "item.completed" ||
      event.type === "content.delta"
    ) {
      return { ...event, threadId: record.parentThreadId, itemId: prefix + event.itemId };
    }
    return { ...event, threadId: record.parentThreadId };
  }

  private isCurrentAttempt(record: RunRecord, attemptIndex: number): boolean {
    return !record.settled && !record.attemptSettled && record.attemptIndex === attemptIndex;
  }

  private finishAttempt(
    record: RunRecord,
    attemptIndex: number,
    status: Exclude<SubagentRunStatus, "running">,
    errorMessage?: string,
  ): void {
    if (!this.isCurrentAttempt(record, attemptIndex)) return;
    record.attemptSettled = true;
    this.drainPendingRequests(record);
    this.completeOpenForwardedItems(record);

    const attempt = record.plan.attempts[attemptIndex]!;
    record.attemptResults.push({
      attempt: attemptIndex + 1,
      provider: attempt.provider,
      model: attempt.model,
      status,
      output: record.output,
      ...(errorMessage ? { error: errorMessage } : {}),
      ...(record.turnDispatched ? { may_have_side_effects: true } : {}),
    });

    const nextAttemptIndex = attemptIndex + 1;
    const mayRetry =
      status === "failed" &&
      !record.cancelRequested &&
      nextAttemptIndex < record.plan.attempts.length &&
      (record.plan.retryMode === "any-failure" || !record.turnDispatched);
    if (mayRetry) {
      void this.attemptRunner.teardown(record).then(() => {
        if (record.cancelRequested || record.settled) {
          this.settle(record, "cancelled");
          return;
        }
        this.runAttempt(record, nextAttemptIndex);
      });
      return;
    }

    this.settle(record, status, errorMessage);
  }

  private drainPendingRequests(record: RunRecord): void {
    for (const requestId of record.pendingRequestIds) {
      this.deps.host.appendRuntimeEvent(record.parentThreadId, {
        type: "request.resolved",
        threadId: record.parentThreadId,
        requestId: namespacedRequestId(record.runId, requestId),
        outcome: "cancelled",
      });
    }
    record.pendingRequestIds.clear();
  }

  /**
   * Terminal transition (idempotent): mark settled, tear the child down, emit
   * the synthetic tile completion (which drains buffered child events in the
   * router), and release waiters.
   */
  private settle(
    record: RunRecord,
    status: SubagentRunStatus,
    errorMessage?: string,
    options?: { teardown?: boolean },
  ): void {
    if (record.settled) return;
    record.settled = true;
    if (record.status === "running") record.status = status;

    this.drainPendingRequests(record);
    this.completeOpenForwardedItems(record);
    if (
      status !== "running" &&
      !record.attemptResults.some((attempt) => attempt.attempt === record.attemptIndex + 1)
    ) {
      const attempt = record.plan.attempts[record.attemptIndex];
      if (attempt) {
        record.attemptResults.push({
          attempt: record.attemptIndex + 1,
          provider: attempt.provider,
          model: attempt.model,
          status,
          output: record.output,
          ...(errorMessage ? { error: errorMessage } : {}),
          ...(record.turnDispatched ? { may_have_side_effects: true } : {}),
        });
      }
    }

    if (options?.teardown !== false) void this.attemptRunner.teardown(record);

    const text = errorMessage ? `${record.output}\n${errorMessage}`.trim() : record.output;
    if (errorMessage) {
      // Preserve the legacy failed-run output shape while also exposing the
      // structured error metadata added for retry safety.
      record.output = text;
      record.error = {
        message: errorMessage,
        may_have_side_effects: record.turnDispatched,
      };
    }
    const payload: ToolCallPayload = {
      name: record.label,
      status: record.status === "completed" ? "success" : "error",
      isCrossagent: true,
      crossagentStatus: record.status,
      ...(record.stepCount > 0 ? { progress: { stepCount: record.stepCount } } : {}),
      ...(text ? { result: text } : {}),
    };
    this.deps.host.appendRuntimeEvent(record.parentThreadId, {
      type: "item.completed",
      threadId: record.parentThreadId,
      itemId: syntheticItemId(record.runId),
      payload,
    });

    record.resolveSettled();
    this.pruneSettledRuns(record.parentThreadId);
  }

  /**
   * Complete every child item whose provider never emitted a terminal event.
   * Descendants are closed before ancestors, matching normal nested-tool
   * teardown and preventing an open child from being stranded under a closed
   * provider-native Agent row.
   */
  private completeOpenForwardedItems(record: RunRecord): void {
    for (const event of record.forwardedRuntimeItems.drainTerminalEvents(record.parentThreadId)) {
      this.deps.host.appendRuntimeEvent(record.parentThreadId, event);
    }
  }

  private pruneSettledRuns(parentThreadId: string): void {
    const settled = [...this.runs.values()]
      .filter((record) => record.parentThreadId === parentThreadId && record.status !== "running")
      .sort((a, b) => a.createdAt - b.createdAt);
    for (const record of settled.slice(0, -MAX_RETAINED_RUNS_PER_PARENT)) {
      this.runs.delete(record.runId);
    }
  }
}
