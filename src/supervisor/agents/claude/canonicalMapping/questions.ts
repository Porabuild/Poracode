import type { RuntimeEvent } from "@/shared/contracts";
import { buildQuestionAnswerEvents } from "../../questionAnswerEvents";

export const ASK_USER_QUESTION_TOOL_NAME = "AskUserQuestion";

export interface ClaudeQuestion {
  question: string;
  header: string;
  options: Array<{ optionId: string; label: string; description?: string }>;
  multiSelect?: boolean;
}

export function mapClaudeQuestionRequest(input: {
  threadId: string;
  requestId: string;
  questions: ClaudeQuestion[];
}): RuntimeEvent {
  const firstQuestion = input.questions[0];
  const isSingleQuestion = input.questions.length === 1;
  return {
    type: "request.opened",
    threadId: input.threadId,
    requestId: input.requestId,
    requestType: "tool_user_input",
    payload: {
      summary: firstQuestion?.question ?? "Claude needs more information",
      details: {
        questions: input.questions,
        userInputForm: { questions: input.questions },
      },
      ...(isSingleQuestion && firstQuestion?.options ? { options: firstQuestion.options } : {}),
      ...(isSingleQuestion && firstQuestion?.multiSelect !== undefined
        ? { multiSelect: firstQuestion.multiSelect }
        : {}),
    },
  };
}

/**
 * Build the chat items rendered in place of the suppressed `AskUserQuestion`
 * tool_call once the user has answered. Emits a single `question_answer`
 * item carrying the structured questions, selected options (with their
 * descriptions), and any custom freeform text the user typed.
 *
 * `answers` is the form's raw response map keyed by question text — the
 * value per question is the option id, an array of option ids, an object
 * with `optionIds` / `answers`, or a custom freeform string.
 */
export function buildClaudeQuestionAnswerEvents(input: {
  threadId: string;
  itemId: string;
  questions: ClaudeQuestion[];
  answers: Record<string, unknown>;
}): RuntimeEvent[] {
  return buildQuestionAnswerEvents({
    threadId: input.threadId,
    itemId: input.itemId,
    questions: input.questions.map((question) => ({
      keys: [question.question, question.header],
      header: question.header,
      question: question.question,
      options: question.options,
    })),
    answers: input.answers,
  });
}

export function parseClaudeQuestions(input: Record<string, unknown>): ClaudeQuestion[] {
  const rawQuestions = Array.isArray(input.questions) ? input.questions : [];
  return rawQuestions.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const q = raw as Record<string, unknown>;
    const question =
      typeof q.question === "string" && q.question.length > 0
        ? q.question
        : `Question ${index + 1}`;
    const header =
      typeof q.header === "string" && q.header.length > 0 ? q.header : `Question ${index + 1}`;
    const options = Array.isArray(q.options)
      ? q.options.flatMap((opt, optIndex) => {
          if (!opt || typeof opt !== "object") return [];
          const o = opt as Record<string, unknown>;
          const fallback = `Option ${optIndex + 1}`;
          const optionId =
            typeof o.optionId === "string" && o.optionId.length > 0
              ? o.optionId
              : typeof o.label === "string" && o.label.length > 0
                ? o.label
                : fallback;
          const label =
            typeof o.label === "string" && o.label.length > 0 ? o.label : optionId || fallback;
          return [
            {
              optionId,
              label,
              ...(typeof o.description === "string" ? { description: o.description } : {}),
            },
          ];
        })
      : [];
    return [{ question, header, options, multiSelect: q.multiSelect === true }];
  });
}
