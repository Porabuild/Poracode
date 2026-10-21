import type { ComponentProps } from "react";
import { Input } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { UserInputOption } from "@/shared/contracts";
import { isQuestionStepEnter } from "../QuestionStepForm";
import {
  QuestionOptionRow,
  QuestionRowMarker,
  questionInputRowClassName,
  questionRowInputClassName,
  questionTextFieldClassName,
} from "./QuestionOptionRow";

type CustomAnswerInputProps = Omit<
  ComponentProps<typeof Input>,
  "className" | "value" | "onChange" | "type"
>;

/** Choice list whose optional custom answer is the list's last row, not a second field. */
export function QuestionOptions(props: {
  label: string;
  options: readonly UserInputOption[];
  value: string | readonly string[];
  multiSelect?: boolean;
  isDisabled: boolean;
  wrapLabels?: boolean;
  invalid?: boolean;
  required?: boolean;
  describedBy?: string;
  onSelect: (optionId: string, submitOnLast?: boolean) => void;
  custom?: CustomAnswerInputProps & { value: string; onChange: (value: string) => void };
}) {
  const { label, options, value, multiSelect, isDisabled, onSelect, custom } = props;
  const isChosen = (optionId: string) =>
    multiSelect ? Array.isArray(value) && value.includes(optionId) : value === optionId;
  // Tab enters the list on its chosen row (else the first); arrows move within it.
  const tabStop = Math.max(
    0,
    options.findIndex((option) => isChosen(option.optionId)),
  );
  return (
    <div className="flex flex-col gap-px">
      <div
        role="listbox"
        aria-label={label}
        aria-describedby={props.describedBy}
        aria-invalid={props.invalid}
        aria-required={props.required}
        {...(multiSelect ? { "aria-multiselectable": true } : {})}
        className="flex flex-col gap-px"
      >
        {options.map((option, index) => (
          <QuestionOptionRow
            key={option.optionId}
            index={index}
            option={option}
            isDisabled={isDisabled}
            {...(props.wrapLabels ? { wrapLabel: true } : {})}
            isTabStop={index === tabStop}
            {...(multiSelect
              ? { checked: isChosen(option.optionId) }
              : { selected: isChosen(option.optionId) })}
            onClick={() => onSelect(option.optionId)}
            onKeyDown={(event) => {
              if (isDisabled || !isQuestionStepEnter(event)) return;
              event.preventDefault();
              event.stopPropagation();
              onSelect(option.optionId, !multiSelect);
            }}
          />
        ))}
      </div>
      {custom ? (
        <QuestionCustomAnswerRow index={options.length} isDisabled={isDisabled} {...custom} />
      ) : null}
    </div>
  );
}

function QuestionCustomAnswerRow({
  index,
  isDisabled,
  value,
  onChange,
  placeholder,
  ...inputProps
}: CustomAnswerInputProps & {
  index: number;
  isDisabled: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useLingui();
  const active = value.trim().length > 0;
  return (
    <label className={questionInputRowClassName(active, isDisabled)}>
      <QuestionRowMarker active={active}>{index + 1}</QuestionRowMarker>
      <Input
        type="text"
        data-question-option
        {...(index < 9 ? { "aria-keyshortcuts": String(index + 1) } : {})}
        {...inputProps}
        disabled={isDisabled}
        value={value}
        placeholder={placeholder ?? t`Something else…`}
        onChange={(event) => onChange(event.target.value)}
        className={questionRowInputClassName}
      />
    </label>
  );
}

/** Free-text answer field for questions without choices. */
export function QuestionTextInput(props: Omit<ComponentProps<typeof Input>, "className">) {
  return <Input fullWidth {...props} className={questionTextFieldClassName} />;
}
