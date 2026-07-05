import type { RuntimeEvent } from "@/shared/contracts";
import { truncate } from "./toolResult";

/** Max finalized entries retained for `read_thread`'s buffered transcript. */
const MAX_ENTRIES = 200;
/** Total-character budget across retained entries (evicts oldest past this). */
const MAX_TOTAL_CHARS = 64_000;
/** Per-entry body cap so one huge message can't dominate the buffer. */
const PER_ENTRY_MAX_CHARS = 4_000;
/** Per-tool summary cap (command/path/query lines). */
const TOOL_SUMMARY_MAX_CHARS = 500;
/** Cap on the live "last assistant message" accumulator (feeds finalResult). */
const LIVE_ASSISTANT_MAX_CHARS = 20_000;

/** Item types whose completion is recorded as a compact tool row. */
const TOOL_TYPES: ReadonlySet<string> = new Set([
  "tool_call",
  "mcp_tool_call",
  "dynamic_tool_call",
  "image_view",
  "command_execution",
  "file_change",
  "web_search",
]);

/**
 * One finalized row of the compact structured transcript. Provider-agnostic —
 * derived from canonical runtime events, never provider-native payloads.
 */
export type TranscriptEntry =
  | { kind: "assistant"; text: string }
  | { kind: "user"; text: string }
  | { kind: "tool"; name: string; status?: string; summary?: string }
  | { kind: "error"; message: string }
  | { kind: "turn_end"; state: string };

interface OpenItem {
  type: string;
  text: string;
  name?: string;
  status?: string;
  summary?: string;
}

/**
 * Per-child ring buffer of a compact, structured transcript built from the
 * canonical runtime-event stream. Serves `read_thread` for agents whose adapter
 * has no native `readThread` (Claude/Codex/ACP) and after the session closes,
 * and tracks the concluding assistant message so the manager can snapshot a
 * durable final result on turn completion.
 *
 * Bounded by both entry count and total characters so it can't grow without
 * limit for a long-running child.
 */
export class ChildTranscriptBuffer {
  private readonly entries: TranscriptEntry[] = [];
  private totalChars = 0;
  private readonly open = new Map<string, OpenItem>();
  private liveAssistantItemId: string | undefined;
  private liveAssistantText = "";

  /** Fold one canonical runtime event into the buffer. Ignores unrelated kinds. */
  ingest(event: RuntimeEvent): void {
    switch (event.type) {
      case "item.started": {
        const item: OpenItem = { type: event.itemType, text: extractContentText(event.payload) };
        if (TOOL_TYPES.has(event.itemType)) mergeToolMeta(item, event.itemType, event.payload);
        this.open.set(event.itemId, item);
        if (event.itemType === "assistant_message" && item.text) {
          this.setAssistant(event.itemId, item.text);
        }
        return;
      }
      case "item.updated": {
        const item = this.open.get(event.itemId);
        if (!item) return;
        this.applyPayload(event.itemId, item, event.payload);
        return;
      }
      case "item.completed": {
        const item = this.open.get(event.itemId) ?? { type: "assistant_message", text: "" };
        this.applyPayload(event.itemId, item, event.payload);
        this.finalize(item);
        this.open.delete(event.itemId);
        return;
      }
      case "content.delta": {
        if (event.stream !== "assistant_text") return;
        const item = this.open.get(event.itemId) ?? { type: "assistant_message", text: "" };
        item.type = "assistant_message";
        item.text = capTail(item.text + event.delta, LIVE_ASSISTANT_MAX_CHARS);
        this.open.set(event.itemId, item);
        this.appendAssistantDelta(event.itemId, event.delta);
        return;
      }
      case "error": {
        const message = event.message.trim();
        if (message) this.push({ kind: "error", message: truncate(message, PER_ENTRY_MAX_CHARS) });
        return;
      }
      case "turn.completed": {
        for (const item of this.open.values()) this.finalize(item);
        this.open.clear();
        if (event.state !== "completed") this.push({ kind: "turn_end", state: event.state });
        return;
      }
      default:
        return;
    }
  }

  /** Text of the most recent assistant message (the concluding message of the last turn). */
  lastAssistantMessage(): string {
    return this.liveAssistantText;
  }

  /** Oldest→newest slice of the finalized transcript, capped to `limit` entries. */
  snapshot(limit: number): TranscriptEntry[] {
    const n = Math.min(Math.max(Math.trunc(limit) || 1, 1), MAX_ENTRIES);
    return this.entries.slice(-n);
  }

