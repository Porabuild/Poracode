import type { CanonicalItemType, RuntimeEvent, Thread } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { isHomeProjectId } from "@/shared/homeScope";
import type { RemoteForgeActivityEvent } from "@/shared/remote/protocol/forgeActivity";
import type { GitStateService } from "@/host/gitState/GitStateService";
import { classifyForgeCommand, classifyForgeToolCall, isPlainObject } from "./classifyForgeCommand";
import type { ForgeActivityAction, ForgeCommandActivity } from "./types";

/**
 * Event-driven trigger for forge activity: watches the normalized runtime
 * events of completed shell commands and tool calls, and when one changed
 * forge state it refreshes the host's shared git state and broadcasts
 * `remote-forge-activity`. The forge lookup stays the source of truth; the
 * event only tells clients to re-read.
 *
 * It covers every structured chat provider because it reads the normalized
 * runtime-event vocabulary rather than provider payloads. Terminal-presentation
 * threads are not covered: their shell hooks do not carry command text.
 */

const DEBOUNCE_MS = 750;
/** Bound on concurrently tracked runtime items so a provider that never completes one cannot grow the map forever. */
const MAX_PENDING_ITEMS = 1000;
const KEY_SEPARATOR = "\u0000";
/** Providers emit MCP and dynamic tools under their own canonical item types. */
const TOOL_CALL_ITEM_TYPES: ReadonlySet<CanonicalItemType> = new Set([
  "tool_call",
  "mcp_tool_call",
  "dynamic_tool_call",
]);

/** At least one activity, which keeps the first batch action well-defined. */
type ActivityList = readonly [ForgeCommandActivity, ...ForgeCommandActivity[]];

interface PendingItem {
  readonly itemType: CanonicalItemType;
  payload: Record<string, unknown>;
}

interface ActivityBatch {
  readonly projectId: string;
  threadId: string;
  worktreePath?: string;
  /** First branch an activity in this burst named explicitly. */
  explicitBranch?: string;
  /** The thread's checked-out branch when the burst opened. */
  readonly threadBranch?: string;
  lastAction: ForgeActivityAction;
  needsProjectList: boolean;
}

export interface ForgeActivityServiceOptions {
  getThread(
    threadId: string,
  ): Pick<Thread, "id" | "projectId" | "worktreePath" | "worktreeBranch"> | null;
  gitState: Pick<GitStateService, "refreshTarget" | "refreshProjectPullRequests">;
  publish(event: RemoteForgeActivityEvent): void;
  reportError?(error: unknown): void;
}

export class ForgeActivityService {
  private readonly pending = new Map<string, PendingItem>();
  private readonly batches = new Map<string, ActivityBatch>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private disposed = false;

  constructor(private readonly options: ForgeActivityServiceOptions) {}

  observeSupervisorEvent(event: SupervisorEvent): void {
    if (this.disposed) return;
    try {
      this.handleSupervisorEvent(event);
    } catch (error) {
      this.report(error);
    }
  }

