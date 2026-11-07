import {
  emptyStructuredValue,
  structuredFieldVisible,
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
  if (mcp && typeof mcp === "object")
    return parseStructuredElicitationCandidate(mcp, getMcpElicitationSourceText);
  const acp = obj.acpElicitation;
  if (acp && typeof acp === "object")
    return parseStructuredElicitationCandidate(acp, getAcpElicitationSourceText);
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
  )
    return undefined;
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

export function buildStructuredElicitationResponse(
  params: StructuredElicitationParams,
  values: Record<string, StructuredFormValue>,
): unknown {
  const content =
    params.mode !== "form"
      ? undefined
      : Object.fromEntries(
          Object.entries(params.requestedSchema.properties)
            .filter(([, property]) => structuredFieldVisible(property, values))
            .filter(
              ([key]) =>
                (params.requestedSchema.required ?? []).includes(key) ||
                !emptyStructuredValue(values[key]),
            )
            .map(([key]) => [key, values[key]]),
        );
  return {
    action: "accept",
    ...(content !== undefined ? { content } : {}),
    ...(Object.hasOwn(params, "_meta") ? { _meta: params._meta } : {}),
  };
}

export function buildStructuredElicitationDismissResponse() {
  return { action: "decline" };
}
