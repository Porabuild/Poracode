import type { JsonValue } from "@opencode/client";
import {
  commandExecutionPayloadSchema,
  fileChangePayloadSchema,
  planItemPayloadSchema,
  toolCallPayloadSchema,
  webSearchPayloadSchema,
} from "@/shared/contracts/runtimeEvent";
import { z } from "zod";
import { subSessionId } from "./ids";

export type JsonRecord = Record<string, JsonValue>;
export type ToolDefinition = {
  name: string;
  input: JsonRecord;
  metadata: JsonRecord;
  output: string;
};

const recordSchema = z.record(z.string(), z.unknown());
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);
const jsonRecordSchema = z.record(z.string(), jsonValueSchema);

/**
 * Tool metadata key holding the runtime item a tool part was mapped from. The
 * transcript plugin renders it through the desktop's presentation modules,
 * which need the canonical item rather than its OpenCode projection.
 */
export const PORACODE_ITEM_KEY = "poracode";
export type PoracodeItemMetadata = { type: string; payload: JsonValue };

const PAYLOAD_STRING_LIMIT = 64 * 1024;
const PAYLOAD_ARRAY_LIMIT = 500;
const PAYLOAD_DEPTH_LIMIT = 16;

export function mapToolItem(
  itemType: string,
  payload: unknown,
  context?: { threadId: string; itemId: string },
): ToolDefinition | undefined {
  const definition = mapToolDefinition(itemType, payload, context);
  if (!definition) return;
  const item: PoracodeItemMetadata = {
    type: itemType,
    payload: boundedPayload(payload, 0) ?? null,
  };
  return { ...definition, metadata: { ...definition.metadata, [PORACODE_ITEM_KEY]: item } };
}

/** Shallow merge matching the desktop reducer's handling of item updates. */
export function mergePayload(previous: unknown, next: unknown) {
  if (next === undefined) return previous;
  if (!previous || typeof previous !== "object" || !next || typeof next !== "object") return next;
  return { ...(previous as Record<string, unknown>), ...(next as Record<string, unknown>) };
}

// Inline image data URLs stay out: the transcript renders tool rows, not their images.
function boundedPayload(value: unknown, depth: number): JsonValue | undefined {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string")
    return value.length > PAYLOAD_STRING_LIMIT ? value.slice(0, PAYLOAD_STRING_LIMIT) : value;
  if (depth >= PAYLOAD_DEPTH_LIMIT || typeof value !== "object") return undefined;
  if (Array.isArray(value))
    return value
      .slice(0, PAYLOAD_ARRAY_LIMIT)
      .map((entry) => boundedPayload(entry, depth + 1) ?? null);
  const result: Record<string, JsonValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (depth === 0 && key === "images") continue;
    const next = boundedPayload(entry, depth + 1);
    if (next !== undefined) result[key] = next;
  }
  return result;
}

