import { Buffer } from "node:buffer";
import type {
  MessageListOutput,
  PromptFileAttachment,
  SessionMessageAssistant,
  SessionMessageAssistantReasoning,
  SessionMessageAssistantTool,
  SessionMessageIdle,
  SessionMessageInfo,
  SessionMessageSystem,
  SessionMessageSynthetic,
  SessionMessageUser,
  SessionStructuredError,
} from "@opencode/client";
import {
  errorItemPayloadSchema,
  goalItemPayloadSchema,
  messageItemPayloadSchema,
  providerHandoffItemPayloadSchema,
  questionAnswerItemPayloadSchema,
  reasoningItemPayloadSchema,
} from "@/shared/contracts/runtimeEvent";
import type { Thread } from "@/shared/contracts";
import type { PersistedRuntimeItem } from "@/shared/ipc/schemas";
import { z } from "zod";
import { bounded, mapToolItem, record, stringValue } from "./toolMapping";
import { messageId } from "./ids";

const HISTORY_CURSOR_PREFIX = "rmi1.";
const historyCursorPayloadSchema = z.object({
  version: z.literal(1),
  threadId: z.string().min(1),
  beforePosition: z.number().int().nonnegative(),
});

type RuntimeItemsPage = {
  items: readonly PersistedRuntimeItem[];
  nextCursor: number | null;
};

