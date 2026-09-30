import { rawField, parseJsonRecord, stringField, objectField } from "@/shared/sessionImport/io";
import { CLAUDE_METADATA_RECORD_TYPES } from "./text";
interface RawHeadFields {
  readonly id?: string | undefined;
  readonly cwd?: string | undefined;
  readonly startedAt?: string | undefined;
  readonly originator?: string | undefined;
  readonly source?: string | undefined;
  readonly threadSource?: string | undefined;
  readonly accountId?: string | undefined;
  readonly model?: string | undefined;
}

function claudeAssistantModel(line: string): string | undefined {
  const messageStart = line.indexOf('"message":{');
  if (messageStart === -1) return undefined;
  const contentStart = line.indexOf('"content"', messageStart);
  const scope =
    contentStart === -1 ? line.slice(messageStart) : line.slice(messageStart, contentStart);
  return rawField(scope, "model");
}

/**
 * Claude has no single meta line — `sessionId` / `cwd` / `timestamp` /
 * `ownerAccountUuid` are spread across ordinary conversation records. Each
 * complete line is `JSON.parse`d and gated on the record's own `type` key,
 * read structurally rather than by text search: real Claude records order
 * their keys `parentUuid, isSidechain, message, …, type, uuid, timestamp, …`,
 * so on an `assistant` record a plain first-`"type"`-in-the-line search finds
 * `message.type` ("message") before the record's own `type` — which isn't in
 * `CLAUDE_METADATA_RECORD_TYPES` — and silently skips the whole line. Reading
 * `record["type"]` off the parsed object can't be fooled by key order.
 *
 * `message.model` is narrower still: it only ever appears on an `assistant`
 * record, read structurally off `record["message"]`. Keep scanning until
 * every field — including the model — is known or the head chunk runs out; a
 * session whose first assistant reply sits later in the file (a long opening
 * user turn) still finds it as long as it's inside the chunk already read.
 * The cost of that is bounded: at most the {@link HEAD_CHUNK_BYTES} already
 * in memory, on a scan that already runs synchronously on the main thread
 * once per candidate file, so a chunk with no assistant record simply gets
 * scanned in full instead of stopping at `cwd`/`startedAt` — no new I/O.
 *
 * The head chunk can still cut the final line in half (or the file itself
 * can end mid-write); only that line, and only when it fails to parse, falls
 * back to the old regex-based extraction, still gated on the same type set —
 * read via regex here since there is no parsed object to read a key off.
 */
export function claudeHeadFields(prefix: string): RawHeadFields {
  const lines = prefix.split(/\r?\n/u).filter((line) => line.length > 0);
  let id: string | undefined;
  let cwd: string | undefined;
  let startedAt: string | undefined;
  let accountId: string | undefined;
  let model: string | undefined;

  for (let index = 0; index < lines.length; index++) {
    if (cwd !== undefined && startedAt !== undefined && model !== undefined) break;
    const line = lines[index] as string;
    const record = parseJsonRecord(line);
    if (record) {
      const type = record["type"];
      if (typeof type === "string" && CLAUDE_METADATA_RECORD_TYPES.has(type)) {
        id ??= stringField(record["sessionId"]);
        cwd ??= stringField(record["cwd"]);
        startedAt ??= stringField(record["timestamp"]);
        accountId ??= stringField(record["ownerAccountUuid"]);
        if (type === "assistant") {
          const message = objectField(record["message"]);
          if (message) model ??= stringField(message["model"]);
        }
      }
      continue;
    }
    if (index !== lines.length - 1) continue;
    // Final line only, and only because it failed to parse.
    const fallbackType = rawField(line, "type");
    if (fallbackType && CLAUDE_METADATA_RECORD_TYPES.has(fallbackType)) {
      id ??= rawField(line, "sessionId");
      cwd ??= rawField(line, "cwd");
      startedAt ??= rawField(line, "timestamp");
      accountId ??= rawField(line, "ownerAccountUuid");
      if (fallbackType === "assistant") model ??= claudeAssistantModel(line);
    }
  }

  return { id, cwd, startedAt, accountId, model };
}

export function claudeUserText(entry: Record<string, unknown>): string | undefined {
  if (entry["type"] !== "user" || entry["isSidechain"] === true) return undefined;
  const message = entry["message"];
  if (!message || typeof message !== "object") return undefined;
  const content = (message as Record<string, unknown>)["content"];
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return undefined;
  return content
    .map((part) =>
      part && typeof part === "object" && (part as Record<string, unknown>)["type"] === "text"
        ? String((part as Record<string, unknown>)["text"] ?? "")
        : "",
    )
    .join("");
}
