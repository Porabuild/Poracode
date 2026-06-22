import { useState } from "react";
import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { UserInputOption } from "@/shared/contracts";
import { QuestionOptionRow } from "./QuestionOptionRow";

export function QuestionRows(props: {
  options: readonly UserInputOption[];
  isDisabled: boolean;
  onSubmit: (optionIds: readonly string[]) => void;
  multiSelect: boolean;
}) {
  const { options, isDisabled, onSubmit, multiSelect } = props;
  const { t } = useLingui();
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  if (!multiSelect) {
    return (
      <div role="listbox" aria-label={t`Options`} className="flex flex-col px-1 pb-1">
        {options.map((option, index) => (
          <QuestionOptionRow
            key={option.optionId}
            index={index}
            option={option}
            isDisabled={isDisabled}
            onClick={() => onSubmit([option.optionId])}
          />
        ))}
      </div>
    );
  }

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
    <div
      role="listbox"
      aria-label={t`Options`}
      aria-multiselectable="true"
      className="flex flex-col px-1 pb-1"
    >
      {options.map((option, index) => (
        <QuestionOptionRow
          key={option.optionId}
          index={index}
          option={option}
          isDisabled={isDisabled}
          checked={selected.has(option.optionId)}
          onClick={() => toggle(option.optionId)}
        />
      ))}
      <div className="flex justify-end gap-1 px-1 pt-1">
        <Button
          isDisabled={isDisabled || selectedIds.length === 0}
          size="sm"
          variant="secondary"
          className="text-white"
          onPress={() => onSubmit(selectedIds)}
        >
          <Trans>Submit</Trans>
        </Button>
      </div>
    </div>
  );
}
