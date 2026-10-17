import { createHash } from "node:crypto";
import { assistantDisplayText } from "@/shared/assistantMessageText";
import type { MessageItemPayload } from "@/shared/contracts";
import { isMessageReplyFormFallbackText } from "@/shared/messageReplyForm";
import { INLINE_VISUAL_SEARCH_VERSION, inlineVisualSearchText } from "@/shared/inlineVisuals";
import {
  CONVERSATION_SEARCH_EXCERPT_CHARS,
  CONVERSATION_SEARCH_LIMIT,
  CONVERSATION_SEARCH_VERSION,
  type ConversationSearchPage,
  type ConversationSearchQuery,
} from "@/shared/conversationSearch";
import { getSqlite } from "./connection";
import { dbGetThreadRuntimeItemCommitted } from "./runtimeItemRead";
import { RUNTIME_STREAM_ELISION_NOTICE_PREFIX } from "@/shared/runtimeStreamRetentionPolicy";
import { RUNTIME_PAGE_HIDDEN_TYPES } from "./runtimeTimelineReads";

// Disposable extraction generation, independent of canonical history/schema.
// Any text policy/tokenizer or visual extraction change rebuilds old documents.
// v3 omits generated reply-form fallback text hidden by the current timeline.
export const CONVERSATION_SEARCH_INDEX_POLICY_VERSION = 3;
export const CONVERSATION_SEARCH_INDEX_GENERATION = `${CONVERSATION_SEARCH_INDEX_POLICY_VERSION}.visual${INLINE_VISUAL_SEARCH_VERSION}`;
export const SEARCH_INDEX_BATCH_ITEMS = 32;
// Final-reply eligibility is read-time; every completed message is already indexed.
const FINAL_REPLY_CONTROL_TYPES = [...RUNTIME_PAGE_HIDDEN_TYPES, "provider_handoff"];

export interface SearchIndexDocument {
  threadId: string;
  itemId: string;
  revision: number;
  text: string;
}

/** Worker-only committed read; never walks provider payloads or tool content. */
export function readConversationSearchBatch(): SearchIndexDocument[] {
  const rows = getSqlite()
    .prepare(`
    SELECT pending.thread_id, pending.item_id, pending.revision
    FROM conversation_search_pending AS pending ORDER BY pending.rowid DESC LIMIT ?
  `)
    .all(SEARCH_INDEX_BATCH_ITEMS) as Array<{
    thread_id: string;
    item_id: string;
    revision: number;
  }>;
  const documents: SearchIndexDocument[] = [];
  let chars = 0;
  for (const row of rows) {
    const item = dbGetThreadRuntimeItemCommitted(row.thread_id, row.item_id);
    let text = "";
    if (item && !item.parentItemId && item.state === "completed") {
      if (item.type === "assistant_message") {
        let displayed = assistantDisplayText(item);
        const form = (item.payload as MessageItemPayload | undefined)?.replyForm;
        if (isMessageReplyFormFallbackText(form, displayed)) displayed = "";
        const gap = displayed.indexOf(RUNTIME_STREAM_ELISION_NOTICE_PREFIX);
        if (gap >= 0) displayed = displayed.slice(0, gap);
        else if (displayed === item.streams.assistant_text) {
          const state = getSqlite()
            .prepare(`SELECT elided_chars FROM thread_runtime_item_stream_state
            WHERE thread_id = ? AND item_id = ? AND stream = 'assistant_text'`)
            .get(row.thread_id, row.item_id) as { elided_chars: number } | undefined;
          // A lost middle may contain a visual opening fence. The retained tail
          // has no provable fence state, so only the known prefix is prose.
          if (state && state.elided_chars > 0) displayed = "";
        }
        text = inlineVisualSearchText(displayed);
      } else if (item.type === "user_message") {
        const content = (item.payload as { content?: unknown } | undefined)?.content;
        if (Array.isArray(content)) {
          text = content
            .flatMap((block: unknown) => {
              if (!block || typeof block !== "object") return [];
              const value = block as { kind?: unknown; text?: unknown };
              return value.kind === "text" && typeof value.text === "string" ? [value.text] : [];
            })
            .join("\n");
        }
      }
    }
    documents.push({ threadId: row.thread_id, itemId: row.item_id, revision: row.revision, text });
    chars += text.length;
    // At most one retained message can exceed the batch text target.
    if (chars >= 512 * 1024) break;
  }
  return documents;
}

export class ConversationSearchCursorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConversationSearchCursorError";
  }
}

