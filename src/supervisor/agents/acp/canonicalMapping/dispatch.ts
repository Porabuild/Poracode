/**
 * Dispatch an ACP `SessionNotification` to zero-or-more canonical events.
 */

import type { ContentBlock, SessionNotification, SessionUpdate } from "@agentclientprotocol/sdk";
import type { CanonicalContentBlock, RuntimeEvent } from "@/shared/contracts";
import {
  createContextUsageEvent,
  readNonNegativeInteger,
  usageFromTokenCounts,
} from "../../contextUsage";
import { parseAcpAgentMessageApiError } from "../acpUserVisibleErrors";
import { classifyToolCallItemType } from "./contentExtraction";
import {
  buildAcpToolCallPayload,
  buildAcpToolCallUpdatePayload,
  finalizeToolCallPayload,
  findTerminalIdInContent,
  mergeProgressForEmission,
  mergeToolPayload,
} from "./toolCallPayloads";
import {
  buildSubAgentProgress,
  buildSubAgentProgressEvents,
  extractTaskCompleteSummary,
  getActiveSubAgent,
  isAcpSubAgentToolCall,
  isTaskCompleteSummary,
  isUpdateTopicTool,
  removeActiveSubAgent,
  tagSubAgentChildStarts,
} from "./subagents";
import { closeOpenContentItems, newItemId } from "./state";
import type { ActiveAcpSubAgent, AcpMapperState } from "./state";

