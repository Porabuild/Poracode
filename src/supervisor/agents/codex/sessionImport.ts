import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  asRecord,
  parseJsonRecord,
  readFileLines,
  stripInjectedContext,
  type ImportedTranscript,
  type ImportedTranscriptMessage,
  type SessionImportSource,
} from "../base/sessionImport";
import { parseCodexRolloutMeta, parseCodexSessionIndex } from "./sessionFiles";

/** Context Codex packs into `user` turns ahead of what the user typed. */
const INJECTED_TAGS = [
  "app-context",
  "recommended_plugins",
  "environment_context",
  "user_instructions",
  "INSTRUCTIONS",
];
const AGENTS_HEADING_RE = /^\s*#\s*AGENTS\.md instructions[^\n]*/u;

function messageFrom(record: Record<string, unknown>): ImportedTranscriptMessage | undefined {
  if (record["type"] !== "response_item") return undefined;
  const item = asRecord(record["payload"]);
  if (item?.["type"] !== "message") return undefined;
  const role = item["role"];
  if ((role !== "user" && role !== "assistant") || !Array.isArray(item["content"])) {
    return undefined;
  }
  const raw = item["content"]
    .map((part) => {
      const block = asRecord(part);
      const kind = block?.["type"];
      return (kind === "input_text" || kind === "output_text") &&
        typeof block?.["text"] === "string"
        ? block["text"]
        : "";
    })
    .join("");
  const text =
    role === "user"
      ? stripInjectedContext(raw, INJECTED_TAGS).replace(AGENTS_HEADING_RE, "").trim()
      : raw.trim();
  return text ? { role, text } : undefined;
}

/**
 * Codex rollouts (`<home>/sessions/**\/rollout-*.jsonl`). Identity comes from
 * the same `session_meta.payload.id` / filename contract resume discovery uses
 * (`parseCodexRolloutMeta`), so a fork never inherits its root's id.
 */
export function createCodexSessionImport(
  codexHome = join(homedir(), ".codex"),
): SessionImportSource {
  return {
    roots: [join(codexHome, "sessions")],
    acceptFile: (name) => name.startsWith("rollout-") && name.endsWith(".jsonl"),
    async summarize(file) {
      let firstLine: string | undefined;
      let model: string | undefined;
      let preview: string | undefined;
      for await (const line of file.headLines()) {
        if (firstLine === undefined) {
          firstLine = line;
          continue;
        }
        const record = parseJsonRecord(line);
        if (!record) continue;
        if (record["type"] === "turn_context") {
          const value = asRecord(record["payload"])?.["model"];
          if (typeof value === "string") model ??= value;
        }
        const message = messageFrom(record);
        if (message?.role === "user") preview ??= message.text;
        if (preview !== undefined && model !== undefined) break;
      }
      // A first line past the read budget fails to parse; the helper then
      // falls back to the id in the filename.
      const meta = parseCodexRolloutMeta(file.path, firstLine ?? "");
      if (!meta || meta.subagent || meta.source === "exec" || meta.originator === "codex_exec") {
        return undefined;
      }
      return {
        providerSessionId: meta.id,
        ...(meta.cwd ? { cwd: meta.cwd } : {}),
        ...(meta.startedAt ? { startedAt: meta.startedAt } : {}),
        ...(model ? { model } : {}),
        ...(preview ? { preview } : {}),
      };
    },
    async readTitles() {
      let raw: string;
      try {
        raw = await readFile(join(codexHome, "session_index.jsonl"), "utf8");
      } catch {
        return new Map();
      }
      const titles = new Map<string, string>();
      const entries = parseCodexSessionIndex(raw).toSorted((a, b) => a.updatedAt - b.updatedAt);
      for (const entry of entries) {
        if (entry.threadName) titles.set(entry.id, entry.threadName);
      }
      return titles;
    },
    async readTranscript(path) {
      const transcript: ImportedTranscript = { messages: [] };
      let first = true;
      for await (const line of readFileLines(path)) {
        if (first) {
          first = false;
          const meta = parseCodexRolloutMeta(path, line);
          if (meta) transcript.providerSessionId = meta.id;
          continue;
        }
        const record = parseJsonRecord(line);
        const message = record ? messageFrom(record) : undefined;
        if (message) transcript.messages.push(message);
      }
      return transcript;
    },
  };
}
