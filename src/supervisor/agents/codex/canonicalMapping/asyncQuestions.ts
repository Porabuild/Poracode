import type { MessageReplyForm } from "@/shared/contracts";

/** Async questions are message metadata, not a pending JSON-RPC request. */
export function readCodexAsyncQuestions(source: {
  questions?: unknown;
}): MessageReplyForm | undefined {
  if (!Array.isArray(source.questions)) return undefined;
  const questions = source.questions.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const question = entry as { title?: unknown; options?: unknown };
    if (typeof question.title !== "string" || !question.title.trim()) return [];
    const labels = Array.isArray(question.options)
      ? [
          ...new Set(
            question.options.filter(
              (option): option is string => typeof option === "string" && option.trim().length > 0,
            ),
          ),
        ]
      : [];
    return [
      {
        id: `q${index}`,
        question: question.title,
        options: labels.length > 0 ? labels.map((label) => ({ optionId: label, label })) : null,
      },
    ];
  });
  return questions.length > 0 ? { questions } : undefined;
}
