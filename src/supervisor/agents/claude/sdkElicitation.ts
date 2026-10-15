import type { ElicitationRequest, ElicitationResult } from "@anthropic-ai/claude-agent-sdk";
import type { RuntimeEvent } from "@/shared/contracts";
import {
  emptyStructuredValue,
  validStructuredValue,
  type StructuredFormProperty,
  type StructuredFormValue,
} from "@/shared/structuredForm";

function formProperties(request: ElicitationRequest): Record<string, StructuredFormProperty> {
  return (request.requestedSchema?.properties ?? {}) as Record<string, StructuredFormProperty>;
}

export function mapClaudeElicitationRequest(
  threadId: string,
  requestId: string,
  request: ElicitationRequest,
): RuntimeEvent | undefined {
  const mode = request.mode ?? "form";
  if (mode !== "form" && mode !== "url") return undefined;
  if (mode === "url") {
    if (!request.elicitationId || !request.url || !URL.canParse(request.url)) return undefined;
    if (!["http:", "https:"].includes(new URL(request.url).protocol)) return undefined;
  } else {
    const schema = request.requestedSchema;
    if (!schema || (schema.type !== undefined && schema.type !== "object")) return undefined;
    if (
      schema.properties !== undefined &&
      (!schema.properties ||
        typeof schema.properties !== "object" ||
        Array.isArray(schema.properties))
    )
      return undefined;
    if (
      Object.values(formProperties(request)).some(
        (property) =>
          !property || !["string", "number", "integer", "boolean", "array"].includes(property.type),
      )
    )
      return undefined;
  }
  return {
    type: "request.opened",
    threadId,
    requestId,
    requestType: "tool_user_input",
    payload: {
      summary: request.title || request.message,
      details: { mcpElicitation: { ...request, mode } },
    },
  };
}

/** Validate paired-client form replies before allowing the MCP request to continue. */
export function normalizeClaudeElicitationResponse(
  request: ElicitationRequest,
  response: unknown,
): ElicitationResult {
  if (!response || typeof response !== "object") return { action: "cancel" };
  const obj = response as Record<string, unknown>;
  if (obj.action === "decline") return { action: "decline" };
  if (obj.action !== "accept") return { action: "cancel" };
  if (request.mode === "url") return { action: "accept" };
  const source = obj.content;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("MCP form response is missing its content.");
  }
  const required = new Set(
    Array.isArray(request.requestedSchema?.required) ? request.requestedSchema.required : [],
  );
  const content: Array<[string, StructuredFormValue]> = [];
  for (const [key, property] of Object.entries(formProperties(request))) {
    const value = Object.hasOwn(source, key) ? (source as Record<string, unknown>)[key] : undefined;
    if (!required.has(key) && emptyStructuredValue(value as StructuredFormValue | undefined))
      continue;
    const isValue =
      typeof value === "string" ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value)) ||
      (Array.isArray(value) && value.every((entry) => typeof entry === "string"));
    if (
      (value !== undefined && !isValue) ||
      !validStructuredValue(property, value as StructuredFormValue | undefined, required.has(key))
    ) {
      throw new Error("MCP form response contains an invalid value.");
    }
    if (isValue) content.push([key, value as StructuredFormValue]);
  }
  return { action: "accept", content: Object.fromEntries(content) };
}
