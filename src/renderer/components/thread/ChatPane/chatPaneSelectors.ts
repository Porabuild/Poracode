import {
  getRuntimeItemPayload,
  type CompletedTurnRecord,
  type RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";
import type { AppStoreState } from "@/renderer/state/slices/shared";
import {
  clearRuntimeStructuralChangeHint,
  readRuntimeStructuralChangeHint,
} from "@/renderer/state/runtimeStructuralChanges";
import type { MessageItemPayload, ToolCallPayload } from "@/shared/contracts";
import { RUNTIME_REQUEST_ITEM_TYPE } from "@/shared/contracts";
import {
  isAskUserQuestionToolName,
  isCrossagentSpawnAgentTool,
  isDelegatedAgentTool,
} from "@/shared/toolCallClassification";
import { imageViewRendersInline } from "./parts/items/imageViewSource";
import {
  getToolLikePayload,
  isToolGroupItem as isGroupableItemType,
  isToolLikeItem,
} from "./parts/items/toolCallCategorization";

export const EMPTY_THREAD_ITEM_IDS = Object.freeze([]) as readonly string[];
export const EMPTY_THREAD_TIMELINE_ENTRIES = Object.freeze([]) as readonly ChatTimelineEntry[];

export type ChatTimelineEntry =
  | { kind: "item"; id: string }
  | { kind: "tool_call_group"; id: string; itemIds: readonly string[] };

const MAX_INCREMENTAL_TAIL_ITEMS = 128;

/**
 * Cache for `selectVisibleThreadTimelineEntries`. Keyed by
 * `${threadId}\0${hiddenItemId ?? ""}` (a small constant-size string) and
 * validated in O(1) by reference-comparing the source `itemIds` array and the
 * thread's structural version. The structural version (maintained by
 * `runtimeEventSlice`) bumps only on grouping-affecting changes — content
 * deltas don't invalidate the cache.
 *
 * Zustand re-runs every subscriber's selector on every `set()`. With 8 GUI
 * panes mounted and ~500 streaming events/sec, this selector is one of the
 * hottest read paths in the app; the previous O(N) string-concat cache key
 * (one entry per item, full id+type) was burning real CPU.
 */
const timelineEntryCache = new Map<
  string,
  {
    itemIds: readonly string[];
    structuralVersion: number;
    entries: readonly ChatTimelineEntry[];
    entryStartIndices: readonly number[];
    childParentIds: ReadonlySet<string>;
  }
>();

/**
 * Cache for `selectVisibleThreadRuntimeItemIds`. The base `itemIds` array is
 * already reference-stable per thread, but the filtered result for the
 * `hiddenItemId !== undefined` case is freshly allocated on every call. We
 * memoize so the timeline cache above can rely on a stable `itemIds`
 * reference even when a thread is rendering a pinned/floating item surface.
 */
const visibleItemIdsCache = new Map<
  string,
  {
    sourceItemIds: readonly string[];
    structuralVersion: number;
    result: readonly string[];
    sourceIndices: readonly number[];
    stablePrefixLength: number;
  }
>();

export function selectThreadRuntimeItemIds(
  state: AppStoreState,
  threadId: string,
): readonly string[] {
  return state.runtimeItemIdsByThread[threadId] ?? EMPTY_THREAD_ITEM_IDS;
}

export function selectVisibleThreadRuntimeItemIds(
  state: AppStoreState,
  threadId: string,
  hiddenItemId?: string,
): readonly string[] {
  const itemIds = state.runtimeItemIdsByThread[threadId];
  if (!itemIds?.length) return EMPTY_THREAD_ITEM_IDS;

  const structuralVersion = state.runtimeStructuralVersionByThread?.[threadId] ?? 0;
  const cacheKey = `${threadId}\0${hiddenItemId ?? ""}`;
  const cached = visibleItemIdsCache.get(cacheKey);
  if (
    cached &&
    cached.sourceItemIds === itemIds &&
    cached.structuralVersion === structuralVersion
  ) {
    return cached.result;
  }

  const items = state.runtimeItemsByIdByThread[threadId];
  const hint = readRuntimeStructuralChangeHint(threadId, structuralVersion);
  const tailStartIndex =
    cached && cached.structuralVersion + 1 === structuralVersion && hint?.itemIds
      ? findIncrementalTailStart(cached.sourceItemIds, itemIds, hint.itemIds)
      : null;
  let result: readonly string[];
  let sourceIndices: readonly number[];
  let stablePrefixLength = 0;
  if (cached && tailStartIndex !== null) {
    stablePrefixLength = lowerBound(cached.sourceIndices, tailStartIndex);
    const visible = cached.result.slice(0, stablePrefixLength);
    const nextSourceIndices = cached.sourceIndices.slice(0, stablePrefixLength);
    appendVisibleItems(visible, nextSourceIndices, itemIds, items, hiddenItemId, tailStartIndex);
    result = visible.length === 0 ? EMPTY_THREAD_ITEM_IDS : visible;
    sourceIndices = nextSourceIndices;
  } else {
    const visible: string[] = [];
    const nextSourceIndices: number[] = [];
    appendVisibleItems(visible, nextSourceIndices, itemIds, items, hiddenItemId, 0);
    result =
      visible.length === 0
        ? EMPTY_THREAD_ITEM_IDS
        : visible.length === itemIds.length
          ? itemIds
          : visible;
    sourceIndices = nextSourceIndices;
  }

  if (visibleItemIdsCache.size > 500) visibleItemIdsCache.clear();
  visibleItemIdsCache.set(cacheKey, {
    sourceItemIds: itemIds,
    structuralVersion,
    result,
    sourceIndices,
    stablePrefixLength,
  });
  return result;
}

function appendVisibleItems(
  visible: string[],
  sourceIndices: number[],
  itemIds: readonly string[],
  items: Record<string, RuntimeChatItem> | undefined,
  hiddenItemId: string | undefined,
  startIndex: number,
): void {
  for (let index = startIndex; index < itemIds.length; index += 1) {
    const itemId = itemIds[index]!;
    if (itemId === hiddenItemId) continue;
    const item = items?.[itemId];
    if (item?.parentItemId || (item && !isVisibleRuntimeItem(item))) continue;
    visible.push(itemId);
    sourceIndices.push(index);
  }
}

function findIncrementalTailStart(
  previousItemIds: readonly string[],
  itemIds: readonly string[],
  changedItemIds: readonly string[],
): number | null {
  if (changedItemIds.length === 0 || changedItemIds.length > MAX_INCREMENTAL_TAIL_ITEMS)
    return null;
  const remaining = new Set(changedItemIds);
  let earliestIndex = Number.POSITIVE_INFINITY;
  const currentStart = Math.max(0, itemIds.length - MAX_INCREMENTAL_TAIL_ITEMS);
  for (let index = itemIds.length - 1; index >= currentStart && remaining.size > 0; index -= 1) {
    if (!remaining.delete(itemIds[index]!)) continue;
    earliestIndex = Math.min(earliestIndex, index);
  }
  const previousStart = Math.max(0, previousItemIds.length - MAX_INCREMENTAL_TAIL_ITEMS);
  for (
    let index = previousItemIds.length - 1;
    index >= previousStart && remaining.size > 0;
    index -= 1
  ) {
    if (!remaining.delete(previousItemIds[index]!)) continue;
    earliestIndex = Math.min(earliestIndex, index);
  }
  if (remaining.size > 0 || !Number.isFinite(earliestIndex)) return null;
  if (earliestIndex > 0 && previousItemIds[earliestIndex - 1] !== itemIds[earliestIndex - 1]) {
    return null;
  }
  return Math.min(earliestIndex, itemIds.length);
}

function lowerBound(values: readonly number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle]! < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function selectVisibleThreadTimelineEntries(
  state: AppStoreState,
  threadId: string,
  hiddenItemId?: string,
): readonly ChatTimelineEntry[] {
  const itemIds = selectVisibleThreadRuntimeItemIds(state, threadId, hiddenItemId);
  if (itemIds.length === 0) return EMPTY_THREAD_TIMELINE_ENTRIES;

  const structuralVersion = state.runtimeStructuralVersionByThread?.[threadId] ?? 0;
  const cacheKey = `${threadId}\0${hiddenItemId ?? ""}`;
  const cached = timelineEntryCache.get(cacheKey);
  if (cached && cached.itemIds === itemIds && cached.structuralVersion === structuralVersion) {
    return cached.entries;
  }

  const visibleProjection = visibleItemIdsCache.get(cacheKey);
  const hint = readRuntimeStructuralChangeHint(threadId, structuralVersion);
  let entries: readonly ChatTimelineEntry[];
  let entryStartIndices: readonly number[];
  let childParentIds: ReadonlySet<string>;
  if (
    cached &&
    cached.structuralVersion + 1 === structuralVersion &&
    visibleProjection &&
    visibleProjection.structuralVersion === structuralVersion &&
    hint?.itemIds
  ) {
    childParentIds = updateChildParentIds(
      cached.childParentIds,
      state.runtimeItemsByIdByThread[threadId],
      hint.itemIds,
    );
    const stablePrefixLength = visibleProjection.stablePrefixLength;
    if (stablePrefixLength === itemIds.length && cached.itemIds.length === itemIds.length) {
      entries = cached.entries;
      entryStartIndices = cached.entryStartIndices;
    } else {
      let firstChangedEntry = lowerBound(cached.entryStartIndices, stablePrefixLength);
      if (firstChangedEntry > 0) firstChangedEntry -= 1;
      const itemStartIndex = cached.entryStartIndices[firstChangedEntry] ?? 0;
      const tail = buildTimelineEntryProjection(
        state.runtimeItemsByIdByThread[threadId],
        itemIds.slice(itemStartIndex),
        childParentIds,
      );
      entries = [...cached.entries.slice(0, firstChangedEntry), ...tail.entries];
      entryStartIndices = [
        ...cached.entryStartIndices.slice(0, firstChangedEntry),
        ...tail.entryStartIndices.map((index) => index + itemStartIndex),
      ];
    }
  } else {
    childParentIds = collectChildParentIds(state, threadId);
    const projection = buildTimelineEntryProjection(
      state.runtimeItemsByIdByThread[threadId],
      itemIds,
      childParentIds,
    );
    entries = projection.entries;
    entryStartIndices = projection.entryStartIndices;
  }
  if (timelineEntryCache.size > 500) timelineEntryCache.clear();
  timelineEntryCache.set(cacheKey, {
    itemIds,
    structuralVersion,
    entries,
    entryStartIndices,
    childParentIds,
  });
  return entries;
}

function collectChildParentIds(state: AppStoreState, threadId: string): ReadonlySet<string> {
  const items = state.runtimeItemsByIdByThread[threadId];
  const childParentIds = new Set<string>();
  for (const itemId of state.runtimeItemIdsByThread[threadId] ?? EMPTY_THREAD_ITEM_IDS) {
    const parentItemId = items?.[itemId]?.parentItemId;
    if (parentItemId) childParentIds.add(parentItemId);
  }
  return childParentIds;
}

function updateChildParentIds(
  previous: ReadonlySet<string>,
  items: Record<string, RuntimeChatItem> | undefined,
  changedItemIds: readonly string[],
): ReadonlySet<string> {
  let childParentIds: Set<string> | undefined;
  for (const itemId of changedItemIds) {
    const parentItemId = items?.[itemId]?.parentItemId;
    if (!parentItemId || previous.has(parentItemId)) continue;
    childParentIds ??= new Set(previous);
    childParentIds.add(parentItemId);
  }
  return childParentIds ?? previous;
}

function buildTimelineEntries(
  state: AppStoreState,
  threadId: string,
  sourceItemIds: readonly string[],
): readonly ChatTimelineEntry[] {
  const items = state.runtimeItemsByIdByThread[threadId];
  const childParentIds = collectChildParentIds(state, threadId);
  const itemIds = sourceItemIds.filter((itemId) => {
    const item = items?.[itemId];
    return !item || isVisibleRuntimeItem(item);
  });
  return buildTimelineEntryProjection(items, itemIds, childParentIds).entries;
}

function buildTimelineEntryProjection(
  items: Record<string, RuntimeChatItem> | undefined,
  itemIds: readonly string[],
  childParentIds: ReadonlySet<string>,
): { entries: readonly ChatTimelineEntry[]; entryStartIndices: readonly number[] } {
  const entries: ChatTimelineEntry[] = [];
  const entryStartIndices: number[] = [];
  let idx = 0;
  while (idx < itemIds.length) {
    entryStartIndices.push(idx);
    const itemId = itemIds[idx]!;
    const item = items?.[itemId];
    if (!item || !isToolGroupItem(item) || childParentIds.has(itemId)) {
      entries.push({ kind: "item", id: itemId });
      idx += 1;
      continue;
    }
    const groupIds: string[] = [itemId];
    idx += 1;
    while (idx < itemIds.length) {
      const nextId = itemIds[idx]!;
      const next = items?.[nextId];
      if (!next || !isToolGroupItem(next) || childParentIds.has(nextId)) {
        break;
      }
      groupIds.push(nextId);
      idx += 1;
    }
    if (groupIds.length === 1) {
      entries.push({ kind: "item", id: itemId });
    } else {
      // Keep the id stable as new items are appended to the group so the
      // virtualizer reuses the same row DOM and existing tool rows do not
      // remount and replay their `animate-tool-call-enter` animation. Only
      // the newly appended item should animate in.
      entries.push({
        kind: "tool_call_group",
        id: `tool-call-group:${groupIds[0]}`,
        itemIds: groupIds,
      });
    }
  }
  return { entries, entryStartIndices };
}

function isToolGroupItem(item: RuntimeChatItem): boolean {
  // Sub-agent parents render as their own pill (with overlay) — never fold
  // them into a tool-call group.
  if (
    item.type === "tool_call" &&
    isDelegatedAgentTool(item.payload as ToolCallPayload | undefined)
  ) {
    return false;
  }
  // Any tool-like row that renders as a standalone inline image card
  // (ImageView) is never folded into a "Ran N tools" group. Rows that fall back
  // to the generic accordion (still running, errored, or non-image) keep the
  // default grouping — `imageViewRendersInline` mirrors ImageView's render
  // decision so the two never disagree.
  if (isToolLikeItem(item) && imageViewRendersInline(item.payload)) {
    return false;
  }
  // The groupable type set (tools, reasoning, commands, edits, searches) lives
  // in toolCallCategorization so it is maintained in one place.
  return isGroupableItemType(item);
}

/**
 * Bumps when the tail of the thread grows (streaming text/output) so the chat
 * pane can re-stick scroll to the bottom without re-rendering on every row.
 */
export function selectChatScrollAnchor(state: AppStoreState, threadId: string): string {
  return selectChatScrollAnchorForTimeline(state, threadId);
}

export function selectChatScrollAnchorForTimeline(
  state: AppStoreState,
  threadId: string,
  hiddenItemId?: string,
): string {
  const itemIds = state.runtimeItemIdsByThread[threadId];
  if (!itemIds?.length) return "";
  const items = state.runtimeItemsByIdByThread[threadId];
  const lastId = [...itemIds].reverse().find((itemId) => {
    if (itemId === hiddenItemId) return false;
    const item = items?.[itemId];
    if (item?.parentItemId) return false;
    return item ? isVisibleRuntimeItem(item) : true;
  });
  if (!lastId) return "";
  const last = items?.[lastId];
  if (!last) return "";
  return `${last.id}:${growingStreamLength(last)}:${last.state}`;
}

/**
 * Total length of an item's growing stream fields — the single encoding of
 * "which streams make a row taller as they arrive", shared by the scroll
 * anchor above and the virtualizer's live-measure token in MessageList.
 */
export function growingStreamLength(item: RuntimeChatItem): number {
  return (
    (item.streams.assistant_text?.length ?? 0) +
    (item.streams.reasoning_text?.length ?? 0) +
    (item.streams.plan_text?.length ?? 0) +
    (item.streams.command_output?.length ?? 0) +
    (item.streams.file_change_output?.length ?? 0)
  );
}

/**
 * Whether text has at least one non-whitespace character. Used instead of
 * `trim()` because the visibility filter re-runs over every item on each
 * structural bump — trimming would copy each message's full text per pass.
 */
const NON_WHITESPACE = /\S/;
function hasVisibleText(text: string): boolean {
  return NON_WHITESPACE.test(text);
}

/**
 * Whether an item gets its own row in the chat timeline. Anything that answers
 * `false` here can never host an inline indicator, so callers that pick an
 * anchor row (see `appendCompletedTurnIfClosed`) must consult this too.
 */
export function isVisibleRuntimeItem(item: RuntimeChatItem): boolean {
  // Plans and goals are rendered exclusively in composer docks — never inline
  // in chat. Empty completed reasoning items are already dropped at the data
  // layer.
  if (item.type === "plan" || item.type === "goal") return false;
  // Open agent requests (approvals/questions) are persisted only so remote
  // clients can recover the pending prompt from a snapshot; they render as the
  // blocking request form, never as a chat row.
  if ((item.type as string) === RUNTIME_REQUEST_ITEM_TYPE) return false;
  // Error items have no renderer in the chat row switch (ChatItemRow returns
  // null for `error`); excluding them here keeps the virtualized list from
  // allocating an empty slot that shows up as a gap.
  if (item.type === "error") return false;
  // Old ACP sessions may contain completed assistant items created from a blank
  // provider stream-boundary chunk — empty, or whitespace-only (Factory Droid
  // emits "\n\n" after tool calls). They have no renderable content, so
  // allocating a virtualized row for them only produces a blank gap. Keep an
  // empty in-flight item visible for its loader and preserve text/image payloads.
  if (item.type === "assistant_message" && item.state === "completed") {
    const payload = getRuntimeItemPayload<MessageItemPayload>(item, "assistant_message");
    const hasPayloadContent = payload?.content.some(
      (block) => (block.kind === "text" && hasVisibleText(block.text)) || block.kind === "image",
    );
    if (!(hasVisibleText(item.streams.assistant_text ?? "") || hasPayloadContent)) return false;
  }
  if (isToolLikeItem(item)) {
    const payload = getToolLikePayload(item);
    // AskUserQuestion is rendered as the blocking request form while open and
    // as a question_answer row after submission. ACP providers may reveal the
    // tool name only on a later update, so filter it here as a final defense
    // against both live races and already-persisted redundant rows.
    if (isAskUserQuestionToolName(payload?.name) || isAskUserQuestionToolName(payload?.title)) {
      return false;
    }
    // Successful Crossagents runs render as the richer delegated-agent row.
    // Keep failed transport calls visible because they may have no delegated row.
    if (payload?.status !== "error" && isCrossagentSpawnAgentTool(payload)) return false;
    // Tool renderers defer rows without a name. Keep those incomplete calls out
    // of the virtualized timeline and group counts until a later update names them.
    if (!payload?.name?.trim()) return false;
  }
  return true;
}

/** O(1) for the common case (last row is streaming target). */
export function selectRuntimeItemById(
  state: AppStoreState,
  threadId: string,
  itemId: string,
): RuntimeChatItem | undefined {
  return state.runtimeItemsByIdByThread[threadId]?.[itemId];
}

const runtimeItemStoreSelectorCache = new Map<
  string,
  (state: AppStoreState) => RuntimeChatItem | undefined
>();

/**
 * Stable Zustand selector per `(threadId, itemId)` so `useSyncExternalStore`
 * keeps a consistent `getSnapshot` identity across parent-driven renders
 * (virtual row `translateY`, disclosure measure churn).
 */
export function getRuntimeItemStoreSelector(
  threadId: string,
  itemId: string,
): (state: AppStoreState) => RuntimeChatItem | undefined {
  const key = `${threadId}\0${itemId}`;
  let sel = runtimeItemStoreSelectorCache.get(key);
  if (!sel) {
    sel = (state) => selectRuntimeItemById(state, threadId, itemId);
    runtimeItemStoreSelectorCache.set(key, sel);
  }
  return sel;
}

/**
 * Ordered list of child item ids for a sub-agent parent (e.g. a Claude `Task`
 * tool_call). Cached by the thread's structural version so the result reference
 * stays stable across content-only deltas.
 */
const childIdsCache = new Map<
  string,
  {
    sourceItemIds: readonly string[];
    structuralVersion: number;
    result: readonly string[];
  }
>();

export function selectChildItemIds(
  state: AppStoreState,
  threadId: string,
  parentItemId: string,
): readonly string[] {
  const itemIds = state.runtimeItemIdsByThread[threadId];
  if (!itemIds?.length) return EMPTY_THREAD_ITEM_IDS;
  const cacheKey = `${threadId}\0${parentItemId}`;
  const structuralVersion = state.runtimeStructuralVersionByThread?.[threadId] ?? 0;
  const cached = childIdsCache.get(cacheKey);
  if (
    cached &&
    cached.sourceItemIds === itemIds &&
    cached.structuralVersion === structuralVersion
  ) {
    return cached.result;
  }
  const items = state.runtimeItemsByIdByThread[threadId];
  const result = itemIds.filter((id) => items?.[id]?.parentItemId === parentItemId);
  const finalResult = result.length === 0 ? EMPTY_THREAD_ITEM_IDS : result;
  if (childIdsCache.size > 500) childIdsCache.clear();
  childIdsCache.set(cacheKey, { sourceItemIds: itemIds, structuralVersion, result: finalResult });
  return finalResult;
}

const childIdsStoreSelectorCache = new Map<string, (state: AppStoreState) => readonly string[]>();

export function getChildItemIdsStoreSelector(
  threadId: string,
  parentItemId: string,
): (state: AppStoreState) => readonly string[] {
  const key = `${threadId}\0${parentItemId}`;
  let sel = childIdsStoreSelectorCache.get(key);
  if (!sel) {
    sel = (state) => selectChildItemIds(state, threadId, parentItemId);
    childIdsStoreSelectorCache.set(key, sel);
  }
  return sel;
}

const childTimelineEntryCache = new Map<
  string,
  {
    itemIds: readonly string[];
    structuralVersion: number;
    entries: readonly ChatTimelineEntry[];
  }
>();

export function selectChildTimelineEntries(
  state: AppStoreState,
  threadId: string,
  parentItemId: string,
): readonly ChatTimelineEntry[] {
  const itemIds = selectChildItemIds(state, threadId, parentItemId);
  if (itemIds.length === 0) return EMPTY_THREAD_TIMELINE_ENTRIES;
  const structuralVersion = state.runtimeStructuralVersionByThread?.[threadId] ?? 0;
  const cacheKey = `${threadId}\0${parentItemId}`;
  const cached = childTimelineEntryCache.get(cacheKey);
  if (cached && cached.itemIds === itemIds && cached.structuralVersion === structuralVersion) {
    return cached.entries;
  }
  const entries = buildTimelineEntries(state, threadId, itemIds);
  if (childTimelineEntryCache.size > 500) childTimelineEntryCache.clear();
  childTimelineEntryCache.set(cacheKey, { itemIds, structuralVersion, entries });
  return entries;
}

const childTimelineEntriesStoreSelectorCache = new Map<
  string,
  (state: AppStoreState) => readonly ChatTimelineEntry[]
>();

export function getChildTimelineEntriesStoreSelector(
  threadId: string,
  parentItemId: string,
): (state: AppStoreState) => readonly ChatTimelineEntry[] {
  const key = `${threadId}\0${parentItemId}`;
  let sel = childTimelineEntriesStoreSelectorCache.get(key);
  if (!sel) {
    sel = (state) => selectChildTimelineEntries(state, threadId, parentItemId);
    childTimelineEntriesStoreSelectorCache.set(key, sel);
  }
  return sel;
}

/**
 * Frozen turn records with `anchorItemId` remapped onto the row that actually
 * renders. A turn's raw anchor is the last item present when it closed, which
 * is often filtered out of the timeline (goals/plans emitted at the end of an
 * ACP turn, empty assistant boundaries, unnamed tool calls). An anchor that
 * matches no rendered row drops the turn's "Worked for X" line entirely — both
 * the inline indicator and the tail footer key off it — so each anchor is
 * resolved back to the nearest preceding row that does render.
 *
 * `null` after resolution means "no row to hang it on"; the tail footer then
 * renders it for the most recent turn. Anchoring onto a `user_message` is
 * avoided so a synthetic window never shows a stale "Worked for" under a prompt.
 */
interface ResolvedCompletedTurns {
  byAnchor: ReadonlyMap<string, CompletedTurnRecord>;
  mostRecentDisplayable: CompletedTurnRecord | null;
}

/**
 * Keyed on the two source array identities (records, then the visible-id list),
 * so entries are released automatically when the store replaces either — the
 * same store-array-identity derivation pattern used elsewhere in the renderer.
 */
const resolvedCompletedTurnsCache = new WeakMap<
  ReadonlyArray<CompletedTurnRecord>,
  WeakMap<ReadonlyArray<string>, ResolvedCompletedTurns>
>();

const EMPTY_TURN_ANCHOR_MAP: ReadonlyMap<string, CompletedTurnRecord> = new Map();
const EMPTY_RESOLVED_TURNS: ResolvedCompletedTurns = Object.freeze({
  byAnchor: EMPTY_TURN_ANCHOR_MAP,
  mostRecentDisplayable: null,
});

/** A turn shorter than a second has nothing worth showing. */
function isDisplayableCompletedTurn(record: CompletedTurnRecord): boolean {
  return record.endedAt - record.startedAt >= 1000;
}

function selectResolvedCompletedTurns(
  state: AppStoreState,
  threadId: string,
): ResolvedCompletedTurns {
  const sourceRecords = state.runtimeCompletedTurnsByThread[threadId];
  if (!sourceRecords || sourceRecords.length === 0) return EMPTY_RESOLVED_TURNS;
  // Reference-stable per (itemIds, structuralVersion); visibility only changes
  // through structural events, so this doubles as the resolution's cache key.
  const visibleItemIds = selectVisibleThreadRuntimeItemIds(state, threadId);
  let byVisibleItemIds = resolvedCompletedTurnsCache.get(sourceRecords);
  const cached = byVisibleItemIds?.get(visibleItemIds);
  if (cached) return cached;

  const resolved = buildResolvedCompletedTurns(state, threadId, sourceRecords, visibleItemIds);
  if (!byVisibleItemIds) {
    byVisibleItemIds = new WeakMap();
    resolvedCompletedTurnsCache.set(sourceRecords, byVisibleItemIds);
  }
  byVisibleItemIds.set(visibleItemIds, resolved);
  return resolved;
}

function buildResolvedCompletedTurns(
  state: AppStoreState,
  threadId: string,
  sourceRecords: readonly CompletedTurnRecord[],
  visibleItemIds: readonly string[],
): ResolvedCompletedTurns {
  const itemIds = state.runtimeItemIdsByThread[threadId] ?? EMPTY_THREAD_ITEM_IDS;
  const items = state.runtimeItemsByIdByThread[threadId];
  const visible = new Set(visibleItemIds);
  const rawAnchors = new Set<string>();
  for (const record of sourceRecords) {
    if (record.anchorItemId) rawAnchors.add(record.anchorItemId);
  }

  // One pass: every raw anchor maps to the last anchorable row at or before it.
  const anchorResolution = new Map<string, string | null>();
  let lastAnchorable: string | null = null;
  for (const itemId of itemIds) {
    if (visible.has(itemId) && items?.[itemId]?.type !== "user_message") {
      lastAnchorable = itemId;
    }
    if (rawAnchors.has(itemId)) anchorResolution.set(itemId, lastAnchorable);
  }

  // Records are chronological, so the first turn to claim a row is the one that
  // actually ends there. A later turn that produced no row of its own (only a
  // goal update, only an error) must not steal it — that would both hide the
  // earlier duration and misattribute the later one. It falls back to `null`
  // and still reaches the tail footer when it is the most recent turn.
  const claimedAnchors = new Set<string>();
  const records = sourceRecords.map((record) => {
    // A sub-second turn renders nothing, so it neither needs nor claims a row.
    if (!record.anchorItemId || !isDisplayableCompletedTurn(record)) return record;
    // Anchors older than the hydrated window are left untouched — their row is
    // simply not loaded yet, not filtered out.
    if (!anchorResolution.has(record.anchorItemId)) {
      claimedAnchors.add(record.anchorItemId);
      return record;
    }
    const resolvedAnchor = anchorResolution.get(record.anchorItemId) ?? null;
    const anchorItemId =
      resolvedAnchor !== null && !claimedAnchors.has(resolvedAnchor) ? resolvedAnchor : null;
    if (anchorItemId !== null) claimedAnchors.add(anchorItemId);
    return anchorItemId === record.anchorItemId ? record : { ...record, anchorItemId };
  });

  const byAnchor = new Map<string, CompletedTurnRecord>();
  for (const record of records) {
    if (record.anchorItemId && isDisplayableCompletedTurn(record)) {
      byAnchor.set(record.anchorItemId, record);
    }
  }

  let mostRecentDisplayable: CompletedTurnRecord | null = null;
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index]!;
    if (isDisplayableCompletedTurn(record)) {
      mostRecentDisplayable = record;
      break;
    }
  }

  return { byAnchor, mostRecentDisplayable };
}

