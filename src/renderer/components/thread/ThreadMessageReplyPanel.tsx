import { useId, useRef, useState } from "react";
import { toast } from "@heroui/react";
import { useShallow } from "zustand/react/shallow";
import type { MessageItemPayload, MessageReplyForm as ReplyForm } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { submitThreadInput } from "@/renderer/actions/threadRuntimeActions";
import { isRemoteCommandOutcomeUncertainError } from "@/renderer/actions/threadCommandOutcomeActions";
import { useAppStore } from "@/renderer/state/appStore";
import { useThreadRuntimeItem } from "@/renderer/state/useThreadRuntimeItem";
import { getRuntimeItemPayload } from "@/renderer/state/slices/runtimeEventSlice";
import {
  asUserInputFormDetails,
  UserInputForm,
  useUserInputFormController,
} from "./ThreadRuntimeRequestPanel/userInputForm";
import { ThreadDockSection } from "./ThreadDockUI";
import { selectMessageReplyState, selectPendingMessageReplyIds } from "./messageReplyForms";
import { buildMessageReplyAnswer } from "./ChatPane/parts/items/messageReplyAnswerPayload";

export function ThreadMessageReplyDocks({ threadId }: { threadId: string }) {
  const ids = useAppStore(useShallow((state) => selectPendingMessageReplyIds(state, threadId)));
  return ids.map((itemId) => <MessageReplyDock key={itemId} threadId={threadId} itemId={itemId} />);
}

function MessageReplyDock({ threadId, itemId }: { threadId: string; itemId: string }) {
  const item = useThreadRuntimeItem(threadId, itemId);
  const form = item
    ? getRuntimeItemPayload<MessageItemPayload>(item, "assistant_message")?.replyForm
    : undefined;
  return form ? <ThreadMessageReplyPanel threadId={threadId} itemId={itemId} form={form} /> : null;
}

/** Replies are ordinary user messages: the provider keeps running while this form is open. */
export function ThreadMessageReplyPanel({
  threadId,
  itemId,
  form,
}: {
  threadId: string;
  itemId: string;
  form: ReplyForm;
}) {
  const formId = useId();
  const inFlight = useRef(false);
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const replyState = useAppStore((state) => selectMessageReplyState(state, threadId, itemId));
  const available = useAppStore((state) => {
    const thread = state.threads.find((entry) => entry.id === threadId);
    return (
      !!thread && !thread.archived && (thread.status !== "inactive" || thread.canResumeWithConfig)
    );
  });
  const controller = useUserInputFormController(
    asUserInputFormDetails({
      userInputForm: {
        questions: form.questions.map((question) => ({ ...question, header: question.question })),
      },
    }),
  );
  if (!controller || submitted || replyState === "answered" || replyState === "pending")
    return null;
  const disabled = sending || !available;
  async function submit(response: unknown) {
    if (inFlight.current || disabled || !response || typeof response !== "object") return;
    const answers = (response as { answers?: Record<string, unknown> }).answers;
    const values = form.questions.map((question) => {
      const answer = answers?.[question.id];
      return typeof answer === "string" ? answer.trim() : "";
    });
    if (values.some((value) => !value)) return;
    const prompt = form.questions
      .map((question, index) => `${question.question}\n${values[index]}`)
      .join("\n\n");
    inFlight.current = true;
    setSending(true);
    try {
      await submitThreadInput(threadId, prompt, undefined, {
        questionAnswer: buildMessageReplyAnswer(form, values),
      });
      setSubmitted(true);
    } catch (error) {
      // An uncertain send may already be committed; never offer an immediate resend.
      if (isRemoteCommandOutcomeUncertainError(error)) setSubmitted(true);
      toast.danger(friendlyError(error));
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  return (
    <ThreadDockSection className="!text-xs" placement="composer" collapsed={false}>
      <div data-message-reply-form>
        <UserInputForm
          formId={formId}
          controller={controller}
          isDisabled={disabled}
          isPending={sending}
          wrapOptionLabels
          onSubmit={(response) => {
            void submit(response);
          }}
        />
      </div>
    </ThreadDockSection>
  );
}
