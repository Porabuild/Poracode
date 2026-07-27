import { randomUUID } from "node:crypto";
import type { PromptSegment } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { buildPromptContentBlocks } from "@/shared/promptContent";
import type { QueuedStructuredTurn, SessionRuntime } from "../sessionTypes";

export interface StructuredTurnQueueContext {
  emit(event: SupervisorEvent): void;
  sessions: Map<string, SessionRuntime>;
  beginFailureEpisode(session: SessionRuntime): void;
  failStructuredSession(session: SessionRuntime, error: unknown): void;
}

/**
 * Starts structured (GUI / server-controlled) turns and drains the
 * launch-queued initial prompt once the agent signals readiness. Owns the
 * optimistic user_message paint that keeps the chat pane responsive while the
 * structured session's `prompt()` round-trip is in flight. Extracted from
 * `ThreadSessionManager`.
 */
export class StructuredTurnQueue {
  constructor(private readonly ctx: StructuredTurnQueueContext) {}

  start(session: SessionRuntime, turn: QueuedStructuredTurn): void {
    if (!session.structuredSession?.startTurn) {
      return;
    }
    this.ctx.beginFailureEpisode(session);
    // Optimistic user_message: paint the user's prompt in the chat pane
    // before the structured session's `prompt()` round-trip resolves so the
    // chat doesn't visually stall waiting on the agent. Only meaningful for
    // GUI threads — terminal threads render user input via PTY echo.
    // Prefer the renderer-supplied id when present (the chat pane has
    // already painted the message); otherwise emit one from the supervisor.
    const optimisticItemId =
      session.presentationMode === "gui" && turn.prompt.length > 0
        ? (turn.userMessageItemId ??
          this.emitOptimisticUserMessage(session.threadId, turn.prompt, turn.segments))
        : undefined;
    const startOptions = {
      ...(optimisticItemId ? { userMessageItemId: optimisticItemId } : {}),
      ...(turn.inlineInstructions ? { inlineInstructions: turn.inlineInstructions } : {}),
    };
    const startTurn = session.structuredSession.startTurn(
      turn.prompt,
      turn.config,
      turn.segments,
      Object.keys(startOptions).length > 0 ? startOptions : undefined,
    );
    void startTurn.catch((error) => {
      if (this.ctx.sessions.get(session.threadId)?.instanceId !== session.instanceId) {
        return;
      }
      this.ctx.failStructuredSession(session, error);
    });
  }

  /** Drain the launch-queued initial prompt once the agent's TUI is ready. */
  startQueuedLaunchPrompt(session: SessionRuntime): void {
    if (!session.pendingLaunchPrompt || !session.structuredSession?.startTurn) {
      return;
    }
    this.ctx.beginFailureEpisode(session);
    const prompt = session.pendingLaunchPrompt;
    session.pendingLaunchPrompt = undefined;
    void session.structuredSession.startTurn(prompt, session.config).catch((error) => {
      if (this.ctx.sessions.get(session.threadId)?.instanceId !== session.instanceId) {
        return;
      }
      this.ctx.failStructuredSession(session, error);
    });
  }

  /**
   * Synchronously paint the user's typed prompt into the chat pane as a
   * canonical user_message item, ahead of the structured session's own
   * `prompt()` round-trip. The structured session reuses this item id
   * via `StartTurnOptions` so its eventual emit is no-op'd by the
   * renderer's per-id dedupe, and the supervisor still drives the rest of the
   * canonical event stream.
   */
  emitOptimisticUserMessage(threadId: string, prompt: string, segments?: PromptSegment[]): string {
    const turnId = `turn-${randomUUID()}`;
    const itemId = `user-${randomUUID()}`;
    this.ctx.emit({
      type: "thread-runtime-event",
      threadId,
      event: { type: "turn.started", threadId, turnId },
    });
    this.ctx.emit({
      type: "thread-runtime-event",
      threadId,
      event: {
        type: "item.started",
        threadId,
        itemId,
        itemType: "user_message",
        payload: { content: buildPromptContentBlocks(prompt, segments) },
      },
    });
    this.ctx.emit({
      type: "thread-runtime-event",
      threadId,
      event: { type: "item.completed", threadId, itemId },
    });
    return itemId;
  }
}
