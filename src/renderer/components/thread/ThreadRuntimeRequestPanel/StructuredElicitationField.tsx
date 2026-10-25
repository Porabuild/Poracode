import type { Dispatch, SetStateAction } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  emptyStructuredValue,
  structuredFormOptions,
  validStructuredValue,
  type StructuredFormProperty,
  type StructuredFormValue,
} from "@/shared/structuredForm";
import { StructuredCustomValues } from "./StructuredCustomValues";
import { QuestionOptions, QuestionTextInput } from "./parts/QuestionOptions";
import { QuestionRowMarker, questionRowClassName } from "./parts/QuestionOptionRow";

export function StructuredElicitationField(props: {
  fieldKey: string;
  property: StructuredFormProperty;
  formId: string;
  formValues: Record<string, StructuredFormValue>;
  requiredKeys: string[];
  isDisabled: boolean;
  isCustomAnswer: boolean | undefined;
  setFormValues: Dispatch<SetStateAction<Record<string, StructuredFormValue>>>;
  onCustomAnswer: (value: string) => void;
  onSingleChoice: (value: string, submitOnLast?: boolean) => void;
}) {
  const {
    fieldKey: key,
    property,
    formId,
    formValues,
    requiredKeys,
    isDisabled,
    setFormValues,
    onCustomAnswer,
    onSingleChoice,
  } = props;
  const { t } = useLingui();
  const label = property.title ?? key;
  const enumOpts = structuredFormOptions(property);
  const isCustomAnswer = props.isCustomAnswer ?? !enumOpts.some(({ id }) => id === formValues[key]);
  const options = enumOpts.map(({ id, label: optionLabel }) => ({
    optionId: id,
    label: optionLabel,
  }));
  // Array fields read their current selection in three places below;
  // narrow once here (updates still read `cur[key]` functionally).
  const selectedValues = Array.isArray(formValues[key]) ? (formValues[key] as string[]) : [];
  const isRequired = requiredKeys.includes(key);
  const invalid =
    !emptyStructuredValue(formValues[key]) &&
    !validStructuredValue(property, formValues[key], isRequired);
  const errorId = `${formId}-${key}-error`;
  const constraints = [
    property.minimum !== undefined ? t`Minimum: ${property.minimum}` : "",
    property.maximum !== undefined ? t`Maximum: ${property.maximum}` : "",
    property.minLength !== undefined ? t`Minimum characters: ${property.minLength}` : "",
    property.maxLength !== undefined ? t`Maximum characters: ${property.maxLength}` : "",
    property.minItems !== undefined ? t`Minimum selections: ${property.minItems}` : "",
    property.maxItems !== undefined ? t`Maximum selections: ${property.maxItems}` : "",
    property.format
      ? {
          email: t`Email address`,
          uri: t`URL`,
          date: t`Date`,
          "date-time": t`Date and time`,
        }[property.format]
      : "",
    property.pattern ?? "",
  ]
    .filter(Boolean)
    .join(" · ");
  const checked = Boolean(formValues[key]);
  return (
    <div
      data-question-step
      className="space-y-1.5"
      role="group"
      aria-label={label}
      aria-describedby={errorId}
    >
      {property.type === "boolean" ? (
        <label
          className={`${questionRowClassName(checked)} cursor-pointer has-[:focus-visible]:bg-[var(--row-hover)] has-[:focus-visible]:focus-ring`}
        >
          <input
            type="checkbox"
            data-question-option
            aria-label={label}
            className="sr-only"
            disabled={isDisabled}
            checked={checked}
            onChange={(e) => setFormValues((cur) => ({ ...cur, [key]: e.target.checked }))}
          />
          <QuestionRowMarker active={checked}>1</QuestionRowMarker>
          <span className="text-xs font-medium text-foreground">
            <Trans>Yes</Trans>
          </span>
        </label>
      ) : property.type === "integer" || property.type === "number" ? (
        <QuestionTextInput
          aria-label={label}
          aria-invalid={invalid}
          aria-required={isRequired}
          aria-describedby={errorId}
          min={property.minimum}
          max={property.maximum}
          step={property.type === "integer" ? 1 : "any"}
          type="number"
          disabled={isDisabled}
          value={formValues[key] === "" ? "" : String(formValues[key] ?? "")}
          onChange={(e) =>
            setFormValues((cur) => ({
              ...cur,
              [key]: e.target.value.trim().length === 0 ? "" : Number(e.target.value),
            }))
          }
        />
      ) : property.type === "array" ? (
        <div className="flex flex-col gap-px">
          <QuestionOptions
            label={label}
            options={options}
            value={selectedValues}
            multiSelect
            wrapLabels
            isDisabled={isDisabled}
            invalid={invalid}
            required={isRequired}
            describedBy={errorId}
            onSelect={(optionId) =>
              setFormValues((cur) => {
                const selected = Array.isArray(cur[key]) ? (cur[key] as string[]) : [];
                return {
                  ...cur,
                  [key]: selected.includes(optionId)
                    ? selected.filter((value) => value !== optionId)
                    : [...selected, optionId],
                };
              })
            }
          />
          {property.allowCustom ? (
            <StructuredCustomValues
              isDisabled={isDisabled}
              atLimit={
                property.maxItems !== undefined && selectedValues.length >= property.maxItems
              }
              values={selectedValues.filter((value) => !enumOpts.some(({ id }) => id === value))}
              onChange={(custom) =>
                setFormValues((current) => ({
                  ...current,
                  [key]: [
                    ...(Array.isArray(current[key]) ? (current[key] as string[]) : []).filter(
                      (value) => enumOpts.some(({ id }) => id === value),
                    ),
                    ...custom,
                  ],
                }))
              }
            />
          ) : null}
        </div>
      ) : enumOpts.length > 0 ? (
        <QuestionOptions
          label={label}
          options={options}
          value={isCustomAnswer ? "" : String(formValues[key] ?? "")}
          isDisabled={isDisabled}
          invalid={invalid}
          required={isRequired}
          describedBy={errorId}
          onSelect={(optionId, submitOnLast) => {
            const value =
              !submitOnLast && !isRequired && !isCustomAnswer && formValues[key] === optionId
                ? ""
                : optionId;
            setFormValues((cur) => ({ ...cur, [key]: value }));
            onSingleChoice(value, submitOnLast);
          }}
          {...(property.allowCustom
            ? {
                custom: {
                  value: isCustomAnswer ? String(formValues[key] ?? "") : "",
                  onChange: onCustomAnswer,
                  "aria-label": label,
                  "aria-invalid": invalid,
                  "aria-describedby": errorId,
                  minLength: property.minLength,
                  maxLength: property.maxLength,
                  ...(property.placeholder !== undefined
                    ? { placeholder: property.placeholder }
                    : {}),
                },
              }
            : {})}
        />
      ) : (
        <QuestionTextInput
          aria-label={label}
          aria-invalid={invalid}
          aria-required={isRequired}
          aria-describedby={errorId}
          {...(property.placeholder !== undefined ? { placeholder: property.placeholder } : {})}
          minLength={property.minLength}
          maxLength={property.maxLength}
          type="text"
          disabled={isDisabled}
          value={String(formValues[key] ?? "")}
          onChange={(e) => setFormValues((cur) => ({ ...cur, [key]: e.target.value }))}
        />
      )}
      <p id={errorId} className="px-2.5 text-[11px] text-[color:var(--muted)] empty:hidden">
        {constraints}
        {invalid ? (
          <span className="block text-danger">
            <Trans>Enter a valid value.</Trans>
          </span>
        ) : null}
      </p>
    </div>
  );
}
