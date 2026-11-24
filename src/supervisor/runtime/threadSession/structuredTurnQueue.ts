import { randomUUID } from "node:crypto";
import type {
  ModelSwitchItemPayload,
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
  /**
   * The model that answered each thread's latest GUI turn, retained across
   * session restarts for the host's lifetime so a switch made while a thread
   * was stopped still records its divider on the next launch. A launch can
   * also seed the baseline from the client's stored items
   * (`previousTurnModel`) for threads this host has not run since startup.
   * Entries are one short string per thread ever run; thread ids are never
   * reused, so no eviction is needed.
   */
  private readonly lastTurnModelByThread = new Map<string, string>();

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
      // A changed answering model records its divider ahead of the prompt,
      // like the provider-handoff divider at a launch.
      this.noteTurnModel(session.threadId, turn.config.model, {
        requestedItemId: turn.modelSwitchItemId,
      });
      // Broadcast the renderer's row ID so paired clients see the same prompt.
      optimisticItemId = this.emitOptimisticUserMessage(
        session.threadId,
        turn.prompt,
        turn.displaySegments ?? turn.segments,
        turn.userMessageItemId,
        {
          ...(turn.questionAnswer ? { questionAnswer: turn.questionAnswer } : {}),
          ...(turn.config.model.trim() ? { model: turn.config.model } : {}),
        },
      );
    }
    const startOptions = {
      ...(optimisticItemId ? { userMessageItemId: optimisticItemId } : {}),
      ...(turn.questionAnswer ? { questionAnswer: turn.questionAnswer } : {}),
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
    if (session.presentationMode === "gui" && prompt.length > 0) {
      this.noteTurnModel(session.threadId, session.config.model);
    }
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
    options?: {
      includeTurn?: boolean;
      questionAnswer?: QuestionAnswerItemPayload;
      /** Thread-config model this message was submitted with (see the payload field). */
      model?: string;
    },
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
          ...(options?.model?.trim() ? { model: options.model } : {}),
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

  /**
   * Note the model a GUI turn is about to be answered with, recording a
   * `model_switch` divider when it differs from the model that answered the
   * thread's previous turn. Callers emit then paint the prompt, so the
   * divider lands ahead of it on the durable event path. `seedModel` is a
   * launch's client-supplied previous model, consulted only when this host
   * has not run a turn for the thread yet. `resetBaseline` marks a provider
   * switch, whose model ids are not comparable with the previous provider's:
   * the baseline restarts silently with the new provider's model.
   */
  noteTurnModel(
    threadId: string,
    model: string | undefined,
    options?: {
      seedModel?: string | undefined;
      resetBaseline?: boolean | undefined;
      requestedItemId?: string | undefined;
    },
  ): void {
    const next = model?.trim();
    if (!next) return;
    const previous = options?.resetBaseline
      ? undefined
      : (this.lastTurnModelByThread.get(threadId) ?? options?.seedModel?.trim());
    if (previous && previous !== next) {
      this.emitModelSwitch(threadId, previous, next, options?.requestedItemId);
    }
    this.lastTurnModelByThread.set(threadId, next);
  }

  /** Record where a thread's answering model changed within one provider. */
  emitModelSwitch(
    threadId: string,
    fromModel: string,
    toModel: string,
    requestedItemId?: string,
  ): string {
    const itemId = requestedItemId ?? `model-switch-${randomUUID()}`;
    const payload: ModelSwitchItemPayload = {
      fromModel,
      toModel,
      at: new Date().toISOString(),
    };
    this.ctx.emit({
      type: "thread-runtime-event",
      threadId,
      event: {
        type: "item.started",
        threadId,
        itemId,
        itemType: "model_switch",
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
