import type { MessageItemPayload, MessageReplyForm, RuntimeEvent } from "@/shared/contracts";
import type { StructuredSessionUpdate } from "../base";
import { readMessageReplyAnswer } from "@/shared/messageReplyForm";

interface QuestionMessage {
  form: MessageReplyForm;
  pending: boolean;
  completed: boolean;
}

/** Async forms need attention independently of the app-server's active/idle state. */
export class CodexAsyncQuestionAttention {
  private readonly messages = new Map<string, QuestionMessage>();
  private readonly childItemIds = new Set<string>();
  private lastUserMessageItemId: string | undefined;

  get needsReply(): boolean {
    return [...this.messages.values()].some((message) => message.pending);
  }

  observe(events: readonly RuntimeEvent[]): boolean {
    const neededReply = this.needsReply;
    for (const event of events) {
      if (event.type === "item.started" && event.parentItemId) {
        this.childItemIds.add(event.itemId);
        continue;
      }
      if ("itemId" in event && this.childItemIds.has(event.itemId)) {
        if (event.type === "item.completed") this.childItemIds.delete(event.itemId);
        continue;
      }
      if (event.type === "item.started" && event.itemType === "user_message") {
        if (this.lastUserMessageItemId === event.itemId) continue;
        this.lastUserMessageItemId = event.itemId;
        this.answer(event.payload as MessageItemPayload);
        continue;
      }
      if (
        event.type !== "item.started" &&
        event.type !== "item.updated" &&
        event.type !== "item.completed"
      )
        continue;
      if (event.type === "item.started" && event.itemType !== "assistant_message") continue;
      const form = (event.payload as MessageItemPayload | undefined)?.replyForm;
      const existing = this.messages.get(event.itemId);
      if (!existing && form?.questions.length) {
        this.messages.set(event.itemId, { form, pending: true, completed: false });
      }
      const message = this.messages.get(event.itemId);
      if (message && event.type === "item.completed") {
        message.completed = true;
        if (!message.pending) this.messages.delete(event.itemId);
      }
    }
    return neededReply !== this.needsReply;
  }

  apply(update: StructuredSessionUpdate): StructuredSessionUpdate {
    if (
      this.needsReply &&
      (update.status === "working" || update.status === "idle" || update.status === "finished")
    ) {
      return { ...update, attention: "needs_reply" };
    }
    return update;
  }

  private answer(payload: MessageItemPayload): void {
    const pending = [...this.messages.entries()].filter(([, message]) => message.pending);
    const sourceItemId = payload.questionAnswer?.sourceItemId;
    const text = payload.content
      .flatMap((block) => (block.kind === "text" ? [block.text] : []))
      .join("");
    // Older/native clients reply with the form's plain question/answer text.
    const matching = pending.toReversed().find(([, { form }]) => {
      if (payload.questionAnswer) {
        return (
          form.questions.length === payload.questionAnswer.questions.length &&
          form.questions.every(
            (question, index) =>
              question.question === payload.questionAnswer?.questions[index]?.question,
          )
        );
      }
      return readMessageReplyAnswer(form, text) !== undefined;
    });
    const answered = sourceItemId
      ? pending.filter(([itemId]) => itemId === sourceItemId)
      : matching
        ? [matching]
        : payload.questionAnswer
          ? []
          : pending;
    for (const [itemId, message] of answered) {
      message.pending = false;
      if (message.completed) this.messages.delete(itemId);
    }
  }
}
