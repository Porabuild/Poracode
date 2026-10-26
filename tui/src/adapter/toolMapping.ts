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

export function mapToolItem(
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
      name,
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
