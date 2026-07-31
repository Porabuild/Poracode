import { readFile } from "node:fs/promises";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ProjectLocation, RuntimeEvent } from "@/shared/contracts";
import {
  closeClaudeOpenItems,
  createClaudeMapperState,
  mapClaudeSdkMessage,
} from "../agents/claude/sdkCanonicalMapping";
import { manifestUncPath } from "./transcriptReader";

/**
 * Convert a workflow agent's on-disk transcript (`agent-<id>.jsonl`) into the
 * same canonical runtime events a live thread produces, so the overlay can
 * render the agent's chat with the real chat timeline (ChatItemRow) instead of
 * bespoke transcript boxes.
 *
 * The jsonl lines carry full Claude SDK messages, so they run through the
 * regular Claude canonical mapper. Two transcript-specific adjustments:
 * - plain user text (the agent's prompt) is synthesized into a `user_message`
 *   item — the mapper only consumes `tool_result` user content;
 * - item ids are remapped to a deterministic per-agent sequence so a re-read
 *   of the (append-only) file yields identical events for the same lines.
 */
export interface ReadWorkflowAgentChatInput {
  /** Synthetic renderer-side thread id the events are keyed under. */
  threadId: string;
  transcriptDir: string;
  agentId: string;
  /** When true, dangling open items are flushed to completed. */
  agentFinished: boolean;
  location: ProjectLocation;
}

export async function readWorkflowAgentChatEvents(
  input: ReadWorkflowAgentChatInput,
): Promise<RuntimeEvent[]> {
  let raw: string;
  try {
    raw = await readFile(agentJsonlPath(input), "utf8");
  } catch (err) {
    if (isNotFoundError(err)) return [];
    throw err;
  }

  const state = createClaudeMapperState(input.threadId);
  const events: RuntimeEvent[] = [];
  let userMessageCount = 0;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let record: unknown;
    try {
      record = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!record || typeof record !== "object") continue;
    const obj = record as Record<string, unknown>;
    const type = obj.type;
    if (type !== "user" && type !== "assistant") continue;

    if (type === "user") {
      const text = plainUserText(obj);
      if (text) {
        userMessageCount += 1;
        const itemId = `user-${userMessageCount}`;
        events.push(
          {
            type: "item.started",
            threadId: input.threadId,
            itemId,
            itemType: "user_message",
            payload: { content: [{ kind: "text", text }] },
          },
          { type: "item.completed", threadId: input.threadId, itemId },
        );
      }
    }

    events.push(...mapClaudeSdkMessage(obj as unknown as SDKMessage, state));

    // Full (non-streamed) assistant messages complete their text items
    // immediately, but the per-index maps persist — without a clear, the next
    // message's block 0 would collide with a completed slot and be dropped.
    // (In live streaming `message_start` performs this reset.)
    if (type === "assistant") {
      state.assistantTextItems.clear();
      state.reasoningItems.clear();
    }
  }

  if (input.agentFinished) {
    events.push(...closeClaudeOpenItems(state));
  }

  return remapDeterministicIds(
    events.filter(
      (event) =>
        event.type === "item.started" ||
        event.type === "item.updated" ||
        event.type === "item.completed" ||
        event.type === "content.delta",
    ),
    input.agentId,
  );
}

/**
 * Extract the plain text of a user message that is NOT a tool_result (i.e. the
 * agent's prompt). String content is the common SDK shape; array content may
 * carry text blocks alongside tool_results — only the text blocks count here.
 */
function plainUserText(obj: Record<string, unknown>): string | undefined {
  const message = obj.message;
  if (!message || typeof message !== "object") return undefined;
  const content = (message as Record<string, unknown>).content;
  if (typeof content === "string") return content.trim() || undefined;
  if (!Array.isArray(content)) return undefined;
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const blockObj = block as Record<string, unknown>;
    if (blockObj.type === "text" && typeof blockObj.text === "string" && blockObj.text.length > 0) {
      parts.push(blockObj.text);
    }
  }
  const joined = parts.join("\n").trim();
  return joined || undefined;
}

/**
 * Rewrite mapper-generated item ids (random per invocation) into a stable
 * `wfa-<agentId>-<n>` sequence assigned in first-appearance order. The jsonl
 * is append-only, so re-reads produce the same events for the same prefix of
 * lines and the ids stay identical across polls.
 */
function remapDeterministicIds(events: RuntimeEvent[], agentId: string): RuntimeEvent[] {
  const idMap = new Map<string, string>();
  const mapId = (itemId: string): string => {
    let mapped = idMap.get(itemId);
    if (!mapped) {
      mapped = `wfa-${agentId}-${idMap.size + 1}`;
      idMap.set(itemId, mapped);
    }
    return mapped;
  };
  return events.map((event) =>
    "itemId" in event && typeof event.itemId === "string"
      ? { ...event, itemId: mapId(event.itemId) }
      : event,
  );
}

function agentJsonlPath(input: ReadWorkflowAgentChatInput): string {
  const dir =
    input.location.kind === "wsl"
      ? manifestUncPath(input.location.uncPath, input.location.linuxPath, input.transcriptDir)
      : input.transcriptDir;
  const sep = dir.includes("\\") ? "\\" : "/";
  return `${dir.replace(/[\\/]+$/u, "")}${sep}agent-${input.agentId}.jsonl`;
}

function isNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  if (code === "ENOENT") return true;
  const message = err instanceof Error ? err.message : String(err);
  return /ENOENT|no such file/i.test(message);
}
