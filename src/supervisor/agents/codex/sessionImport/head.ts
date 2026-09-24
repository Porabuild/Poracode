import { rawField, parseJsonRecord, stringField, objectField } from "@/shared/sessionImport/io";
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

export function codexHeadFields(prefix: string): RawHeadFields {
  const lines = prefix.split(/\r?\n/u).filter((line) => line.length > 0);
  let id: string | undefined;
  let cwd: string | undefined;
  let startedAt: string | undefined;
  let originator: string | undefined;
  let source: string | undefined;
  let threadSource: string | undefined;
  let model: string | undefined;
  let sawSessionMeta = false;

  for (let index = 0; index < lines.length; index++) {
    if (sawSessionMeta && model !== undefined) break;
    const line = lines[index] as string;
    const record = parseJsonRecord(line);
    if (record) {
      const type = record["type"];
      if (type === "session_meta") {
        sawSessionMeta = true;
        const payload = objectField(record["payload"]);
        if (payload) {
          id ??= stringField(payload["session_id"]);
          cwd ??= stringField(payload["cwd"]);
          startedAt ??= stringField(payload["timestamp"]);
          originator ??= stringField(payload["originator"]);
          source ??= stringField(payload["source"]);
          threadSource ??= stringField(payload["thread_source"]);
          model ??= stringField(payload["model"]);
        }
      } else if (type === "turn_context") {
        const payload = objectField(record["payload"]);
        if (payload) model ??= stringField(payload["model"]);
      } else if (type === "event_msg") {
        const payload = objectField(record["payload"]);
        if (payload?.["type"] === "thread_settings_applied") {
          const settings = objectField(payload["thread_settings"]);
          if (settings) model ??= stringField(settings["model"]);
        }
      }
      continue;
    }
    if (index !== lines.length - 1) continue;
    // Final line only, and only because it failed to parse.
    const fallbackType = rawField(line, "type");
    if (fallbackType === "session_meta" && index === 0) {
      sawSessionMeta = true;
      id ??= rawField(line, "session_id");
      cwd ??= rawField(line, "cwd");
      startedAt ??= rawField(line, "timestamp");
      originator ??= rawField(line, "originator");
      source ??= rawField(line, "source");
      threadSource ??= rawField(line, "thread_source");
    }
    if (fallbackType === "session_meta" || fallbackType === "turn_context") {
      model ??= rawField(line, "model");
    }
  }

  return { id, cwd, startedAt, originator, source, threadSource, model };
}

export function codexUserText(entry: Record<string, unknown>): string | undefined {
  if (entry["type"] !== "response_item") return undefined;
  const payload = entry["payload"];
  if (!payload || typeof payload !== "object") return undefined;
  const item = payload as Record<string, unknown>;
  if (item["type"] !== "message" || item["role"] !== "user") return undefined;
  const content = item["content"];
  if (!Array.isArray(content)) return undefined;
  return content
    .map((part) =>
      part && typeof part === "object" && (part as Record<string, unknown>)["type"] === "input_text"
        ? String((part as Record<string, unknown>)["text"] ?? "")
        : "",
    )
    .join("");
}
