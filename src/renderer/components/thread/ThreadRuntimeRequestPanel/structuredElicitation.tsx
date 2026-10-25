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
  emptyStructuredValue,
  initialStructuredFormValues,
  structuredFieldVisible,
  validStructuredValue,
  type StructuredFormProperty,
  type StructuredFormValue,
} from "@/shared/structuredForm";

export type StructuredElicitationParams =
  | {
      mode: "form";
      message: string;
      sourceText: string;
      _meta?: unknown;
      links?: Array<{ url: string; title: string; description?: string }>;
      requestedSchema: {
        type: "object";
        properties: Record<string, StructuredFormProperty>;
        required?: string[];
      };
    }
  | {
      mode: "url";
      message: string;
      sourceText: string;
      url: string;
      elicitationId: string;
      _meta?: unknown;
    };

export function asStructuredElicitationDetails(
  value: unknown,
): StructuredElicitationParams | undefined {
  if (!value || typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  const structured = obj.structuredElicitation;
  if (structured && typeof structured === "object") {
    return parseStructuredElicitationCandidate(structured, (source) =>
      typeof source.sourceText === "string" ? source.sourceText : undefined,
    );
  }
  const mcp = obj.mcpElicitation;
  if (mcp && typeof mcp === "object") {
    return parseStructuredElicitationCandidate(mcp, getMcpElicitationSourceText);
  }
  const acp = obj.acpElicitation;
  if (acp && typeof acp === "object") {
    return parseStructuredElicitationCandidate(acp, getAcpElicitationSourceText);
  }
  return parseStructuredElicitationCandidate(value, getMcpElicitationSourceText);
}

function parseStructuredElicitationCandidate(
  candidate: unknown,
  getSourceText: (obj: Record<string, unknown>) => string | undefined,
): StructuredElicitationParams | undefined {
  if (!candidate || typeof candidate !== "object") return undefined;
  const obj = candidate as Record<string, unknown>;
  const mode = obj.mode;
  if (mode !== "form" && mode !== "url") return undefined;
  if (typeof obj.message !== "string") return undefined;
  const sourceText = getSourceText(obj);
  if (!sourceText) return undefined;
  if (mode === "url") {
    if (typeof obj.url !== "string" || typeof obj.elicitationId !== "string") return undefined;
    if (!isHttpUrl(obj.url)) return undefined;
    return {
      mode: "url",
      message: obj.message,
      sourceText,
      url: obj.url,
      elicitationId: obj.elicitationId,
      ...(Object.hasOwn(obj, "_meta") ? { _meta: obj._meta } : {}),
    };
  }
  const schema = obj.requestedSchema;
  if (!schema || typeof schema !== "object") return undefined;
  const schemaObj = schema as Record<string, unknown>;
  if (
    (schemaObj.type !== undefined && schemaObj.type !== "object") ||
    (schemaObj.properties !== undefined && typeof schemaObj.properties !== "object")
  ) {
    return undefined;
  }
  const rawRequired = schemaObj.required;
  const required = Array.isArray(rawRequired)
    ? rawRequired.filter((key): key is string => typeof key === "string")
    : [];
  return {
    mode: "form",
    message: obj.message,
    sourceText,
    ...(Array.isArray(obj.links)
      ? {
          links: obj.links.filter(
            (link): link is { url: string; title: string; description?: string } =>
              !!link &&
              typeof link === "object" &&
              typeof link.url === "string" &&
              typeof link.title === "string" &&
              isHttpUrl(link.url),
          ),
        }
      : {}),
    requestedSchema: {
      type: "object",
      properties: (schemaObj.properties ?? {}) as Record<string, StructuredFormProperty>,
      ...(required.length > 0 ? { required } : {}),
    },
    ...(Object.hasOwn(obj, "_meta") ? { _meta: obj._meta } : {}),
  };
}

function getMcpElicitationSourceText(obj: Record<string, unknown>): string | undefined {
  return typeof obj.serverName === "string" && obj.serverName.length > 0
    ? `MCP server "${obj.serverName}"`
    : undefined;
}

function getAcpElicitationSourceText(obj: Record<string, unknown>): string {
  const agentName =
    typeof obj.agentName === "string" && obj.agentName.length > 0 ? obj.agentName : undefined;
  return agentName ? `ACP agent "${agentName}"` : "ACP agent";
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

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
    const content = Object.fromEntries(
      submittedFields
        .filter(([key]) => requiredKeys.includes(key) || !emptyStructuredValue(values[key]))
        .map(([key]) => [key, values[key]]),
    );
    onSubmit(
      {
        action: "accept",
        ...(params.mode === "form" ? { content } : {}),
        ...(Object.hasOwn(params, "_meta") ? { _meta: params._meta } : {}),
      },
      "answered",
    );
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
          onDecline={() => onSubmit({ action: "decline" }, "declined")}
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
