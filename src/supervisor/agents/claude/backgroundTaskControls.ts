import { randomUUID } from "node:crypto";
import type { Query, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  BACKGROUND_TASK_OUTPUT_MAX_UTF16_LENGTH,
  backgroundTaskOutputSchema,
  type BackgroundTask,
  type BackgroundTaskOutput,
} from "@/shared/contracts";
import { BACKGROUND_TASK_OUTPUT_ACTION_ID } from "@/shared/remote/contract/backgroundTaskReduceSpec";
import { msg } from "@/shared/messages";
import type { ClaudeMapperState } from "./sdkCanonicalMappingState";

const STOP_ACTION_ID = "background-task.stop.v1";
const OUTPUT_ACTION_ID = BACKGROUND_TASK_OUTPUT_ACTION_ID;
const STOP_CONFIRMATION_MS = 10_000;
// A read is a local control round-trip; bound it so a session reset cannot
// leave the renderer awaiting a promise forever.
const OUTPUT_READ_TIMEOUT_MS = 10_000;
// Foreground runs may never get a terminal notification; keep a bounded tail of them.
const MAX_TRACKED_TASKS = 64;
const MAX_OUTPUT_CHARS = BACKGROUND_TASK_OUTPUT_MAX_UTF16_LENGTH;

/**
 * SDK 0.3 implements `getTaskOutput(taskId)` at runtime (a read-only
 * `get_task_output` control request, no model turn), but the pinned public
 * `Query` type omits it. Feature-check the actual method on the query instance
 * before advertising the output capability; hosts with an older method simply
 * never list `background-task.output.v1`.
 */
type NativeGetTaskOutput = (taskId: string) => Promise<unknown>;
type BackgroundTaskRuntime = Pick<Query, "stopTask"> & {
  /** Present on SDK builds that implement the read RPC; untyped in public Query. */
  getTaskOutput?: unknown;
};

type TaskInfo = {
  token: string;
  startedAt: number;
  runId?: string;
  lastProgressAt?: number;
  progress?: string;
  progressKey?: string;
};
type PendingStop = { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void };

/** Owns task timing and native Stop/output capabilities for one live CLI process. */
export class ClaudeBackgroundTaskControls {
  private readonly tasks = new Map<string, TaskInfo>();
  private readonly stops = new Map<string, PendingStop>();
  private readonly outputReads = new Map<
    string,
    {
      promise: Promise<Record<string, unknown>>;
      cancel: (error: Error) => void;
    }
  >();
  private readonly reported = new Set<string>();

  constructor(
    private readonly state: ClaudeMapperState,
    private readonly runtime: () => BackgroundTaskRuntime | undefined,
  ) {}

  reset(): void {
    for (const stop of this.stops.values())
      stop.reject(new Error(msg("thread.sessionActionUnavailable")));
    this.stops.clear();
    for (const read of this.outputReads.values())
      read.cancel(new Error(msg("thread.sessionActionUnavailable")));
    this.outputReads.clear();
    this.tasks.clear();
    this.reported.clear();
  }

  listActions(): readonly { id: string }[] {
    const runtime = this.runtime();
    if (!runtime) return [];
    return [{ id: STOP_ACTION_ID }, ...(readTaskOutput(runtime) ? [{ id: OUTPUT_ACTION_ID }] : [])];
  }

  /** Only valid lifecycle signals for the current run can drain live work. */
  shouldIgnore(message: SDKMessage): boolean {
    if (message.type !== "system") return false;
    if (message.subtype === "background_tasks_changed") return !Array.isArray(message.tasks);
    if (
      message.subtype === "task_notification" &&
      message.status !== "completed" &&
      message.status !== "failed" &&
      message.status !== "stopped"
    )
      return true;
    if (!("task_id" in message) || !("run_id" in message)) return false;
    return this.isStaleRun(message.task_id, message.run_id);
  }

