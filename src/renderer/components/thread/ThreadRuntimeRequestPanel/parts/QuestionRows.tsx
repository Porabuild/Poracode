import { useId, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import type { UserInputOption } from "@/shared/contracts";
import { QuestionOptions } from "./QuestionOptions";
import { QuestionStepForm } from "../QuestionStepForm";
import { QuestionFormActions } from "./QuestionFormActions";

export function QuestionRows(props: {
  options: readonly UserInputOption[];
  isDisabled: boolean;
  onSubmit: (optionIds: readonly string[]) => void;
  multiSelect: boolean;
}) {
  const { options, isDisabled, onSubmit, multiSelect } = props;
  const { t } = useLingui();
  const formId = useId();
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

  function toggle(optionId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(optionId)) {
        next.delete(optionId);
      } else {
        next.add(optionId);
      }
      return next;
    });
  }

  const selectedIds = [...selected];
  return (
    <QuestionStepForm
      id={formId}
      activeStep="options"
      isLastStep
      isDisabled={isDisabled}
      onSubmit={() => {
        if (selectedIds.length > 0) onSubmit(selectedIds);
      }}
      footer={
        multiSelect ? (
          <QuestionFormActions
            formId={formId}
            isLastStep
            canSubmit={selectedIds.length > 0}
            isDisabled={isDisabled}
          />
        ) : null
      }
    >
      <QuestionOptions
        label={t`Options`}
        options={options}
        value={selectedIds}
        multiSelect={multiSelect}
        isDisabled={isDisabled}
        onSelect={(optionId) => (multiSelect ? toggle(optionId) : onSubmit([optionId]))}
      />
    </QuestionStepForm>
  );
}
