import { useId, useRef, useState, type ReactNode } from "react";
import { Button, toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { MessageReplyForm as ReplyForm } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { messageReplyFormText } from "@/shared/messageReplyForm";
import { readThreadInputDelivery } from "@/renderer/state/threadInputDelivery";
import { submitThreadInput } from "@/renderer/actions/threadRuntimeActions";
import { isRemoteCommandOutcomeUncertainError } from "@/renderer/actions/threadCommandOutcomeActions";
import { useAppStore } from "@/renderer/state/appStore";
import {
  asUserInputFormDetails,
  questionHasAnswer,
  UserInputForm,
  useUserInputFormController,
} from "../../../ThreadRuntimeRequestPanel/userInputForm";
import { QuestionSwitcher } from "../../../ThreadRuntimeRequestPanel/parts/QuestionSwitcher";

/** Replies are ordinary user messages: the provider keeps running while this form is open. */
export function MessageReplyForm({
  threadId,
  itemId,
  form,
  text,
  children,
}: {
  threadId: string;
  itemId: string;
  form: ReplyForm;
  text: string;
  children: ReactNode;
}) {
  const { t } = useLingui();
  const formId = useId();
  const inFlight = useRef(false);
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const replyState = useAppStore((state): "none" | "pending" | "answered" => {
    const ids = state.runtimeItemIdsByThread[threadId];
    const items = state.runtimeItemsByIdByThread[threadId];
    const index = ids?.indexOf(itemId) ?? -1;
    if (index < 0 || !ids || !items) return "none";
    // Async questions have no correlated response RPC. Any subsequent top-level
    // user input supersedes them, including a reply typed in the composer.
    let pending = false;
    for (let position = index + 1; position < ids.length; position += 1) {
      const item = items[ids[position]!];
      if (item?.type !== "user_message" || item.parentItemId) continue;
      const delivery = readThreadInputDelivery(item.payload);
      if (delivery === "pending") pending = true;
      else if (delivery !== "failed") return "answered";
    }
    return pending ? "pending" : "none";
  });
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
  if (!controller || submitted || replyState === "answered") return children;
  const disabled = sending || replyState === "pending" || !available;
  const activeQuestion = controller.questions[controller.activeIndex];
  const isLastStep = controller.activeIndex === controller.questions.length - 1;
  const canAdvance =
    activeQuestion &&
    questionHasAnswer(activeQuestion, controller.answers, controller.customAnswers);

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
      await submitThreadInput(threadId, prompt);
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
    <>
      {text.trim() !== messageReplyFormText(form).trim() ? children : null}
      <div className="rounded-lg border border-[color:var(--border)]" data-message-reply-form>
        <QuestionSwitcher
          questions={controller.questions}
          answers={controller.answers}
          customAnswers={controller.customAnswers}
          activeIndex={controller.activeIndex}
          isDisabled={disabled}
          onSelect={controller.setActiveIndex}
        />
        <UserInputForm
          formId={formId}
          controller={controller}
          isDisabled={disabled}
          wrapOptionLabels
          onSubmit={(response) => {
            void submit(response);
          }}
        />
        <div className="flex justify-end px-2 pb-2">
          <Button
            size="sm"
            variant="tertiary"
            type="submit"
            form={formId}
            isDisabled={disabled || (isLastStep ? !controller.allAnswered : !canAdvance)}
          >
            {isLastStep ? t`Submit` : t`Continue`}
          </Button>
        </div>
      </div>
    </>
  );
}
