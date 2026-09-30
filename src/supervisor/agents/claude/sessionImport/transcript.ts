import { stripInjectedContext, CLAUDE_METADATA_RECORD_TYPES } from "./text";
import { closeSync, openSync, readSync } from "node:fs";
import { basename } from "node:path";
import { StringDecoder } from "node:string_decoder";
import {
  capMessageText,
  type ImportedMessage,
  type ImportedTranscript,
} from "@/shared/sessionImport/transcript";

/**
 * Claude Code writes one JSONL file per session under
 * `<home>/projects/<encoded cwd>/<session id>.jsonl`. Conversation lines are
 * `type: "user" | "assistant"`; everything else on the stream (hooks, queue
 * operations, bridge/session bookkeeping) is machinery. `isSidechain` marks
 * sub-agent traffic, which the import drops so the transcript matches what the
 * user actually saw in their own pane.
 */

/**
 * Claude Code writes its own bracketed notes into the `user` role when a turn
 * is cut short. They are transcript bookkeeping, not something the user typed,
 * so a message consisting only of one is dropped.
 */
const INTERRUPTION_MARKER_RE = /^\s*\[Request interrupted by user(?: for tool use)?\]\s*$/u;

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

function sessionIdFromFileName(path: string): string {
  return basename(path).replace(/\.jsonl$/iu, "");
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const block = part as Record<string, unknown>;
      if (block["type"] !== "text") return "";
      return typeof block["text"] === "string" ? block["text"] : "";
    })
    .join("");
}

function messageFrom(entry: Record<string, unknown>): ImportedMessage | undefined {
  const role = entry["type"];
  if (role !== "user" && role !== "assistant") return undefined;
  if (entry["isSidechain"] === true) return undefined;
  const message = entry["message"];
  if (!message || typeof message !== "object") return undefined;
  const raw = textFromContent((message as Record<string, unknown>)["content"]);
  if (raw.trim().length === 0) return undefined;
  // Claude Code writes machine blocks (task notifications, slash-command
  // echoes, system reminders) into the user role as plain text. Strip them so
  // only what the user actually typed is replayed.
  const text = role === "user" ? stripInjectedContext(raw) : raw;
  if (text.trim().length === 0) return undefined;
  // Tested after stripping, not before: the marker can share its turn with a
  // system reminder, and the anchored pattern fails against the two together
  // — the turn would then strip down to the bare marker and be replayed as
  // if the user had typed it.
  if (role === "user" && INTERRUPTION_MARKER_RE.test(text)) return undefined;
  const at = entry["timestamp"];
  return {
    role,
    text: capMessageText(text),
    ...(typeof at === "string" ? { at } : {}),
  };
}

export function parseClaudeTranscript(path: string): ImportedTranscript {
  const transcript: ImportedTranscript = {
    providerSessionId: sessionIdFromFileName(path),
    messages: [],
  };
  for (const line of readLinesSync(path)) {
    const entry = parseLine(line);
    if (!entry) continue;
    // Same gate the scan applies (`CLAUDE_METADATA_RECORD_TYPES`): every
    // Claude record carries `cwd` and `timestamp` as plain top-level fields,
    // so a `file-history-snapshot` or any other machinery record would
    // otherwise decide what folder — and, last-wins, what session — the
    // imported thread believes in.
    const type = entry["type"];
    if (typeof type === "string" && CLAUDE_METADATA_RECORD_TYPES.has(type)) {
      if (typeof entry["sessionId"] === "string") transcript.providerSessionId = entry["sessionId"];
      if (!transcript.cwd && typeof entry["cwd"] === "string") transcript.cwd = entry["cwd"];
      if (!transcript.startedAt && typeof entry["timestamp"] === "string") {
        transcript.startedAt = entry["timestamp"];
      }
    }
    const message = messageFrom(entry);
    if (message) transcript.messages.push(message);
  }
  return transcript;
}
