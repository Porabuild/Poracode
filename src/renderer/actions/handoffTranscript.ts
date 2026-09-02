import type { ExtractContextResult, Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { formatHandoffRow, type HandoffRow } from "./handoffTranscriptRows";

/**
 * Whole-file budget, roughly 12-15k tokens. Small next to any current context
 * window, but the file rides in the new provider's first message for the rest
 * of its session, so it is filled by priority rather than recency alone.
 */
export const MAX_TRANSCRIPT_CONTEXT_CHARS = 50_000;
const ROW_SEPARATOR = "\n\n";
const LEADING_GAP_MARKER = "[earlier turns omitted]";
const INNER_GAP_MARKER = "[turns omitted]";
/**
 * What one gap marker can cost the joined file: a row separator plus the
 * longest marker. Kept rows are contiguous per tier, not per position, so
 * `joinRows` may separate any two of them with a marker; reserving this on
 * every kept row keeps the joined file near the budget instead of past it.
 */
const GAP_MARKER_ALLOWANCE = ROW_SEPARATOR.length + LEADING_GAP_MARKER.length;

/**
 * Pick which rows fit the budget:
 *
 * 1. The first user message, always. It is the original task, and pure
 *    tail-first truncation would drop it first on a long thread.
 * 2. Conversation rows, newest first, until the budget is spent.
 * 3. Activity rows, newest first, with whatever is left.
 *
 * Each tier stops at the first row that does not fit, so the kept set is a
 * recent contiguous run per tier rather than a scatter of small rows.
 */
function selectRows(rows: readonly HandoffRow[]): ReadonlySet<HandoffRow> {
  const kept = new Set<HandoffRow>();
  let used = 0;
  const tryKeep = (candidate: HandoffRow): boolean => {
    const cost =
      candidate.text.length + (kept.size > 0 ? ROW_SEPARATOR.length + GAP_MARKER_ALLOWANCE : 0);
    if (used + cost > MAX_TRANSCRIPT_CONTEXT_CHARS) return false;
    kept.add(candidate);
    used += cost;
    return true;
  };

  const firstUserMessage = rows.find((candidate) => candidate.isUserMessage);
  if (firstUserMessage) tryKeep(firstUserMessage);
  for (const tier of ["conversation", "activity"] as const) {
    for (let position = rows.length - 1; position >= 0; position -= 1) {
      const candidate = rows[position]!;
      if (candidate.tier !== tier || kept.has(candidate)) continue;
      if (!tryKeep(candidate)) break;
    }
  }
  return kept;
}

/** Join kept rows in thread order, marking where rows were left out. */
function joinRows(rows: readonly HandoffRow[], kept: ReadonlySet<HandoffRow>): string {
  const parts: string[] = [];
  let previousKeptPosition = -1;
  rows.forEach((candidate, position) => {
    if (!kept.has(candidate)) return;
    if (position > previousKeptPosition + 1) {
      parts.push(previousKeptPosition < 0 ? LEADING_GAP_MARKER : INNER_GAP_MARKER);
    }
    parts.push(candidate.text);
    previousKeptPosition = position;
  });
  return parts.join(ROW_SEPARATOR);
}

/**
 * Copy a thread's stored chat history into handoff context: messages first,
 * key tool activity after, noise dropped (see `handoffTranscriptRows`). The
 * result is the same shape provider-side extraction produces, tagged as a
 * "transcript" so the launch input tells the incoming provider it is reading
 * the actual prior turns rather than a digest. Null when the thread has no
 * stored rows, which is a terminal thread's normal state.
 */
export function buildTranscriptContext(
  thread: Thread,
  sourceLabel: string,
): ExtractContextResult | null {
  const state = useAppStore.getState();
  const itemIds = state.runtimeItemIdsByThread[thread.id] ?? [];
  const itemsById = state.runtimeItemsByIdByThread[thread.id];
  if (!itemsById || itemIds.length === 0) return null;

  const rows: HandoffRow[] = [];
  itemIds.forEach((itemId) => {
    const item = itemsById[itemId];
    if (!item || item.parentItemId) return;
    const formatted = formatHandoffRow(item);
    if (formatted?.text.trim()) rows.push(formatted);
  });
  if (rows.length === 0) return null;

  const transcript = joinRows(rows, selectRows(rows));
  if (!transcript.trim()) return null;

  return {
    summary: [
      `Chat history of this conversation from the ${sourceLabel} session, oldest turn first. Tool output is omitted; rerun commands if you need their results.`,
      "",
      transcript,
    ].join("\n"),
    sourceProvider: thread.agentKind,
    sourceSessionId: thread.sessionRef?.providerSessionId ?? thread.id,
    ...(thread.worktreePath ? { worktreePath: thread.worktreePath } : {}),
    extractedAt: new Date().toISOString(),
    contentKind: "transcript",
  };
}
