import type { Dispatch, SetStateAction } from "react";
import { Input } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  emptyStructuredValue,
  structuredFormOptions,
  validStructuredValue,
  type StructuredFormProperty,
  type StructuredFormValue,
} from "@/shared/structuredForm";
import { StructuredCustomValues } from "./StructuredCustomValues";
import { QuestionOptionRow } from "./parts/QuestionOptionRow";
import { isQuestionStepEnter } from "./QuestionStepForm";

export function StructuredElicitationField(props: {
  fieldKey: string;
  property: StructuredFormProperty;
  formId: string;
  formValues: Record<string, StructuredFormValue>;
  requiredKeys: string[];
  isDisabled: boolean;
  setFormValues: Dispatch<SetStateAction<Record<string, StructuredFormValue>>>;
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
    onSingleChoice,
  } = props;
  const { t } = useLingui();
  const label = property.title ?? key;
  const description = property.description ?? "";
  const enumOpts = structuredFormOptions(property);
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
  const textInput = (
    <Input
      aria-label={label}
      aria-invalid={invalid}
      aria-describedby={errorId}
      {...(property.placeholder !== undefined ? { placeholder: property.placeholder } : {})}
      minLength={property.minLength}
      maxLength={property.maxLength}
      type="text"
      disabled={isDisabled}
      value={String(formValues[key] ?? "")}
      onChange={(e) => setFormValues((cur) => ({ ...cur, [key]: e.target.value }))}
      className="w-full rounded border border-[color:var(--border)] bg-[var(--composer-surface)] px-2 py-1 text-[11px] text-foreground outline-none"
    />
  );
  return (
    <div
      data-question-step
      className="space-y-1"
      role="group"
      aria-label={label}
      aria-describedby={errorId}
    >
      <div>
        <p className="text-[11px] font-medium text-foreground">
          {label}
          {isRequired ? <span className="text-warning"> *</span> : null}
        </p>
        {description ? (
          <p className="text-[11px] text-[color:var(--muted)]">{description}</p>
        ) : null}
      </div>
      <p id={errorId} className="text-[11px] text-muted">
        {constraints}
        {invalid ? (
          <span className="block text-danger">
            <Trans>Enter a valid value.</Trans>
          </span>
        ) : null}
      </p>
      {property.type === "boolean" ? (
        <label className="flex items-center gap-2 text-[11px] text-foreground">
          <input
            type="checkbox"
            className="size-3.5"
            disabled={isDisabled}
            checked={Boolean(formValues[key])}
            onChange={(e) => setFormValues((cur) => ({ ...cur, [key]: e.target.checked }))}
          />
          <span>{label}</span>
        </label>
      ) : property.type === "integer" || property.type === "number" ? (
        <Input
          aria-label={label}
          aria-invalid={invalid}
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
          className="w-full rounded border border-[color:var(--border)] bg-[var(--composer-surface)] px-2 py-1 text-[11px] text-foreground outline-none"
        />
      ) : property.type === "array" ? (
        <div className="space-y-0.5">
          {enumOpts.map((option, index) => {
            const checked = selectedValues.includes(option.id);
            return (
              <label
                key={option.id}
                className="flex items-center gap-2 text-[11px] text-foreground"
              >
                <input
                  type="checkbox"
                  data-question-option
                  aria-label={option.label}
                  {...(index < 9 ? { "aria-keyshortcuts": String(index + 1) } : {})}
                  disabled={isDisabled}
                  className="size-3.5"
                  checked={checked}
                  onChange={(e) =>
                    setFormValues((cur) => {
                      const next = Array.isArray(cur[key]) ? [...(cur[key] as string[])] : [];
                      return {
                        ...cur,
                        [key]: e.target.checked
                          ? [...next, option.id]
                          : next.filter((v) => v !== option.id),
                      };
                    })
                  }
                />
                <span aria-hidden="true" className="text-muted">{`${index + 1}.`}</span>
                <span>{option.label}</span>
              </label>
            );
          })}
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
        <>
          <div
            role="listbox"
            aria-label={label}
            aria-describedby={errorId}
            aria-invalid={invalid}
            className="space-y-0.5"
          >
            {enumOpts.map((option, index) => (
              <QuestionOptionRow
                key={option.id}
                index={index}
                option={{ optionId: option.id, label: option.label }}
                isDisabled={isDisabled}
                selected={formValues[key] === option.id}
                onClick={() => {
                  setFormValues((cur) => ({
                    ...cur,
                    [key]: !isRequired && cur[key] === option.id ? "" : option.id,
                  }));
                  onSingleChoice(!isRequired && formValues[key] === option.id ? "" : option.id);
                }}
                onKeyDown={(event) => {
                  if (isDisabled || !isQuestionStepEnter(event)) return;
                  event.preventDefault();
                  event.stopPropagation();
                  setFormValues((cur) => ({ ...cur, [key]: option.id }));
                  onSingleChoice(option.id, true);
                }}
              />
            ))}
          </div>
          {property.allowCustom ? textInput : null}
        </>
      ) : (
        textInput
      )}
    </div>
  );
}
