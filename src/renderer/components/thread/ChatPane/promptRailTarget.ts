import type { MessageItemPayload } from "@/shared/contracts";
import type { PersistedPromptIndex } from "@/shared/ipc";
import { assistantDisplayText, hasVisibleAssistantText } from "@/shared/assistantMessageText";
import { getRuntimeItemPayload } from "@/renderer/state/slices/runtimeEventSlice";
import type { AppStoreState } from "@/renderer/state/slices/shared";
import type { ChatTimelineEntry } from "./chatPaneSelectors";
import type { VisibleRowRange } from "./stickyPromptTarget";
import { buildUserPromptPreview } from "./parts/items/userPromptText";

/** Vertical distance between neighbouring ticks. */
export const RAIL_TICK_PITCH_PX = 12;
/** Most ticks the rail shows at once; longer threads slide a window of them. */
export const MAX_RAIL_TICKS = 24;
/** Ticks mounted beyond each window edge so a slide never reveals a gap. */
export const RAIL_TICK_OVERSCAN = 4;

const PREVIEW_MAX_LENGTH = 400;
const REPLY_SOURCE_MAX_LENGTH = 1_500;
const REST_SCALE = 0.333;
const IN_VIEW_SCALE = 0.5;
const ACTIVE_SCALE = 0.667;
const MAGNIFIED_SCALES = [1, 0.667, 0.417] as const;

// Selectors rerun on every store update, including each streamed delta, so
// their results are kept per immutable input: an item's type never changes and
// the timeline array is replaced only when its structure does.
const promptIndexesByEntries = new WeakMap<readonly ChatTimelineEntry[], number[]>();
const promptPreviewByPayload = new WeakMap<object, string | null>();

/** Timeline indexes of the user prompts, in order. */
export function selectUserPromptIndexes(
  state: AppStoreState,
  threadId: string,
  entries: readonly ChatTimelineEntry[],
): number[] {
  const cached = promptIndexesByEntries.get(entries);
  if (cached) return cached;
  const itemsById = state.runtimeItemsByIdByThread[threadId];
  const indexes: number[] = [];
  let everyItemResolved = true;
  entries.forEach((entry, index) => {
    if (entry.kind !== "item") return;
    const item = itemsById?.[entry.id];
    if (!item) everyItemResolved = false;
    else if (item.type === "user_message") indexes.push(index);
  });
  // An entry whose item has not arrived yet could still turn out to be a prompt.
  if (everyItemResolved) promptIndexesByEntries.set(entries, indexes);
  return indexes;
}

/** A prompt on the rail: loaded into the transcript, or known only from the host's index. */
export interface RailPrompt {
  readonly id: string;
  /** Timeline index of the prompt's row, or null while paging has not loaded it. */
  readonly loadedIndex: number | null;
  /** Host-supplied preview; only needed while the prompt is not loaded. */
  readonly text: string;
}

/**
 * The rail's prompts, oldest first: the prompts the host knows about that are
 * older than everything loaded, then every loaded prompt in transcript order.
 * Loaded rows are authoritative for order and presence; the host index only
 * contributes what paging has not reached. Without an index the rail shows the
 * loaded prompts alone.
 */
export function buildRailPrompts(
  index: PersistedPromptIndex | null,
  entries: readonly ChatTimelineEntry[],
  loadedPromptIndexes: readonly number[],
): RailPrompt[] {
  const loadedIds = new Set(loadedPromptIndexes.map((entryIndex) => entries[entryIndex]!.id));
  const indexedText = new Map<string, string>();
  const unloaded: RailPrompt[] = [];
  if (index) {
    // Prompts are ascending, so the first loaded one is the oldest loaded.
    const oldestLoadedPosition =
      index.prompts.find((prompt) => loadedIds.has(prompt.itemId))?.position ?? Infinity;
    for (const prompt of index.prompts) {
      indexedText.set(prompt.itemId, prompt.text);
      // Unloaded rows newer than the loaded window cannot be reached by paging
      // older history (hidden or removed rows), so they would never resolve.
      if (!loadedIds.has(prompt.itemId) && prompt.position < oldestLoadedPosition) {
        unloaded.push({ id: prompt.itemId, loadedIndex: null, text: prompt.text });
      }
    }
  }
  return [
    ...unloaded,
    ...loadedPromptIndexes.map((entryIndex) => {
      const id = entries[entryIndex]!.id;
      return { id, loadedIndex: entryIndex, text: indexedText.get(id) ?? "" };
    }),
  ];
}

/**
 * Position of the prompt the last visible row belongs to: the nearest loaded
 * prompt at or above it. Before the first loaded prompt it is that prompt, and
 * before any measurement it is the last one (the transcript opens at the end).
 */
