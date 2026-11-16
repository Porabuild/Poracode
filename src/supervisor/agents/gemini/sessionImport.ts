import { readFile, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
  asRecord,
  parseJsonRecord,
  readFileLines,
  stripInjectedContext,
  type ImportedTranscript,
  type ImportedTranscriptMessage,
  type SessionImportFile,
  type SessionImportSource,
  type SessionImportSummary,
} from "../base/sessionImport";
import { resolveGeminiConfigDir } from "./session";

const MAX_JSON_SUMMARY_BYTES = 16 * 1024 * 1024;

interface GeminiTranscriptMessage {
  id: string;
  type: string;
  content: unknown;
  model?: string;
}

interface ParsedGeminiConversation {
  sessionId?: string;
  startTime?: string;
  summary?: string;
  kind?: string;
  directories?: string[];
  messages: GeminiTranscriptMessage[];
}

function extractPartListText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        const rec = asRecord(part);
        return typeof rec?.text === "string" ? rec.text : "";
      })
      .filter((s) => s.length > 0)
      .join("\n");
  }
  const rec = asRecord(content);
  if (typeof rec?.text === "string") return rec.text;
  return "";
}

function applyJsonlRecord(
  state: ParsedGeminiConversation,
  messagesMap: Map<string, GeminiTranscriptMessage>,
  record: Record<string, unknown>,
): void {
  if (typeof record.$rewindTo === "string") {
    let found = false;
    const toDelete: string[] = [];
    for (const id of messagesMap.keys()) {
      if (id === record.$rewindTo) found = true;
      if (found) toDelete.push(id);
    }
    if (found) {
      for (const id of toDelete) messagesMap.delete(id);
    } else {
      messagesMap.clear();
    }
    return;
  }

  const patchObj = asRecord(record.$patch);
  if (patchObj) {
    const applyPatch = (patch: Record<string, unknown>) => {
      const id = typeof patch.id === "string" ? patch.id : undefined;
      if (!id) return;
      const existing = messagesMap.get(id);
      if (!existing) return;
      if (patch.content !== undefined) {
        existing.content = patch.content;
      }
    };
    if (typeof patchObj.id === "string") applyPatch(patchObj);
    if (Array.isArray(patchObj.updates)) {
      for (const entry of patchObj.updates) {
        const rec = asRecord(entry);
        if (rec) applyPatch(rec);
      }
    }
    if (Array.isArray(patchObj.removeIds)) {
      for (const id of patchObj.removeIds) {
        if (typeof id === "string") messagesMap.delete(id);
      }
    }
    if (Array.isArray(patchObj.orderIds)) {
      const ordered: Array<[string, GeminiTranscriptMessage]> = [];
      for (const id of patchObj.orderIds) {
        if (typeof id !== "string") continue;
        const msg = messagesMap.get(id);
        if (!msg) continue;
        ordered.push([id, msg]);
        messagesMap.delete(id);
      }
      for (const [id, msg] of ordered) {
        messagesMap.set(id, msg);
      }
    }
    return;
  }

  const setObj = asRecord(record.$set);
  if (setObj) {
    if (typeof setObj.sessionId === "string") state.sessionId = setObj.sessionId;
    if (typeof setObj.startTime === "string") state.startTime = setObj.startTime;
    if (typeof setObj.summary === "string") state.summary = setObj.summary;
    if (typeof setObj.kind === "string") state.kind = setObj.kind;
    if (Array.isArray(setObj.directories)) {
      state.directories = setObj.directories.filter(
        (d): d is string => typeof d === "string" && d.length > 0,
      );
    }
    if (Array.isArray(setObj.messages)) {
      messagesMap.clear();
      for (const item of setObj.messages) {
        const rec = asRecord(item);
        if (typeof rec?.id === "string" && typeof rec.type === "string") {
          messagesMap.set(rec.id, {
            id: rec.id,
            type: rec.type,
            content: rec.content,
            ...(typeof rec.model === "string" ? { model: rec.model } : {}),
          });
        }
      }
    }
    return;
  }

  // Partial metadata record (`{ sessionId, projectHash, startTime, kind, directories }`)
  if (typeof record.sessionId === "string" && !("id" in record)) {
    state.sessionId = record.sessionId;
    if (typeof record.startTime === "string") state.startTime = record.startTime;
    if (typeof record.summary === "string") state.summary = record.summary;
    if (typeof record.kind === "string") state.kind = record.kind;
    if (Array.isArray(record.directories)) {
      state.directories = record.directories.filter(
        (d): d is string => typeof d === "string" && d.length > 0,
      );
    }
    return;
  }

  // Regular MessageRecord
  if (typeof record.id === "string" && typeof record.type === "string") {
    messagesMap.set(record.id, {
      id: record.id,
      type: record.type,
      content: record.content,
      ...(typeof record.model === "string" ? { model: record.model } : {}),
    });
  }
}

function parseJsonConversation(raw: string): ParsedGeminiConversation | undefined {
  const rec = parseJsonRecord(raw);
  if (!rec) return undefined;
  const messages: GeminiTranscriptMessage[] = [];
  if (Array.isArray(rec.messages)) {
    for (const entry of rec.messages) {
      const m = asRecord(entry);
      if (typeof m?.id === "string" && typeof m.type === "string") {
        messages.push({
          id: m.id,
          type: m.type,
          content: m.content,
          ...(typeof m.model === "string" ? { model: m.model } : {}),
        });
      }
    }
  }
  return {
    ...(typeof rec.sessionId === "string" ? { sessionId: rec.sessionId } : {}),
    ...(typeof rec.startTime === "string" ? { startTime: rec.startTime } : {}),
    ...(typeof rec.summary === "string" ? { summary: rec.summary } : {}),
    ...(typeof rec.kind === "string" ? { kind: rec.kind } : {}),
    ...(Array.isArray(rec.directories)
      ? {
          directories: rec.directories.filter(
            (d): d is string => typeof d === "string" && d.length > 0,
          ),
        }
      : {}),
    messages,
  };
}

