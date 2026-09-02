import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import {
  assistantTranscriptContent,
  textFromRuntimeContentBlocks,
} from "./experimentResponseTranscript";

/**
 * How much of the handoff budget a row may claim, mirroring what the built-in
 * `read_thread` tool hands an agent: the conversation itself, then the tool
 * activity that changed state. Everything else (tool status lines, image
 * views, web searches, command output) is noise the new provider can recreate
 * and is left out entirely.
 *
 * - "conversation": user and assistant messages, plans, goals, errors, and
 *   provider dividers. Filled first.
 * - "activity": file changes and the command lines that ran, one line each.
 *   Filled with whatever budget the conversation leaves.
 */
export type HandoffRowTier = "conversation" | "activity";

export interface HandoffRow {
  tier: HandoffRowTier;
  text: string;
  isUserMessage: boolean;
}

/**
 * Per-message cap. Higher than `read_thread`'s 2,000 because a handoff file is
 * read once with no paging to fall back on, but still bounded so one pasted
 * log cannot take the whole budget.
 */
export const MAX_HANDOFF_MESSAGE_CHARS = 6_000;
const MAX_HANDOFF_ACTIVITY_CHARS = 500;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/** Keep the start: the ask sits at the top of a user message. */
function truncateHead(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n[message truncated]` : text;
}

/** Keep the end: the conclusion sits at the bottom of an assistant message. */
function truncateTail(text: string, maxChars: number): string {
  return text.length > maxChars ? `[message truncated]\n${text.slice(-maxChars)}` : text;
}

function row(tier: HandoffRowTier, text: string, isUserMessage = false): HandoffRow {
  return { tier, text, isUserMessage };
}

/** Render one top-level thread item for the handoff file, or null to drop it. */
export function formatHandoffRow(item: RuntimeChatItem): HandoffRow | null {
  const payload = asRecord(item.payload);
  switch (item.type) {
    case "user_message": {
      const text = textFromRuntimeContentBlocks(item.payload);
      return text
        ? row("conversation", `User:\n${truncateHead(text, MAX_HANDOFF_MESSAGE_CHARS)}`, true)
        : null;
    }
    case "assistant_message": {
      // Display truth only: a hook-suppressed or rewritten message hands off
      // exactly what the user saw, never the replaced stream.
      const text = assistantTranscriptContent(item);
      return text
        ? row("conversation", `Assistant:\n${truncateTail(text, MAX_HANDOFF_MESSAGE_CHARS)}`)
        : null;
    }
    case "plan": {
      const steps = payload?.steps;
      if (!Array.isArray(steps)) return null;
      const lines = steps.flatMap((step) => {
        const record = asRecord(step);
        if (!record || typeof record.step !== "string") return [];
        const status = typeof record.status === "string" ? record.status : "pending";
        return [`- [${status}] ${record.step}`];
      });
      return lines.length > 0
        ? row("conversation", `Plan:\n${truncateTail(lines.join("\n"), MAX_HANDOFF_MESSAGE_CHARS)}`)
        : null;
    }
    case "goal": {
      const objective = typeof payload?.objective === "string" ? payload.objective : "";
      const status = typeof payload?.status === "string" ? ` (${payload.status})` : "";
      return objective
        ? row(
            "conversation",
            `Goal${status}:\n${truncateHead(objective, MAX_HANDOFF_MESSAGE_CHARS)}`,
          )
        : null;
    }
    case "error": {
      const message = typeof payload?.message === "string" ? payload.message : "";
      return message
        ? row("conversation", `Error:\n${truncateHead(message, MAX_HANDOFF_MESSAGE_CHARS)}`)
        : null;
    }
    case "provider_handoff": {
      const from = typeof payload?.fromAgentKind === "string" ? payload.fromAgentKind : "";
      const to = typeof payload?.toAgentKind === "string" ? payload.toAgentKind : "";
      return from && to ? row("conversation", `[Thread switched provider: ${from} → ${to}]`) : null;
    }
    case "command_execution": {
      // The command line only. Its output is the largest stream a thread
      // carries and the one thing the new provider can regenerate by rerunning.
      const command = typeof payload?.command === "string" ? payload.command : "";
      return command
        ? row("activity", truncateHead(`Command: ${command}`, MAX_HANDOFF_ACTIVITY_CHARS))
        : null;
    }
    case "file_change": {
      const path = typeof payload?.path === "string" ? payload.path : "";
      const kind = typeof payload?.changeKind === "string" ? payload.changeKind : "change";
      return path
        ? row("activity", truncateHead(`File ${kind}: ${path}`, MAX_HANDOFF_ACTIVITY_CHARS))
        : null;
    }
    default:
      return null;
  }
}