export function findActivePromptPosition(
  loadedIndexes: readonly (number | null)[],
  lastVisibleIndex: number | null,
): number {
  if (lastVisibleIndex === null) return loadedIndexes.length - 1;
  let active = -1;
  let firstLoaded = -1;
  for (let position = 0; position < loadedIndexes.length; position += 1) {
    const loadedIndex = loadedIndexes[position];
    if (loadedIndex === null || loadedIndex === undefined) continue;
    if (firstLoaded < 0) firstLoaded = position;
    if (loadedIndex > lastVisibleIndex) break;
    active = position;
  }
  return active >= 0 ? active : Math.max(firstLoaded, 0);
}

/**
 * Whether the turn that starts at `loadedIndexes[position]` (and runs up to the
 * next loaded prompt) has a row inside the visible range. A prompt that is not
 * loaded has no rows to see.
 */
export function isPromptTurnInView(
  loadedIndexes: readonly (number | null)[],
  position: number,
  range: VisibleRowRange | null,
  entryCount: number,
): boolean {
  const start = loadedIndexes[position];
  if (range === null || start === null || start === undefined) return false;
  const turnEnd = (nextLoadedIndexAfter(loadedIndexes, position) ?? entryCount) - 1;
  return start <= range.last && turnEnd >= range.first;
}

/** The next loaded prompt's timeline index after `position`; it closes the turn at `position`. */
export function nextLoadedIndexAfter(
  loadedIndexes: readonly (number | null)[],
  position: number,
): number | undefined {
  for (let next = position + 1; next < loadedIndexes.length; next += 1) {
    const loadedIndex = loadedIndexes[next];
    if (loadedIndex !== null && loadedIndex !== undefined) return loadedIndex;
  }
  return undefined;
}

/**
 * Horizontal scale of a tick: it magnifies like a dock around the hovered tick,
 * and otherwise grows with how much of its turn is on screen.
 */
export function tickScale(input: {
  position: number;
  hoveredPosition: number | null;
  isActive: boolean;
  isInView: boolean;
}): number {
  if (input.hoveredPosition !== null) {
    return MAGNIFIED_SCALES[Math.abs(input.position - input.hoveredPosition)] ?? REST_SCALE;
  }
  return input.isActive ? ACTIVE_SCALE : input.isInView ? IN_VIEW_SCALE : REST_SCALE;
}

/** The `max`-wide run of positions that keeps `activePosition` centered where it can. */
export function windowRailPositions(
  count: number,
  activePosition: number,
  max: number,
): { start: number; end: number } {
  if (count <= max) return { start: 0, end: count };
  const start = Math.min(Math.max(activePosition - Math.floor(max / 2), 0), count - max);
  return { start, end: start + max };
}

/** One-line text of the user prompt at `entryId`, or null when it has none. */
export function selectPromptPreview(
  state: AppStoreState,
  threadId: string,
  entryId: string,
): string | null {
  const item = state.runtimeItemsByIdByThread[threadId]?.[entryId];
  const payload = item
    ? getRuntimeItemPayload<MessageItemPayload>(item, "user_message")
    : undefined;
  if (!payload) return null;
  const cached = promptPreviewByPayload.get(payload);
  if (cached !== undefined) return cached;
  const text = buildUserPromptPreview(payload.content);
  const preview = text === null ? null : text.slice(0, PREVIEW_MAX_LENGTH);
  promptPreviewByPayload.set(payload, preview);
  return preview;
}

/**
 * One-line text of the last assistant message the agent wrote in answer to the
 * prompt at `promptIndex`, i.e. before the next prompt (`nextPromptIndex`).
 */
export function selectReplyPreview(
  state: AppStoreState,
  threadId: string,
  entries: readonly ChatTimelineEntry[],
  promptIndex: number,
  nextPromptIndex: number | undefined,
): string | null {
  const itemsById = state.runtimeItemsByIdByThread[threadId];
  for (let index = (nextPromptIndex ?? entries.length) - 1; index > promptIndex; index -= 1) {
    const entry = entries[index];
    if (entry?.kind !== "item") continue;
    const item = itemsById?.[entry.id];
    if (item?.type !== "assistant_message" || !hasVisibleAssistantText(item)) continue;
    return stripMarkdownForPreview(assistantDisplayText(item).slice(0, REPLY_SOURCE_MAX_LENGTH));
  }
  return null;
}

/**
 * Plain one-line text for a markdown snippet: syntax markers go, link and image
 * labels stay. A regex pass, not a parser, because a preview only needs to look
 * clean and runs on every streamed update while the card is open.
 */
export function stripMarkdownForPreview(markdown: string): string {
  return markdown
    .replace(/```[^\n]*\n?/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<\/?[a-z][^>]*>/gi, " ")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "")
    .replace(/[*~`|]+/g, "")
    .replace(/(^|\s)_+|_+(?=\s|$)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PREVIEW_MAX_LENGTH);
}
