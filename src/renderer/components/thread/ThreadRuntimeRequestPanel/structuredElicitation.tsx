import { useId, useState, type ReactNode } from "react";
import { StructuredElicitationField } from "./StructuredElicitationField";
import { QuestionStepForm } from "./QuestionStepForm";
import { QuestionFormActions } from "./parts/QuestionFormActions";
import { QuestionSwitcher } from "./parts/QuestionSwitcher";
import { Trans, useLingui } from "@lingui/react/macro";
import { Plug } from "lucide-react";
import { QuestionFormHeader } from "./parts/QuestionFormHeader";
import type { RequestOutcome } from "@/shared/contracts";
import { openExternalWithFeedback } from "@/renderer/utils/openExternal";
import {
  asStructuredElicitationDetails,
  buildStructuredElicitationDismissResponse,
  buildStructuredElicitationResponse,
  type StructuredElicitationParams,
} from "@/shared/runtimeRequestForms";
import {
  emptyStructuredValue,
  initialStructuredFormValues,
  structuredFieldVisible,
  validStructuredValue,
  type StructuredFormValue,
} from "@/shared/structuredForm";

export { asStructuredElicitationDetails };
export type { StructuredElicitationParams };

function ExternalElicitationLink(props: { href: string; className?: string; children: ReactNode }) {
  return (
    <a
      href={props.href}
      target="_blank"
      rel="noreferrer"
      {...(props.className ? { className: props.className } : {})}
      onClick={(event) => {
        event.preventDefault();
        openExternalWithFeedback(props.href);
      }}
    >
      {props.children}
    </a>
  );
}

