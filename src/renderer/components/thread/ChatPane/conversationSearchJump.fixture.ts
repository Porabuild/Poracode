import type { PersistedRuntimeItem } from "@/shared/ipc/schemas";
import {
  CONVERSATION_MATCH_WINDOW,
  CONVERSATION_MATCH_WINDOW_LIMIT,
} from "./loadRuntimeItemThroughHistory";

/**
 * Deterministic before/after fixture for a deep conversation match, usable by
 * unit tests and by a CDP-driven app harness (same host responses each run).
 *
 * Before (rank 5 gap): reaching a match at `exactPosition` from the loaded tail
 * transfers `legacyPageCount` sequential older pages. After (this change): one
 * authorized located-item read plus one bounded, item-centered window read.
 * The exact item is always at the center of `windowResponse.items`, so a CDP
 * before/after capture can assert the same visible exact match with 2 reads.
 */
export const CDP_FIXTURE_TOTAL_ITEMS = 400;
export const CDP_FIXTURE_EXACT_POSITION = 40;
export const CDP_FIXTURE_PAGE_SIZE = 40;

export function fixtureItem(position: number): PersistedRuntimeItem {
  const isUser = position % 2 === 0;
  return {
    id: `item-${String(position).padStart(4, "0")}`,
    type: isUser ? "user_message" : "assistant_message",
    state: "completed",
    payload: isUser ? { content: [{ kind: "text", text: `needle at ${position}` }] } : {},
    streams: isUser ? {} : { assistant_text: `reply at ${position}` },
  };
}

export interface DeepConversationCdpFixture {
  readonly exactItemId: string;
  readonly exactPosition: number;
  readonly exactItem: PersistedRuntimeItem;
  /** Host response for the one authorized `thread-history-item` located read. */
  readonly locatedItemResponse: { item: PersistedRuntimeItem; position: number };
  /** Host response for the one fenced `beforePosition` bounded window read. */
  readonly windowResponse: {
    items: PersistedRuntimeItem[];
    reads: "bounded-v1";
    nextCursor: number | null;
  };
  /** Before: sequential pages the old jump loop transfers to reach the match. */
  readonly legacyPageCount: number;
  /** After: 1 exact read + 1 bounded window read. */
  readonly positionedReadCount: 2;
}

export function buildDeepConversationCdpFixture(): DeepConversationCdpFixture {
  const exactPosition = CDP_FIXTURE_EXACT_POSITION;
  const exactItem = fixtureItem(exactPosition);
  const windowItems: PersistedRuntimeItem[] = [];
  for (
    let position = exactPosition - CONVERSATION_MATCH_WINDOW;
    position <= exactPosition + CONVERSATION_MATCH_WINDOW;
    position++
  ) {
    if (position >= 0 && position < CDP_FIXTURE_TOTAL_ITEMS)
      windowItems.push(fixtureItem(position));
  }
  return {
    exactItemId: exactItem.id,
    exactPosition,
    exactItem,
    locatedItemResponse: { item: exactItem, position: exactPosition },
    windowResponse: {
      items: windowItems.slice(0, CONVERSATION_MATCH_WINDOW_LIMIT),
      reads: "bounded-v1",
      nextCursor: exactPosition - CONVERSATION_MATCH_WINDOW,
    },
    legacyPageCount: Math.ceil((CDP_FIXTURE_TOTAL_ITEMS - exactPosition) / CDP_FIXTURE_PAGE_SIZE),
    positionedReadCount: 2,
  };
}
