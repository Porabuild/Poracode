import { useState } from "react";
import { useLingui } from "@lingui/react/macro";
import type { RequestOutcome } from "@/shared/contracts";
import { QuestionOptionRow } from "./parts/QuestionOptionRow";

export type UserInputFormOption = {
  optionId: string;
  label: string;
  description?: string;
};

export type UserInputFormQuestion = {
  id: string;
  header: string;
  question: string;
  isSecret: boolean;
  multiSelect: boolean;
  options: UserInputFormOption[] | null;
};

export type UserInputFormDetails = {
  questions: UserInputFormQuestion[];
  responseShape: "answers-map" | "codex-request-user-input";
};

export function asUserInputFormDetails(value: unknown): UserInputFormDetails | undefined {
  if (!value || typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  const generic = obj.userInputForm;
  if (generic && typeof generic === "object") {
    const questions = readUserInputFormQuestions(
      (generic as { questions?: unknown }).questions,
      "generic",
    );
    if (questions.length > 0) return { questions, responseShape: "answers-map" };
  }

  const codex = obj.codexUserInput;
  if (codex && typeof codex === "object") {
    const questions = readUserInputFormQuestions(
      (codex as { questions?: unknown }).questions,
      "codex",
    );
    if (questions.length > 0) return { questions, responseShape: "codex-request-user-input" };
  }

  return undefined;
}

function readUserInputFormQuestions(
  raw: unknown,
  source: "generic" | "codex",
): UserInputFormQuestion[] {
  if (!Array.isArray(raw)) return [];
  const questions: UserInputFormQuestion[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.question !== "string" || e.question.length === 0) continue;
    const id = typeof e.id === "string" && e.id.length > 0 ? e.id : e.question;
    const header =
      typeof e.header === "string" && e.header.length > 0
        ? e.header
        : source === "codex"
          ? e.question
          : id;
    const options =
      Array.isArray(e.options) && e.options.length > 0
        ? e.options.flatMap((opt) => {
            if (!opt || typeof opt !== "object") return [];
            const o = opt as Record<string, unknown>;
            if (typeof o.label !== "string" || o.label.length === 0) return [];
            const optionId =
              typeof o.optionId === "string" && o.optionId.length > 0 ? o.optionId : o.label;
            return [
              {
                optionId,
                label: o.label,
                ...(typeof o.description === "string" && o.description.length > 0
                  ? { description: o.description }
                  : {}),
              },
            ];
          })
        : null;
    questions.push({
      id,
      header,
      question: e.question,
      isSecret: e.isSecret === true,
      multiSelect: e.multiSelect === true,
      options,
    });
  }
  return questions;
}

export type UserInputFormAnswer = string | string[];

function initialUserInputFormAnswers(
  questions: readonly UserInputFormQuestion[],
): Record<string, UserInputFormAnswer> {
  return Object.fromEntries(questions.map((q) => [q.id, q.multiSelect ? [] : ""]));
}

function singleUserInputValue(value: UserInputFormAnswer | undefined): string {
  return typeof value === "string" ? value : "";
}

function userInputValueList(value: UserInputFormAnswer | undefined): string[] {
  return Array.isArray(value) ? value : [];
}

export type UserInputFormController = {
  questions: readonly UserInputFormQuestion[];
  responseShape: UserInputFormDetails["responseShape"];
  activeIndex: number;
  answers: Record<string, UserInputFormAnswer>;
  customAnswers: Record<string, string>;
  /** Every question has a selection or custom text — the form is submittable. */
  allAnswered: boolean;
  setActiveIndex: (index: number) => void;
  selectSingleChoice: (questionId: string, optionId: string) => void;
  toggleMultiSelect: (questionId: string, optionId: string) => void;
  setDirectAnswer: (questionId: string, value: string) => void;
  setCustomAnswer: (questionId: string, value: string) => void;
  buildResponse: () => unknown;
};

export function useUserInputFormController(
  details: UserInputFormDetails | undefined,
): UserInputFormController | null {
  const [activeIndex, setActiveIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, UserInputFormAnswer>>(() =>
    details ? initialUserInputFormAnswers(details.questions) : {},
  );
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});

  if (!details) return null;
  const form = details;

  function selectSingleChoice(questionId: string, optionId: string) {
    setAnswers((cur) => ({ ...cur, [questionId]: optionId }));
    setCustomAnswers((cur) => (cur[questionId] ? { ...cur, [questionId]: "" } : cur));
    setActiveIndex((index) => Math.min(index + 1, form.questions.length - 1));
  }

  function toggleMultiSelect(questionId: string, optionId: string) {
    setAnswers((cur) => {
      const selected = userInputValueList(cur[questionId]);
      const next = selected.includes(optionId)
        ? selected.filter((id) => id !== optionId)
        : [...selected, optionId];
      return { ...cur, [questionId]: next };
    });
    setCustomAnswers((cur) => (cur[questionId] ? { ...cur, [questionId]: "" } : cur));
  }

  function setDirectAnswer(questionId: string, value: string) {
    setAnswers((cur) => (cur[questionId] === value ? cur : { ...cur, [questionId]: value }));
  }

  function setCustomAnswer(questionId: string, value: string) {
    setCustomAnswers((cur) => ({ ...cur, [questionId]: value }));
    if (value.length > 0) {
      const question = form.questions.find((q) => q.id === questionId);
      const empty: UserInputFormAnswer = question?.multiSelect ? [] : "";
      setAnswers((cur) => {
        const existing = cur[questionId];
        if (Array.isArray(existing) ? existing.length === 0 : existing === "") return cur;
        return { ...cur, [questionId]: empty };
      });
    }
  }

  function buildResponse(): unknown {
    if (form.responseShape === "codex-request-user-input") {
      return {
        answers: Object.fromEntries(
          form.questions.map((question) => {
            const custom = (customAnswers[question.id] ?? "").trim();
            if (custom.length > 0) return [question.id, { answers: [custom] }];
            const value = answers[question.id];
            const values = Array.isArray(value) ? value : value ? [value] : [];
            return [question.id, { answers: values }];
          }),
        ),
      };
    }
    return {
      answers: Object.fromEntries(
        form.questions.map((question) => {
          const custom = (customAnswers[question.id] ?? "").trim();
          if (custom.length > 0) return [question.id, custom];
          return [question.id, answers[question.id]];
        }),
      ),
    };
  }

  return {
    questions: form.questions,
    responseShape: form.responseShape,
    activeIndex,
    answers,
    customAnswers,
    allAnswered: form.questions.every((question) =>
      questionHasAnswer(question, answers, customAnswers),
    ),
    setActiveIndex,
    selectSingleChoice,
    toggleMultiSelect,
    setDirectAnswer,
    setCustomAnswer,
    buildResponse,
  };
}