export function historyMessages(
  thread: Thread,
  items: readonly PersistedRuntimeItem[],
  includeLatestIdle = false,
): SessionMessageInfo[] {
  const messages: SessionMessageInfo[] = [];
  const fallbackTime = timestamp(thread.createdAt);
  const lastTurnStarted = includeLatestIdle
    ? timestampOrUndefined(thread.lastTurnStartedAt)
    : undefined;
  const lastTurnEnded = includeLatestIdle
    ? timestampOrUndefined(thread.lastTurnEndedAt)
    : undefined;
  let assistant: SessionMessageAssistant | undefined;

  const flushAssistant = (latest = false) => {
    if (!assistant) return;
    if (latest && lastTurnStarted !== undefined) assistant.time.created = lastTurnStarted;
    if (latest && lastTurnEnded !== undefined) {
      assistant.time.completed = lastTurnEnded;
      assistant.finish ??= "stop";
    } else if (!latest) {
      assistant.finish ??= "stop";
    }
    messages.push(assistant);
    assistant = undefined;
  };
  const currentAssistant = (item: PersistedRuntimeItem) => {
    assistant ??= {
      id: messageId(item.id),
      time: { created: fallbackTime },
      type: "assistant",
      agent: thread.agentKind,
      model: { id: thread.config.model, providerID: thread.agentKind },
      content: [],
    };
    return assistant;
  };

  for (const item of items) {
    if (item.type === "user_message") {
      flushAssistant();
      const payload = messageItemPayloadSchema.safeParse(item.payload);
      const blocks = payload.success ? payload.data.content : [];
      const user: SessionMessageUser = {
        id: messageId(item.id),
        time: { created: fallbackTime },
        type: "user",
        text: blocks
          .filter((block) => block.kind === "text")
          .map((block) => block.text)
          .join(""),
        files: blocks.flatMap((block): PromptFileAttachment[] => {
          if (block.kind === "file")
            return [
              {
                data: "",
                mime: block.mimeType ?? "application/octet-stream",
                ...(block.name ? { name: block.name } : {}),
                source: { type: "uri", uri: block.path },
              },
            ];
          if (block.kind === "image")
            return [
              {
                data: block.dataUrl.split(",").at(-1) ?? "",
                mime: block.mimeType,
                ...(block.name ? { name: block.name } : {}),
                source: { type: "inline" },
              },
            ];
          return [];
        }),
      };
      messages.push(user);
      continue;
    }

    if (item.type === "assistant_message") {
      const payload = messageItemPayloadSchema.safeParse(item.payload);
      const streamed = item.streams.assistant_text;
      const text =
        payload.success && payload.data.displayAuthoritative
          ? payload.data.content
              .filter((block) => block.kind === "text")
              .map((block) => block.text)
              .join("")
          : (streamed ?? "");
      if (text || (payload.success && payload.data.displayAuthoritative))
        currentAssistant(item).content.push({ type: "text", text: bounded(text) });
      continue;
    }

    if (item.type === "reasoning") {
      const payload = reasoningItemPayloadSchema.safeParse(item.payload);
      const part: SessionMessageAssistantReasoning = {
        type: "reasoning",
        text: bounded(
          item.streams.reasoning_text || (payload.success ? payload.data.summary : "") || "",
        ),
        ...(item.state === "completed" && lastTurnEnded !== undefined
          ? { time: { created: lastTurnStarted ?? fallbackTime, completed: lastTurnEnded } }
          : {}),
      };
      currentAssistant(item).content.push(part);
      continue;
    }

    if (
      item.type === "command_execution" ||
      item.type === "file_change" ||
      item.type === "tool_call" ||
      item.type === "mcp_tool_call" ||
      item.type === "dynamic_tool_call" ||
      item.type === "web_search" ||
      item.type === "plan" ||
      item.type === "image_view"
    ) {
      const definition = mapToolItem(item.type, item.payload, {
        threadId: thread.id,
        itemId: item.id,
      });
      if (!definition) continue;
      const payload = record(item.payload);
      const errorMessage = stringValue(payload.errorMessage || record(payload.error).message);
      const output = bounded(
        item.streams.command_output ||
          item.streams.file_change_output ||
          definition.output ||
          errorMessage,
      );
      const failed = payload.status === "error" || Boolean(errorMessage);
      const metadata = { ...definition.metadata, output };
      const state: SessionMessageAssistantTool["state"] =
        item.state !== "completed"
          ? { status: "running", input: definition.input, metadata }
          : failed
            ? {
                status: "error",
                input: definition.input,
                error: { type: "tool_error", message: errorMessage || "Tool failed" },
                metadata,
                content: [{ type: "text", text: output || errorMessage || "Tool failed" }],
              }
            : {
                status: "completed",
                input: definition.input,
                metadata,
                content: [{ type: "text", text: output || "Completed" }],
              };
      const tool: SessionMessageAssistantTool = {
        type: "tool",
        id: item.id,
        name: definition.name,
        executed: true,
        time: {
          created: lastTurnStarted ?? fallbackTime,
          ran: lastTurnStarted ?? fallbackTime,
          ...(item.state === "completed" && lastTurnEnded !== undefined
            ? { completed: lastTurnEnded }
            : {}),
        },
        state,
      };
      currentAssistant(item).content.push(tool);
      continue;
    }

    if (item.type === "error") {
      const payload = errorItemPayloadSchema.safeParse(item.payload);
      const message = payload.success
        ? payload.data.message
        : stringValue(record(item.payload).message);
      if (message) {
        const error: SessionStructuredError = { type: "provider_error", message };
        const failedAssistant = currentAssistant(item);
        failedAssistant.error = error;
        failedAssistant.finish = "error";
        flushAssistant();
        messages.push({
          id: messageId(item.id),
          time: { created: fallbackTime },
          type: "system",
          text: message,
          description: "Provider error",
        } satisfies SessionMessageSystem);
      }
      continue;
    }

    if (item.type === "provider_handoff") {
      flushAssistant();
      const payload = providerHandoffItemPayloadSchema.safeParse(item.payload);
      if (payload.success)
        messages.push({
          id: messageId(item.id),
          time: { created: timestampOrUndefined(payload.data.at) ?? fallbackTime },
          type: "system",
          text: `Provider changed from ${payload.data.fromAgentKind} to ${payload.data.toAgentKind}.`,
          description: "Provider handoff",
        } satisfies SessionMessageSystem);
      continue;
    }

    if (item.type === "goal") {
      flushAssistant();
      const payload = goalItemPayloadSchema.safeParse(item.payload);
      if (payload.success && payload.data.objective)
        messages.push({
          id: messageId(item.id),
          time: {
            created: timestampOrUndefined(payload.data.updatedAt) ?? fallbackTime,
          },
          type: "system",
          text: payload.data.objective,
          description: `Goal ${payload.data.status ?? payload.data.action ?? "updated"}`,
        } satisfies SessionMessageSystem);
      continue;
    }

    if (item.type === "question_answer") {
      flushAssistant();
      const payload = questionAnswerItemPayloadSchema.safeParse(item.payload);
      if (payload.success)
        messages.push({
          id: messageId(item.id),
          time: { created: fallbackTime },
          type: "synthetic",
          text: payload.data.questions
            .map((question) => {
              const answer =
                question.customAnswer ||
                question.selected.map((selection) => selection.label).join(", ");
              return `${question.question}: ${answer}`;
            })
            .join("\n"),
          description: "Question answered",
        } satisfies SessionMessageSynthetic);
    }
  }

  flushAssistant(true);
  if (
    includeLatestIdle &&
    lastTurnEnded !== undefined &&
    (thread.status === "idle" ||
      thread.status === "inactive" ||
      thread.status === "finished" ||
      thread.status === "error")
  ) {
    const error =
      thread.status === "error" || thread.errorMessage
        ? { type: "provider_error", message: thread.errorMessage ?? "Provider failed" }
        : undefined;
    messages.push({
      id: messageId(`idle-${thread.id}-${lastTurnEnded}`),
      time: { created: lastTurnEnded },
      type: "idle",
      outcome: error ? "failed" : "succeeded",
      ...(error ? { error } : {}),
    } satisfies SessionMessageIdle);
  }
  return messages.reverse();
}

