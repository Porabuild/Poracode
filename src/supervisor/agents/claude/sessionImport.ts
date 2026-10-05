import { basename, join } from "node:path";
import {
  asRecord,
  parseJsonRecord,
  readFileLines,
  stripInjectedContext,
  type ImportedTranscript,
  type ImportedTranscriptMessage,
  type SessionImportSource,
} from "../base/sessionImport";

/** Machine blocks Claude Code writes into the `user` role. */
const INJECTED_TAGS = [
  "system-reminder",
  "task-notification",
  "local-command-stdout",
  "local-command-stderr",
  "local-command-caveat",
  "command-name",
  "command-message",
  "command-args",
];
const INTERRUPTION_MARKER_RE = /^\[Request interrupted by user(?: for tool use)?\]$/u;

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      const block = asRecord(part);
      return block?.["type"] === "text" && typeof block["text"] === "string" ? block["text"] : "";
    })
    .join("");
}

/** A conversation turn the user saw in their own pane, or `undefined` for machinery. */
function messageFrom(record: Record<string, unknown>): ImportedTranscriptMessage | undefined {
  const role = record["type"];
  if (role !== "user" && role !== "assistant") return undefined;
  if (record["isSidechain"] === true || record["isMeta"] === true) return undefined;
  const raw = textFromContent(asRecord(record["message"])?.["content"]);
  const text = role === "user" ? stripInjectedContext(raw, INJECTED_TAGS) : raw.trim();
  if (!text || (role === "user" && INTERRUPTION_MARKER_RE.test(text))) return undefined;
  return { role, text };
}

function customTitle(record: Record<string, unknown> | undefined): string | undefined {
  if (record?.["type"] === "custom-title" && typeof record["customTitle"] === "string") {
    return record["customTitle"].trim() || undefined;
  }
  if (record?.["type"] === "summary" && typeof record["summary"] === "string") {
    return record["summary"].trim() || undefined;
  }
  return undefined;
}

/**
 * Claude Code transcripts (`<config>/projects/<encoded cwd>/<session id>.jsonl`).
 * The file stem is the id `--resume` looks up; `agent-*` files and sidechain
 * logs are sub-agent traffic, not conversations of their own.
 */
export function createClaudeSessionImport(configDir: string): SessionImportSource {
  return {
    roots: [join(configDir, "projects")],
    acceptFile: (name) => name.endsWith(".jsonl") && !name.startsWith("agent-"),
    async summarize(file) {
      let cwd: string | undefined;
      let startedAt: string | undefined;
      let model: string | undefined;
      let preview: string | undefined;
      let title: string | undefined;
      let sawTurn = false;
      for await (const line of file.headLines()) {
        const record = parseJsonRecord(line);
        if (!record) continue;
        title = customTitle(record) ?? title;
        const type = record["type"];
        if (type !== "user" && type !== "assistant") continue;
        if (!sawTurn && record["isSidechain"] === true) return undefined;
        sawTurn = true;
        if (typeof record["cwd"] === "string") cwd ??= record["cwd"];
        if (typeof record["timestamp"] === "string") startedAt ??= record["timestamp"];
        const recordModel = asRecord(record["message"])?.["model"];
        if (
          type === "assistant" &&
          typeof recordModel === "string" &&
          recordModel !== "<synthetic>"
        ) {
          model ??= recordModel;
        }
        const message = messageFrom(record);
        if (message?.role === "user") preview ??= message.text;
        if (preview !== undefined && model !== undefined && cwd !== undefined) break;
      }
      if (!sawTurn) return undefined;
      // `/rename` appends its title, so the newest one sits near the end.
      for (const line of (await file.tailLines()).toReversed()) {
        const tailTitle = line.includes("custom-title")
          ? customTitle(parseJsonRecord(line))
          : undefined;
        if (tailTitle) {
          title = tailTitle;
          break;
        }
      }
      return {
        providerSessionId: basename(file.path, ".jsonl"),
        ...(cwd ? { cwd } : {}),
        ...(startedAt ? { startedAt } : {}),
        ...(model ? { model } : {}),
        ...(preview ? { preview } : {}),
        ...(title ? { title } : {}),
      };
    },
    async readTranscript(path) {
      const transcript: ImportedTranscript = {
        providerSessionId: basename(path, ".jsonl"),
        messages: [],
      };
      for await (const line of readFileLines(path)) {
        const record = parseJsonRecord(line);
        const message = record ? messageFrom(record) : undefined;
        if (message) transcript.messages.push(message);
      }
      return transcript;
    },
  };
}