function acpContentBlockToCanonical(block: ContentBlock): CanonicalContentBlock | undefined {
  if (block.type === "text") {
    return { kind: "text", text: block.text };
  }
  if (block.type === "image") {
    return {
      kind: "image",
      mimeType: block.mimeType ?? "application/octet-stream",
      dataUrl: `data:${block.mimeType ?? "application/octet-stream"};base64,${block.data}`,
    };
  }
  if (block.type === "resource_link") {
    return { kind: "file", path: block.uri.replace(/^file:\/\//, ""), name: block.name };
  }
  return undefined;
}

/**
 * Map a single ACP `SessionNotification` to zero-or-more canonical events.
 * Mutates `state` to track open items.
 */
export function mapAcpSessionUpdate(
  notification: SessionNotification,
  state: AcpMapperState,
): RuntimeEvent[] {
  const update: SessionUpdate = notification.update;
  const events: RuntimeEvent[] = [];
  const { threadId } = state;
  const activeSubAgent = getActiveSubAgent(state);
  let pendingSubAgent: ActiveAcpSubAgent | undefined;

  switch (update.sessionUpdate) {
    case "agent_message_chunk": {
      const content = (update as { content?: ContentBlock }).content;
      // Gemini echoes `[MODE_UPDATE] <mode>` as an agent text chunk whenever the
      // session is launched (or switched) into a specific approval mode. The
      // user already chose the mode in the launcher; surfacing the echo as
      // chat noise on every turn is just clutter. Drop it before we open an
      // assistant item so the chat stays clean.
      if (
        !state.openAssistantItemId &&
        content?.type === "text" &&
        /^\[MODE_UPDATE\]/.test(content.text)
      ) {
        break;
      }
      if (content?.type === "text") {
        const apiError = parseAcpAgentMessageApiError(content.text);
        if (apiError) {
          events.push(...closeOpenContentItems(state));
          events.push({ type: "error", threadId, message: apiError });
          break;
        }
      }
      // Open an assistant item on first chunk; emit deltas thereafter.
      if (!state.openAssistantItemId) {
        // Close any prior reasoning/user items — assistant is starting fresh.
        events.push(...closeOpenContentItems(state));
        state.openAssistantItemId = newItemId("asst");
        events.push({
          type: "item.started",
          threadId,
          itemId: state.openAssistantItemId,
          itemType: "assistant_message",
        });
      }
      if (content) {
        if (content.type === "text") {
          events.push({
            type: "content.delta",
            threadId,
            itemId: state.openAssistantItemId,
            stream: "assistant_text",
            delta: content.text,
          });
        } else {
          const block = acpContentBlockToCanonical(content);
          if (block) {
            events.push({
              type: "item.updated",
              threadId,
              itemId: state.openAssistantItemId,
              payload: { content: [block] },
            });
          }
        }
      }
      break;
    }

    case "agent_thought_chunk": {
      if (!state.openReasoningItemId) {
        // Close any prior assistant — reasoning bracket starts.
        if (state.openAssistantItemId) {
          events.push({
            type: "item.completed",
            threadId,
            itemId: state.openAssistantItemId,
          });
          delete state.openAssistantItemId;
        }
        state.openReasoningItemId = newItemId("reason");
        events.push({
          type: "item.started",
          threadId,
          itemId: state.openReasoningItemId,
          itemType: "reasoning",
        });
      }
      const content = (update as { content?: ContentBlock }).content;
      if (content && content.type === "text") {
        events.push({
          type: "content.delta",
          threadId,
          itemId: state.openReasoningItemId,
          stream: "reasoning_text",
          delta: content.text,
        });
      }
      break;
    }

    case "user_message_chunk": {
      // Intentional skip. The supervisor (or the renderer's optimistic push)
      // already emits a `user_message` item with a stable id at the start of
      // every turn we initiate via `startTurn`. Some ACP servers — Copilot
      // notably — echo the user's prompt back as `user_message_chunk`
      // updates, which the mapper would otherwise turn into a second
      // user_message item with a fresh id (no dedupe target). Dropping the
      // echo keeps the chat free of duplicates without losing data, since
      // the content is identical to what we already painted.
      break;
    }

    case "tool_call": {
      // First seal any open assistant/reasoning so the tool-call surfaces in order.
      events.push(...closeOpenContentItems(state));
      const toolCall = update as {
        toolCallId: string;
        title?: string | null;
        kind?: string | null;
        status?: "pending" | "in_progress" | "completed" | "failed";
        rawInput?: unknown;
        content?: unknown;
        locations?: Array<{ path?: string | null; line?: number | null }> | null;
      };
      // Gemini's `update_topic` is a meta-tool that re-titles the current
      // conversation topic — emitted on nearly every user turn as the model's
      // first action. It's noise in the chat stream (a "thinking" tool that
      // produces no user-facing artifact), so drop it entirely along with its
      // matching `tool_call_update`.
      if (isUpdateTopicTool(toolCall.title, toolCall.kind)) {
        state.suppressedToolCallIds.add(toolCall.toolCallId);
        break;
      }
      // Copilot's `task_complete` is the end-of-turn summary, not a real tool —
      // surface it as an assistant_message so it renders inline with the rest
      // of the response instead of as a collapsed accordion.
      if (isTaskCompleteSummary(toolCall.title, toolCall.kind)) {
        const text = extractTaskCompleteSummary(toolCall.rawInput);
        state.suppressedToolCallIds.add(toolCall.toolCallId);
        if (text) {
          const asstId = newItemId("asst");
          events.push({
            type: "item.started",
            threadId,
            itemId: asstId,
            itemType: "assistant_message",
          });
          events.push({
            type: "content.delta",
            threadId,
            itemId: asstId,
            stream: "assistant_text",
            delta: text,
          });
          events.push({ type: "item.completed", threadId, itemId: asstId });
        }
        break;
      }
      const itemId = newItemId("tool");
      const status =
        toolCall.status === "completed"
          ? "success"
          : toolCall.status === "failed"
            ? "error"
            : "running";
      const itemType = classifyToolCallItemType(toolCall.kind, toolCall.title, toolCall.locations);
      const isSubAgent = isAcpSubAgentToolCall(toolCall);
      const payload = buildAcpToolCallPayload(
        itemType,
        toolCall,
        status,
        isSubAgent,
        state.resolveTerminalOutput,
        state.resolveTerminalOutputByCommand,
      );
      const terminalId = findTerminalIdInContent((toolCall as { content?: unknown }).content);
      state.toolCallItems.set(toolCall.toolCallId, {
        itemId,
        itemType,
        payload,
        isSubAgent,
        ...(terminalId ? { terminalId } : {}),
      });
      events.push({
        type: "item.started",
        threadId,
        itemId,
        itemType,
        payload,
      });
      if (toolCall.status === "completed" || toolCall.status === "failed") {
        events.push({
          type: "item.completed",
          threadId,
          itemId,
          payload: finalizeToolCallPayload(state, {
            itemId,
            itemType,
            payload,
            isSubAgent,
            ...(terminalId ? { terminalId } : {}),
          }),
        });
        state.toolCallItems.delete(toolCall.toolCallId);
      }
      if (isSubAgent && toolCall.status !== "completed" && toolCall.status !== "failed") {
        pendingSubAgent = { toolCallId: toolCall.toolCallId, itemId };
      }
      break;
    }

    case "tool_call_update": {
      const toolCall = update as {
        toolCallId: string;
        title?: string | null;
        kind?: string | null;
        status?: "pending" | "in_progress" | "completed" | "failed";
        rawInput?: unknown;
        rawOutput?: unknown;
        content?: unknown;
        locations?: Array<{ path?: string | null; line?: number | null }> | null;
      };
      if (state.suppressedToolCallIds.has(toolCall.toolCallId)) {
        if (toolCall.status === "completed" || toolCall.status === "failed") {
          state.suppressedToolCallIds.delete(toolCall.toolCallId);
        }
        break;
      }
      const item = state.toolCallItems.get(toolCall.toolCallId);
      if (!item) break;
      const isTerminal = toolCall.status === "completed" || toolCall.status === "failed";
      const status =
        toolCall.status === "completed"
          ? "success"
          : toolCall.status === "failed"
            ? "error"
            : "running";
      const updateTerminalId = findTerminalIdInContent((toolCall as { content?: unknown }).content);
      if (updateTerminalId) item.terminalId = updateTerminalId;
      const payload = buildAcpToolCallUpdatePayload(
        item,
        toolCall,
        status,
        state.resolveTerminalOutput,
        state.resolveTerminalOutputByCommand,
      );
      const subAgentProgress = item.isSubAgent
        ? buildSubAgentProgress(toolCall, payload, status)
        : undefined;
      const nextPayload = subAgentProgress?.label
        ? mergeToolPayload(payload, {
            progress: {
              description: subAgentProgress.label,
              ...(subAgentProgress.summary ? { summary: subAgentProgress.summary } : {}),
            },
          })
        : payload;
      const mergedPayload = mergeToolPayload(item.payload, nextPayload);
      const emittedPayload = mergeProgressForEmission(nextPayload, mergedPayload);
      item.payload = mergedPayload;
      events.push({
        type: isTerminal ? "item.completed" : "item.updated",
        threadId,
        itemId: item.itemId,
        payload: emittedPayload,
      });
      if (subAgentProgress?.text) {
        events.push(...buildSubAgentProgressEvents(state, item, subAgentProgress.text, isTerminal));
      } else if (isTerminal && item.subAgentProgressItemId) {
        events.push({
          type: "item.completed",
          threadId,
          itemId: item.subAgentProgressItemId,
        });
      }
      if (isTerminal) {
        state.toolCallItems.delete(toolCall.toolCallId);
        if (item.isSubAgent) {
          removeActiveSubAgent(state, toolCall.toolCallId);
        }
      }
      break;
    }

    case "plan": {
      const plan = update as {
        entries?: Array<{ content: string; status: "pending" | "in_progress" | "completed" }>;
        content?: {
          entries?: Array<{ content: string; status: "pending" | "in_progress" | "completed" }>;
        };
      };
      const rawEntries = plan.entries ?? plan.content?.entries ?? [];
      const steps = rawEntries.map((entry) => ({ step: entry.content, status: entry.status }));
      state.openPlanSteps = steps;
      if (!state.openPlanItemId) {
        events.push(...closeOpenContentItems(state));
        state.openPlanItemId = newItemId("plan");
        events.push({
          type: "item.started",
          threadId,
          itemId: state.openPlanItemId,
          itemType: "plan",
          payload: { steps },
        });
      } else {
        events.push({
          type: "item.updated",
          threadId,
          itemId: state.openPlanItemId,
          payload: { steps },
        });
      }
      // If every step is completed, close the plan.
      if (steps.length > 0 && steps.every((s) => s.status === "completed")) {
        events.push({
          type: "item.completed",
          threadId,
          itemId: state.openPlanItemId,
          payload: { steps },
        });
        delete state.openPlanItemId;
        delete state.openPlanSteps;
      }
      break;
    }

    case "current_mode_update": {
      const modeUpdate = update as { currentModeId?: string };
      if (modeUpdate.currentModeId) {
        events.push({
          type: "warning",
          threadId,
          message: `Mode changed to ${modeUpdate.currentModeId}`,
        });
      }
      break;
    }

    case "usage_update": {
      const usageUpdate = update as { used?: unknown; size?: unknown };
      const event = createContextUsageEvent(
        threadId,
        usageFromTokenCounts({
          usedTokens: readNonNegativeInteger(usageUpdate.used),
          maxTokens: readNonNegativeInteger(usageUpdate.size),
        }),
      );
      if (event) events.push(event);
      break;
    }

    default:
      // Other update kinds (`session_info_update`, `config_option_update`, etc.)
      // don't produce chat items in v1. They flow through the existing
      // status/text channels untouched.
      break;
  }

  if (activeSubAgent) {
    tagSubAgentChildStarts(events, activeSubAgent, state);
  }
  if (pendingSubAgent) {
    state.activeSubAgents.push(pendingSubAgent);
  }
  return events;
}