/**
 * Per-thread Map<anchorItemId, CompletedTurnRecord> over resolved anchors, so
 * per-row lookups stay O(1). The most-recent record is intentionally included —
 * callers can skip it (e.g. when the live tail loader is already showing it).
 */
export function selectCompletedTurnsByAnchorItem(
  state: AppStoreState,
  threadId: string,
): ReadonlyMap<string, CompletedTurnRecord> {
  return selectResolvedCompletedTurns(state, threadId).byAnchor;
}

/**
 * The newest turn worth showing a "Worked for X" line for, with its anchor
 * already resolved onto a rendered row (or `null` when no row can host it).
 */
export function selectMostRecentDisplayableCompletedTurn(
  state: AppStoreState,
  threadId: string,
): CompletedTurnRecord | null {
  return selectResolvedCompletedTurns(state, threadId).mostRecentDisplayable;
}

/**
 * Lookup helper: given a timeline entry, return the frozen turn record (if
 * any) that should render its "Worked for X" line beneath this row. For
 * tool-call groups, any of the grouped item ids may be the anchor.
 */
export function selectCompletedTurnForEntry(
  state: AppStoreState,
  threadId: string,
  entry: ChatTimelineEntry,
): CompletedTurnRecord | undefined {
  const anchorMap = selectCompletedTurnsByAnchorItem(state, threadId);
  if (anchorMap.size === 0) return undefined;
  if (entry.kind === "item") return anchorMap.get(entry.id);
  for (const itemId of entry.itemIds) {
    const record = anchorMap.get(itemId);
    if (record) return record;
  }
  return undefined;
}

export function clearRuntimeItemStoreSelectorCacheForThread(threadId: string): void {
  clearRuntimeStructuralChangeHint(threadId);
  const prefix = `${threadId}\0`;
  for (const key of runtimeItemStoreSelectorCache.keys()) {
    if (key.startsWith(prefix)) {
      runtimeItemStoreSelectorCache.delete(key);
    }
  }
  for (const key of timelineEntryCache.keys()) {
    if (key.startsWith(prefix)) timelineEntryCache.delete(key);
  }
  for (const key of visibleItemIdsCache.keys()) {
    if (key.startsWith(prefix)) visibleItemIdsCache.delete(key);
  }
  for (const key of childIdsCache.keys()) {
    if (key.startsWith(prefix)) childIdsCache.delete(key);
  }
  for (const key of childIdsStoreSelectorCache.keys()) {
    if (key.startsWith(prefix)) childIdsStoreSelectorCache.delete(key);
  }
  for (const key of childTimelineEntryCache.keys()) {
    if (key.startsWith(prefix)) childTimelineEntryCache.delete(key);
  }
  for (const key of childTimelineEntriesStoreSelectorCache.keys()) {
    if (key.startsWith(prefix)) childTimelineEntriesStoreSelectorCache.delete(key);
  }
}
