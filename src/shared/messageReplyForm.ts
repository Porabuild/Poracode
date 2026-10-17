import type { MessageReplyForm } from "./contracts/runtimeEvent";

/** Text fallback shared by clients that cannot display an interactive reply form. */
export function messageReplyFormText(form: MessageReplyForm): string {
  return form.questions
    .map((question) =>
      [question.question, ...(question.options?.map((option) => `- ${option.label}`) ?? [])].join(
        "\n",
      ),
    )
    .join("\n\n");
}

export function isMessageReplyFormFallbackText(
  form: MessageReplyForm | undefined,
  text: string,
): boolean {
  return !!form && (!text.trim() || text.trim() === messageReplyFormText(form).trim());
}
