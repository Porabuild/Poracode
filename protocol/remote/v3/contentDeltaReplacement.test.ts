import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runtimeEventSchema } from "../../../src/shared/contracts/runtimeEvent";
import { applyRuntimeEventsToState } from "../../../src/renderer/state/slices/runtimeEventReducer";
import type { AppStoreState } from "../../../src/renderer/state/slices/shared";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/content-delta-replacement.json", import.meta.url), "utf8"),
) as {
  threadId: string;
  itemId: string;
  cases: Array<{
    id: string;
    events: unknown[];
    expected: { state: string; payload: unknown; streams: Record<string, string> } | null;
  }>;
  invalidEvents: unknown[];
};

function initialState(): AppStoreState {
  return {
    threads: [],
    runtimeItemIdsByThread: {},
    runtimeItemsByIdByThread: {},
    runtimeRequestsByThread: {},
    runtimeContextByThread: {},
    runtimeBackgroundTasksByThread: {},
    runtimeStructuralVersionByThread: {},
    runtimeCompletedTurnsByThread: {},
    runtimeOpenTurnByThread: {},
  } as unknown as AppStoreState;
}

describe("shared content stream replacement fixtures", () => {
  it.each(fixture.cases)("$id retains its meaning across batch boundaries", (entry) => {
    const events = entry.events.map((event) => runtimeEventSchema.parse(event));
    for (const batches of [events.map((event) => [event]), [events]]) {
      let state = initialState();
      for (const batch of batches) {
        state = { ...state, ...applyRuntimeEventsToState(state, fixture.threadId, batch) };
      }
      const item = state.runtimeItemsByIdByThread[fixture.threadId]?.[fixture.itemId];
      const actual = item
        ? { state: item.state, payload: item.payload, streams: item.streams }
        : null;
      expect(actual).toEqual(entry.expected);
    }
  });

  it.each(fixture.invalidEvents)("rejects a malformed replacement flag: %j", (event) => {
    expect(runtimeEventSchema.safeParse(event).success).toBe(false);
  });
});
