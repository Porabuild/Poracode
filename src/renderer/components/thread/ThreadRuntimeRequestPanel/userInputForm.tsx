import { useState } from "react";
import { useLingui } from "@lingui/react/macro";
import type { RequestOutcome } from "@/shared/contracts";
import {
  asUserInputFormDetails,
  buildUserInputFormResponse,
  initialUserInputFormAnswers,
  questionHasAnswer,
  singleUserInputValue,
  userInputValueList,
  type UserInputFormAnswer,
  type UserInputFormDetails,
  type UserInputFormOption,
  type UserInputFormQuestion,
} from "@/shared/runtimeRequestForms";
import { QuestionStepForm } from "./QuestionStepForm";
import { HelpCircle } from "lucide-react";
import { QuestionOptions, QuestionTextInput } from "./parts/QuestionOptions";
import { QuestionFormHeader } from "./parts/QuestionFormHeader";
import { questionTextFieldClassName } from "./parts/QuestionOptionRow";
import { QuestionSwitcher } from "./parts/QuestionSwitcher";
import { QuestionFormActions } from "./parts/QuestionFormActions";
import { TextArea } from "@/renderer/components/common/TextArea";

export { asUserInputFormDetails };
export type {
  UserInputFormAnswer,
  UserInputFormDetails,
  UserInputFormOption,
  UserInputFormQuestion,
};

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
    return buildUserInputFormResponse(form, answers, customAnswers, answerOverrides);
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
            controller.questions.length > 1 ? (
              <QuestionSwitcher
                steps={controller.questions.map((question) => ({
                  id: question.id,
                  label: question.header,
                  answered: questionHasAnswer(
                    question,
                    controller.answers,
                    controller.customAnswers,
                  ),
                }))}
                activeIndex={controller.activeIndex}
                isDisabled={isDisabled}
                onSelect={controller.setActiveIndex}
              />
            ) : undefined
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
          {...(!isLastStep && allQuestionsAnswered
            ? { onSubmitEarly: () => onSubmit(controller.buildResponse(), "answered") }
            : {})}
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