  observe(message: SDKMessage): boolean {
    if (message.type !== "system") return false;
    if (message.subtype === "background_tasks_changed") {
      if (!Array.isArray(message.tasks)) return false;
      // Mapping installs this level after observation; protect the whole incoming
      // roster while its entries acquire metadata, rather than only the latest id.
      const rosterIds = new Set(
        message.tasks.flatMap((entry) =>
          entry && typeof entry.task_id === "string" && entry.ambient !== true
            ? [entry.task_id]
            : [],
        ),
      );
      let changed = false;
      for (const entry of message.tasks) {
        if (!entry || typeof entry.task_id !== "string" || !entry.task_id || entry.ambient === true)
          continue;
        const previous = this.tasks.get(entry.task_id);
        const info = this.taskInfo(entry.task_id, entry.run_id, rosterIds);
        // A new run of a listed task replaces its Stop token; new members publish via the roster.
        changed ||= previous !== info && this.isListed(entry.task_id);
      }
      return changed;
    }
    if (
      message.subtype !== "task_started" &&
      message.subtype !== "task_progress" &&
      message.subtype !== "task_notification"
    )
      return false;
    if (typeof message.task_id !== "string" || !message.task_id) return false;
    if ("ambient" in message && message.ambient === true) return false;
    // Callers normally drop stale frames via shouldIgnore; observing one anyway must
    // not let an old run's notification confirm the newer run's Stop.
    if (this.isStaleRun(message.task_id, message.run_id)) return false;
    const previous = this.tasks.get(message.task_id);
    if (message.subtype === "task_notification") {
      if (previous) {
        this.stops.get(previous.token)?.resolve();
        this.cancelOutputRead(previous.token);
      }
      this.tasks.delete(message.task_id);
      return false;
    }
    const info = this.taskInfo(message.task_id, message.run_id);
    if (message.subtype === "task_started")
      return previous !== info && this.isListed(message.task_id);
    const progressKey = JSON.stringify([
      message.description,
      message.last_tool_name,
      message.summary,
      message.usage?.tool_uses,
      message.usage?.total_tokens,
    ]);
    if (info.progressKey === progressKey) return false;
    info.progressKey = progressKey;
    info.lastProgressAt = Date.now();
    const progress =
      (typeof message.summary === "string" ? message.summary.trim() : "") ||
      (typeof message.last_tool_name === "string" ? message.last_tool_name.trim() : "");
    if (progress) {
      const truncated = progress.slice(0, 4096);
      const lastUnit = truncated.charCodeAt(truncated.length - 1);
      // Never put an unpaired high surrogate on the native JSON wire.
      info.progress = lastUnit >= 0xd800 && lastUnit <= 0xdbff ? truncated.slice(0, -1) : truncated;
    }
    // Unlisted work keeps its metadata for a later roster entry but publishes nothing now.
    return this.isListed(message.task_id);
  }

  decorate(tasks: readonly BackgroundTask[]): BackgroundTask[] {
    const runtime = this.runtime();
    const canStop = runtime?.stopTask !== undefined;
    const canReadOutput = readTaskOutput(runtime) !== undefined;
    return tasks.map((task) => {
      const info = this.taskInfo(task.taskId);
      return {
        ...task,
        startedAt: info.startedAt,
        ...(info.lastProgressAt !== undefined ? { lastProgressAt: info.lastProgressAt } : {}),
        ...(info.progress ? { progress: info.progress } : {}),
        ...(canStop
          ? {
              stopAction: {
                id: STOP_ACTION_ID,
                payload: { taskId: task.taskId, token: info.token },
              },
            }
          : {}),
        // Output is a separate capability: only claim it when the running SDK
        // exposes it AND this task is a shell/Monitor lane whose output exists.
        ...(canReadOutput && isOutputEligible(task)
          ? {
              outputAction: {
                id: OUTPUT_ACTION_ID,
                payload: { taskId: task.taskId, token: info.token },
              },
            }
          : {}),
      };
    });
  }

  reconcile(tasks: readonly BackgroundTask[]): void {
    const next = new Set(tasks.map((task) => task.taskId));
    for (const id of this.reported) {
      if (next.has(id)) continue;
      const info = this.tasks.get(id);
      if (info) {
        this.stops.get(info.token)?.resolve();
        this.cancelOutputRead(info.token);
        this.tasks.delete(id);
      }
    }
    this.reported.clear();
    for (const id of next) {
      this.reported.add(id);
    }
  }

