import type { OpenCode2Client, SessionMessageInfo } from "./clientTypes";
import type { ThreadHistoryEntry } from "../base";

/**
 * Normalise `message.list` output into the shared `ThreadHistoryEntry[]`
 * shape. `parts`/`info` stay provider-native, mirroring OpenCode 1 — a future
 * consumer can read them through the same field names as live events.
 */
export function toThreadHistoryEntries(raw: ReadonlyArray<unknown>): ThreadHistoryEntry[] {
  const entries: ThreadHistoryEntry[] = [];
  for (const candidate of raw) {
    if (!candidate || typeof candidate !== "object") continue;
    const record = candidate as Record<string, unknown>;
    const messageId = typeof record.id === "string" ? record.id : undefined;
    if (!messageId) continue;
    if (record.type === "user") {
      entries.push({
        messageId,
        role: "user",
        parts: [{ kind: "text", text: typeof record.text === "string" ? record.text : "" }],
        info: record,
      });
      continue;
    }
    if (record.type === "assistant") {
      entries.push({
        messageId,
        role: "assistant",
        parts: Array.isArray(record.content) ? record.content : [],
        info: record,
      });
    }
  }
  // `message.list` defaults to newest-first and `order: "asc"` is requested,
  // but the beta may ignore the param — sort defensively by creation time.
  return entries.sort((left, right) => messageCreatedAt(left.info) - messageCreatedAt(right.info));
}

function messageCreatedAt(info: unknown): number {
  const created = (info as { time?: { created?: unknown } } | undefined)?.time?.created;
  return typeof created === "number" ? created : 0;
}

/** Read every page so long sessions can resume and roll back without truncation. */
export async function readOpenCode2Messages(
  client: OpenCode2Client,
  sessionID: string,
): Promise<SessionMessageInfo[]> {
  const messages = new Map<string, SessionMessageInfo>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await client.message.list(
      { sessionID, ...(cursor ? { cursor } : { order: "asc" as const }) },
      { signal: AbortSignal.timeout(30_000) },
    );
    for (const message of page.data) messages.set(message.id, message);
    cursor = page.cursor.next ?? undefined;
    if (cursor && cursors.has(cursor))
      throw new Error("OpenCode 2 returned a repeated history cursor.");
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return [...messages.values()].sort(
    (left, right) => messageCreatedAt(left) - messageCreatedAt(right),
  );
}

export async function rollbackOpenCode2Messages(
  client: OpenCode2Client,
  sessionID: string,
  numTurns: number,
): Promise<void> {
  if (!Number.isInteger(numTurns) || numTurns < 1)
    throw new Error("The rollback count must be a positive integer.");
  const messages = await readOpenCode2Messages(client, sessionID);
  const prompts = messages.filter((message) => message.type === "user");
  const boundary = prompts[prompts.length - numTurns];
  if (!boundary) throw new Error("The rollback count exceeds the conversation history.");
  await client.session.revert.stage({ sessionID, messageID: boundary.id, files: false });
  await client.session.revert.commit({ sessionID });
}
