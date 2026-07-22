/**
 * Shared ACP subagent lifecycle primitives.
 *
 * Provider adapters decode their native wire shapes into the small descriptor
 * and launch/completion inputs below. This module owns the canonical task
 * input, detached/activity metadata, task correlation, and synthetic ACP
 * notifications consumed by the provider-agnostic mapper.
 */

import type { SessionNotification } from "@agentclientprotocol/sdk";
import {
  PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY,
  PORACODE_ACP_DETACHED_SUBAGENT_META_KEY,
  PORACODE_ACP_NEW_ASSISTANT_ITEM_META_KEY,
  PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY,
  PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY,
} from "./canonicalMapping/subagents";

export interface AcpSubagentDescriptorPatch {
  rawInput?: Record<string, unknown>;
  subagentType?: string;
  description?: string;
  prompt?: string;
  model?: string;
  background?: boolean;
}

export interface AcpSubagentDescriptor {
  rawInput: Record<string, unknown>;
  subagentType: string;
  description?: string;
  prompt?: string;
  model?: string;
  background: boolean;
}

export interface AcpBackgroundSubagentLaunch {
  sessionId: string;
  toolCallId: string;
  taskId: string;
  agentId?: string;
  subagentType?: string;
  description?: string;
}

export interface AcpSubagentCompletionInput {
  sessionId: string;
  toolCallId?: string;
  taskId?: string;
  status: "completed" | "failed" | "cancelled";
  result?: string;
  childOutput?: string;
  parentReply?: string;
  terminalMeta?: Record<string, unknown>;
}

export interface AcpSubagentCoordinator {
  updateCall(toolCallId: string, patch: AcpSubagentDescriptorPatch): AcpSubagentDescriptor;
  getCall(toolCallId: string): AcpSubagentDescriptor | undefined;
  canonicalInput(toolCallId: string, rawInput?: unknown): Record<string, unknown>;
  registerBackgroundLaunch(input: {
    sessionId: string;
    toolCallId: string;
    taskId: string;
    agentId?: string;
  }): AcpBackgroundSubagentLaunch | undefined;
  resolveBackgroundToolCallId(taskId: string): string | undefined;
  complete(input: AcpSubagentCompletionInput): SessionNotification[];
  forgetCall(toolCallId: string): void;
}

export function createAcpSubagentCoordinator(): AcpSubagentCoordinator {
  const calls = new Map<string, AcpSubagentDescriptor>();
  const toolCallIdByTaskId = new Map<string, string>();
  const reportedLaunches = new Set<string>();

  const updateCall = (
    toolCallId: string,
    patch: AcpSubagentDescriptorPatch,
  ): AcpSubagentDescriptor => {
    const previous = calls.get(toolCallId);
    const rawInput = { ...(previous?.rawInput ?? {}), ...(patch.rawInput ?? {}) };
    const descriptor: AcpSubagentDescriptor = {
      rawInput,
      subagentType:
        nonEmpty(patch.subagentType) ??
        nonEmpty(readString(rawInput, "subagent_type")) ??
        previous?.subagentType ??
        "agent",
      background:
        previous?.background === true ||
        patch.background === true ||
        rawInput.background === true ||
        rawInput.run_in_background === true,
      ...optionalString(
        "description",
        nonEmpty(patch.description) ??
          nonEmpty(readString(rawInput, "description")) ??
          previous?.description,
      ),
      ...optionalString(
        "prompt",
        nonEmpty(patch.prompt) ?? nonEmpty(readString(rawInput, "prompt")) ?? previous?.prompt,
      ),
      ...optionalString(
        "model",
        nonEmpty(patch.model) ?? nonEmpty(readString(rawInput, "model")) ?? previous?.model,
      ),
    };
    calls.set(toolCallId, descriptor);
    return descriptor;
  };

  const forgetCall = (toolCallId: string): void => {
    calls.delete(toolCallId);
    for (const [taskId, mappedToolCallId] of toolCallIdByTaskId) {
      if (mappedToolCallId === toolCallId) toolCallIdByTaskId.delete(taskId);
    }
  };

  return {
    updateCall,

    getCall(toolCallId) {
      return calls.get(toolCallId);
    },

    canonicalInput(toolCallId, rawInput) {
      const incoming = plainRecord(rawInput);
      const descriptor = updateCall(toolCallId, { rawInput: incoming });
      return buildCanonicalAcpSubagentInput(descriptor);
    },

    registerBackgroundLaunch(input) {
      const descriptor = calls.get(input.toolCallId);
      if (!descriptor) return undefined;
      toolCallIdByTaskId.set(input.taskId, input.toolCallId);
      const launchKey = `${input.sessionId}:${input.taskId}`;
      if (reportedLaunches.has(launchKey)) return undefined;
      reportedLaunches.add(launchKey);
      return {
        sessionId: input.sessionId,
        toolCallId: input.toolCallId,
        taskId: input.taskId,
        ...(input.agentId ? { agentId: input.agentId } : {}),
        ...(descriptor.subagentType ? { subagentType: descriptor.subagentType } : {}),
        ...(descriptor.description ? { description: descriptor.description } : {}),
      };
    },

    resolveBackgroundToolCallId(taskId) {
      return toolCallIdByTaskId.get(taskId);
    },

    complete(input) {
      const toolCallId =
        input.toolCallId ?? (input.taskId ? toolCallIdByTaskId.get(input.taskId) : undefined);
      if (!toolCallId) return [];
      const descriptor = calls.get(toolCallId) ?? {
        rawInput: {},
        subagentType: "agent",
        background: true,
      };
      const notifications = createAcpSubagentCompletionNotifications({
        sessionId: input.sessionId,
        toolCallId,
        descriptor,
        status: input.status,
        ...(input.result ? { result: input.result } : {}),
        ...(input.childOutput ? { childOutput: input.childOutput } : {}),
        ...(input.parentReply ? { parentReply: input.parentReply } : {}),
        ...(input.terminalMeta ? { terminalMeta: input.terminalMeta } : {}),
      });
      forgetCall(toolCallId);
      return notifications;
    },

    forgetCall,
  };
}

