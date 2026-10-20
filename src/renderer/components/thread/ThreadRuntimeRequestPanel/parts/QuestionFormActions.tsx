import { Button, Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowRight } from "lucide-react";

/** One footer for every question form: the dismissal sits beside the step action. */
export function QuestionFormActions(props: {
  formId: string;
  isLastStep: boolean;
  canSubmit: boolean;
  isDisabled: boolean;
  /** The answer is being sent; the step action shows progress. */
  isPending?: boolean;
  /** Turns the request down without answering (cancel or decline, per protocol). */
  onDecline?: () => void;
}) {
  const { formId, isLastStep, canSubmit, isDisabled, isPending = false, onDecline } = props;
  const { t } = useLingui();
  const disabledReason = isLastStep
    ? t`Answer every question to submit`
    : t`Answer this question to continue`;
  return (
    <div className="flex items-center justify-end gap-1 px-2 pt-0.5 pb-2">
      {onDecline ? (
        <Button
          isDisabled={isDisabled}
          size="sm"
          variant="ghost"
          className="text-muted"
          onPress={onDecline}
        >
          <Trans>Decline</Trans>
        </Button>
      ) : null}
      <Tooltip delay={0} isDisabled={canSubmit || isDisabled}>
        <Tooltip.Trigger
          role="group"
          aria-label={!canSubmit ? disabledReason : undefined}
          tabIndex={!canSubmit && !isDisabled ? 0 : -1}
        >
          <Button
            form={formId}
            isDisabled={isDisabled || !canSubmit}
            isPending={isPending}
            size="sm"
            type="submit"
            variant="primary"
          >
            {isLastStep ? t`Submit` : t`Continue`}
            {isLastStep ? null : <ArrowRight className="size-3.5" aria-hidden />}
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content placement="top">{disabledReason}</Tooltip.Content>
      </Tooltip>
    </div>
  );
}