function mapToolDefinition(
  itemType: string,
  payload: unknown,
  context?: { threadId: string; itemId: string },
): ToolDefinition | undefined {
  const value = record(payload);
  if (itemType === "command_execution") {
    const parsed = commandExecutionPayloadSchema.safeParse(payload);
    if (!parsed.success) return;
    return {
      name: "bash",
      input: jsonRecord({
        command: parsed.data.command,
        description: parsed.data.command,
      }),
      metadata: jsonRecord({
        exit: parsed.data.exitCode ?? null,
        cwd: parsed.data.cwd ?? "",
      }),
      output: bounded(parsed.data.errorMessage ?? ""),
    };
  }
  if (itemType === "file_change") {
    const parsed = fileChangePayloadSchema.safeParse(payload);
    if (!parsed.success) return;
    const status =
      parsed.data.changeKind === "create"
        ? "added"
        : parsed.data.changeKind === "delete"
          ? "deleted"
          : "modified";
    return {
      name: parsed.data.changeKind === "create" ? "write" : "edit",
      input: jsonRecord({ filePath: parsed.data.path }),
      metadata: jsonRecord({
        diff: value.diff ?? "",
        files: [
          {
            file: parsed.data.path,
            status,
            patch: value.diff ?? "",
          },
        ],
      }),
      output: bounded(String(value.output ?? "")),
    };
  }
  if (itemType === "tool_call") {
    const parsed = toolCallPayloadSchema.safeParse(payload);
    if (!parsed.success) return;
    const args = jsonRecord(parsed.data.args);
    if (parsed.data.isSubAgent) {
      return {
        name: "task",
        input: jsonRecord({
          description: parsed.data.title ?? parsed.data.name,
          subagent_type: parsed.data.subAgentType ?? "agent",
          prompt: args.prompt ?? "",
        }),
        metadata: jsonRecord(
          context ? { sessionID: subSessionId(context.threadId, context.itemId) } : {},
        ),
        output: bounded(String(parsed.data.result ?? "")),
      };
    }
    const name =
      parsed.data.kind === "read"
        ? "read"
        : parsed.data.kind === "search"
          ? typeof args.pattern === "string"
            ? "glob"
            : "grep"
          : parsed.data.kind === "fetch"
            ? "webfetch"
            : parsed.data.kind === "execute"
              ? "bash"
              : parsed.data.kind === "edit" ||
                  parsed.data.kind === "delete" ||
                  parsed.data.kind === "move"
                ? "edit"
                : parsed.data.name;
    const input =
      name === "read" || name === "write" || name === "edit"
        ? jsonRecord({ ...args, filePath: parsed.data.locations?.[0]?.path ?? args.path })
        : name === "webfetch"
          ? jsonRecord({ ...args, url: args.url })
          : name === "bash"
            ? jsonRecord({ ...args, command: args.command })
            : args;
    return {
      name:
        parsed.data.isCrossagent === true && parsed.data.subAgentType
          ? `${parsed.data.subAgentType} · ${name}`
          : name,
      input,
      metadata: jsonRecord({}),
      output: bounded(String(parsed.data.result ?? "")),
    };
  }
  if (itemType === "mcp_tool_call" || itemType === "dynamic_tool_call") {
    const serverId = stringValue(value.serverId);
    const name = stringValue(value.name) || itemType;
    return {
      name: serverId ? `${serverId}_${name}` : name,
      input: jsonRecord(value.args),
      metadata: jsonRecord({}),
      output: bounded(stringValue(value.result)),
    };
  }
  if (itemType === "web_search") {
    const parsed = webSearchPayloadSchema.safeParse(payload);
    if (!parsed.success) return;
    return {
      name: "websearch",
      input: jsonRecord({ query: parsed.data.query }),
      metadata: jsonRecord({}),
      output: bounded(stringValue(value.result)),
    };
  }
  if (itemType === "image_view") {
    return {
      name: "read",
      input: jsonRecord({ filePath: value.path }),
      metadata: jsonRecord({}),
      output: "",
    };
  }
  if (itemType === "plan") {
    const parsed = planItemPayloadSchema.safeParse(payload);
    if (!parsed.success) return;
    return {
      name: "todowrite",
      input: jsonRecord({
        todos: parsed.data.steps.map((step) => ({ content: step.step, status: step.status })),
      }),
      metadata: jsonRecord({}),
      output: "",
    };
  }
  if (itemType === "question_answer") {
    // Keeps transcript order: the plugin renders the Poracode item metadata,
    // never this generic tool row.
    return {
      name: "poracode_question_answer",
      input: jsonRecord(value),
      metadata: jsonRecord({}),
      output: "",
    };
  }
  return;
}

export function jsonRecord(value: unknown): JsonRecord {
  const parsed = jsonRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

export function record(value: unknown) {
  const parsed = recordSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

export function bounded(value: string) {
  return value.length <= 64 * 1024 ? value : value.slice(-64 * 1024);
}

export function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}