export function buildCanonicalAcpSubagentInput(
  descriptor: AcpSubagentDescriptor,
): Record<string, unknown> {
  return {
    ...descriptor.rawInput,
    _toolName: "task",
    subagent_type: descriptor.subagentType,
    ...(descriptor.description ? { description: descriptor.description } : {}),
    ...(descriptor.prompt ? { prompt: descriptor.prompt } : {}),
    ...(descriptor.model ? { model: descriptor.model } : {}),
    ...(descriptor.background ? { background: true } : {}),
  };
}

export function normalizeAcpSubagentToolCall(
  notification: SessionNotification,
  input: {
    rawInput: Record<string, unknown>;
    detached?: boolean;
    keepOpen?: boolean;
    rawOutput?: unknown;
    omitContent?: boolean;
    omitRawOutput?: boolean;
  },
): SessionNotification {
  const update = notification.update as Record<string, unknown>;
  const meta = plainRecord(update._meta);
  const visible = input.omitContent ? withoutField(update, "content") : update;
  const withoutOutput = input.omitRawOutput ? withoutField(visible, "rawOutput") : visible;
  return withUpdate(notification, {
    ...withoutOutput,
    rawInput: input.rawInput,
    ...(input.rawOutput !== undefined ? { rawOutput: input.rawOutput } : {}),
    ...(input.keepOpen ? { status: "in_progress" } : {}),
    ...(input.detached
      ? { _meta: { ...meta, [PORACODE_ACP_DETACHED_SUBAGENT_META_KEY]: true } }
      : Object.keys(meta).length > 0
        ? { _meta: meta }
        : {}),
  });
}

export function withAcpSubagentParent(
  notification: SessionNotification,
  toolCallId: string,
): SessionNotification {
  return withMeta(notification, PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY, toolCallId);
}

export function withAcpTopLevelToolCall(notification: SessionNotification): SessionNotification {
  return withMeta(notification, PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY, true);
}

export function withAcpDetachedSubagentActivity(
  notification: SessionNotification,
  toolCallId: string,
): SessionNotification {
  return withMeta(notification, PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY, toolCallId);
}

function createAcpSubagentCompletionNotifications(input: {
  sessionId: string;
  toolCallId: string;
  descriptor: AcpSubagentDescriptor;
  status: "completed" | "failed" | "cancelled";
  result?: string;
  childOutput?: string;
  parentReply?: string;
  terminalMeta?: Record<string, unknown>;
}): SessionNotification[] {
  const notifications: SessionNotification[] = [];
  if (input.childOutput) {
    notifications.push(
      sessionNotification(input.sessionId, {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: input.childOutput },
        _meta: { [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: input.toolCallId },
      }),
    );
  }
  if (input.parentReply) {
    notifications.push(
      sessionNotification(input.sessionId, {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: input.parentReply },
        _meta: {
          [PORACODE_ACP_NEW_ASSISTANT_ITEM_META_KEY]: true,
          [PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY]: input.toolCallId,
        },
      }),
    );
  }
  notifications.push(
    sessionNotification(input.sessionId, {
      sessionUpdate: "tool_call_update",
      toolCallId: input.toolCallId,
      status: input.status === "completed" ? "completed" : "failed",
      rawInput: buildCanonicalAcpSubagentInput(input.descriptor),
      ...(input.result ? { rawOutput: input.result } : {}),
      _meta: {
        ...input.terminalMeta,
        [PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY]: input.toolCallId,
      },
    }),
  );
  return notifications;
}

function withMeta(
  notification: SessionNotification,
  key: string,
  value: string | boolean,
): SessionNotification {
  const update = notification.update as Record<string, unknown>;
  return withUpdate(notification, {
    ...update,
    _meta: { ...plainRecord(update._meta), [key]: value },
  });
}

function sessionNotification(
  sessionId: string,
  update: Record<string, unknown>,
): SessionNotification {
  return { sessionId, update } as unknown as SessionNotification;
}

function withUpdate(
  notification: SessionNotification,
  update: Record<string, unknown>,
): SessionNotification {
  return { ...notification, update: update as SessionNotification["update"] };
}

function withoutField(record: Record<string, unknown>, field: string): Record<string, unknown> {
  const next = { ...record };
  delete next[field];
  return next;
}

function optionalString<K extends string>(
  key: K,
  value: string | undefined,
): Partial<Record<K, string>> {
  return value ? ({ [key]: value } as Record<K, string>) : {};
}

function plainRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
