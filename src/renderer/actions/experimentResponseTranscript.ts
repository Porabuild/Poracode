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

function joinTranscriptParts(parts: readonly string[], maxChars?: number): string {
  const present = parts.filter(Boolean);
  if (maxChars === undefined) return present.join("\n");
  const kept: string[] = [];
  let length = 0;
  for (let index = present.length - 1; index >= 0; index -= 1) {
    const text = present[index]!;
    const separatorLength = kept.length > 0 ? 1 : 0;
    const remaining = maxChars - length - separatorLength;
    if (remaining <= 0) break;
    kept.push(text.length > remaining ? text.slice(-remaining) : text);
    length += separatorLength + Math.min(text.length, remaining);
    if (text.length > remaining) break;
  }
  return kept.reverse().join("\n");
}

function projectRuntimeContentBlocks(
  payload: unknown,
  maxChars: number | undefined,
  includeText: boolean,
): string {
  const content = asRecord(payload)?.content;
  if (!Array.isArray(content)) return "";
  return joinTranscriptParts(
    content.map((block) => textFromRuntimeContentBlock(block, includeText)),
    maxChars,
  );
}

export function textFromRuntimeContentBlocks(payload: unknown, maxChars?: number): string {
  return projectRuntimeContentBlocks(payload, maxChars, true);
}

export function assistantTranscriptContent(item: PersistedRuntimeItem, maxChars?: number): string {
  return joinTranscriptParts(
    [assistantDisplayText(item), projectRuntimeContentBlocks(item.payload, undefined, false)],
    maxChars,
  );
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
