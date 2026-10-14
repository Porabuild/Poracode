import { useLayoutEffect, useRef, type ReactNode, type KeyboardEvent } from "react";
import { handleQuestionOptionKey } from "./questionOptionKeyboard";

export function isQuestionStepEnter(event: KeyboardEvent): boolean {
  return (
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.nativeEvent.isComposing &&
    event.nativeEvent.keyCode !== 229
  );
}

/** Enter advances an answered step; submission belongs to the final step. */
export function QuestionStepForm(props: {
  id: string;
  activeStep: string;
  isLastStep: boolean;
  canAdvance: boolean;
  isDisabled: boolean;
  onAdvance: () => void;
  onSubmit: () => void;
  children: ReactNode;
}) {
  const { id, activeStep, isLastStep, canAdvance, isDisabled, onAdvance, onSubmit, children } =
    props;
  const formRef = useRef<HTMLFormElement>(null);
  const previousStep = useRef(activeStep);
  useLayoutEffect(() => {
    if (previousStep.current !== activeStep) {
      formRef.current
        ?.querySelector<HTMLElement>(
          "[data-question-step] button:not(:disabled), [data-question-step] input:not(:disabled), [data-question-step] textarea:not(:disabled)",
        )
        ?.focus();
    }
    previousStep.current = activeStep;
  }, [activeStep]);

  function advanceOrSubmit() {
    if (isDisabled) return;
    if (isLastStep) onSubmit();
    else if (canAdvance) onAdvance();
  }

  return (
    <form
      id={id}
      ref={formRef}
      noValidate
      className="space-y-2 border-t border-[color:var(--border)] px-2 py-1.5"
      onKeyDownCapture={(event) => {
        if (!isDisabled && handleQuestionOptionKey(event, event.currentTarget)) return;
        if ((event.target as HTMLElement).closest("[data-question-enter-local]")) return;
        // Modified Enter must not fall through to native implicit submission.
        // Shift+Enter in a textarea retains its normal newline behavior.
        if (
          event.key === "Enter" &&
          (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey)
        ) {
          if (!(event.shiftKey && event.target instanceof HTMLTextAreaElement))
            event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (!isQuestionStepEnter(event)) return;
        // Buttons and links retain their own activation (answer rows select and advance).
        if ((event.target as HTMLElement).closest('button:not([type="submit"]), a')) return;
        event.preventDefault();
        event.stopPropagation();
        advanceOrSubmit();
      }}
      onSubmit={(event) => {
        event.preventDefault();
        advanceOrSubmit();
      }}
    >
      {children}
    </form>
  );
}