  async invoke(actionId: string, payload: unknown): Promise<Record<string, unknown>> {
    if (actionId === OUTPUT_ACTION_ID) return this.invokeOutput(payload);
    const input =
      payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    const taskId = typeof input.taskId === "string" ? input.taskId : "";
    const info = this.tasks.get(taskId);
    const runtime = this.runtime();
    if (
      actionId !== STOP_ACTION_ID ||
      !runtime?.stopTask ||
      !info ||
      input.token !== info.token ||
      !this.reported.has(taskId)
    ) {
      throw new Error(msg("thread.sessionActionUnavailable"));
    }
    const pending = this.stops.get(info.token);
    if (pending) {
      await pending.promise;
      return {};
    }
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const stop = { promise, resolve, reject };
    this.stops.set(info.token, stop);
    const timer = setTimeout(
      () => reject(new Error(msg("thread.backgroundTaskStopUnconfirmed"))),
      STOP_CONFIRMATION_MS,
    );
    try {
      // The SDK reply accepts Stop; only a terminal notification or roster removal confirms it.
      void runtime
        .stopTask(taskId)
        .catch((error: unknown) =>
          reject(error instanceof Error ? error : new Error(String(error))),
        );
      await promise;
      return {};
    } finally {
      clearTimeout(timer);
      if (this.stops.get(info.token) === stop) this.stops.delete(info.token);
    }
  }

  /**
   * Read the bounded output tail of one currently-listed shell/Monitor task.
   * The returned taskId/token are fenced to the live run before the native read
   * and rechecked after it resolves: a replaced run, a drained roster, a
   * stopped task, a reset session, or a different query instance refuses
   * instead of returning another run's text. The native call is read-only and
   * never opens a model turn or touches thread status.
   */
  private async invokeOutput(payload: unknown): Promise<Record<string, unknown>> {
    const input =
      payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    const taskId = typeof input.taskId === "string" ? input.taskId : "";
    const info = this.tasks.get(taskId);
    const runtime = this.runtime();
    const readOutput = readTaskOutput(runtime);
    if (
      !readOutput ||
      !runtime ||
      !info ||
      input.token !== info.token ||
      !this.isOutputTarget(taskId, info.token, runtime)
    ) {
      throw new Error(msg("thread.sessionActionUnavailable"));
    }
    const inflight = this.outputReads.get(info.token);
    if (inflight) return inflight.promise;

    const cancelled = Promise.withResolvers<never>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = (async (): Promise<Record<string, unknown>> => {
      try {
        const raw = await Promise.race([
          readOutput(taskId),
          cancelled.promise,
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error(msg("thread.sessionActionFailed"))),
              OUTPUT_READ_TIMEOUT_MS,
            );
          }),
        ]);
        const normalized = normalizeTaskOutput(raw);
        if (!this.isOutputTarget(taskId, info.token, runtime)) {
          throw new Error(msg("thread.sessionActionUnavailable"));
        }
        return {
          output: normalized.output,
          totalBytes: normalized.totalBytes,
          truncated: normalized.truncated,
        };
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    })();
    const entry = {
      promise: read,
      cancel: (error: Error) => cancelled.reject(error),
    };
    this.outputReads.set(info.token, entry);
    void read
      .finally(() => {
        if (this.outputReads.get(info.token) === entry) this.outputReads.delete(info.token);
      })
      .catch(() => {});
    return read;
  }

  /**
   * A task read target is current only while the same run/token is tracked,
   * still listed, still a shell/Monitor lane, and the same query owns it.
   */
  private isOutputTarget(taskId: string, token: string, runtime: BackgroundTaskRuntime): boolean {
    if (this.runtime() !== runtime) return false;
    const info = this.tasks.get(taskId);
    if (!info || info.token !== token) return false;
    if (!this.reported.has(taskId)) return false;
    const task = this.state.reportedBackgroundTasks?.find((entry) => entry.taskId === taskId);
    return task !== undefined && isOutputEligible(task);
  }

  private cancelOutputRead(token: string): void {
    const entry = this.outputReads.get(token);
    if (!entry) return;
    this.outputReads.delete(token);
    entry.cancel(new Error(msg("thread.sessionActionUnavailable")));
  }

  private taskInfo(taskId: string, runId?: string, rosterIds?: ReadonlySet<string>): TaskInfo {
    const previous = this.tasks.get(taskId);
    if (previous && this.isStaleRun(taskId, runId)) return previous;
    if (previous && (!runId || !previous.runId || runId === previous.runId)) {
      if (runId) previous.runId = runId;
      return previous;
    }
    if (previous) {
      this.stops.get(previous.token)?.reject(new Error(msg("thread.sessionActionUnavailable")));
      this.cancelOutputRead(previous.token);
    }
    const info: TaskInfo = {
      token: randomUUID(),
      startedAt: Date.now(),
      ...(runId ? { runId } : {}),
    };
    this.tasks.set(taskId, info);
    this.evictUntracked(taskId, rosterIds);
    return info;
  }

  /** The SDK promises one task's run ids sort in open order by plain string comparison. */
  private isStaleRun(taskId: string, runId: string | undefined): boolean {
    const current = this.tasks.get(taskId)?.runId;
    return !!(current && runId && runId < current);
  }

  private isListed(taskId: string): boolean {
    return this.state.reportedBackgroundTasks?.some((task) => task.taskId === taskId) === true;
  }

  /** Drop the oldest runs no live roster, sub-agent registry or Stop still references. */
  private evictUntracked(keep: string, rosterIds?: ReadonlySet<string>): void {
    let excess = this.tasks.size - MAX_TRACKED_TASKS;
    for (const [taskId, info] of this.tasks) {
      if (excess <= 0) return;
      if (
        taskId === keep ||
        rosterIds?.has(taskId) ||
        this.reported.has(taskId) ||
        this.isListed(taskId) ||
        this.state.liveBackgroundTaskIds?.has(taskId) ||
        this.state.activeSubAgentTaskToTool?.has(taskId) ||
        this.stops.has(info.token)
      )
        continue;
      this.tasks.delete(taskId);
      excess--;
    }
  }
}

