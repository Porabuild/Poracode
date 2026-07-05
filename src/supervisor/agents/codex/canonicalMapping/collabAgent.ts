/**
 * Codex collab-agent (sub-agent) tool-call helpers — input/result/progress
 * extraction from the `agentsStates` payload shape.
 */

import { normalizeItemType } from "../canonicalMappingState";
import { type CodexItemPayload, readNonEmptyString, readStringArray } from "./readers";

export function isCodexCollabAgentToolCall(source: CodexItemPayload): boolean {
  const type = normalizeItemType(source.type ?? source.kind);
  return type === "collab agent tool call" || type === "collab agent";
}

export function pickCollabAgentInput(source: CodexItemPayload): unknown {
  const prompt = readNonEmptyString(source.prompt);
  const senderThreadId =
    readNonEmptyString(source.senderThreadId) ?? readNonEmptyString(source.sender_thread_id);
  const receiverThreadIds = readStringArray(source.receiverThreadIds ?? source.receiver_thread_ids);
  const agentsStates = readCollabAgentStates(source);
  const model = readNonEmptyString(source.model);
  const reasoningEffort =
    readNonEmptyString(source.reasoningEffort) ?? readNonEmptyString(source.reasoning_effort);
  const toolKind = readNonEmptyString(source.toolKind) ?? readNonEmptyString(source.tool_kind);

  const input: Record<string, unknown> = {};
  if (prompt) {
    input.description = prompt;
    input.prompt = prompt;
  }
  if (senderThreadId) input.senderThreadId = senderThreadId;
  if (receiverThreadIds.length > 0) input.receiverThreadIds = receiverThreadIds;
  if (agentsStates !== undefined) input.agentsStates = agentsStates;
  if (model) input.model = model;
  if (reasoningEffort) input.reasoningEffort = reasoningEffort;
  if (toolKind) input.toolKind = toolKind;
  return Object.keys(input).length > 0 ? input : undefined;
}

export function pickCollabAgentResult(source: CodexItemPayload): unknown {
  const agentsStates = readCollabAgentStates(source);
  const messages = readCollabAgentMessages(agentsStates);
  if (messages.length === 1) return messages[0];
  if (messages.length > 1) return messages.join("\n\n");
  return agentsStates !== undefined ? { agentsStates } : undefined;
}

export function readCollabAgentProgress(source: CodexItemPayload):
  | {
      description?: string;
      model?: string;
      stepCount?: number;
    }
  | undefined {
  const agentsStates = readCollabAgentStates(source);
  const description = readCollabAgentMessages(agentsStates)[0] ?? readNonEmptyString(source.prompt);
  const model = readNonEmptyString(source.model);
  const receiverThreadIds = readStringArray(source.receiverThreadIds ?? source.receiver_thread_ids);
  const stepCount =
    receiverThreadIds.length > 0
      ? receiverThreadIds.length
      : agentsStates && typeof agentsStates === "object" && !Array.isArray(agentsStates)
        ? Object.keys(agentsStates as Record<string, unknown>).length
        : undefined;
  const progress = {
    ...(description ? { description } : {}),
    ...(model ? { model } : {}),
    ...(stepCount !== undefined ? { stepCount } : {}),
  };
  return Object.keys(progress).length > 0 ? progress : undefined;
}

function readCollabAgentStates(source: CodexItemPayload): unknown {
  return source.agentsStates ?? source.agents_states;
}

function readCollabAgentMessages(states: unknown): string[] {
  if (!states || typeof states !== "object" || Array.isArray(states)) return [];
  const messages: string[] = [];
  for (const state of Object.values(states as Record<string, unknown>)) {
    if (!state || typeof state !== "object" || Array.isArray(state)) continue;
    const message = readNonEmptyString((state as Record<string, unknown>).message);
    if (message) messages.push(message);
  }
  return messages;
}
