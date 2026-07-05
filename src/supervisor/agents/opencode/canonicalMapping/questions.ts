/**
 * OpenCode question request → canonical user-input form mapping.
 */

import type { QuestionRequest } from "@opencode-ai/sdk/v2";

export function questionRequestPayload(req: QuestionRequest): {
  summary: string;
  details?: unknown;
  options?: { optionId: string; label: string; description?: string }[];
  multiSelect?: boolean;
} {
  const questions = req.questions ?? [];
  const summary =
    questions.length > 1
      ? (questions[0]?.question ?? questions[0]?.header ?? "Input requested")
      : questions
          .map((q) => q.header ?? q.question ?? "")
          .filter((s) => s.length > 0)
          .join("\n") || "Input requested";
  const formQuestions = [];
  for (let qi = 0; qi < questions.length; qi += 1) {
    const q = questions[qi]!;
    const opts = q.options ?? [];
    const options = [];
    for (let oi = 0; oi < opts.length; oi += 1) {
      const opt = opts[oi]!;
      const id = `q${qi}.${oi}`;
      options.push({
        optionId: id,
        label: opt.label,
        ...(opt.description ? { description: opt.description } : {}),
      });
    }
    formQuestions.push({
      id: `q${qi}`,
      question: q.question,
      header: q.header,
      options,
      ...(q.multiple ? { multiSelect: true } : {}),
    });
  }
  const first = formQuestions[0];
  if (formQuestions.length > 1) {
    return { summary, details: { userInputForm: { questions: formQuestions } } };
  }
  return first
    ? {
        summary,
        details: { userInputForm: { questions: formQuestions } },
        options: first.options,
        ...(first.multiSelect ? { multiSelect: true } : {}),
      }
    : { summary };
}

export function questionRequestId(id: string): string {
  return `opencode-q-${id}`;
}
