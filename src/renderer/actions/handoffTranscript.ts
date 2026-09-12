import type { ExtractContextResult, Thread } from "@/shared/contracts";
import { parseContextWindowTokens } from "@/shared/contextWindow";
import { useAppStore } from "@/renderer/state/appStore";
import {
  formatHandoffRow,
  MAX_HANDOFF_MESSAGE_CHARS,
  type HandoffRow,
} from "./handoffTranscriptRows";

/** Approximate token allocation; leave the rest of the window for the next task. */
const HANDOFF_CONTEXT_SHARE = 0.35;
const CHARS_PER_TOKEN = 4;
const DEFAULT_MAX_TRANSCRIPT_CONTEXT_CHARS = 400_000;
// Even UTF-8 text must fit the remote attachment upload's 20 MiB ceiling.
const MAX_TRANSCRIPT_CONTEXT_CHARS = 4_000_000;

/** Character budget for the destination; unknown sizes use a bounded fallback. */
export function handoffTranscriptBudget(contextSize?: string): number {
  const tokens = parseContextWindowTokens(contextSize ?? "");
  return tokens === undefined
    ? DEFAULT_MAX_TRANSCRIPT_CONTEXT_CHARS
    : Math.min(
        MAX_TRANSCRIPT_CONTEXT_CHARS,
        Math.floor(tokens * CHARS_PER_TOKEN * HANDOFF_CONTEXT_SHARE),
      );
}

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
function selectRows(rows: readonly HandoffRow[], maxChars: number): ReadonlySet<HandoffRow> {
  const kept = new Set<HandoffRow>();
  let used = 0;
  const tryKeep = (candidate: HandoffRow): boolean => {
    const cost = candidate.text.length + ROW_SEPARATOR.length + GAP_MARKER_ALLOWANCE;
    if (used + cost > maxChars) return false;
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
  maxChars: number = DEFAULT_MAX_TRANSCRIPT_CONTEXT_CHARS,
): ExtractContextResult | null {
  const state = useAppStore.getState();
  const itemIds = state.runtimeItemIdsByThread[thread.id] ?? [];
  const itemsById = state.runtimeItemsByIdByThread[thread.id];
  if (!itemsById || itemIds.length === 0) return null;

  const header = `Chat history of this conversation from the ${sourceLabel} session, oldest turn first. Tool output is omitted; rerun commands if you need their results.\n\n`;
  const rowBudget = maxChars - header.length;
  // Leave room for the row label, truncation marker, separators, and gap marker.
  const messageBudget = Math.min(MAX_HANDOFF_MESSAGE_CHARS, Math.max(0, rowBudget - 100));
  const rows: HandoffRow[] = [];
  itemIds.forEach((itemId) => {
    const item = itemsById[itemId];
    if (!item || item.parentItemId) return;
    const formatted = formatHandoffRow(item, messageBudget);
    if (formatted?.text.trim()) rows.push(formatted);
  });
  if (rows.length === 0) return null;

  const transcript = joinRows(rows, selectRows(rows, rowBudget));
  if (!transcript.trim()) return null;

  return {
    summary: header + transcript,
    sourceProvider: thread.agentKind,
    sourceSessionId: thread.sessionRef?.providerSessionId ?? thread.id,
    ...(thread.worktreePath ? { worktreePath: thread.worktreePath } : {}),
    extractedAt: new Date().toISOString(),
    contentKind: "transcript",
  };
}