  private handleSupervisorEvent(event: SupervisorEvent): void {
    switch (event.type) {
      case "thread-runtime-event":
        this.observeRuntimeEvent(event.threadId, event.event);
        return;
      case "thread-runtime-events":
        for (const runtimeEvent of event.events) {
          this.observeRuntimeEvent(event.threadId, runtimeEvent);
        }
        return;
      case "thread-runtime-events-multi":
        for (const batch of event.batches) {
          for (const runtimeEvent of batch.events) {
            this.observeRuntimeEvent(batch.threadId, runtimeEvent);
          }
        }
        return;
      case "thread-reset":
      case "thread-exited":
        this.clearThreadPending(event.threadId);
        return;
      default:
        return;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.pending.clear();
    this.batches.clear();
  }

  private observeRuntimeEvent(threadId: string, event: RuntimeEvent): void {
    switch (event.type) {
      case "item.started": {
        if (event.itemType !== "command_execution" && !TOOL_CALL_ITEM_TYPES.has(event.itemType)) {
          return;
        }
        // Track every shell command and tool item regardless of payload shape:
        // the shared ACP mapper can deliver a tool's name and kind in a later
        // `item.updated`, so the started payload alone cannot decide.
        this.insertPending(this.pendingKey(threadId, event.itemId), {
          itemType: event.itemType,
          payload: isPlainObject(event.payload) ? event.payload : {},
        });
        return;
      }
      case "item.updated": {
        const entry = this.pending.get(this.pendingKey(threadId, event.itemId));
        if (!entry) return;
        mergePayload(entry, event.payload);
        return;
      }
      case "item.completed": {
        const key = this.pendingKey(threadId, event.itemId);
        const entry = this.pending.get(key);
        if (!entry) return;
        mergePayload(entry, event.payload);
        this.pending.delete(key);
        this.evaluate(threadId, entry);
        return;
      }
      default:
        return;
    }
  }

  private insertPending(key: string, entry: PendingItem): void {
    if (!this.pending.has(key) && this.pending.size >= MAX_PENDING_ITEMS) {
      const oldest = this.pending.keys().next();
      if (!oldest.done) this.pending.delete(oldest.value);
    }
    this.pending.set(key, entry);
  }

  private evaluate(threadId: string, entry: PendingItem): void {
    const { payload } = entry;
    if (payload.status === "error") return;
    if (typeof payload.exitCode === "number" && payload.exitCode !== 0) return;

    let activities: ForgeCommandActivity[];
    if (entry.itemType === "command_execution") {
      if (typeof payload.command !== "string") return;
      activities = classifyForgeCommand(payload.command);
    } else if (
      payload.kind === "execute" &&
      isPlainObject(payload.args) &&
      typeof payload.args.command === "string"
    ) {
      activities = classifyForgeCommand(payload.args.command);
    } else {
      if (typeof payload.name !== "string") return;
      const found = classifyForgeToolCall(payload.name, payload.args);
      activities = found ? [found] : [];
    }

    const [firstActivity, ...remaining] = activities;
    if (firstActivity === undefined) return;
    this.enqueue(threadId, [firstActivity, ...remaining]);
  }

  private enqueue(threadId: string, activities: ActivityList): void {
    const thread = this.options.getThread(threadId);
    if (!thread || isHomeProjectId(thread.projectId)) return;

    const worktreePath = thread.worktreePath;
    const key = `${thread.projectId}${KEY_SEPARATOR}${worktreePath ?? ""}`;
    let batch = this.batches.get(key);
    if (!batch) {
      batch = {
        projectId: thread.projectId,
        threadId,
        ...(worktreePath ? { worktreePath } : {}),
        ...(thread.worktreeBranch ? { threadBranch: thread.worktreeBranch } : {}),
        lastAction: activities[0].action,
        needsProjectList: false,
      };
      this.batches.set(key, batch);
      // First activity opens the window; later activities merge without
      // extending it, so a burst of forge commands refreshes at most once.
      const timer = setTimeout(() => {
        this.timers.delete(key);
        this.flush(key);
      }, DEBOUNCE_MS);
      timer.unref?.();
      this.timers.set(key, timer);
    }

    batch.threadId = threadId;
    for (const activity of activities) {
      batch.lastAction = activity.action;
      if (batch.explicitBranch === undefined && activity.branch !== undefined) {
        batch.explicitBranch = activity.branch;
      }
      // Only a push leaves the pull request list untouched; every other
      // action can add or change a row in it.
      batch.needsProjectList ||= activity.action !== "push";
    }
  }

  private flush(key: string): void {
    const batch = this.batches.get(key);
    if (!batch) return;
    this.batches.delete(key);

    // Prefer the branch an activity in the burst named over the thread's
    // checked-out branch; `--head feat-b` creates a pull request for another
    // branch, even when a later `git push` in the same burst names none.
    const branch = batch.explicitBranch ?? batch.threadBranch;
    const event: RemoteForgeActivityEvent = {
      type: "remote-forge-activity",
      projectId: batch.projectId,
      threadId: batch.threadId,
      ...(batch.worktreePath ? { worktreePath: batch.worktreePath } : {}),
      ...(branch ? { branch } : {}),
      action: batch.lastAction,
    };
    try {
      this.options.publish(event);
    } catch (error) {
      this.report(error);
    }

    // The supervisor serializes pull-request polls per project, so the visible
    // checkout's lookup runs first and the slower open-PR list follows it.
    void this.options.gitState
      .refreshTarget({
        projectId: batch.projectId,
        ...(batch.worktreePath ? { worktreePath: batch.worktreePath } : {}),
        includePrDetails: true,
        afterMutation: true,
      })
      .catch((error: unknown) => this.report(error))
      .then(() => {
        if (!batch.needsProjectList || this.disposed) return;
        return this.options.gitState
          .refreshProjectPullRequests(batch.projectId, { afterMutation: true })
          .catch((error: unknown) => this.report(error));
      });
  }

  private clearThreadPending(threadId: string): void {
    const prefix = `${threadId}${KEY_SEPARATOR}`;
    for (const key of this.pending.keys()) {
      if (key.startsWith(prefix)) this.pending.delete(key);
    }
  }

  private pendingKey(threadId: string, itemId: string): string {
    return `${threadId}${KEY_SEPARATOR}${itemId}`;
  }

  private report(error: unknown): void {
    try {
      this.options.reportError?.(error);
    } catch {
      // Diagnostics must never break the observer or the flush timer.
    }
  }
}

function mergePayload(entry: PendingItem, payload: unknown): void {
  if (isPlainObject(payload)) Object.assign(entry.payload, payload);
}
