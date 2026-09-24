import { stripInjectedContext } from "./text";
import { closeSync, openSync, readSync } from "node:fs";
import { StringDecoder } from "node:string_decoder";
import {
  capMessageText,
  type ImportedMessage,
  type ImportedTranscript,
} from "@/shared/sessionImport/transcript";

/**
 * Codex rollout files are JSONL. The first line is `session_meta`; conversation
 * turns are `response_item` lines whose payload is a `message`. Everything else
 * (`reasoning`, `*_tool_call*`, `event_msg`, `turn_context`, `world_state`) is
 * machinery the import deliberately drops.
 */

interface CodexHead {
  providerSessionId?: string;
  cwd?: string;
  startedAt?: string;
}

const READ_CHUNK_BYTES = 64 * 1024;

/**
 * Yields lines from a file without holding the whole thing in memory: a
 * chunk is read into a fixed buffer, decoded (`StringDecoder` carries a
 * multi-byte character split across the chunk boundary), and split on `\n`,
 * with the trailing partial line carried into the next chunk. At most one
 * chunk plus one in-progress line is held at a time.
 */
function* readLinesSync(path: string): Generator<string> {
  const fd = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(READ_CHUNK_BYTES);
    const decoder = new StringDecoder("utf8");
    let remainder = "";
    for (;;) {
      const bytesRead = readSync(fd, buffer, 0, READ_CHUNK_BYTES, null);
      if (bytesRead === 0) break;
      remainder += decoder.write(buffer.subarray(0, bytesRead));
      let newlineIndex = remainder.indexOf("\n");
      while (newlineIndex !== -1) {
        yield remainder.slice(0, newlineIndex);
        remainder = remainder.slice(newlineIndex + 1);
        newlineIndex = remainder.indexOf("\n");
      }
    }
    remainder += decoder.end();
    if (remainder.length > 0) yield remainder;
  } finally {
    closeSync(fd);
  }
}

function parseLine(line: string): Record<string, unknown> | undefined {
  const trimmed = line.trim();
  if (trimmed.length === 0) return undefined;
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function headFrom(entry: Record<string, unknown>): CodexHead | undefined {
  if (entry["type"] !== "session_meta") return undefined;
  const payload = entry["payload"];
  if (!payload || typeof payload !== "object") return undefined;
  const meta = payload as Record<string, unknown>;
  const head: CodexHead = {};
  if (typeof meta["session_id"] === "string") head.providerSessionId = meta["session_id"];
  if (typeof meta["cwd"] === "string") head.cwd = meta["cwd"];
  if (typeof meta["timestamp"] === "string") head.startedAt = meta["timestamp"];
  return head;
}

function messageFrom(entry: Record<string, unknown>): ImportedMessage | undefined {
  if (entry["type"] !== "response_item") return undefined;
  const payload = entry["payload"];
  if (!payload || typeof payload !== "object") return undefined;
  const item = payload as Record<string, unknown>;
  if (item["type"] !== "message") return undefined;
  const role = item["role"];
  if (role !== "user" && role !== "assistant") return undefined;

  const content = item["content"];
  if (!Array.isArray(content)) return undefined;
  const raw = content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const block = part as Record<string, unknown>;
      const kind = block["type"];
      if (kind !== "input_text" && kind !== "output_text") return "";
      return typeof block["text"] === "string" ? block["text"] : "";
    })
    .join("");
  // Codex prefixes a turn with plugin catalogues, environment dumps, and
  // AGENTS.md — words the user never typed. What survives stripping is the
  // real message, and a turn that was pure context leaves nothing.
  const text = role === "user" ? stripInjectedContext(raw) : raw;
  if (text.trim().length === 0) return undefined;

  const at = entry["timestamp"];
  return {
    role,
    text: capMessageText(text),
    ...(typeof at === "string" ? { at } : {}),
  };
}

export function parseCodexTranscript(path: string): ImportedTranscript {
  const transcript: ImportedTranscript = { messages: [] };
  for (const line of readLinesSync(path)) {
    const entry = parseLine(line);
    if (!entry) continue;
    const head = headFrom(entry);
    if (head) {
      Object.assign(transcript, head);
      continue;
    }
    const message = messageFrom(entry);
    if (message) transcript.messages.push(message);
  }
  return transcript;
}
