import { randomBytes } from "node:crypto";
import type {
  AgentKind,
  ProjectLocation,
  RuntimeEvent,
  ThreadConfig,
  ThreadServerRequestId,
  ToolCallPayload,
} from "@/shared/contracts";
import { capabilitiesForPresentation, validateAgentModelSelection } from "@/shared/agentSelection";
import { formatReasoningLabel } from "@/shared/modelLabels";
import type { AgentAdapter, StructuredSessionHandle } from "@/supervisor/agents/base";
import { runOneShotChild, type OneShotChildHandle } from "./oneShotChild";
import { buildUnrestrictedChildConfig, resolveSubagentExecution } from "./types";
import type {
  SpawnAgentRequest,
  SubagentRunHost,
  SubagentRunStatus,
  SubagentWaitResult,
} from "./types";

/**
 * Default `wait_for_agent` / `run_agent` blocking timeout. Blocking waits must
 * finish under every MCP client's own tool-call kill timer, or the client
 * aborts the HTTP call and the caller sees an opaque transport error instead
 * of the graceful `status: "running"` re-poll result. Known ceilings: Codex
 * `tool_timeout_sec` and Gemini's per-server `timeout` (both set to 300s in
 * their `mcpSubagent.ts` builders — keep in sync), and undici's 300s
 * default headers timeout for fetch-based clients (Claude SDK).
 */
export const DEFAULT_WAIT_TIMEOUT_MS = 120_000;
/** Hard cap on caller-supplied `timeout_s` — see {@link DEFAULT_WAIT_TIMEOUT_MS}. */
export const MAX_WAIT_TIMEOUT_MS = 240_000;
/** Max concurrent live children per parent thread. */
export const MAX_CONCURRENT_CHILDREN_PER_PARENT = 4;

export interface SubagentRunManagerDeps {
  adapters: Map<AgentKind, AgentAdapter>;
  host: SubagentRunHost;
}

interface RunRecord {
  runId: string;
  parentThreadId: string;
  childThreadId: string;
  label: string;
  status: SubagentRunStatus;
  /** Accumulated assistant text from `content.delta` events. */
  output: string;
  /** Direct child items started under the synthetic Agent row. */
  stepCount: number;
  handle: StructuredSessionHandle | undefined;
  /** One-shot child driver handle (set instead of `handle` for CLI-only agents). */
  oneShot: OneShotChildHandle | undefined;
  /**
   * Child-side ids of forwarded `request.opened` events still awaiting a
   * resolution. Drained on settle/cancel via synthetic `request.resolved`
   * events so the parent's request panel doesn't show a stale prompt.
   */
  pendingRequestIds: Set<string>;
  cancelRequested: boolean;
  settled: boolean;
  settledPromise: Promise<void>;
  resolveSettled: () => void;
}

/** A synchronous spawn-time failure surfaced to the caller as an MCP error. */
export class SubagentSpawnError extends Error {}

