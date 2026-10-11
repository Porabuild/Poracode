import type { Query, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { StartTurnOptions } from "../base";
import type { PromptSegment, ThreadConfig } from "@/shared/contracts";
import { parseGoalSlashCommand } from "../goalRuntime";
import type { ToolItemState } from "./sdkCanonicalMappingState";

// Long foreground Bash tasks register after two seconds. Wait for their
// task_started/tool-result edge, bounded for producers omitting that event.
const FOREGROUND_REGISTRATION_WAIT_MS = 3_000;

export type ClaudeSteer = [string, ThreadConfig, PromptSegment[] | undefined, StartTurnOptions];
export type ClaudeForegroundSteerState = "none" | "backgrounded" | "blocked";

type SendNowRequest = (
  input: { subtype: "interrupt"; send_now: true; message_uuid: string },
  options: { signal: AbortSignal },
) => Promise<unknown>;

// SDK 0.3.280 exposes request() at runtime but has no typed Send-now wrapper.
// Feature-check both the pinned SDK method and the CLI's explicit capabilities.
function sendNowRequest(query: Query): SendNowRequest | undefined {
  const request = (query as unknown as { request?: SendNowRequest }).request;
  return typeof request === "function" ? request : undefined;
}

/** Tracks unanswered input: several steers can fold into one SDK cycle. */
export class ClaudeSteerDelivery {
  private pending = new Map<string, ClaudeSteer>();
  private delivered = new Set<string>();
  private backgrounded = new Set<string>();
  private taskTools = new Map<string, string>();
  private queued = new Set<string>();
  private nativeControls = new Set<AbortController>();
  private supportsSendNow = false;
  private tail: Promise<void> = Promise.resolve();
  private activityVersion = 0;
  private activity = Promise.withResolvers<void>();
  supported = false;

  get hasPending(): boolean {
    return this.pending.size > 0 || this.delivered.size > 0;
  }

  get hasBackgroundedTools(): boolean {
    return this.backgrounded.size > 0;
  }

  add(uuid: string, steer: ClaudeSteer): void {
    this.pending.set(uuid, steer);
  }

  clear(): void {
    this.pending.clear();
    this.delivered.clear();
    this.queued.clear();
    for (const control of this.nativeControls) control.abort();
    this.nativeControls.clear();
    this.tail = Promise.resolve();
    this.noteActivity();
  }

  /** The owning query stopped or was replaced; its tasks can no longer be steered. */
  reset(): void {
    this.clear();
    this.backgrounded.clear();
    this.taskTools.clear();
  }

  canSendNow(query: Query): boolean {
    return this.supported && this.supportsSendNow && sendNowRequest(query) !== undefined;
  }

  /** Send now targets only admitted input and never performs Stop's task sweep. */
  async sendNow(query: Query, uuid: string, isCurrent: () => boolean): Promise<void> {
    const request = sendNowRequest(query);
    if (!request || !this.canSendNow(query)) return;
    const deadline = Date.now() + FOREGROUND_REGISTRATION_WAIT_MS;
    while (isCurrent() && this.pending.has(uuid) && !this.queued.has(uuid)) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) return;
      await this.waitForActivity(this.activityVersion, remaining);
    }
    if (!isCurrent() || !this.pending.has(uuid) || !this.queued.has(uuid)) return;
    const controller = new AbortController();
    this.nativeControls.add(controller);
    try {
      await request.call(
        query,
        { subtype: "interrupt", send_now: true, message_uuid: uuid },
        {
          signal: controller.signal,
        },
      );
    } catch {
      // Unsupported/retired control leaves the already-admitted input queued.
    } finally {
      this.nativeControls.delete(controller);
    }
  }

  /** Hand back undelivered steers in submission order and forget them. */
  takePending(): ClaudeSteer[] {
    const steers = [...this.pending.values()];
    this.clear();
    return steers;
  }

  /** Attachment reads must not reorder messages submitted close together. */
  serialize(deliver: () => Promise<void>): Promise<void> {
    const result = this.tail.then(deliver);
    this.tail = result.catch(() => {});
    return result;
  }

  observe(message: SDKMessage): ClaudeSteer | undefined {
    this.noteActivity();
    const lifecycle = message as { type: string; command_uuid?: string; state?: string };
    if (
      lifecycle.type === "command_lifecycle" &&
      lifecycle.state === "queued" &&
      lifecycle.command_uuid &&
      this.pending.has(lifecycle.command_uuid)
    ) {
      this.queued.add(lifecycle.command_uuid);
    }
    if (message.type === "system" && message.subtype === "task_started" && message.tool_use_id) {
      this.taskTools.set(message.task_id, message.tool_use_id);
    }
    if (message.type === "system" && message.subtype === "task_notification") {
      const toolId = message.tool_use_id ?? this.taskTools.get(message.task_id);
      if (toolId) this.backgrounded.delete(toolId);
      this.taskTools.delete(message.task_id);
    }
    if (message.type === "user" && Array.isArray(message.message.content)) {
      const result = message.tool_use_result as { backgroundTaskId?: string } | undefined;
      if (!result?.backgroundTaskId) {
        for (const block of message.message.content) {
          if (block.type !== "tool_result") continue;
          this.backgrounded.delete(block.tool_use_id);
          for (const [taskId, toolId] of this.taskTools) {
            if (toolId === block.tool_use_id) this.taskTools.delete(taskId);
          }
        }
      }
    }
    if (message.type === "system" && message.subtype === "init") {
      this.supported = message.capabilities?.includes("interrupt_cancel_queued_v1") === true;
      this.supportsSendNow =
        message.capabilities?.includes("interrupt_send_now_v1") === true &&
        message.capabilities.includes("msg_lifecycle_v1");
    }
    if (message.type !== "user" || message.parent_tool_use_id || !message.uuid) return;
    const steer = this.pending.get(message.uuid);
    if (steer) {
      this.pending.delete(message.uuid);
      this.queued.delete(message.uuid);
      this.delivered.add(message.uuid);
    }
    return steer;
  }

  /** Distinguish absent work from successfully backgrounded or unbackgroundable work. */
  async backgroundForegroundTools(
    query: Query,
    tools: () => readonly ToolItemState[],
    isCurrent: () => boolean,
  ): Promise<ClaudeForegroundSteerState> {
    const deadline = Date.now() + FOREGROUND_REGISTRATION_WAIT_MS;
    while (isCurrent()) {
      const foreground = tools();
      if (foreground.length === 0) return "none";
      const version = this.activityVersion;
      const results = await Promise.all(
        foreground.map(async (tool) => {
          const result = await query.backgroundTasks(tool.itemId).catch(() => null);
          if (result === true && isCurrent()) this.backgrounded.add(tool.itemId);
          return result;
        }),
      );
      if (!isCurrent()) return "blocked";
      const remaining = deadline - Date.now();
      // If backgrounding is unavailable, preserve executing work. Native
      // queued input still admits the steer and Stop can cancel it.
      if (results.every((result) => result === true)) return "backgrounded";
      if (results.includes(null) || remaining <= 0) return "blocked";
      await this.waitForActivity(version, remaining);
    }
    return "blocked";
  }

  private async waitForActivity(version: number, remaining: number): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (version === this.activityVersion) {
        await Promise.race([
          this.activity.promise,
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, remaining);
          }),
        ]);
      }
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private noteActivity(): void {
    this.activityVersion++;
    this.activity.resolve();
    this.activity = Promise.withResolvers<void>();
  }

  /** A replay acknowledges delivery; only its cycle's result acknowledges an answer. */
  settleResult(message: Extract<SDKMessage, { type: "result" }>, interrupted: boolean): void {
    const uuids =
      message.user_message_uuids ??
      (message.user_message_uuid ? [message.user_message_uuid] : undefined);
    if (uuids) {
      // Main-thread cycles answer input in replay order. A coalesced result
      // from an older CLI names only its last member; acknowledge that prefix
      // while leaving later replays and unrelated generation results alone.
      const delivered = [...this.delivered];
      const lastAnswered = delivered.findLastIndex((uuid) => uuids.includes(uuid));
      for (const uuid of delivered.slice(0, lastAnswered + 1)) this.delivered.delete(uuid);
      for (const uuid of uuids) {
        this.pending.delete(uuid);
        this.queued.delete(uuid);
      }
    } else if (!interrupted) {
      // Older producers omit result correlation. A normal result answers the
      // replayed input, while an aborted generation may precede its answer.
      this.delivered.clear();
    }
  }
}

/**
 * A `/goal <objective>` or `/goal clear` replaces the running goal. The CLI's
 * goal Stop hook can keep the current turn open indefinitely, so such a steer
 * must interrupt instead of waiting for the turn to end. A bare `/goal` is a
 * status query and waits like any other command.
 */
export function isGoalMutationPrompt(prompt: string): boolean {
  const goal = parseGoalSlashCommand(prompt);
  return goal !== undefined && goal.action !== "viewed";
}

/**
 * SDK 0.3.280 (as since 0.3.251) implements cancelQueued but still types
 * `interrupt()` without the argument.
 * Use only after the CLI advertises interrupt_cancel_queued_v1. A plain interrupt
 * explicitly leaves SDK-queued user input runnable.
 */
export function interruptClaudeQuery(
  query: Query,
  cancelQueued: boolean,
): ReturnType<Query["interrupt"]> {
  if (!cancelQueued) return query.interrupt();
  const interrupt: (options: { cancelQueued: boolean }) => ReturnType<Query["interrupt"]> =
    query.interrupt;
  return interrupt.call(query, { cancelQueued: true });
}