/** The runtime method when this SDK build actually implements it. */
function readTaskOutput(
  runtime: BackgroundTaskRuntime | undefined,
): NativeGetTaskOutput | undefined {
  const method = runtime?.getTaskOutput;
  if (typeof method !== "function") return undefined;
  return (method as NativeGetTaskOutput).bind(runtime);
}

/**
 * Only shell/Monitor lanes promise readable output. A category-less older task
 * falls back to its legacy `kind` (command), never to a guessed capability.
 */
function isOutputEligible(task: Pick<BackgroundTask, "kind" | "category">): boolean {
  const category = task.category ?? (task.kind === "command" ? "command" : "other");
  return category === "command" || category === "monitor";
}

/**
 * Normalize the native `get_task_output` payload into the shared response.
 * `total_bytes` stays the native byte count; the string tail is re-bounded
 * defensively and marked truncated when the cap actually clipped it.
 */
function normalizeTaskOutput(value: unknown): BackgroundTaskOutput {
  if (!value || typeof value !== "object") {
    throw new Error(msg("thread.sessionActionFailed"));
  }
  const record = value as Record<string, unknown>;
  const output = record.output;
  const totalBytes = record.total_bytes;
  const truncated = record.truncated;
  if (
    typeof output !== "string" ||
    typeof totalBytes !== "number" ||
    typeof truncated !== "boolean"
  ) {
    throw new Error(msg("thread.sessionActionFailed"));
  }
  let bounded = output;
  let clipped = truncated;
  if (bounded.length > MAX_OUTPUT_CHARS) {
    // The contract promises the LATEST tail; keep the end, not the oldest prefix.
    bounded = bounded.slice(-MAX_OUTPUT_CHARS);
    // Never leave an unpaired surrogate on the JSON wire when the tail slice
    // cut through a surrogate pair.
    const firstUnit = bounded.charCodeAt(0);
    if (firstUnit >= 0xdc00 && firstUnit <= 0xdfff) bounded = bounded.slice(1);
    const lastUnit = bounded.charCodeAt(bounded.length - 1);
    if (lastUnit >= 0xd800 && lastUnit <= 0xdbff) bounded = bounded.slice(0, -1);
    clipped = true;
  }
  try {
    const parsed = backgroundTaskOutputSchema.parse({
      output: bounded,
      totalBytes,
      truncated: clipped,
    });
    return {
      output: parsed.output,
      totalBytes: parsed.totalBytes,
      truncated: parsed.truncated,
    };
  } catch {
    throw new Error(msg("thread.sessionActionFailed"));
  }
}