export function questionHasAnswer(
  question: UserInputFormQuestion,
  answers: Record<string, UserInputFormAnswer>,
  customAnswers: Record<string, string>,
): boolean {
  const custom = customAnswers[question.id] ?? "";
  if (custom.trim().length > 0) return true;
  return hasUserInputAnswer(answers[question.id]);
}

function hasUserInputAnswer(value: UserInputFormAnswer | undefined): boolean {
  if (Array.isArray(value)) return value.length > 0;
  // Whitespace-only text is as unanswered: the supervisor rejects empty
  // answer entries, so the gate and the trimmed payload must agree.
  return typeof value === "string" && value.trim().length > 0;
}

export function UserInputForm(props: {
  formId: string;
  controller: UserInputFormController;
  isDisabled: boolean;
  summary?: string;
  onSubmit: (response: unknown, outcome: RequestOutcome) => void;
}) {
  const { formId, controller, isDisabled, summary, onSubmit } = props;
  const { t } = useLingui();
  const activeQuestion = controller.questions[controller.activeIndex] ?? controller.questions[0];
  if (!activeQuestion) return null;
  const customAnswer = controller.customAnswers[activeQuestion.id] ?? "";
  const allQuestionsAnswered = controller.allAnswered;
  // The panel already renders the question as the bold summary/title. Skip a
  // header/question line here when it only repeats that title or the other line
  // — e.g. providers (Kimi) that carry a single question with no distinct header
  // would otherwise show the same sentence three times.
  const showQuestion = activeQuestion.question !== summary;
  const showHeader =
    activeQuestion.header.length > 0 &&
    activeQuestion.header !== activeQuestion.question &&
    activeQuestion.header !== summary;

  return (
    <form
      id={formId}
      className="space-y-2 border-t border-[color:var(--border)] px-2 py-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        // The supervisor rejects answers with empty entries, so never submit
        // an incomplete form — the Submit button is gated to match.
        if (!allQuestionsAnswered) return;
        onSubmit(controller.buildResponse(), "answered");
      }}
    >
      <div className="space-y-1">
        {showHeader || showQuestion ? (
          <div>
            {showHeader ? (
              <p className="text-[11px] font-medium text-foreground">{activeQuestion.header}</p>
            ) : null}
            {showQuestion ? (
              <p className="text-[11px] text-[color:var(--muted)]">{activeQuestion.question}</p>
            ) : null}
          </div>
        ) : null}
        {activeQuestion.options ? (
          <div className="space-y-1">
            <div
              role="listbox"
              aria-label={activeQuestion.header}
              {...(activeQuestion.multiSelect ? { "aria-multiselectable": true } : {})}
              className="flex flex-col"
            >
              {activeQuestion.options.map((option, index) => (
                <QuestionOptionRow
                  key={option.optionId}
                  index={index}
                  option={option}
                  isDisabled={isDisabled}
                  {...(activeQuestion.multiSelect
                    ? {
                        checked: userInputValueList(controller.answers[activeQuestion.id]).includes(
                          option.optionId,
                        ),
                      }
                    : {
                        selected:
                          singleUserInputValue(controller.answers[activeQuestion.id]) ===
                          option.optionId,
                      })}
                  onClick={() => {
                    if (activeQuestion.multiSelect) {
                      controller.toggleMultiSelect(activeQuestion.id, option.optionId);
                      return;
                    }
                    controller.selectSingleChoice(activeQuestion.id, option.optionId);
                  }}
                />
              ))}
            </div>
            <input
              type="text"
              disabled={isDisabled}
              value={customAnswer}
              onChange={(e) => controller.setCustomAnswer(activeQuestion.id, e.target.value)}
              placeholder={t`Or write a custom answer`}
              className="w-full rounded border border-[color:var(--border)] bg-[var(--composer-surface)] px-2 py-1 text-[11px] text-foreground outline-none"
            />
          </div>
        ) : activeQuestion.isSecret ? (
          <input
            type="password"
            disabled={isDisabled}
            value={singleUserInputValue(controller.answers[activeQuestion.id])}
            onChange={(e) => controller.setDirectAnswer(activeQuestion.id, e.target.value)}
            className="w-full rounded border border-[color:var(--border)] bg-[var(--composer-surface)] px-2 py-1 text-[11px] text-foreground outline-none"
          />
        ) : (
          <textarea
            disabled={isDisabled}
            rows={2}
            value={singleUserInputValue(controller.answers[activeQuestion.id])}
            onChange={(e) => controller.setDirectAnswer(activeQuestion.id, e.target.value)}
            className="w-full rounded border border-[color:var(--border)] bg-[var(--composer-surface)] px-2 py-1 text-[11px] text-foreground outline-none"
          />
        )}
      </div>
    </form>
  );
}
