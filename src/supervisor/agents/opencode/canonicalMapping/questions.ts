/**
 * OpenCode question request → canonical user-input form mapping.
 *
 * Covers both `question.asked` (v1) and `question.v2.asked` — the shapes are
 * structurally identical (`questions[]` + optional `tool` link).
 */

import type { QuestionRequest } from "../legacySdk";

/** Minimal structural view shared by v1 and v2 question payloads. */
export interface OpenCodeQuestionShape {
  questions?: Array<{
    question: string;
    header: string;
    options?: Array<{ label: string; description?: string }>;
    multiple?: boolean;
    custom?: boolean;
  }>;
}

export function questionRequestPayload(req: QuestionRequest | OpenCodeQuestionShape): {
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
      // The renderer always offers a custom-answer input; still record the
      // server's intent so future readers can distinguish free-text questions.
      ...(q.custom ? { custom: true } : {}),
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

export function questionV2RequestId(id: string): string {
  return `opencode-qv2-${id}`;
}
