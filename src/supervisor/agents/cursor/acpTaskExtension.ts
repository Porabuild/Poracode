/**
 * Cursor ACP `cursor/task` extension → canonical RuntimeEvent mapper.
 *
 * Cursor's ACP server emits near-empty `tool_call` payloads for subagent tasks
 * (`rawInput: { _toolName: "task" }`) and delivers the real metadata only after
 * the task completes via a vendor `cursor/task` extension notification. Without
 * this bridge the chat renders a generic tool accordion instead of a sub-agent
 * row with an openable overlay thread.
 */

import { randomUUID } from "node:crypto";
import type { RuntimeEvent } from "@/shared/contracts";

export interface CursorTaskExtensionParams {
  toolCallId: string;
  description?: unknown;
  prompt?: unknown;
  model?: unknown;
  agentId?: unknown;
  durationMs?: unknown;
  subagentType?: unknown;
}

export function isCursorTaskExtension(method: string): boolean {
  return method === "cursor/task";
}

export function parseCursorTaskExtensionParams(
  params: Record<string, unknown>,
): CursorTaskExtensionParams | undefined {
  const toolCallId = readString(params.toolCallId);
  if (!toolCallId) return undefined;
  return {
    toolCallId,
    description: params.description,
    prompt: params.prompt,
    model: params.model,
    agentId: params.agentId,
    durationMs: params.durationMs,
    subagentType: params.subagentType,
  };
}

export function mapCursorTaskExtension(
  threadId: string,
  parentItemId: string,
  params: CursorTaskExtensionParams,
): RuntimeEvent[] {
  const description = readString(params.description);
  const prompt = readString(params.prompt);
  const model = readString(params.model);
  const subagentType = readCursorSubagentType(params.subagentType);
  const durationMs = readNonNegativeInteger(params.durationMs);

  const args: Record<string, unknown> = {
    _toolName: "task",
    ...(description ? { description, name: description } : {}),
    ...(prompt ? { prompt } : {}),
    ...(subagentType ? { subagent_type: subagentType } : {}),
  };

  const progress: Record<string, unknown> = {};
  if (model) progress.model = model;
  if (durationMs !== undefined) progress.durationMs = durationMs;
  if (description) progress.description = description;

  const title = description ? `Task: ${description}` : "Task: Subagent task";
  const events: RuntimeEvent[] = [
    {
      type: "item.updated",
      threadId,
      itemId: parentItemId,
      payload: {
        isSubAgent: true,
        name: title,
        title,
        args,
        ...(Object.keys(progress).length > 0 ? { progress } : {}),
      },
    },
  ];

  if (prompt) {
    const childId = `cursor-subagent-${randomUUID()}`;
    events.push(
      {
        type: "item.started",
        threadId,
        itemId: childId,
        itemType: "assistant_message",
        parentItemId,
      },
      {
        type: "content.delta",
        threadId,
        itemId: childId,
        stream: "assistant_text",
        delta: prompt,
      },
      { type: "item.completed", threadId, itemId: childId },
    );
    events.push({
      type: "item.updated",
      threadId,
      itemId: parentItemId,
      payload: {
        isSubAgent: true,
        status: "running",
        progress: {
          ...(Object.keys(progress).length > 0 ? progress : {}),
          stepCount: 1,
        },
      },
    });
  }

  return events;
}

function readCursorSubagentType(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 && trimmed !== "unspecified" ? trimmed : undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  for (const key of [
    "explore",
    "computer_use",
    "browser_use",
    "shell",
    "video_review",
    "vm_setup_helper",
  ]) {
    if (key in record) return key;
  }
  const custom = record.custom;
  if (custom && typeof custom === "object" && !Array.isArray(custom)) {
    for (const key of Object.keys(custom as Record<string, unknown>)) {
      if (key !== "unspecified") return key;
    }
  }
  return undefined;
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.trunc(value));
}
