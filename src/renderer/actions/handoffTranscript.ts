import type { ExtractContextResult, Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { textFromRuntimeContentBlocks } from "./experimentResponseTranscript";

const MAX_TRANSCRIPT_CONTEXT_CHARS = 50_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function formatRuntimeItemForHandoff(item: RuntimeChatItem): string | null {
  const streams = item.streams;
  const payload = asRecord(item.payload);
  switch (item.type) {
    case "user_message": {
      const text = textFromRuntimeContentBlocks(item.payload);
      return text ? `User:\n${text}` : null;
    }
    case "assistant_message": {
      const text = textFromRuntimeContentBlocks(item.payload) || streams.assistant_text;
      return text ? `Assistant:\n${text}` : null;
    }
    case "plan": {
      const steps = payload?.steps;
      if (!Array.isArray(steps)) return null;
      const text = steps
        .map((step) => {
          const record = asRecord(step);
          if (!record || typeof record.step !== "string") return "";
          const status = typeof record.status === "string" ? record.status : "pending";
          return `- [${status}] ${record.step}`;
        })
        .filter(Boolean)
        .join("\n");
      return text ? `Plan:\n${text}` : null;
    }
    case "goal": {
      const objective = typeof payload?.objective === "string" ? payload.objective : "";
      const status = typeof payload?.status === "string" ? ` (${payload.status})` : "";
      return objective ? `Goal${status}:\n${objective}` : null;
    }
    case "tool_call":
    case "mcp_tool_call":
    case "image_view":
    case "dynamic_tool_call": {
      const name = typeof payload?.title === "string" ? payload.title : payload?.name;
      const status = typeof payload?.status === "string" ? payload.status : item.state;
      return typeof name === "string" ? `Tool ${status}: ${name}` : null;
    }
    case "command_execution": {
      const command = typeof payload?.command === "string" ? payload.command : "";
      const output = streams.command_output;
      return command || output
        ? `Command:\n${command}${output ? `\nOutput:\n${output}` : ""}`
        : null;
    }
    case "file_change": {
      const path = typeof payload?.path === "string" ? payload.path : "";
      const kind = typeof payload?.changeKind === "string" ? payload.changeKind : "change";
      return path ? `File ${kind}: ${path}` : null;
    }
    case "web_search": {
      const query = typeof payload?.query === "string" ? payload.query : "";
      return query ? `Web search: ${query}` : null;
    }
    case "error": {
      const message = typeof payload?.message === "string" ? payload.message : "";
      return message ? `Error:\n${message}` : null;
    }
    case "provider_handoff": {
      const from = typeof payload?.fromAgentKind === "string" ? payload.fromAgentKind : "";
      const to = typeof payload?.toAgentKind === "string" ? payload.toAgentKind : "";
      return from && to ? `[Thread switched provider: ${from} → ${to}]` : null;
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

  const transcript = itemIds
    .map((itemId) => itemsById[itemId])
    .filter((item): item is RuntimeChatItem => Boolean(item && !item.parentItemId))
    .map(formatRuntimeItemForHandoff)
    .filter((text): text is string => Boolean(text?.trim()))
    .join("\n\n");

  if (!transcript.trim()) return null;
  const summary = [
    `Context captured from the ${sourceLabel} chat transcript because provider resume and terminal scrollback were unavailable.`,
    "",
    transcript.length > MAX_TRANSCRIPT_CONTEXT_CHARS
      ? `${transcript.slice(-MAX_TRANSCRIPT_CONTEXT_CHARS)}\n\n[earlier transcript truncated]`
      : transcript,
  ].join("\n");

  return {
    summary,
    sourceProvider: thread.agentKind,
    sourceSessionId: thread.sessionRef?.providerSessionId ?? thread.id,
    ...(thread.worktreePath ? { worktreePath: thread.worktreePath } : {}),
    extractedAt: new Date().toISOString(),
  };
}