/** Prefix used for a child's re-tagged item ids inside the parent stream. */
function childItemPrefix(runId: string): string {
  return `${runId}:`;
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

  constructor(private readonly deps: SubagentRunManagerDeps) {}

  /**
   * Kick off a child run. Validates synchronously (adapter, parent, capacity)
   * — throwing {@link SubagentSpawnError} on failure — then creates the child
   * session and starts its turn asynchronously. Returns immediately with the
   * run id.
   */
  spawn(parentThreadId: string, request: SpawnAgentRequest): { runId: string } {
    const prompt = request.prompt?.trim();
    if (!prompt) {
      throw new SubagentSpawnError("prompt is required");
    }
    const adapter = this.deps.adapters.get(request.agent as AgentKind);
    if (!adapter) {
      throw new SubagentSpawnError(`Unknown provider: ${request.agent}`);
    }
    const execution = resolveSubagentExecution(adapter);
    if (!execution) {
      throw new SubagentSpawnError(`Provider ${request.agent} cannot be spawned as a subagent`);
    }
    const parent = this.deps.host.getParentContext(parentThreadId);
    if (!parent) {
      throw new SubagentSpawnError("Parent thread is no longer active");
    }
    if (this.activeCountForParent(parentThreadId) >= MAX_CONCURRENT_CHILDREN_PER_PARENT) {
      throw new SubagentSpawnError(
        `Too many concurrent subagents (max ${MAX_CONCURRENT_CHILDREN_PER_PARENT}). Wait for one to finish or cancel it.`,
      );
    }

    const capabilities =
      execution === "structured"
        ? capabilitiesForPresentation(adapter.capabilities, "gui")
        : adapter.capabilities;
    const model = request.model ?? capabilities.models[0]?.id;
    if (!model) {
      throw new SubagentSpawnError(`Provider ${request.agent} has no available models`);
    }
    const selectionError = validateAgentModelSelection(capabilities, {
      model,
      ...(request.effort ? { reasoning: request.effort } : {}),
      ...(request.fast === true ? { fast: true } : {}),
    });
    if (selectionError) throw new SubagentSpawnError(selectionError);
    const modelLabel = capabilities.models.find((m) => m.id === model)?.label ?? model;
    const runName = request.name?.trim();
    const selectionLabel = [
      adapter.label,
      modelLabel,
      ...(request.effort ? [formatReasoningLabel(request.effort)] : []),
      ...(request.fast === true ? ["Fast"] : []),
    ].join(" · ");
    const label = runName ? `${runName} — ${selectionLabel}` : selectionLabel;

    const runId = randomBytes(6).toString("hex");
    const childThreadId = `${parentThreadId}::sub::${runId}`;

    const childConfig = buildUnrestrictedChildConfig(
      {
        model,
        ...(request.effort ? { effort: request.effort } : {}),
        ...(request.fast === true ? { fast: true } : {}),
      },
      capabilities,
      parent.config,
    );

    let resolveSettled!: () => void;
    const settledPromise = new Promise<void>((resolve) => {
      resolveSettled = resolve;
    });
    const record: RunRecord = {
      runId,
      parentThreadId,
      childThreadId,
      label,
      status: "running",
      output: "",
      stepCount: 0,
      handle: undefined,
      oneShot: undefined,
      pendingRequestIds: new Set<string>(),
      cancelRequested: false,
      settled: false,
      settledPromise,
      resolveSettled,
    };
    this.runs.set(runId, record);

    // Emit the synthetic parent tile so the existing subagent renderer picks it
    // up (renderer keys on payload.isSubAgent === true).
    const startPayload: ToolCallPayload = { name: label, status: "running", isSubAgent: true };
    this.deps.host.appendRuntimeEvent(parentThreadId, {
      type: "item.started",
      threadId: parentThreadId,
      itemId: syntheticItemId(runId),
      itemType: "tool_call",
      payload: startPayload,
    });

    void this.runChild(record, adapter, parent.projectLocation, childConfig, prompt);

    return { runId };
  }

  /** Block until the run settles or the timeout elapses. */
  async waitFor(runId: string, timeoutMs: number): Promise<SubagentWaitResult> {
    const record = this.runs.get(runId);
    if (!record) {
      return { status: "failed", output: `Unknown run_id: ${runId}` };
    }
    if (record.status !== "running") {
      return { status: record.status, output: record.output };
    }
    const timedOut = Symbol("timeout");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race([
      record.settledPromise.then(() => "settled" as const),
      new Promise<typeof timedOut>((resolve) => {
        timer = setTimeout(() => resolve(timedOut), Math.max(0, timeoutMs));
      }),
    ]);
    if (timer) clearTimeout(timer);
    if (result === timedOut) {
      return { status: "running", output: record.output };
    }
    return { status: record.status, output: record.output };
  }

  getStatus(runId: string): SubagentWaitResult {
    const record = this.runs.get(runId);
    if (!record) return { status: "failed", output: `Unknown run_id: ${runId}` };
    return { status: record.status, output: record.output };
  }

  /** Interrupt + dispose a single run. */
  async cancel(runId: string): Promise<void> {
    const record = this.runs.get(runId);
    if (!record) return;
    record.cancelRequested = true;
    await this.teardown(record);
    this.settle(record, "cancelled");
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

  private activeCountForParent(parentThreadId: string): number {
    let count = 0;
    for (const record of this.runs.values()) {
      if (record.parentThreadId === parentThreadId && record.status === "running") count += 1;
    }
    return count;
  }

  private async runChild(
    record: RunRecord,
    adapter: AgentAdapter,
    projectLocation: ProjectLocation,
    childConfig: ThreadConfig,
    prompt: string,
  ): Promise<void> {
    // CLI-only agents (no structured runtime) run through the one-shot child
    // driver: a single bypass-permissions CLI invocation whose stdout is
    // streamed into the parent tile as a growing text item.
    if (resolveSubagentExecution(adapter) === "one-shot") {
      this.runOneShotChild(record, adapter, projectLocation, childConfig, prompt);
      return;
    }
    try {
      const mcpAccess = await this.deps.host.resolveParentMcpAccess?.(record.parentThreadId, {
        threadId: record.childThreadId,
        title: record.label,
      });
      const handle = await adapter.createStructuredSession?.({
        threadId: record.childThreadId,
        projectLocation,
        config: childConfig,
        presentationMode: "gui",
        ...(mcpAccess ?? {}),
      });
      if (!handle) {
        this.settle(record, "failed", "Failed to create subagent session");
        return;
      }
      record.handle = handle;
      if (record.cancelRequested) {
        this.settle(record, "cancelled");
        return;
      }
      handle.setListener({
        onClose: () => this.settle(record, "completed"),
        onError: (message) => this.settle(record, "failed", message),
        onUpdate: () => {},
        onRuntimeEvent: (event) => this.onChildEvent(record, event),
      });

      if (handle.activate) await handle.activate();
      if (record.cancelRequested) return void this.settle(record, "cancelled");
      if (handle.openThread) await handle.openThread(childConfig);
      if (record.cancelRequested) return void this.settle(record, "cancelled");
      if (handle.startTurn) await handle.startTurn(prompt, childConfig);
    } catch (error) {
      this.settle(
        record,
        record.cancelRequested ? "cancelled" : "failed",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Drive a CLI-only agent as a one-shot child. Streams stdout into the parent
   * stream as a single growing `assistant_message` item (opened lazily on the
   * first chunk, mirroring the structured mapper's assistant-text streaming) and
   * settles from the process exit code. The synthetic tile + re-tag / output
   * accumulation are reused via {@link onChildEvent}.
   */
  private runOneShotChild(
    record: RunRecord,
    adapter: AgentAdapter,
    projectLocation: ProjectLocation,
    childConfig: ThreadConfig,
    prompt: string,
  ): void {
    const itemId = `${record.runId}-oneshot-out`;
    let opened = false;
    const ensureOpen = () => {
      if (opened) return;
      opened = true;
      this.onChildEvent(record, {
        type: "item.started",
        threadId: record.childThreadId,
        itemId,
        itemType: "assistant_message",
      });
    };

    const handle = runOneShotChild({
      adapter,
      projectLocation,
      model: childConfig.model,
      effort: childConfig.effort,
      prompt,
      onTextDelta: (delta) => {
        ensureOpen();
        this.onChildEvent(record, {
          type: "content.delta",
          threadId: record.childThreadId,
          itemId,
          stream: "assistant_text",
          delta,
        });
      },
      onSettle: ({ status, errorMessage }) => {
        if (opened) {
          this.onChildEvent(record, {
            type: "item.completed",
            threadId: record.childThreadId,
            itemId,
          });
        }
        // On cancel, `cancel()`/`cancelAllForThread()` set `cancelRequested` and
        // synchronously called `settle("cancelled")` in the same tick, so by the
        // time this exit-driven callback fires the record is already settled and
        // this call is an idempotent no-op — the process exit status never
        // overrides the recorded `cancelled`.
        this.settle(record, status, errorMessage);
      },
    });

    record.oneShot = handle;
    // A cancel that landed between spawn() and here: tear the fresh process down.
    if (record.cancelRequested) handle.cancel();
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
  private onChildEvent(record: RunRecord, event: RuntimeEvent): void {
    switch (event.type) {
      case "content.delta":
        if (event.stream === "assistant_text") record.output += event.delta;
        this.deps.host.appendRuntimeEvent(record.parentThreadId, this.retag(record, event));
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
        this.deps.host.appendRuntimeEvent(record.parentThreadId, this.retag(record, event));
        return;
      case "item.updated":
      case "item.completed":
        this.deps.host.appendRuntimeEvent(record.parentThreadId, this.retag(record, event));
        return;
      case "request.opened":
        record.pendingRequestIds.add(event.requestId);
        this.deps.host.appendRuntimeEvent(record.parentThreadId, this.retag(record, event));
        return;
      case "request.resolved":
        record.pendingRequestIds.delete(event.requestId);
        this.deps.host.appendRuntimeEvent(record.parentThreadId, this.retag(record, event));
        return;
      case "turn.completed":
        this.settle(record, event.state === "completed" ? "completed" : "failed");
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
  private retag(record: RunRecord, event: RuntimeEvent): RuntimeEvent {
    const prefix = childItemPrefix(record.runId);
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

  /**
   * Terminal transition (idempotent): mark settled, tear the child down, emit
   * the synthetic tile completion (which drains buffered child events in the
   * router), and release waiters.
   */
  private settle(record: RunRecord, status: SubagentRunStatus, errorMessage?: string): void {
    if (record.settled) return;
    record.settled = true;
    if (record.status === "running") record.status = status;

    // Clear any still-open forwarded requests so the parent's request panel
    // doesn't strand a stale prompt for a child that's gone.
    for (const requestId of record.pendingRequestIds) {
      this.deps.host.appendRuntimeEvent(record.parentThreadId, {
        type: "request.resolved",
        threadId: record.parentThreadId,
        requestId: namespacedRequestId(record.runId, requestId),
        outcome: "cancelled",
      });
    }
    record.pendingRequestIds.clear();

    void this.teardown(record);

    const text = errorMessage ? `${record.output}\n${errorMessage}`.trim() : record.output;
    if (errorMessage) record.output = text;
    const payload: ToolCallPayload = {
      name: record.label,
      status: record.status === "completed" ? "success" : "error",
      isSubAgent: true,
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
  }

  private async teardown(record: RunRecord): Promise<void> {
    if (record.oneShot) {
      record.oneShot.cancel();
      record.oneShot = undefined;
    }
    const handle = record.handle;
    if (!handle) return;
    record.handle = undefined;
    try {
      if (handle.interruptTurn) await handle.interruptTurn();
    } catch {}
    try {
      await handle.dispose();
    } catch {}
  }
}
