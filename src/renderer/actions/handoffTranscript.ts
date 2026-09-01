import { assistantDisplayText } from "@/shared/assistantMessageText";
import type { ExtractContextResult, Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { textFromRuntimeContentBlocks } from "./experimentResponseTranscript";

const MAX_TRANSCRIPT_CONTEXT_CHARS = 50_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function joinTailWithinBudget(parts: readonly string[], maxChars: number): string {
  const kept: string[] = [];
  let length = 0;
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index]!;
    const remaining = maxChars - length;
    if (remaining <= 0) break;
    kept.push(part.length > remaining ? part.slice(-remaining) : part);
    length += Math.min(part.length, remaining);
    if (part.length > remaining) break;
  }
  return kept.reverse().join("");
}

function formatRuntimeItemForHandoff(item: RuntimeChatItem, maxChars: number): string | null {
  const streams = item.streams;
  const payload = asRecord(item.payload);
  switch (item.type) {
    case "user_message": {
      const prefix = "User:\n";
      const text = textFromRuntimeContentBlocks(
        item.payload,
        Math.max(0, maxChars - prefix.length),
      );
      return text ? `${prefix}${text}` : null;
    }
    case "assistant_message": {
      const prefix = "Assistant:\n";
      // Display truth only: a hook-suppressed or rewritten message hands off
      // exactly what the user saw, never the replaced stream.
      const text = assistantDisplayText(item);
      return text ? joinTailWithinBudget([prefix, text], maxChars) : null;
    }
    case "plan": {
      const steps = payload?.steps;
      if (!Array.isArray(steps)) return null;
      const lines: string[] = [];
      let length = 0;
      const contentBudget = Math.max(0, maxChars - "Plan:\n".length);
      for (let index = steps.length - 1; index >= 0; index -= 1) {
        const record = asRecord(steps[index]);
        if (!record || typeof record.step !== "string") continue;
        const separatorLength = lines.length > 0 ? 1 : 0;
        const remaining = contentBudget - length - separatorLength;
        if (remaining <= 0) break;
        const status = typeof record.status === "string" ? record.status : "pending";
        const line = joinTailWithinBudget([`- [${status}] `, record.step], remaining);
        lines.push(line);
        length += separatorLength + line.length;
        if (line.length === remaining) break;
      }
      const text = lines.reverse().join("\n");
      return text ? joinTailWithinBudget(["Plan:\n", text], maxChars) : null;
    }
    case "goal": {
      const objective = typeof payload?.objective === "string" ? payload.objective : "";
      const status = typeof payload?.status === "string" ? ` (${payload.status})` : "";
      return objective ? joinTailWithinBudget([`Goal${status}:\n`, objective], maxChars) : null;
    }
    case "tool_call":
    case "mcp_tool_call":
    case "image_view":
    case "dynamic_tool_call": {
      const name = typeof payload?.title === "string" ? payload.title : payload?.name;
      const status = typeof payload?.status === "string" ? payload.status : item.state;
      return typeof name === "string"
        ? joinTailWithinBudget([`Tool ${status}: `, name], maxChars)
        : null;
    }
    case "command_execution": {
      const command = typeof payload?.command === "string" ? payload.command : "";
      const output = streams.command_output;
      return command || output
        ? joinTailWithinBudget(
            ["Command:\n", command, ...(output ? ["\nOutput:\n", output] : [])],
            maxChars,
          )
        : null;
    }
    case "file_change": {
      const path = typeof payload?.path === "string" ? payload.path : "";
      const kind = typeof payload?.changeKind === "string" ? payload.changeKind : "change";
      return path ? joinTailWithinBudget([`File ${kind}: `, path], maxChars) : null;
    }
    case "web_search": {
      const query = typeof payload?.query === "string" ? payload.query : "";
      return query ? joinTailWithinBudget(["Web search: ", query], maxChars) : null;
    }
    case "error": {
      const message = typeof payload?.message === "string" ? payload.message : "";
      return message ? joinTailWithinBudget(["Error:\n", message], maxChars) : null;
    }
    case "provider_handoff": {
      const from = typeof payload?.fromAgentKind === "string" ? payload.fromAgentKind : "";
      const to = typeof payload?.toAgentKind === "string" ? payload.toAgentKind : "";
      return from && to
        ? joinTailWithinBudget(["[Thread switched provider: ", from, " → ", to, "]"], maxChars)
        : null;
    }
    default:
      return null;
  }
}

/**
 * Summarize a thread's stored transcript into handoff context — the fallback
 * when provider-side extraction is unavailable: no resumable session, or a
 * mirrored thread whose `extractContext` procedure lives on its host. The
 * result is the same shape the extraction path produces, so the handoff launch
 * input treats both identically.
 */
export function buildTranscriptContext(
  thread: Thread,
  sourceLabel: string,
): ExtractContextResult | null {
  const state = useAppStore.getState();
  const itemIds = state.runtimeItemIdsByThread[thread.id] ?? [];
  const itemsById = state.runtimeItemsByIdByThread[thread.id];
  if (!itemsById || itemIds.length === 0) return null;

  const parts: string[] = [];
  let transcriptLength = 0;
  let truncated = false;
  for (let index = itemIds.length - 1; index >= 0; index -= 1) {
    const item = itemsById[itemIds[index]!];
    if (!item || item.parentItemId) continue;
    const separatorLength = parts.length > 0 ? 2 : 0;
    const remaining = MAX_TRANSCRIPT_CONTEXT_CHARS - transcriptLength - separatorLength;
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    const text = formatRuntimeItemForHandoff(item, remaining);
    if (!text?.trim()) continue;
    if (text.length > remaining) {
      parts.push(text.slice(-remaining));
      truncated = true;
      break;
    }
    parts.push(text);
    transcriptLength += separatorLength + text.length;
    if (text.length === remaining) {
      truncated = true;
      break;
    }
  }
  const transcript = parts.reverse().join("\n\n");

  if (!transcript.trim()) return null;
  const summary = [
    `Context captured from the ${sourceLabel} chat transcript because provider resume and terminal scrollback were unavailable.`,
    "",
    truncated ? `${transcript}\n\n[earlier transcript truncated]` : transcript,
  ].join("\n");

  return {
    summary,
    sourceProvider: thread.agentKind,
    sourceSessionId: thread.sessionRef?.providerSessionId ?? thread.id,
    ...(thread.worktreePath ? { worktreePath: thread.worktreePath } : {}),
    extractedAt: new Date().toISOString(),
  };
}