async function readJsonlConversationFromLines(
  lines: AsyncIterable<string>,
): Promise<ParsedGeminiConversation | undefined> {
  const state: ParsedGeminiConversation = { messages: [] };
  const messagesMap = new Map<string, GeminiTranscriptMessage>();
  let parsedAny = false;
  for await (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const rec = parseJsonRecord(trimmed);
    if (!rec) continue;
    parsedAny = true;
    applyJsonlRecord(state, messagesMap, rec);
  }
  if (!parsedAny) return undefined;
  state.messages = [...messagesMap.values()];
  return state;
}

function extractTrailingJsonlSummary(lines: readonly string[]): string | undefined {
  let summary: string | undefined;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const rec = parseJsonRecord(trimmed);
    if (!rec) continue;
    const setObj = asRecord(rec.$set);
    if (typeof setObj?.summary === "string") {
      summary = setObj.summary;
      continue;
    }
    if (typeof rec.sessionId === "string" && !("id" in rec) && typeof rec.summary === "string") {
      summary = rec.summary;
    }
  }
  return summary;
}

async function resolveConversationCwd(
  filePath: string,
  parsed: ParsedGeminiConversation,
  projectRootCache: Map<string, string>,
): Promise<string | undefined> {
  const firstDir = parsed.directories?.find((entry) => entry.trim().length > 0);
  if (firstDir) return firstDir.trim();
  const projectDir = dirname(dirname(filePath));
  const cached = projectRootCache.get(projectDir);
  if (cached !== undefined) return cached;
  try {
    const marker = (await readFile(join(projectDir, ".project_root"), "utf8")).trim();
    if (marker) {
      projectRootCache.set(projectDir, marker);
      return marker;
    }
  } catch {
    // `.project_root` may be absent on older or custom layouts
  }
  return undefined;
}

function toImportedMessages(messages: readonly GeminiTranscriptMessage[]): {
  messages: ImportedTranscriptMessage[];
  model?: string;
  preview?: string;
} {
  const result: ImportedTranscriptMessage[] = [];
  let model: string | undefined;
  let preview: string | undefined;
  for (const entry of messages) {
    if (entry.type !== "user" && entry.type !== "gemini") continue;
    const role: "user" | "assistant" = entry.type === "user" ? "user" : "assistant";
    if (role === "assistant" && !model && typeof entry.model === "string" && entry.model.trim()) {
      model = entry.model.trim();
    }
    const rawText = extractPartListText(entry.content);
    const cleaned = role === "user" ? stripInjectedContext(rawText, []) : rawText.trim();
    if (!cleaned) continue;
    if (role === "user" && !preview) preview = cleaned;
    result.push({ role, text: cleaned });
  }
  return {
    messages: result,
    ...(model ? { model } : {}),
    ...(preview ? { preview } : {}),
  };
}

export function createGeminiSessionImport(homeDir?: string): SessionImportSource {
  const configDir = resolveGeminiConfigDir(homeDir ? { GEMINI_CLI_HOME: homeDir } : undefined);
  const projectRootCache = new Map<string, string>();
  return {
    roots: [join(configDir, "tmp")],
    acceptFile(name: string): boolean {
      const lower = name.toLowerCase();
      return lower.startsWith("session-") && (lower.endsWith(".json") || lower.endsWith(".jsonl"));
    },
    async summarize(file: SessionImportFile): Promise<SessionImportSummary | undefined> {
      if (basename(dirname(file.path)) !== "chats") return undefined;
      const isJsonl = file.path.toLowerCase().endsWith(".jsonl");
      let parsed: ParsedGeminiConversation | undefined;
      if (isJsonl) {
        parsed = await readJsonlConversationFromLines(file.headLines());
        if (parsed) {
          const tailSummary = extractTrailingJsonlSummary(await file.tailLines());
          if (tailSummary !== undefined) parsed.summary = tailSummary;
        }
      } else {
        const fileStat = await stat(file.path);
        if (fileStat.size > MAX_JSON_SUMMARY_BYTES) return undefined;
        parsed = parseJsonConversation(await readFile(file.path, "utf8"));
      }
      if (!parsed?.sessionId || parsed.kind === "subagent") return undefined;

      const { messages, model, preview } = toImportedMessages(parsed.messages);
      if (messages.length === 0) return undefined;

      const cwd = await resolveConversationCwd(file.path, parsed, projectRootCache);
      const title = parsed.summary?.trim();
      return {
        providerSessionId: parsed.sessionId,
        ...(cwd ? { cwd } : {}),
        ...(parsed.startTime ? { startedAt: parsed.startTime } : {}),
        ...(model ? { model } : {}),
        ...(preview ? { preview } : {}),
        ...(title ? { title } : {}),
      };
    },
    async readTranscript(path: string): Promise<ImportedTranscript> {
      const isJsonl = path.toLowerCase().endsWith(".jsonl");
      const parsed = isJsonl
        ? await readJsonlConversationFromLines(readFileLines(path))
        : parseJsonConversation(await readFile(path, "utf8"));
      if (!parsed || parsed.kind === "subagent") {
        return { messages: [] };
      }
      const { messages } = toImportedMessages(parsed.messages);
      return {
        ...(parsed.sessionId ? { providerSessionId: parsed.sessionId } : {}),
        messages,
      };
    },
  };
}
