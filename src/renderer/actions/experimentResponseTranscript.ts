import type { PersistedRuntimeItem } from "@/shared/ipc";
import { MAX_EXPERIMENT_RESPONSE_LENGTH } from "@/shared/contracts";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function textFromRuntimeContentBlock(block: unknown): string {
  const record = asRecord(block);
  if (!record) return "";
  if (record.kind === "text" && typeof record.text === "string") return record.text;
  if (record.kind === "file" && typeof record.path === "string") return `@${record.path}`;
  if (record.kind === "image") {
    if (typeof record.path === "string") return `@${record.path}`;
    if (typeof record.name === "string") return `[image: ${record.name}]`;
    return "[image]";
  }
  return "";
}

export function textFromRuntimeContentBlocks(payload: unknown, maxChars?: number): string {
  const content = asRecord(payload)?.content;
  if (!Array.isArray(content)) return "";
  if (maxChars === undefined) {
    return content.map(textFromRuntimeContentBlock).filter(Boolean).join("\n");
  }
  const parts: string[] = [];
  let length = 0;
  for (let index = content.length - 1; index >= 0; index -= 1) {
    const text = textFromRuntimeContentBlock(content[index]);
    if (!text) continue;
    const separatorLength = parts.length > 0 ? 1 : 0;
    const remaining = maxChars - length - separatorLength;
    if (remaining <= 0) break;
    parts.push(text.length > remaining ? text.slice(-remaining) : text);
    length += separatorLength + Math.min(text.length, remaining);
    if (text.length > remaining) break;
  }
  return parts.reverse().join("\n");
}

function formatChatMessage(item: PersistedRuntimeItem): string | null {
  if (item.parentItemId) return null;
  if (item.type === "user_message") {
    const text = textFromRuntimeContentBlocks(item.payload);
    return text ? `User:\n${text}` : null;
  }
  if (item.type === "assistant_message") {
    const text = textFromRuntimeContentBlocks(item.payload) || item.streams.assistant_text;
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
