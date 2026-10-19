import { randomUUID } from "node:crypto";
import type {
  PromptSegment,
  ProviderHandoffItemPayload,
  QuestionAnswerItemPayload,
  RuntimeEvent,
} from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import type { StructuredTurnResult } from "../../agents/base";
import { buildPromptContentBlocks } from "@/shared/promptContent";
import type { QueuedStructuredTurn, SessionRuntime } from "../sessionTypes";
import { structuredTurnTextOptions } from "../turnClientContext";
import type { ThreadOutputPipeline } from "../threadOutputPipeline";
import { settleStructuredStartupWithoutTurn } from "./helpers";

export interface StructuredTurnQueueContext {
  emit(event: SupervisorEvent): void;
  /** Append same-turn feedback behind buffered events and flush within credit. */
  emitTurnContinuation(threadId: string, events: RuntimeEvent[]): void;
  sessions: Map<string, SessionRuntime>;
  outputPipeline: Pick<ThreadOutputPipeline, "updateState">;
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
  private readonly pendingStarts = new WeakMap<
    SessionRuntime,
    Promise<void | StructuredTurnResult>
  >();

  constructor(private readonly ctx: StructuredTurnQueueContext) {}

  start(
    session: SessionRuntime,
    turn: QueuedStructuredTurn,
  ): Promise<void | StructuredTurnResult> | undefined {
    if (!session.structuredSession?.startTurn) {
      return undefined;
    }
    this.ctx.beginFailureEpisode(session);
    let optimisticItemId: string | undefined;
    if (session.presentationMode === "gui" && turn.prompt.length > 0) {
      // Match first-turn startup: providers can publish idle metadata while
      // applying settings, before their canonical working/turn-start edge.
      session.suppressInitialStructuredIdle = true;
      this.ctx.outputPipeline.updateState(session, "working", "working");
      // Broadcast the renderer's row ID so paired clients see the same prompt.
      optimisticItemId = this.emitOptimisticUserMessage(
        session.threadId,
        turn.prompt,
        turn.displaySegments ?? turn.segments,
        turn.userMessageItemId,
        ...(turn.questionAnswer ? ([{ questionAnswer: turn.questionAnswer }] as const) : []),
      );
    }
    const startOptions = {
      ...(optimisticItemId ? { userMessageItemId: optimisticItemId } : {}),
      ...structuredTurnTextOptions(session, turn),
    };
    const startTurn = session.structuredSession.startTurn(
      turn.prompt,
      turn.config,
      turn.segments,
      Object.keys(startOptions).length > 0 ? startOptions : undefined,
    );
    this.pendingStarts.set(session, startTurn);
    void startTurn.then(
      (result) => {
        if (this.pendingStarts.get(session) !== startTurn) return;
        this.pendingStarts.delete(session);
        if (this.ctx.sessions.get(session.threadId)?.instanceId === session.instanceId) {
          settleStructuredStartupWithoutTurn(session, result, this.ctx.outputPipeline);
        }
      },
      (error) => {
        if (this.pendingStarts.get(session) === startTurn) this.pendingStarts.delete(session);
        if (
          session.ignoreExit ||
          this.ctx.sessions.get(session.threadId)?.instanceId !== session.instanceId
        ) {
          return;
        }
        this.ctx.failStructuredSession(session, error);
      },
    );
    // This promise is the provider's admission/round-trip result. Callers
    // may observe rejection so a queued item can be restored, but must never
    // use resolution as the turn-completion boundary.
    return startTurn;
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
  emitOptimisticUserMessage(
    threadId: string,
    prompt: string,
    segments?: PromptSegment[],
    requestedItemId?: string,
    options?: { includeTurn?: boolean; questionAnswer?: QuestionAnswerItemPayload },
  ): string {
    const itemId = requestedItemId ?? `user-${randomUUID()}`;
    const events: RuntimeEvent[] = [
      {
        type: "item.started",
        threadId,
        itemId,
        itemType: "user_message",
        payload: {
          content: buildPromptContentBlocks(prompt, segments),
          ...(options?.questionAnswer ? { questionAnswer: options.questionAnswer } : {}),
        },
      },
      { type: "item.completed", threadId, itemId },
    ];
    if (options?.includeTurn === false) {
      this.ctx.emitTurnContinuation(threadId, events);
    } else {
      events.unshift({ type: "turn.started", threadId, turnId: `turn-${randomUUID()}` });
      for (const event of events) {
        this.ctx.emit({ type: "thread-runtime-event", threadId, event });
      }
    }
    return itemId;
  }

  /**
   * Record where a thread changed provider in place. Emitted from the spawn
   * pipeline rather than the renderer so the divider lands on the durable event
   * path — persisted to SQLite and broadcast to every paired client — and is
   * ordered ahead of the prompt that the new provider answers.
   */
  emitProviderHandoff(
    threadId: string,
    fromAgentKind: string,
    toAgentKind: string,
    requestedItemId?: string,
  ): string {
    const itemId = requestedItemId ?? `handoff-${randomUUID()}`;
    const payload: ProviderHandoffItemPayload = {
      fromAgentKind,
      toAgentKind,
      at: new Date().toISOString(),
    };
    this.ctx.emit({
      type: "thread-runtime-event",
      threadId,
      event: {
        type: "item.started",
        threadId,
        itemId,
        itemType: "provider_handoff",
        payload,
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
