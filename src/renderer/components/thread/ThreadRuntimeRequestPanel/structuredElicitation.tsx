import { useState } from "react";
import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { RequestOutcome } from "@/shared/contracts";

type StructuredElicitationSchemaProperty =
  | {
      type: "string";
      title?: string;
      description?: string;
      default?: string;
      enum?: string[];
      enumNames?: string[];
      oneOf?: Array<{ const: string; title?: string }>;
    }
  | {
      type: "integer" | "number";
      title?: string;
      description?: string;
      default?: number;
    }
  | {
      type: "boolean";
      title?: string;
      description?: string;
      default?: boolean;
    }
  | {
      type: "array";
      title?: string;
      description?: string;
      default?: string[];
      items?: {
        enum?: string[];
        enumNames?: string[];
        oneOf?: Array<{ const: string; title?: string }>;
      };
    };

export type StructuredElicitationParams =
  | {
      mode: "form";
      message: string;
      sourceText: string;
      _meta?: unknown;
      requestedSchema: {
        type: "object";
        properties: Record<string, StructuredElicitationSchemaProperty>;
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
    requestedSchema: {
      type: "object",
      properties: (schemaObj.properties ?? {}) as Record<
        string,
        StructuredElicitationSchemaProperty
      >,
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

type StructuredFormValue = boolean | number | string | string[];

function getStructuredElicitationEnumOptions(
  property: StructuredElicitationSchemaProperty,
): { id: string; label: string }[] {
  if ("oneOf" in property && Array.isArray(property.oneOf)) {
    return property.oneOf.map((o) => ({ id: o.const, label: o.title ?? o.const }));
  }
  if ("enum" in property && Array.isArray(property.enum)) {
    const names =
      "enumNames" in property && Array.isArray(property.enumNames) ? property.enumNames : [];
    return property.enum.map((v, i) => ({ id: v, label: names[i] ?? v }));
  }
  if (property.type === "array" && property.items) {
    if (Array.isArray(property.items.oneOf)) {
      return property.items.oneOf.map((o) => ({ id: o.const, label: o.title ?? o.const }));
    }
    if (Array.isArray(property.items.enum)) {
      const names = Array.isArray(property.items.enumNames) ? property.items.enumNames : [];
      return property.items.enum.map((v, i) => ({ id: v, label: names[i] ?? v }));
    }
  }
  return [];
}

function getInitialStructuredFormValues(schema: {
  properties: Record<string, StructuredElicitationSchemaProperty>;
}): Record<string, StructuredFormValue> {
  const initial: Record<string, StructuredFormValue> = {};
  for (const [key, property] of Object.entries(schema.properties)) {
    if (property.type === "boolean") initial[key] = property.default ?? false;
    else if (property.type === "integer" || property.type === "number")
      initial[key] = property.default ?? "";
    else if (property.type === "array") initial[key] = property.default ?? [];
    else initial[key] = property.default ?? "";
  }
  return initial;
}

function isEmptyRequiredValue(value: StructuredFormValue | undefined): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function StructuredElicitationForm(props: {
  params: StructuredElicitationParams;
  isDisabled: boolean;
  onSubmit: (response: unknown, outcome: RequestOutcome) => void;
}) {
  const { params, isDisabled, onSubmit } = props;
  const { t } = useLingui();
  const [formValues, setFormValues] = useState<Record<string, StructuredFormValue>>(() =>
    params.mode === "form" ? getInitialStructuredFormValues(params.requestedSchema) : {},
  );
  const requiredKeys = params.mode === "form" ? (params.requestedSchema.required ?? []) : [];
  const hasMissing =
    params.mode === "form" && requiredKeys.some((key) => isEmptyRequiredValue(formValues[key]));

  function submitAccept() {
    onSubmit(
      {
        action: "accept",
        ...(params.mode === "form" ? { content: formValues } : {}),
        ...(Object.hasOwn(params, "_meta") ? { _meta: params._meta } : {}),
      },
      "answered",
    );
  }

  return (
    <div className="space-y-2 border-t border-[color:var(--border)] px-2 py-1.5">
      {params.mode === "url" ? (
        <a
          className="text-xs font-medium text-[color:var(--accent)] underline-offset-4 hover:underline"
          href={params.url}
          rel="noreferrer"
          target="_blank"
        >
          <Trans>Open required URL</Trans>
        </a>
      ) : (
        <div className="space-y-2">
          {Object.entries(params.requestedSchema.properties).map(([key, property]) => {
            const label = property.title ?? key;
            const description = property.description ?? "";
            const enumOpts = getStructuredElicitationEnumOptions(property);
            const isRequired = requiredKeys.includes(key);
            return (
              <div key={key} className="space-y-1">
                <div>
                  <p className="text-[11px] font-medium text-foreground">
                    {label}
                    {isRequired ? <span className="text-warning"> *</span> : null}
                  </p>
                  {description ? (
                    <p className="text-[11px] text-[color:var(--muted)]">{description}</p>
                  ) : null}
                </div>
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
                  <input
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
                      const current = Array.isArray(formValues[key])
                        ? (formValues[key] as string[])
                        : [];
                      const checked = current.includes(option.id);
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
                  </div>
                ) : enumOpts.length > 0 ? (
                  <select
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
                  <input
                    type="text"
                    disabled={isDisabled}
                    value={String(formValues[key] ?? "")}
                    onChange={(e) => setFormValues((cur) => ({ ...cur, [key]: e.target.value }))}
                    className="w-full rounded border border-[color:var(--border)] bg-[var(--composer-surface)] px-2 py-1 text-[11px] text-foreground outline-none"
                  />
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