export async function historyMessagePage(
  thread: Thread,
  limit: number,
  cursor: string | undefined,
  fetchPage: (beforePosition: number | undefined, pageSize: number) => Promise<RuntimeItemsPage>,
): Promise<MessageListOutput> {
  let beforePosition = cursor === undefined ? undefined : decodeHistoryCursor(cursor, thread.id);
  let nextCursor: number | null = null;
  let items: PersistedRuntimeItem[] = [];
  const seenCursors = new Set<number>();
  const pageSize = Math.min(500, Math.max(20, limit * 2));

  while (true) {
    const page = await fetchPage(beforePosition, pageSize);
    if (page.items.length === 0) {
      if (page.nextCursor !== null) throw new Error("Runtime history cursor did not advance.");
      nextCursor = null;
      break;
    }
    items = [...page.items, ...items];
    nextCursor = page.nextCursor;
    const messages = historyMessages(thread, items, cursor === undefined);
    const oldestRunComplete = items[0]?.type === "user_message";
    if ((messages.length >= limit && oldestRunComplete) || nextCursor === null) break;
    if (
      seenCursors.has(nextCursor) ||
      (beforePosition !== undefined && nextCursor >= beforePosition)
    )
      throw new Error("Runtime history cursor did not advance.");
    seenCursors.add(nextCursor);
    beforePosition = nextCursor;
  }

  return {
    data: historyMessages(thread, items, cursor === undefined),
    cursor: {
      previous: null,
      next: nextCursor === null ? null : encodeHistoryCursor(thread.id, nextCursor),
    },
  };
}

export function encodeHistoryCursor(threadId: string, beforePosition: number) {
  return `${HISTORY_CURSOR_PREFIX}${Buffer.from(
    JSON.stringify({ version: 1, threadId, beforePosition }),
    "utf8",
  ).toString("base64url")}`;
}

export function decodeHistoryCursor(cursor: string, threadId: string) {
  if (cursor.length > 512 || !cursor.startsWith(HISTORY_CURSOR_PREFIX))
    throw new Error("Invalid message history cursor.");
  let value: unknown;
  try {
    value = JSON.parse(
      Buffer.from(cursor.slice(HISTORY_CURSOR_PREFIX.length), "base64url").toString(),
    );
  } catch (error) {
    throw new Error("Invalid message history cursor.", { cause: error });
  }
  const parsed = historyCursorPayloadSchema.safeParse(value);
  if (!parsed.success || parsed.data.threadId !== threadId)
    throw new Error("Message history cursor does not match this session.");
  return parsed.data.beforePosition;
}

function timestamp(value: string) {
  return timestampOrUndefined(value) ?? 0;
}

function timestampOrUndefined(value: string | number | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
