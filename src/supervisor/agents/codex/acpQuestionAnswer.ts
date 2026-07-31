import { randomUUID } from "node:crypto";
import type { RuntimeEvent } from "@/shared/contracts";
import {
  buildQuestionAnswerEvents,
  type QuestionAnswerSourceQuestion,
} from "../questionAnswerEvents";

export function buildCodexQuestionAnswerEvents(input: {
  threadId: string;
  params: Record<string, unknown> | undefined;
  response: unknown;
}): RuntimeEvent[] {
  return buildQuestionAnswerEvents({
    threadId: input.threadId,
    itemId: `codex-question-answer-${randomUUID()}`,
    questions: codexQuestionSources(input.params),
    answers: codexResponseAnswers(input.response),
  });
}

function codexQuestionSources(
  params: Record<string, unknown> | undefined,
): QuestionAnswerSourceQuestion[] {
  const raw = Array.isArray(params?.questions) ? params.questions : [];
  return raw.flatMap((entry, index): QuestionAnswerSourceQuestion[] => {
    if (!entry || typeof entry !== "object") return [];
    const q = entry as Record<string, unknown>;
    const id = typeof q.id === "string" && q.id.length > 0 ? q.id : `q${index}`;
    const question = typeof q.question === "string" ? q.question : "";
    const header =
      typeof q.header === "string" && q.header.length > 0
        ? q.header
        : question.length > 0
          ? question
          : id;
    const options = Array.isArray(q.options)
      ? q.options.flatMap((opt) => {
          if (!opt || typeof opt !== "object") return [];
          const o = opt as Record<string, unknown>;
          const label =
            typeof o.label === "string" && o.label.length > 0
              ? o.label
              : typeof o.optionId === "string" && o.optionId.length > 0
                ? o.optionId
                : undefined;
          if (!label) return [];
          return [
            {
              optionId: label,
              label,
              ...(typeof o.description === "string" && o.description.length > 0
                ? { description: o.description }
                : {}),
            },
          ];
        })
      : [];
    return [{ keys: [id, question, header], header, question, options }];
  });
}

function codexResponseAnswers(response: unknown): Record<string, unknown> {
  if (!response || typeof response !== "object") return {};
  const answers = (response as { answers?: unknown }).answers;
  return answers && typeof answers === "object" ? (answers as Record<string, unknown>) : {};
}
