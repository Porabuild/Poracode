import type { BackgroundSubagentCompletion } from "@/supervisor/crossagentMcp/types";
import type { SessionRuntime } from "../sessionTypes";
import { writeSubmittedPrompt } from "./promptWrite";

const MAX_NOTIFICATION_OUTPUT_CHARS = 24_000;

interface SerializedCompletion {
  run_id: string;
  name: string;
  status: BackgroundSubagentCompletion["status"];
  output: string;
  output_truncated?: true;
  error?: BackgroundSubagentCompletion["error"];
}

export interface BackgroundSubagentNotificationsContext {
  sessions: Map<string, SessionRuntime>;
  isCurrentSession(session: SessionRuntime): boolean;
  onDeliveryError(threadId: string, error: unknown): void;
}

function serializeCompletion(
  completion: BackgroundSubagentCompletion,
  outputBudget: number,
): SerializedCompletion {
  const output = completion.output.slice(0, Math.max(0, outputBudget));
  const outputTruncated = output.length < completion.output.length;
  return {
    run_id: completion.runId,
    name: completion.name,
    status: completion.status,
    output,
    ...(outputTruncated ? { output_truncated: true as const } : {}),
    ...(completion.error ? { error: completion.error } : {}),
  };
}

export function formatBackgroundSubagentNotification(
  completions: readonly BackgroundSubagentCompletion[],
): string {
  let remainingOutputChars = MAX_NOTIFICATION_OUTPUT_CHARS;
  const serialized = completions.map((completion) => {
    const result = serializeCompletion(completion, remainingOutputChars);
    remainingOutputChars -= result.output.length;
    return result;
  });
  return [
    "<crossagent_background_results>",
    "Background crossagent run(s) finished. These are asynchronous tool results, not a new user request. Continue the current task using them; do not call wait_for_agent for these completed run IDs. If an output is truncated, call get_status with its run_id for the full result.",
    JSON.stringify(serialized),
    "</crossagent_background_results>",
  ].join("\n");
}

/**
 * Delivers detached crossagent results back into the parent model.
 *
 * A steer-capable structured provider receives the notification during its
 * active turn. Other providers and terminal sessions retain it until the
 * parent is idle, so a background completion never interrupts foreground
 * work. Completions landing in the same microtask are coalesced into one
 * message.
 */
export class BackgroundSubagentNotifications {
  private readonly pending = new Map<string, BackgroundSubagentCompletion[]>();
  private readonly scheduled = new Set<string>();
  private readonly delivering = new Set<string>();
  private disposed = false;

  constructor(private readonly context: BackgroundSubagentNotificationsContext) {}

  enqueue(threadId: string, completion: BackgroundSubagentCompletion): void {
    if (this.disposed || !this.context.sessions.has(threadId)) return;
    const pending = this.pending.get(threadId);
    if (pending) {
      pending.push(completion);
    } else {
      this.pending.set(threadId, [completion]);
    }
    this.schedule(threadId);
  }

  onSessionStateChanged(session: SessionRuntime): void {
    if (this.pending.has(session.threadId)) {
      this.schedule(session.threadId);
    }
  }

  clear(threadId: string): void {
    this.pending.delete(threadId);
    this.scheduled.delete(threadId);
  }

  dispose(): void {
    this.disposed = true;
    this.pending.clear();
    this.scheduled.clear();
  }

  private schedule(threadId: string): void {
    if (this.scheduled.has(threadId) || this.delivering.has(threadId)) return;
    this.scheduled.add(threadId);
    queueMicrotask(() => {
      this.scheduled.delete(threadId);
      void this.deliver(threadId);
    });
  }

  private async deliver(threadId: string): Promise<void> {
    if (this.disposed || this.delivering.has(threadId)) return;
    const session = this.context.sessions.get(threadId);
    const pending = this.pending.get(threadId);
    if (!session || !pending?.length || !this.context.isCurrentSession(session)) {
      this.pending.delete(threadId);
      return;
    }

    const structured = session.structuredSession;
    const canSteer = session.status === "working" && structured?.steerTurn;
    const canStartStructured = session.status === "idle" && structured?.startTurn;
    const canWriteTerminal = session.status === "idle" && !structured && session.pty;
    if (!canSteer && !canStartStructured && !canWriteTerminal) return;

    this.pending.delete(threadId);
    this.delivering.add(threadId);
    const prompt = formatBackgroundSubagentNotification(pending);
    let delivered = false;
    try {
      if (canSteer) {
        await structured.steerTurn!(prompt, session.config);
      } else if (canStartStructured) {
        await structured.startTurn!(prompt, session.config);
      } else {
        const pty = session.pty!;
        await writeSubmittedPrompt(
          pty,
          session.adapter.buildDirectInput?.(
            prompt,
            undefined,
            session.config,
            session.projectLocation,
          ) ?? [prompt, "\r"],
          session.projectLocation,
        );
      }
      delivered = true;
    } catch (error) {
      const newer = this.pending.get(threadId);
      this.pending.set(threadId, newer ? [...pending, ...newer] : pending);
      this.context.onDeliveryError(threadId, error);
    } finally {
      this.delivering.delete(threadId);
    }

    if (delivered && this.pending.has(threadId)) {
      this.schedule(threadId);
    }
  }
}
