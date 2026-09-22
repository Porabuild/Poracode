import type Database from "better-sqlite3";
import type { ToolCallPayload } from "@/shared/contracts";
import { RUNTIME_REQUEST_ITEM_TYPE } from "@/shared/contracts";
import { inlineImagePayloadRenders } from "@/shared/inlineImagePayload";
import { isSubAgentTool } from "@/shared/toolCallClassification";
import { safeParse } from "./rowMappers";
import { assembleItemStreams, readStreamTails, type ItemStreamTails } from "./runtimeStreamStore";
import type { PersistedRuntimeItem } from "./runtimeItems";

/**
 * Shared runtime-timeline read helpers.
 *
 * These are the pure pieces of the legacy ordered-transcript reader
 * (`runtimeItems.ts`): the row-to-item materialization, the hidden/named/group
 * classification, and the candidate-window selection (tail window, group
 * boundary extension, target timeline entries). The bounded B4 history reader
 * (`historyReads.ts`) consumes exactly the same helpers so the two readers
 * cannot drift; only the probes that need text (payload parsing, stream
 * content) differ, and each reader supplies them through callbacks.
 *
 * No persistence, control, fence, or mutation logic lives here.
 */

export type RuntimeTimelineKind = "hidden" | "group" | "item";

export const RUNTIME_PAGE_BOUNDARY_SCAN_SIZE = 200;
export const RUNTIME_PAGE_MAX_RAW_ITEMS = 5_000;

/**
 * Legacy `runtimePage=1` reader window. `buildThreadSnapshot` calls
 * `dbReadThreadRuntimeItemsPage(threadId, undefined, LEGACY_RUNTIME_PAGE_LIMIT,
 * targetTimelineEntryCount ?? LEGACY_RUNTIME_PAGE_TARGET_ENTRIES)`, so the
 * first materialization is the newest `LEGACY_RUNTIME_PAGE_LIMIT + 1` rows
 * (the raw page window plus its one lookahead row) and the selection always
 * pushes at least `target` newest rows into the page. The legacy bulk-read
 * charge measures exactly those windows from these constants so the
 * reservation and the read cannot drift.
 */
export const LEGACY_RUNTIME_PAGE_LIMIT = 500;
export const LEGACY_RUNTIME_PAGE_TARGET_ENTRIES = 40;
export const RUNTIME_PAGE_HIDDEN_TYPES = new Set([
  "plan",
  "goal",
  "error",
  RUNTIME_REQUEST_ITEM_TYPE,
]);
export const RUNTIME_PAGE_NAMED_TOOL_TYPES = new Set([
  "tool_call",
  "mcp_tool_call",
  "image_view",
  "dynamic_tool_call",
]);
export const RUNTIME_PAGE_GROUP_TYPES = new Set([
  "tool_call",
  "mcp_tool_call",
  "image_view",
  "dynamic_tool_call",
  "command_execution",
  "file_change",
  "web_search",
  "reasoning",
]);

/** Row shape shared by the legacy and bounded materializers. */
export interface RuntimeTimelineItemRow {
  item_id: string;
  type: string;
  state: string;
  payload: string | null;
  streams: string | null;
  parent_item_id: string | null;
}

export function runtimeItemState(state: string): PersistedRuntimeItem["state"] {
  return state === "completed" || state === "updated" ? state : "started";
}

/** Pure row-to-item mapping; the caller supplies assembled stream tails. */
export function mapRuntimeItemRow(
  row: RuntimeTimelineItemRow,
  tails?: ItemStreamTails,
): PersistedRuntimeItem {
  const head = row.streams ? (safeParse(row.streams) as Record<string, string>) : {};
  return {
    id: row.item_id,
    type: row.type,
    state: runtimeItemState(row.state),
    payload: row.payload ? safeParse(row.payload) : undefined,
    streams: assembleItemStreams(head, tails),
    ...(row.parent_item_id ? { parentItemId: row.parent_item_id } : {}),
  };
}

/**
 * Map rows to items with their appended stream tails. Chunks are fetched for
 * the whole batch at once so a 500-row page costs one extra query, not 500.
 */
export function mapRuntimeItemRows(
  sqlite: InstanceType<typeof Database>,
  threadId: string,
  rows: readonly RuntimeTimelineItemRow[],
): PersistedRuntimeItem[] {
  if (rows.length === 0) return [];
  const tails = readStreamTails(
    sqlite,
    threadId,
    rows.map((row) => row.item_id),
  );
  return rows.map((row) => mapRuntimeItemRow(row, tails.get(row.item_id)));
}

/**
 * Classification input with lazy text probes: `payload` is consulted only for
 * named tool types and `reasoningHasContent` only for a completed `reasoning`
 * row, so neither reader pays for text it does not need.
 */
export interface RuntimeTimelineClassificationInput {
  readonly itemId: string;
  readonly type: string;
  readonly state: string;
  readonly parentItemId: string | null;
  readonly childParentIds: ReadonlySet<string>;
  readonly payload: () => Record<string, unknown> | undefined;
  readonly reasoningHasContent: () => boolean;
}

