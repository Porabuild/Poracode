import type { MessageReplyForm, QuestionAnswerItemPayload } from "@/shared/contracts";

/**
 * Replies already persist as ordinary prompts. Recognize the form's exact text
 * format so existing history gets the same answer card without a data migration.
 */
export function readMessageReplyAnswer(
  form: MessageReplyForm,
  prompt: string,
): QuestionAnswerItemPayload | undefined {
  const answers: string[] = [];
  let remaining = prompt;
  for (const [index, question] of form.questions.entries()) {
    const prefix = `${question.question}\n`;
    if (!remaining.startsWith(prefix)) return undefined;
    remaining = remaining.slice(prefix.length);
    const nextQuestion = form.questions[index + 1];
    const boundary = nextQuestion ? `\n\n${nextQuestion.question}\n` : undefined;
    const end = boundary ? remaining.indexOf(boundary) : remaining.length;
    if (end < 0) return undefined;
    // Old prompts have no escaping. Preserve the raw message rather than
    // assigning custom text to the wrong question when its delimiter repeats.
    if (boundary && remaining.indexOf(boundary, end + boundary.length) >= 0) return undefined;
    const answer = remaining.slice(0, end);
    if (!answer || answer !== answer.trim()) return undefined;
    answers.push(answer);
    remaining = remaining.slice(end + (boundary ? 2 : 0));
  }
  return answers.length > 0 ? buildMessageReplyAnswer(form, answers) : undefined;
}

export function buildMessageReplyAnswer(
  form: MessageReplyForm,
  answers: readonly string[],
): QuestionAnswerItemPayload {
  return {
    questions: form.questions.map((question, index) => {
      const answer = answers[index] ?? "";
      const option = question.options?.find((entry) => entry.optionId.trim() === answer);
      return {
        header: "",
        question: question.question,
        selected: option ? [{ label: option.label }] : [],
        ...(!option ? { customAnswer: answer } : {}),
      };
    }),
  };
}
