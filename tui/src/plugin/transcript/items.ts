import type {
  SessionMessageAssistant,
  SessionMessageAssistantTool,
  SessionMessageInfo,
} from "@opencode/client";
import type { ProjectLocation } from "@/shared/contracts";
import { PORACODE_ITEM_KEY, type PoracodeItemMetadata } from "../../adapter/toolMapping";
import {
  isChatToolGroupItem,
  isVisibleRuntimeItem,
  type RuntimeChatItem,
} from "../../desktop/presentation";

export type AssistantPart = SessionMessageAssistant["content"][number];

/** The part a transcript entry names, matching the host's `text:N` / `reasoning:N` / tool-id refs. */
export function resolvePart(message: SessionMessageInfo | undefined, partID: string) {
  if (message?.type !== "assistant") return undefined;
  const tool = message.content.find((part) => part.type === "tool" && part.id === partID);
  if (tool) return tool;
  const match = /^(text|reasoning):(\d+)$/u.exec(partID);
  if (!match) return undefined;
  return message.content.filter((part) => part.type === match[1])[Number(match[2])];
}

/** The `poracode` runtime-item marker inside a metadata record, shape-checked. */
export function poracodeItemOf(metadata: unknown): PoracodeItemMetadata | undefined {
  const value = (metadata as Record<string, unknown> | null | undefined)?.[PORACODE_ITEM_KEY];
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return typeof (value as { type?: unknown }).type === "string"
    ? (value as PoracodeItemMetadata)
    : undefined;
}

function poracodeItem(part: SessionMessageAssistantTool): PoracodeItemMetadata | undefined {
  if (part.state.status === "streaming") return undefined;
  return poracodeItemOf(part.state.metadata);
}

const OUTPUT_STREAMS: Partial<Record<string, "command_output" | "file_change_output">> = {
  command_execution: "command_output",
  file_change: "file_change_output",
};

/** The canonical runtime item behind a tool part, as the desktop chat holds it. */
export function toolChatItem(
  part: SessionMessageAssistantTool,
  live = true,
): RuntimeChatItem | undefined {
  const source = poracodeItem(part);
  if (!source) return undefined;
  const state = part.state;
  let payload: unknown = source.payload ?? undefined;
  // A tool the run closed without a result has no error on its payload; the desktop shows it failed.
  if (state.status === "error" && payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (record.status !== "error")
      payload = { ...record, status: "error", errorMessage: state.error.message };
  }
  const stream = OUTPUT_STREAMS[source.type];
  const output = state.status === "streaming" ? "" : String(state.metadata?.output ?? "");
  return {
    id: part.id,
    type: source.type as RuntimeChatItem["type"],
    // Only a running session keeps a still-open tool live; a part left
    // "running" past its turn (interrupt, restart) reads as a plain row.
    state: state.status === "running" && live ? "updated" : "completed",
    payload,
    streams: stream && output ? { [stream]: output } : {},
  };
}

export function reasoningChatItem(id: string, text: string, completed: boolean): RuntimeChatItem {
  return {
    id,
    type: "reasoning",
    state: completed ? "completed" : "updated",
    payload: {},
    streams: { reasoning_text: text },
  };
}

/** Desktop timeline grouping: the same predicate the GUI's chat pane uses. */
export function joinsRun(item: RuntimeChatItem) {
  return isChatToolGroupItem(item);
}

export function isVisibleItem(item: RuntimeChatItem) {
  return isVisibleRuntimeItem(item);
}

export function projectLocation(directory: string | undefined): ProjectLocation | undefined {
  if (!directory) return undefined;
  return /^[A-Za-z]:[\\/]/u.test(directory)
    ? { kind: "windows", path: directory }
    : { kind: "posix", path: directory };
}

/**
 * When the turn containing `messageID` started, as the host measures turn duration: the first
 * input after the previous idle marker, or the nearest input in history that predates markers.
 */
export function turnStartedAt(messages: readonly SessionMessageInfo[], messageID: string) {
  const index = messages.findIndex((message) => message.id === messageID);
  if (index < 0) return undefined;
  const legacy = !messages.some((message) => message.type === "idle");
  let started: number | undefined;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const message = messages[cursor]!;
    if (message.type === "idle") break;
    if (message.type !== "user" && message.type !== "synthetic") continue;
    started = message.time.created;
    if (legacy) break;
  }
  return started ?? messages[index]!.time.created;
}
