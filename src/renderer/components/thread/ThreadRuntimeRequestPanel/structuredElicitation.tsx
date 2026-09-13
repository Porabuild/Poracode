import { useId, useState, type ReactNode } from "react";
import { StructuredCustomValues } from "./StructuredCustomValues";
import { Button, Input } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { RequestOutcome } from "@/shared/contracts";
import { openExternalWithFeedback } from "@/renderer/utils/openExternal";

import {
  emptyStructuredValue,
  initialStructuredFormValues,
  structuredFieldVisible,
  structuredFormOptions,
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
  onSubmit: (response: unknown, outcome: RequestOutcome) => void;
}) {
  const { params, isDisabled, onSubmit } = props;
  const { t } = useLingui();
  const formId = useId();
  const [formValues, setFormValues] = useState<Record<string, StructuredFormValue>>(() =>
    params.mode === "form" ? initialStructuredFormValues(params.requestedSchema.properties) : {},
  );
  const requiredKeys = params.mode === "form" ? (params.requestedSchema.required ?? []) : [];
  const fields =
    params.mode === "form"
      ? Object.entries(params.requestedSchema.properties).filter(([, property]) =>
          structuredFieldVisible(property, formValues),
        )
      : [];
  const hasMissing = fields.some(
    ([key, property]) =>
      !validStructuredValue(property, formValues[key], requiredKeys.includes(key)),
  );

  function submitAccept() {
    if (isDisabled || hasMissing) return;
    const content = Object.fromEntries(
      fields
        .filter(([key]) => requiredKeys.includes(key) || !emptyStructuredValue(formValues[key]))
        .map(([key]) => [key, formValues[key]]),
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
    <div className="space-y-2 border-t border-[color:var(--border)] px-2 py-1.5">
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
          {fields.map(([key, property]) => {
            const label = property.title ?? key;
            const description = property.description ?? "";
            const enumOpts = structuredFormOptions(property);
            // Array fields read their current selection in three places below;
            // narrow once here (updates still read `cur[key]` functionally).
            const selectedValues = Array.isArray(formValues[key])
              ? (formValues[key] as string[])
              : [];
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
            return (
              <div
                key={key}
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
                      onChange={(e) =>
                        setFormValues((cur) => ({ ...cur, [key]: e.target.checked }))
                      }
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
                    {enumOpts.map((option) => {
                      const checked = selectedValues.includes(option.id);
                      return (
                        <label
                          key={option.id}
                          className="flex items-center gap-2 text-[11px] text-foreground"
                        >
                          <input
                            type="checkbox"
                            disabled={isDisabled}
                            className="size-3.5"
                            checked={checked}
                            onChange={(e) =>
                              setFormValues((cur) => {
                                const next = Array.isArray(cur[key])
                                  ? [...(cur[key] as string[])]
                                  : [];
                                return {
                                  ...cur,
                                  [key]: e.target.checked
                                    ? [...next, option.id]
                                    : next.filter((v) => v !== option.id),
                                };
                              })
                            }
                          />
                          <span>{option.label}</span>
                        </label>
                      );
                    })}
                    {property.allowCustom ? (
                      <StructuredCustomValues
                        isDisabled={isDisabled}
                        atLimit={
                          property.maxItems !== undefined &&
                          selectedValues.length >= property.maxItems
                        }
                        values={selectedValues.filter(
                          (value) => !enumOpts.some(({ id }) => id === value),
                        )}
                        onChange={(custom) =>
                          setFormValues((current) => ({
                            ...current,
                            [key]: [
                              ...(Array.isArray(current[key])
                                ? (current[key] as string[])
                                : []
                              ).filter((value) => enumOpts.some(({ id }) => id === value)),
                              ...custom,
                            ],
                          }))
                        }
                      />
                    ) : null}
                  </div>
                ) : enumOpts.length > 0 && !property.allowCustom ? (
                  <select
                    aria-label={label}
                    aria-invalid={invalid}
                    aria-describedby={errorId}
                    disabled={isDisabled}
                    value={String(formValues[key] ?? "")}
                    onChange={(e) => setFormValues((cur) => ({ ...cur, [key]: e.target.value }))}
                    className="w-full rounded border border-[color:var(--border)] bg-[var(--composer-surface)] px-2 py-1 text-[11px] text-foreground outline-none"
                  >
                    <option value="">—</option>
                    {enumOpts.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <datalist id={`${formId}-${key}`}>
                      {enumOpts.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </datalist>
                    <Input
                      {...(enumOpts.length > 0 ? { list: `${formId}-${key}` } : {})}
                      aria-label={label}
                      aria-invalid={invalid}
                      aria-describedby={errorId}
                      {...(property.placeholder !== undefined
                        ? { placeholder: property.placeholder }
                        : {})}
                      minLength={property.minLength}
                      maxLength={property.maxLength}
                      type="text"
                      disabled={isDisabled}
                      value={String(formValues[key] ?? "")}
                      onChange={(e) => setFormValues((cur) => ({ ...cur, [key]: e.target.value }))}
                      className="w-full rounded border border-[color:var(--border)] bg-[var(--composer-surface)] px-2 py-1 text-[11px] text-foreground outline-none"
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-1 pt-1">
        <Button
          isDisabled={isDisabled}
          size="sm"
          variant="ghost"
          className="text-muted"
          onPress={() => onSubmit({ action: "cancel" }, "cancelled")}
        >
          <Trans>Cancel</Trans>
        </Button>
        <Button
          isDisabled={isDisabled}
          size="sm"
          variant="ghost"
          onPress={() => onSubmit({ action: "decline" }, "declined")}
        >
          <Trans>Decline</Trans>
        </Button>
        <Button
          isDisabled={isDisabled || hasMissing}
          size="sm"
          variant="secondary"
          onPress={submitAccept}
        >
          {params.mode === "url" ? t`Continue` : t`Submit`}
        </Button>
      </div>
    </div>
  );
}
