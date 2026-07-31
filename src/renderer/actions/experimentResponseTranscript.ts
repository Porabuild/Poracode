import type { PersistedRuntimeItem } from "@/shared/ipc";
import { MAX_EXPERIMENT_RESPONSE_LENGTH } from "@/shared/contracts";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function textFromContentBlocks(payload: unknown): string {
  const content = asRecord(payload)?.content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
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
    })
    .filter(Boolean)
    .join("\n");
}

function formatChatMessage(item: PersistedRuntimeItem): string | null {
  if (item.parentItemId) return null;
  if (item.type === "user_message") {
    const text = textFromContentBlocks(item.payload);
    return text ? `User:\n${text}` : null;
  }
  if (item.type === "assistant_message") {
    const text = textFromContentBlocks(item.payload) || item.streams.assistant_text;
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
