import { useState } from "react";
import { Button, Input } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Plus, X } from "lucide-react";
import {
  QuestionRowMarker,
  questionInputRowClassName,
  questionRowClassName,
  questionRowInputClassName,
} from "./parts/QuestionOptionRow";

/** Custom entries of a multi-select field, rendered as extra checked rows of its list. */
export function StructuredCustomValues(props: {
  values: string[];
  isDisabled: boolean;
  /** True when the parent field already has maxItems selected (enum + custom). */
  atLimit?: boolean;
  onChange: (values: string[]) => void;
}) {
  const { values, isDisabled, atLimit = false, onChange } = props;
  const { t } = useLingui();
  const [draft, setDraft] = useState("");
  function add() {
    const value = draft.trim();
    if (isDisabled || atLimit || !value) return;
    if (!values.includes(value)) onChange([...values, value]);
    setDraft("");
  }
  return (
    <div className="flex flex-col gap-px">
      {values.map((value) => (
        <div key={value} className={questionRowClassName(true)}>
          <QuestionRowMarker active>{null}</QuestionRowMarker>
          <span className="min-w-0 flex-1 text-xs font-medium break-all text-foreground">
            {value}
          </span>
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            className="-my-1 size-6 min-w-6"
            isDisabled={isDisabled}
            aria-label={t`Remove ${value}`}
            onPress={() => onChange(values.filter((entry) => entry !== value))}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ))}
      <label className={questionInputRowClassName(false, isDisabled || atLimit)}>
        <QuestionRowMarker active={false}>
          <Plus className="size-2.5" strokeWidth={3} />
        </QuestionRowMarker>
        <Input
          data-question-enter-local
          aria-label={t`Other`}
          placeholder={t`Other`}
          value={draft}
          disabled={isDisabled || atLimit}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
              add();
            }
          }}
          className={questionRowInputClassName}
        />
        {draft.trim() ? (
          <Button
            size="sm"
            variant="ghost"
            className="-my-1 h-6"
            isDisabled={isDisabled || atLimit}
            onPress={add}
          >
            <Trans>Add</Trans>
          </Button>
        ) : null}
      </label>
    </div>
  );
}
