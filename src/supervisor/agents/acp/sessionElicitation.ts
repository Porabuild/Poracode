import {
  CreateElicitationRequest as AcpCreateElicitationRequest,
  type CreateElicitationRequest,
  type CreateElicitationResponse,
  type ElicitationContentValue,
  type ElicitationPropertySchema,
} from "@agentclientprotocol/sdk";
import type { RuntimeEvent } from "@/shared/contracts";
import {
  buildQuestionAnswerEvents,
  type QuestionAnswerSourceOption,
  type QuestionAnswerSourceQuestion,
} from "../questionAnswerEvents";

export function buildAcpElicitationAnswerEvents(input: {
  threadId: string;
  itemId: string;
  request: CreateElicitationRequest;
  response: unknown;
}): RuntimeEvent[] {
  if (input.request.mode !== "form" || !isAcpAcceptResponse(input.response)) return [];
  return buildQuestionAnswerEvents({
    threadId: input.threadId,
    itemId: input.itemId,
    questions: acpFormQuestionSources(input.request),
    answers: acpResponseAnswers(input.response),
  });
}

export function normalizeAcpElicitationResponse(
  response: unknown,
  request: CreateElicitationRequest,
): CreateElicitationResponse {
  if (!response || typeof response !== "object") return { action: "cancel" };
  const obj = response as Record<string, unknown>;
  const action = obj.action;
  const meta = readAcpResponseMeta(obj);
  if (action === "decline") return { action: "decline", ...meta };
  if (action !== "accept") return { action: "cancel", ...meta };

  const content = AcpCreateElicitationRequest.isForm(request)
    ? normalizeAcpElicitationContent(obj.content, request.requestedSchema.properties ?? {})
    : undefined;
  return {
    action: "accept",
    ...(content !== undefined ? { content } : {}),
    ...meta,
  };
}

function isAcpAcceptResponse(response: unknown): boolean {
  if (!response || typeof response !== "object") return false;
  return (response as { action?: unknown }).action === "accept";
}

function acpFormQuestionSources(request: CreateElicitationRequest): QuestionAnswerSourceQuestion[] {
  if (!AcpCreateElicitationRequest.isForm(request)) return [];
  const properties = request.requestedSchema.properties ?? {};
  return Object.entries(properties).map(([key, schema]) => {
    const title = readAcpStringField(schema, "title");
    const description = readAcpStringField(schema, "description");
    return {
      keys: [key],
      header: title ?? key,
      question: description ?? "",
      options: acpSchemaOptions(schema),
    };
  });
}

function acpSchemaOptions(schema: ElicitationPropertySchema): QuestionAnswerSourceOption[] {
  const direct = readEnumLikeOptions(schema as Record<string, unknown>);
  if (direct.length > 0) return direct;
  if (schema.type === "array") {
    const items = (schema as { items?: unknown }).items;
    if (items && typeof items === "object") {
      return readEnumLikeOptions(items as Record<string, unknown>);
    }
  }
  return [];
}

function readEnumLikeOptions(source: Record<string, unknown>): QuestionAnswerSourceOption[] {
  if (Array.isArray(source.oneOf)) {
    return source.oneOf.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const o = entry as { const?: unknown; title?: unknown };
      if (typeof o.const !== "string") return [];
      return [{ optionId: o.const, label: typeof o.title === "string" ? o.title : o.const }];
    });
  }
  if (Array.isArray(source.enum)) {
    const names = Array.isArray(source.enumNames) ? source.enumNames : [];
    return source.enum.flatMap((value, index) => {
      if (typeof value !== "string") return [];
      const name = names[index];
      return [{ optionId: value, label: typeof name === "string" ? name : value }];
    });
  }
  return [];
}

function acpResponseAnswers(response: unknown): Record<string, unknown> {
  if (!response || typeof response !== "object") return {};
  const content = (response as { content?: unknown }).content;
  if (!content || typeof content !== "object" || Array.isArray(content)) return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(content as Record<string, unknown>)) {
    if (typeof value === "string" || Array.isArray(value)) {
      result[key] = value;
    } else if (typeof value === "boolean") {
      result[key] = value ? "Yes" : "No";
    } else if (typeof value === "number" && Number.isFinite(value)) {
      result[key] = String(value);
    }
  }
  return result;
}

function readAcpStringField(schema: unknown, field: string): string | undefined {
  if (!schema || typeof schema !== "object") return undefined;
  const value = (schema as Record<string, unknown>)[field];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readAcpResponseMeta(
  response: Record<string, unknown>,
): { _meta: Record<string, unknown> | null } | {} {
  if (!Object.hasOwn(response, "_meta")) return {};
  const meta = response._meta;
  if (meta === null) return { _meta: null };
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
  return { _meta: meta as Record<string, unknown> };
}

function normalizeAcpElicitationContent(
  content: unknown,
  properties: Record<string, ElicitationPropertySchema>,
): Record<string, ElicitationContentValue> | undefined {
  if (!content || typeof content !== "object" || Array.isArray(content)) return undefined;
  const source = content as Record<string, unknown>;
  const normalized: Record<string, ElicitationContentValue> = {};
  for (const [key, schema] of Object.entries(properties)) {
    if (!Object.hasOwn(source, key)) continue;
    const value = source[key];
    if (!schema || typeof schema !== "object" || !("type" in schema)) continue;
    switch (schema.type) {
      case "string":
        if (typeof value === "string") normalized[key] = value;
        break;
      case "integer":
      case "number":
        if (typeof value === "number" && Number.isFinite(value)) normalized[key] = value;
        break;
      case "boolean":
        if (typeof value === "boolean") normalized[key] = value;
        break;
      case "array":
        if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
          normalized[key] = value;
        }
        break;
      default:
        break;
    }
  }
  return normalized;
}