/**
 * The single hidden/named/group/item decision shared by the legacy page reader
 * and the bounded history reader. Behavior is exactly the historical
 * `classifyRuntimeTimelineRow`: hidden types and child rows are invisible, an
 * empty completed reasoning row is invisible, a named tool without a trimmed
 * name is invisible, sub-agent and inline-image rows are their own timeline
 * entry, and the remaining group types collapse into a run.
 */
export function classifyRuntimeTimelineEntry(
  input: RuntimeTimelineClassificationInput,
): RuntimeTimelineKind {
  if (input.parentItemId !== null || RUNTIME_PAGE_HIDDEN_TYPES.has(input.type)) return "hidden";
  if (input.type === "reasoning" && input.state === "completed") {
    if (!input.reasoningHasContent()) return "hidden";
  }
  let payload: Record<string, unknown> | undefined;
  if (RUNTIME_PAGE_NAMED_TOOL_TYPES.has(input.type)) {
    payload = input.payload();
    const name = payload && typeof payload.name === "string" ? payload.name : undefined;
    if (!name?.trim()) return "hidden";
  }
  if (!RUNTIME_PAGE_GROUP_TYPES.has(input.type)) return "item";
  if (input.childParentIds.has(input.itemId)) return "item";
  if (
    payload &&
    (isSubAgentTool(payload as unknown as ToolCallPayload) || inlineImagePayloadRenders(payload))
  ) {
    return "item";
  }
  return "group";
}

export function accumulateRuntimeTimelineEntry(
  kind: RuntimeTimelineKind,
  state: { entries: number; insideGroup: boolean },
): void {
  if (kind === "hidden") return;
  if (kind === "group") {
    if (!state.insideGroup) state.entries += 1;
    state.insideGroup = true;
    return;
  }
  state.entries += 1;
  state.insideGroup = false;
}

export interface RuntimePageSelection<T> {
  /** Newest-first selected rows. */
  readonly rows: T[];
  readonly hasMore: boolean;
}

/**
 * The exact candidate selection of the legacy `dbReadThreadRuntimeItemsPage`,
 * generic over the row shape so the bounded reader can drive it with
 * metadata-only rows. `readRows` returns newest-first rows for the cursor.
 */
export function selectRuntimePageRows<T extends { readonly position: number }>(input: {
  readonly readRows: (cursor: number | undefined, rowLimit: number) => T[];
  readonly isTimelineGroup: (row: T) => boolean;
  readonly classify: (row: T) => RuntimeTimelineKind;
  readonly beforePosition?: number;
  readonly limit: number;
  readonly targetTimelineEntryCount?: number;
}): RuntimePageSelection<T> {
  const { readRows } = input;
  if (input.targetTimelineEntryCount === undefined) {
    const rows = readRows(input.beforePosition, input.limit + 1);
    let segmentRows = rows.slice(0, input.limit);
    let lookaheadRows = rows.slice(input.limit);
    while (
      segmentRows.length > 0 &&
      input.isTimelineGroup(segmentRows.at(-1)!) &&
      lookaheadRows[0] &&
      input.isTimelineGroup(lookaheadRows[0])
    ) {
      const boundaryIndex = lookaheadRows.findIndex((row) => !input.isTimelineGroup(row));
      if (boundaryIndex >= 0) {
        segmentRows = [...segmentRows, ...lookaheadRows.slice(0, boundaryIndex)];
        lookaheadRows = lookaheadRows.slice(boundaryIndex);
        break;
      }
      segmentRows = [...segmentRows, ...lookaheadRows];
      lookaheadRows = readRows(segmentRows.at(-1)!.position, RUNTIME_PAGE_BOUNDARY_SCAN_SIZE);
    }
    return { rows: segmentRows, hasMore: lookaheadRows.length > 0 };
  }

  const targetTimelineEntryCount = input.targetTimelineEntryCount;
  const pageRows: T[] = [];
  const timelineCount = { entries: 0, insideGroup: false };
  let cursor = input.beforePosition;
  let hasMore = false;
  let completingTargetGroup = false;

  pageScan: for (;;) {
    const scanLimit = completingTargetGroup ? RUNTIME_PAGE_BOUNDARY_SCAN_SIZE : input.limit;
    const rows = readRows(cursor, scanLimit + 1);
    const scanRows = rows.slice(0, scanLimit);
    const hasLookahead = rows.length > scanLimit;
    if (scanRows.length === 0) break;

    for (let index = 0; index < scanRows.length; index += 1) {
      const row = scanRows[index]!;
      if (completingTargetGroup && !input.isTimelineGroup(row)) {
        hasMore = true;
        break pageScan;
      }

      pageRows.push(row);
      cursor = row.position;
      if (!completingTargetGroup) {
        accumulateRuntimeTimelineEntry(input.classify(row), timelineCount);
        if (timelineCount.entries >= targetTimelineEntryCount) {
          completingTargetGroup = timelineCount.insideGroup;
          if (!completingTargetGroup) {
            hasMore = index < scanRows.length - 1 || hasLookahead;
            break pageScan;
          }
        }
      }
    }

    hasMore = hasLookahead;
    if (!hasMore) break;
    if (pageRows.length >= RUNTIME_PAGE_MAX_RAW_ITEMS && !completingTargetGroup) break;
  }

  return { rows: pageRows, hasMore };
}

export function chunkValues<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

export function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}
