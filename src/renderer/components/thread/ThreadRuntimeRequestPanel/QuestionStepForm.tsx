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
  /** Single-step forms only submit, so they need no advance. */
  canAdvance?: boolean;
  isDisabled: boolean;
  onAdvance?: () => void;
  onSubmit: () => void;
  header?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const {
    id,
    activeStep,
    isLastStep,
    canAdvance = false,
    isDisabled,
    onAdvance,
    onSubmit,
    children,
  } = props;
  const formRef = useRef<HTMLFormElement>(null);
  const previousStep = useRef(activeStep);
  useLayoutEffect(() => {
    // Move into the new step at its Tab stop, unless the step tabs are being
    // driven from the keyboard and must keep focus.
    if (
      previousStep.current !== activeStep &&
      !document.activeElement?.closest('[role="tablist"]')
    ) {
      formRef.current
        ?.querySelector<HTMLElement>(
          '[data-question-step] :is(button, input, textarea):not(:disabled):not([tabindex="-1"])',
        )
        ?.focus();
    }
    previousStep.current = activeStep;
  }, [activeStep]);

  function advanceOrSubmit() {
    if (isDisabled) return;
    if (isLastStep) onSubmit();
    else if (canAdvance) onAdvance?.();
  }

  return (
    <form
      id={id}
      ref={formRef}
      noValidate
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
      {props.header}
      <div className="space-y-2 p-2">{children}</div>
      {props.footer}
    </form>
  );
}
