import type { Query, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { StartTurnOptions } from "../base";
import type { PromptSegment, ThreadConfig } from "@/shared/contracts";

export type ClaudeSteer = [string, ThreadConfig, PromptSegment[] | undefined, StartTurnOptions];

/** Tracks delivery, not turn count: several steers can fold into one SDK turn. */
export class ClaudeSteerDelivery {
  private pending = new Map<string, ClaudeSteer>();
  private tail: Promise<void> = Promise.resolve();
  supported = false;

  get hasPending(): boolean {
    return this.pending.size > 0;
  }

  add(uuid: string, steer: ClaudeSteer): void {
    this.pending.set(uuid, steer);
  }

  clear(): void {
    this.pending.clear();
    this.tail = Promise.resolve();
  }

  /** Attachment reads must not reorder messages submitted close together. */
  serialize(deliver: () => Promise<void>): Promise<void> {
    const result = this.tail.then(deliver);
    this.tail = result.catch(() => {});
    return result;
  }

  observe(message: SDKMessage): ClaudeSteer | undefined {
    if (message.type === "system" && message.subtype === "init") {
      this.supported = message.capabilities?.includes("interrupt_cancel_queued_v1") === true;
    }
    if (message.type !== "user" || message.parent_tool_use_id || !message.uuid) return;
    const steer = this.pending.get(message.uuid);
    if (steer) this.pending.delete(message.uuid);
    return steer;
  }
}

/**
 * SDK 0.3.251 implements cancelQueued but omits the argument in its public type.
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
