import type { PersistedRuntimeItem } from "@/shared/ipc";
import { assistantDisplayText } from "@/shared/assistantMessageText";
import { MAX_EXPERIMENT_RESPONSE_LENGTH } from "@/shared/contracts";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function textFromRuntimeContentBlock(block: unknown, includeText: boolean): string {
  const record = asRecord(block);
  if (!record) return "";
  if (includeText && record.kind === "text" && typeof record.text === "string") return record.text;
  if (record.kind === "file" && typeof record.path === "string") return `@${record.path}`;
  if (record.kind === "mcp" && typeof record.name === "string") return `@${record.name}`;
  if (
    record.kind === "thread" &&
    typeof record.title === "string" &&
    typeof record.threadId === "string"
  ) {
    return `@${record.title || record.threadId}`;
  }
  if (record.kind === "image") {
    if (typeof record.path === "string") return `@${record.path}`;
    if (typeof record.name === "string") return `[image: ${record.name}]`;
    return "[image]";
  }
  return "";
}

function joinTranscriptParts(parts: readonly string[]): string {
  return parts.filter(Boolean).join("\n");
}

function projectRuntimeContentBlocks(payload: unknown, includeText: boolean): string {
  const content = asRecord(payload)?.content;
  if (!Array.isArray(content)) return "";
  return joinTranscriptParts(
    content.map((block) => textFromRuntimeContentBlock(block, includeText)),
  );
}

export function textFromRuntimeContentBlocks(payload: unknown): string {
  return projectRuntimeContentBlocks(payload, true);
}

export function assistantTranscriptContent(item: PersistedRuntimeItem): string {
  return joinTranscriptParts([
    assistantDisplayText(item),
    projectRuntimeContentBlocks(item.payload, false),
  ]);
}

function formatChatMessage(item: PersistedRuntimeItem): string | null {
  if (item.parentItemId) return null;
  if (item.type === "user_message") {
    const text = textFromRuntimeContentBlocks(item.payload);
    return text ? `User:\n${text}` : null;
  }
  if (item.type === "assistant_message") {
    // Display truth only: exports carry what the user saw, so text a display
    // hook suppressed or replaced never leaks into the experiment response.
    const text = assistantTranscriptContent(item);
    return text ? `Assistant:\n${text}` : null;
  }
  return null;
}

export function buildExperimentResponseTranscript(items: readonly PersistedRuntimeItem[]): string {
  const transcript = items
    .map(formatChatMessage)
    .filter((message): message is string => Boolean(message?.trim()))
    .join("\n\n");
  if (transcript.length <= MAX_EXPERIMENT_RESPONSE_LENGTH) return transcript;
  const prefix = "[earlier chat truncated]\n\n";
  return `${prefix}${transcript.slice(-(MAX_EXPERIMENT_RESPONSE_LENGTH - prefix.length))}`;
}