export function StructuredElicitationForm(props: {
  params: StructuredElicitationParams;
  isDisabled: boolean;
  isPending?: boolean;
  onSubmit: (response: unknown, outcome: RequestOutcome) => void;
}) {
  const { params, isDisabled, onSubmit } = props;
  const { t } = useLingui();
  const formId = useId();
  const [formValues, setFormValues] = useState<Record<string, StructuredFormValue>>(() =>
    params.mode === "form" ? initialStructuredFormValues(params.requestedSchema.properties) : {},
  );
  const [activeFieldKey, setActiveFieldKey] = useState<string | null>(null);
  const [customAnswerFields, setCustomAnswerFields] = useState<Record<string, boolean>>({});
  const requiredKeys = params.mode === "form" ? (params.requestedSchema.required ?? []) : [];
  function visibleFields(values: Record<string, StructuredFormValue>) {
    return params.mode === "form"
      ? Object.entries(params.requestedSchema.properties).filter(([, property]) =>
          structuredFieldVisible(property, values),
        )
      : [];
  }
  const fields = visibleFields(formValues);
  const activeIndex = Math.max(
    0,
    fields.findIndex(([key]) => key === activeFieldKey),
  );
  const activeField = fields[activeIndex];
  const activeProperty = activeField?.[1];
  const steps = fields.map(([key, property]) => ({
    id: key,
    label: property.title ?? key,
    answered:
      !emptyStructuredValue(formValues[key]) &&
      validStructuredValue(property, formValues[key], requiredKeys.includes(key)),
  }));
  const title = activeProperty ? (activeProperty.title ?? activeField![0]) : params.message;
  const description = activeProperty?.description;
  // The server's request text says why it asks; keep it unless the field repeats it.
  const sourceLine =
    params.message && params.message !== title && params.message !== description
      ? `${params.sourceText} · ${params.message}`
      : params.sourceText;
  const canAdvance =
    !activeField ||
    validStructuredValue(
      activeField[1],
      formValues[activeField[0]],
      requiredKeys.includes(activeField[0]),
    );

  function advance(values = formValues) {
    if (params.mode !== "form") return;
    const visible = visibleFields(values);
    const index = Math.max(
      0,
      visible.findIndex(([key]) => key === activeField?.[0]),
    );
    setActiveFieldKey(visible[Math.min(index + 1, visible.length - 1)]?.[0] ?? null);
  }
  const hasMissing = fields.some(
    ([key, property]) =>
      !validStructuredValue(property, formValues[key], requiredKeys.includes(key)),
  );

  function submitAccept(values = formValues) {
    const submittedFields = visibleFields(values);
    if (
      isDisabled ||
      submittedFields.some(
        ([key, property]) =>
          !validStructuredValue(property, values[key], requiredKeys.includes(key)),
      )
    )
      return;
    onSubmit(buildStructuredElicitationResponse(params, values), "answered");
  }

  return (
    <QuestionStepForm
      id={formId}
      activeStep={activeField?.[0] ?? ""}
      isLastStep={activeIndex >= fields.length - 1}
      canAdvance={canAdvance}
      isDisabled={isDisabled}
      onAdvance={() => advance()}
      onSubmit={() => submitAccept()}
      header={
        <QuestionFormHeader
          icon={Plug}
          eyebrow={sourceLine}
          title={title}
          required={!!activeField && requiredKeys.includes(activeField[0])}
          description={description}
          hint={activeProperty?.type === "array" ? t`Select all that apply` : undefined}
          steps={
            steps.length > 1 ? (
              <QuestionSwitcher
                steps={steps}
                activeIndex={activeIndex}
                isDisabled={isDisabled}
                onSelect={(index) => setActiveFieldKey(fields[index]?.[0] ?? null)}
              />
            ) : undefined
          }
        />
      }
      footer={
        <QuestionFormActions
          formId={formId}
          isLastStep={params.mode === "form" && activeIndex >= fields.length - 1}
          canSubmit={activeIndex < fields.length - 1 ? canAdvance : !hasMissing}
          isDisabled={isDisabled}
          isPending={props.isPending === true}
          {...(params.mode === "form" && activeIndex < fields.length - 1 && !hasMissing
            ? { onSubmitEarly: () => submitAccept() }
            : {})}
          onDecline={() => onSubmit(buildStructuredElicitationDismissResponse(), "declined")}
        />
      }
    >
      {params.mode === "url" ? (
        <ExternalElicitationLink
          href={params.url}
          className="text-xs font-medium text-[color:var(--accent)] underline-offset-4 hover:underline"
        >
          <Trans>Open required URL</Trans>
        </ExternalElicitationLink>
      ) : (
        <div className="space-y-2">
          {params.links?.map((link, index) => (
            <ExternalElicitationLink
              key={`${link.url}-${index}`}
              href={link.url}
              className="block text-xs text-accent underline"
            >
              {link.title}
              {link.description ? (
                <span className="block text-[11px] text-[color:var(--muted)] no-underline">
                  {link.description}
                </span>
              ) : null}
            </ExternalElicitationLink>
          ))}
          {fields.slice(activeIndex, activeIndex + 1).map(([key, property]) => (
            <StructuredElicitationField
              key={key}
              fieldKey={key}
              property={property}
              formId={formId}
              formValues={formValues}
              requiredKeys={requiredKeys}
              isDisabled={isDisabled}
              isCustomAnswer={
                Object.hasOwn(customAnswerFields, key) ? customAnswerFields[key] : undefined
              }
              setFormValues={setFormValues}
              onCustomAnswer={(value) => {
                setCustomAnswerFields((current) => ({ ...current, [key]: true }));
                setFormValues((current) => ({ ...current, [key]: value }));
              }}
              onSingleChoice={(value, submitOnLast) => {
                setCustomAnswerFields((current) => ({ ...current, [key]: false }));
                if (validStructuredValue(property, value, requiredKeys.includes(key))) {
                  const values = { ...formValues, [key]: value };
                  const visible = visibleFields(values);
                  if (submitOnLast && visible.at(-1)?.[0] === key) submitAccept(values);
                  else advance(values);
                }
              }}
            />
          ))}
        </div>
      )}
    </QuestionStepForm>
  );
}