  /** Number of finalized entries currently retained. */
  get size(): number {
    return this.entries.length;
  }

  /** Fold an item.updated/completed payload into an open item (text, tool meta, assistant tracking). */
  private applyPayload(itemId: string, item: OpenItem, payload: unknown): void {
    const text = extractContentText(payload);
    if (text) item.text = text;
    if (TOOL_TYPES.has(item.type)) mergeToolMeta(item, item.type, payload);
    if (item.type === "assistant_message" && text) this.setAssistant(itemId, text);
  }

  private setAssistant(itemId: string, text: string): void {
    this.liveAssistantItemId = itemId;
    this.liveAssistantText = capTail(text, LIVE_ASSISTANT_MAX_CHARS);
  }

  private appendAssistantDelta(itemId: string, delta: string): void {
    if (itemId !== this.liveAssistantItemId) {
      this.liveAssistantItemId = itemId;
      this.liveAssistantText = delta;
    } else {
      this.liveAssistantText += delta;
    }
    this.liveAssistantText = capTail(this.liveAssistantText, LIVE_ASSISTANT_MAX_CHARS);
  }

  private finalize(item: OpenItem): void {
    const text = item.text.trim();
    if (item.type === "assistant_message") {
      if (text) this.push({ kind: "assistant", text: truncate(text, PER_ENTRY_MAX_CHARS) });
      return;
    }
    if (item.type === "user_message") {
      if (text) this.push({ kind: "user", text: truncate(text, PER_ENTRY_MAX_CHARS) });
      return;
    }
    if (item.type === "error") {
      if (text) this.push({ kind: "error", message: truncate(text, PER_ENTRY_MAX_CHARS) });
      return;
    }
    if (TOOL_TYPES.has(item.type)) {
      this.push({
        kind: "tool",
        name: item.name ?? item.type,
        ...(item.status ? { status: item.status } : {}),
        ...(item.summary ? { summary: truncate(item.summary, TOOL_SUMMARY_MAX_CHARS) } : {}),
      });
    }
  }

  private push(entry: TranscriptEntry): void {
    this.entries.push(entry);
    this.totalChars += entryChars(entry);
    while (
      this.entries.length > 0 &&
      (this.entries.length > MAX_ENTRIES || this.totalChars > MAX_TOTAL_CHARS)
    ) {
      const removed = this.entries.shift();
      if (!removed) break;
      this.totalChars -= entryChars(removed);
    }
  }
}

function entryChars(entry: TranscriptEntry): number {
  switch (entry.kind) {
    case "assistant":
    case "user":
      return entry.text.length;
    case "error":
      return entry.message.length;
    case "tool":
      return (entry.name.length + (entry.summary?.length ?? 0)) | 0;
    case "turn_end":
      return entry.state.length;
  }
}

function mergeToolMeta(item: OpenItem, type: string, payload: unknown): void {
  const p = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const status = typeof p.status === "string" ? p.status : undefined;
  if (status) item.status = status;
  if (type === "command_execution") {
    item.name = "command";
    if (typeof p.command === "string" && p.command) item.summary = p.command;
    return;
  }
  if (type === "file_change") {
    item.name = "file_change";
    const path = typeof p.path === "string" ? p.path : undefined;
    const changeKind = typeof p.changeKind === "string" ? p.changeKind : undefined;
    if (path) item.summary = changeKind ? `${changeKind} ${path}` : path;
    return;
  }
  if (type === "web_search") {
    item.name = "web_search";
    if (typeof p.query === "string" && p.query) item.summary = p.query;
    return;
  }
  const name = typeof p.name === "string" && p.name ? p.name : undefined;
  const title = typeof p.title === "string" && p.title ? p.title : undefined;
  if (name) item.name = name;
  else if (title) item.name = title;
  if (title && title !== item.name) item.summary = title;
}

/** Join canonical text content blocks (`{ kind: "text", text }`) into a plain string. */
function extractContentText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const content = (payload as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (block && typeof block === "object" && (block as { kind?: unknown }).kind === "text") {
      const text = (block as { text?: unknown }).text;
      if (typeof text === "string" && text) parts.push(text);
    }
  }
  return parts.join("");
}

function capTail(text: string, maxChars: number): string {
  return text.length > maxChars ? text.slice(-maxChars) : text;
}