function queryFingerprint(input: ConversationSearchQuery): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        CONVERSATION_SEARCH_INDEX_GENERATION,
        input.query,
        input.projectId ?? null,
        input.includeArchived ?? "true",
      ]),
    )
    .digest("base64url");
}

/** FTS syntax is always quoted; user input never becomes a query operator. */
export function conversationSearchExpression(query: string): string | null {
  const terms = query.normalize("NFKC").match(/[\p{L}\p{N}_]+/gu);
  return terms?.length ? terms.map((term) => `"${term}"*`).join(" AND ") : null;
}

export function readConversationSearchPage(input: ConversationSearchQuery): ConversationSearchPage {
  const sqlite = getSqlite();
  const fingerprint = queryFingerprint(input);
  let after = Number.MAX_SAFE_INTEGER;
  if (input.cursor) {
    try {
      if (!input.cursor.startsWith("cs1.")) throw new Error();
      const cursor = JSON.parse(Buffer.from(input.cursor.slice(4), "base64url").toString()) as {
        q?: unknown;
        id?: unknown;
      };
      if (cursor.q !== fingerprint || !Number.isSafeInteger(cursor.id) || (cursor.id as number) < 1)
        throw new Error();
      after = cursor.id as number;
    } catch {
      throw new ConversationSearchCursorError(
        "The search cursor does not match this query or index version.",
      );
    }
  }
  const expression = conversationSearchExpression(input.query);
  const indexing = !!sqlite.prepare("SELECT 1 FROM conversation_search_pending LIMIT 1").get();
  if (!expression)
    return { version: CONVERSATION_SEARCH_VERSION, entries: [], nextCursor: null, indexing };
  const limit = input.limit ?? CONVERSATION_SEARCH_LIMIT;
  const rows = sqlite
    .prepare(`
    SELECT doc.id, doc.thread_id AS threadId, doc.item_id AS itemId, thread.project_id AS projectId,
      substr(thread.title, 1, 300) AS title, substr(project.name, 1, 200) AS projectName,
      thread.archived, item.type,
      snippet(conversation_search_fts, 0, '', '', '…', 42) AS excerpt
    FROM conversation_search_fts
    JOIN conversation_search_documents AS doc ON doc.id = conversation_search_fts.rowid
    JOIN thread_runtime_items AS item ON item.thread_id = doc.thread_id AND item.item_id = doc.item_id
    JOIN threads AS thread ON thread.id = doc.thread_id
    JOIN projects AS project ON project.id = thread.project_id
    WHERE conversation_search_fts MATCH ? AND doc.id < ?
      AND (? IS NULL OR thread.project_id = ?) AND (? OR thread.archived = 0)
      AND thread.parent_thread_id IS NULL AND item.parent_item_id IS NULL AND item.state = 'completed'
      AND (item.type = 'user_message' OR (item.type = 'assistant_message' AND
        COALESCE((SELECT next.type FROM thread_runtime_items AS next
          WHERE next.thread_id = item.thread_id AND next.parent_item_id IS NULL AND next.position > item.position
            AND next.type NOT IN (${FINAL_REPLY_CONTROL_TYPES.map(() => "?").join(",")})
          ORDER BY next.position LIMIT 1),
          CASE WHEN thread.active_turn_started_at IS NULL THEN 'user_message' ELSE '' END) = 'user_message'))
    ORDER BY doc.id DESC LIMIT ?
  `)
    .all(
      expression,
      after,
      input.projectId ?? null,
      input.projectId ?? null,
      input.includeArchived !== "false" ? 1 : 0,
      ...FINAL_REPLY_CONTROL_TYPES,
      limit + 1,
    ) as Array<{
    id: number;
    threadId: string;
    itemId: string;
    projectId: string;
    title: string;
    projectName: string;
    archived: number;
    type: string;
    excerpt: string;
  }>;
  const page = rows.slice(0, limit);
  return {
    version: CONVERSATION_SEARCH_VERSION,
    entries: page.map((entry) => ({
      threadId: entry.threadId,
      itemId: entry.itemId,
      projectId: entry.projectId,
      title: entry.title,
      projectName: entry.projectName,
      archived: entry.archived === 1,
      role: entry.type === "user_message" ? "user" : "assistant",
      excerpt: entry.excerpt.slice(0, CONVERSATION_SEARCH_EXCERPT_CHARS),
    })),
    nextCursor:
      rows.length > limit
        ? `cs1.${Buffer.from(JSON.stringify({ q: fingerprint, id: page.at(-1)!.id })).toString("base64url")}`
        : null,
    indexing,
  };
}
