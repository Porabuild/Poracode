import { useState } from "react";
import { useLingui } from "@lingui/react/macro";
import type { RequestOutcome } from "@/shared/contracts";
import { QuestionStepForm } from "./QuestionStepForm";
import { HelpCircle } from "lucide-react";
import { QuestionOptions, QuestionTextInput } from "./parts/QuestionOptions";
import { QuestionFormHeader } from "./parts/QuestionFormHeader";
import { questionTextFieldClassName } from "./parts/QuestionOptionRow";
import { QuestionSwitcher } from "./parts/QuestionSwitcher";
import { QuestionFormActions } from "./parts/QuestionFormActions";
import { TextArea } from "@/renderer/components/common/TextArea";

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
  buildResponse: (answerOverrides?: Record<string, UserInputFormAnswer>) => unknown;
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

  function buildResponse(answerOverrides: Record<string, UserInputFormAnswer> = {}): unknown {
    const responseAnswers = { ...answers, ...answerOverrides };
    const responseCustomAnswers = Object.fromEntries(
      Object.entries(customAnswers).filter(([key]) => !Object.hasOwn(answerOverrides, key)),
    );
    if (form.responseShape === "codex-request-user-input") {
      return {
        answers: Object.fromEntries(
          form.questions.map((question) => {
            const custom = (responseCustomAnswers[question.id] ?? "").trim();
            if (custom.length > 0) return [question.id, { answers: [custom] }];
            const value = responseAnswers[question.id];
            const values = Array.isArray(value) ? value : value ? [value] : [];
            return [question.id, { answers: values }];
          }),
        ),
      };
    }
    return {
      answers: Object.fromEntries(
        form.questions.map((question) => {
          const custom = (responseCustomAnswers[question.id] ?? "").trim();
          if (custom.length > 0) return [question.id, custom];
          return [question.id, responseAnswers[question.id]];
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

function questionHasAnswer(
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
  /** The answer is being sent; the step action shows progress. */
  isPending?: boolean;
  wrapOptionLabels?: boolean;
  /** Turns the request down without answering. */
  onDecline?: () => void;
  onSubmit: (response: unknown, outcome: RequestOutcome) => void;
}) {
  const { formId, controller, isDisabled, onSubmit } = props;
  const { t } = useLingui();
  const activeQuestion = controller.questions[controller.activeIndex] ?? controller.questions[0];
  if (!activeQuestion) return null;
  const customAnswer = controller.customAnswers[activeQuestion.id] ?? "";
  const allQuestionsAnswered = controller.allAnswered;
  const isLastStep = controller.activeIndex >= controller.questions.length - 1;
  const canAdvance = questionHasAnswer(
    activeQuestion,
    controller.answers,
    controller.customAnswers,
  );
  // A short header titles the question; providers without one (Kimi, message
  // replies) repeat the question there, so the question becomes the title.
  const hasDistinctHeader =
    activeQuestion.header.length > 0 && activeQuestion.header !== activeQuestion.question;

  return (
    <QuestionStepForm
      id={formId}
      activeStep={activeQuestion.id}
      isLastStep={isLastStep}
      canAdvance={canAdvance}
      isDisabled={isDisabled}
      onAdvance={() => controller.setActiveIndex(controller.activeIndex + 1)}
      onSubmit={() => {
        if (allQuestionsAnswered) onSubmit(controller.buildResponse(), "answered");
      }}
      header={
        <QuestionFormHeader
          icon={HelpCircle}
          title={hasDistinctHeader ? activeQuestion.header : activeQuestion.question}
          description={hasDistinctHeader ? activeQuestion.question : undefined}
          hint={activeQuestion.multiSelect ? t`Select all that apply` : undefined}
          steps={
            <QuestionSwitcher
              steps={controller.questions.map((question) => ({
                id: question.id,
                label: question.header,
                answered: questionHasAnswer(question, controller.answers, controller.customAnswers),
              }))}
              activeIndex={controller.activeIndex}
              isDisabled={isDisabled}
              onSelect={controller.setActiveIndex}
            />
          }
        />
      }
      footer={
        <QuestionFormActions
          formId={formId}
          isLastStep={isLastStep}
          canSubmit={isLastStep ? allQuestionsAnswered : canAdvance}
          isDisabled={isDisabled}
          isPending={props.isPending ?? false}
          {...(props.onDecline ? { onDecline: props.onDecline } : {})}
        />
      }
    >
      <div data-question-step className="space-y-1.5">
        {activeQuestion.options ? (
          <QuestionOptions
            label={activeQuestion.header}
            options={activeQuestion.options}
            value={controller.answers[activeQuestion.id] ?? ""}
            multiSelect={activeQuestion.multiSelect}
            isDisabled={isDisabled}
            {...(props.wrapOptionLabels ? { wrapLabels: true } : {})}
            onSelect={(optionId, submitOnLast) => {
              if (activeQuestion.multiSelect) {
                controller.toggleMultiSelect(activeQuestion.id, optionId);
                return;
              }
              controller.selectSingleChoice(activeQuestion.id, optionId);
              const answers = { ...controller.answers, [activeQuestion.id]: optionId };
              if (
                submitOnLast &&
                controller.activeIndex === controller.questions.length - 1 &&
                controller.questions.every((question) =>
                  questionHasAnswer(
                    question,
                    answers,
                    question.id === activeQuestion.id ? {} : controller.customAnswers,
                  ),
                )
              ) {
                onSubmit(controller.buildResponse({ [activeQuestion.id]: optionId }), "answered");
              }
            }}
            custom={{
              value: customAnswer,
              onChange: (value) => controller.setCustomAnswer(activeQuestion.id, value),
              "aria-label": activeQuestion.question,
            }}
          />
        ) : activeQuestion.isSecret ? (
          <QuestionTextInput
            type="password"
            aria-label={activeQuestion.question}
            disabled={isDisabled}
            value={singleUserInputValue(controller.answers[activeQuestion.id])}
            onChange={(e) => controller.setDirectAnswer(activeQuestion.id, e.target.value)}
          />
        ) : (
          <TextArea
            autoSize
            maxRows={6}
            fullWidth
            disabled={isDisabled}
            rows={2}
            aria-label={activeQuestion.question}
            placeholder={t`Type your answer…`}
            value={singleUserInputValue(controller.answers[activeQuestion.id])}
            onChange={(e) => controller.setDirectAnswer(activeQuestion.id, e.target.value)}
            className={questionTextFieldClassName}
          />
        )}
      </div>
    </QuestionStepForm>
  );
}
