import { randomUUID } from "node:crypto";
import type { Query, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { BackgroundTask } from "@/shared/contracts";
import { msg } from "@/shared/messages";
import type { ClaudeMapperState } from "./sdkCanonicalMappingState";

const STOP_ACTION_ID = "background-task.stop.v1";
const STOP_CONFIRMATION_MS = 10_000;
// Foreground runs may never get a terminal notification; keep a bounded tail of them.
const MAX_TRACKED_TASKS = 64;

type TaskInfo = {
  token: string;
  startedAt: number;
  runId?: string;
  lastProgressAt?: number;
  progress?: string;
  progressKey?: string;
};
type PendingStop = { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void };

/** Owns task timing and native Stop confirmation for one live CLI process. */
export class ClaudeBackgroundTaskControls {
  private readonly tasks = new Map<string, TaskInfo>();
  private readonly stops = new Map<string, PendingStop>();
  private readonly reported = new Set<string>();

  constructor(
    private readonly state: ClaudeMapperState,
    private readonly runtime: () => Pick<Query, "stopTask"> | undefined,
  ) {}

  reset(): void {
    for (const stop of this.stops.values())
      stop.reject(new Error(msg("thread.sessionActionUnavailable")));
    this.stops.clear();
    this.tasks.clear();
    this.reported.clear();
  }

  listActions(): readonly { id: string }[] {
    return this.runtime()?.stopTask ? [{ id: STOP_ACTION_ID }] : [];
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
    const previous = this.tasks.get(message.task_id);
    return !!(previous?.runId && message.run_id && message.run_id < previous.runId);
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
    const previous = this.tasks.get(message.task_id);
    if (previous?.runId && message.run_id && message.run_id < previous.runId) return false;
    if (message.subtype === "task_notification") {
      if (previous) this.stops.get(previous.token)?.resolve();
      this.tasks.delete(message.task_id);
      return false;
    }
    const info = this.taskInfo(message.task_id, message.run_id);
    if (message.subtype === "task_started") {
      const tool = message.tool_use_id
        ? this.state.toolItemsById.get(message.tool_use_id)
        : undefined;
      if (tool?.toolName === "Monitor") {
        (this.state.backgroundTaskKinds ??= new Map()).set(message.task_id, "other");
        const reclassified = this.state.reportedBackgroundTasks?.some(
          (task) => task.taskId === message.task_id && task.kind !== "other",
        );
        if (reclassified) {
          this.state.reportedBackgroundTasks = this.state.reportedBackgroundTasks!.map((task) =>
            task.taskId === message.task_id ? { ...task, kind: "other" } : task,
          );
        }
        return reclassified === true || (previous !== info && this.isListed(message.task_id));
      }
      return previous !== info && this.isListed(message.task_id);
    }
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
    return tasks.map((task) => {
      const info = this.taskInfo(task.taskId);
      return {
        ...task,
        startedAt: info.startedAt,
        ...(info.lastProgressAt !== undefined ? { lastProgressAt: info.lastProgressAt } : {}),
        ...(info.progress ? { progress: info.progress } : {}),
        ...(this.runtime()?.stopTask
          ? {
              stopAction: {
                id: STOP_ACTION_ID,
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
        this.tasks.delete(id);
      }
    }
    this.reported.clear();
    for (const id of next) {
      this.reported.add(id);
    }
  }

  async invoke(actionId: string, payload: unknown): Promise<Record<string, unknown>> {
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

  private taskInfo(taskId: string, runId?: string, rosterIds?: ReadonlySet<string>): TaskInfo {
    const previous = this.tasks.get(taskId);
    if (previous?.runId && runId && runId < previous.runId) return previous;
    if (previous && (!runId || !previous.runId || runId === previous.runId)) {
      if (runId) previous.runId = runId;
      return previous;
    }
    if (previous)
      this.stops.get(previous.token)?.reject(new Error(msg("thread.sessionActionUnavailable")));
    const info: TaskInfo = {
      token: randomUUID(),
      startedAt: Date.now(),
      ...(runId ? { runId } : {}),
    };
    this.tasks.set(taskId, info);
    this.evictUntracked(taskId, rosterIds);
    return info;
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
