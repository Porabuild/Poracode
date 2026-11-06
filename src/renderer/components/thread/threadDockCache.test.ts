// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { AppStoreState } from "@/renderer/state/appStore";
import { recordRuntimeItemChanges } from "@/renderer/state/runtimeItemChanges";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { selectThreadGoalDockState } from "./threadGoalState";
import { selectThreadTodoDockState } from "./threadTodoState";

const cases = [
  {
    name: "goal",
    select: selectThreadGoalDockState,
    payload: { action: "set", objective: "First", status: "active" },
    changed: { action: "updated", objective: "Second", status: "active" },
    initialExpected: { objective: "First" },
    expected: { objective: "Second" },
  },
  {
    name: "plan",
    select: selectThreadTodoDockState,
    payload: { steps: [{ step: "First", status: "in_progress" }] },
    changed: { steps: [{ step: "Second", status: "in_progress" }] },
    initialExpected: { steps: [{ text: "First", status: "in_progress" }] },
    expected: { steps: [{ text: "Second", status: "in_progress" }] },
  },
];

interface ReadCounter {
  reads: number;
}

function getterItems(
  ids: readonly string[],
  source: ReadonlyMap<string, RuntimeChatItem>,
  counter: ReadCounter,
): Record<string, RuntimeChatItem> {
  const items: Record<string, RuntimeChatItem> = {};
  for (const id of ids) {
    Object.defineProperty(items, id, {
      enumerable: true,
      configurable: true,
      get() {
        counter.reads += 1;
        return source.get(id)!;
      },
    });
  }
  return items;
}

function stableHistory(
  threadId: string,
  control: RuntimeChatItem,
  size = 200,
): {
  controlId: string;
  counter: ReadCounter;
  source: Map<string, RuntimeChatItem>;
  state: AppStoreState;
} {
  const ids = Array.from({ length: size }, (_, index) => `${threadId}:item-${index}`);
  const source = new Map<string, RuntimeChatItem>();
  for (const id of ids) {
    source.set(id, {
      id,
      type: "assistant_message",
      state: "completed",
      streams: {},
    } as RuntimeChatItem);
  }
  const controlId = ids.at(-1)!;
  source.set(controlId, { ...control, id: controlId });
  const counter: ReadCounter = { reads: 0 };
  const items = getterItems(ids, source, counter);
  const state = {
    runtimeItemIdsByThread: { [threadId]: ids },
    runtimeItemsByIdByThread: { [threadId]: items },
  } as unknown as AppStoreState;
  return { controlId, counter, source, state };
}

function hintedBackgroundState(state: AppStoreState, backgroundThreadId: string): AppStoreState {
  const previous = state.runtimeItemsByIdByThread;
  const next = { ...previous, [backgroundThreadId]: {} };
  recordRuntimeItemChanges(previous, next, new Set([backgroundThreadId]));
  return { ...state, runtimeItemsByIdByThread: next } as AppStoreState;
}

describe.each(cases)("$name dock runtime snapshot cache", (scenario) => {
  it("does not visit history for non-runtime store updates", () => {
    const threadId = `dock-unchanged-${scenario.name}`;
    const ids = Array.from({ length: 5_000 }, (_, index) => `message-${index}`);
    const readItem = vi.fn<(id: string) => RuntimeChatItem>((id) => ({
      id,
      type: "assistant_message",
      state: "completed",
      streams: {},
    }));
    const items = Object.fromEntries(ids.map((id) => [id, undefined]));
    for (const id of ids) {
      Object.defineProperty(items, id, { enumerable: true, get: () => readItem(id) });
    }
    const state = {
      runtimeItemIdsByThread: { [threadId]: ids },
      runtimeItemsByIdByThread: { [threadId]: items },
    } as unknown as AppStoreState;
    expect(scenario.select(state, threadId)).toBeNull();
    expect(readItem).toHaveBeenCalled();
    readItem.mockClear();
    for (let index = 0; index < 50; index += 1) {
      expect(scenario.select({ ...state, projects: [] }, threadId)).toBeNull();
    }
    expect(readItem).not.toHaveBeenCalled();
    // A runtime snapshot with the same control result takes the late hit and
    // must refresh its key, or every subsequent draft update rescans history.
    const next = {
      ...state,
      runtimeItemsByIdByThread: { ...state.runtimeItemsByIdByThread },
    };
    expect(scenario.select(next, threadId)).toBeNull();
    expect(readItem).toHaveBeenCalled();
    readItem.mockClear();
    for (let index = 0; index < 50; index += 1) {
      expect(scenario.select({ ...next, projects: [] }, threadId)).toBeNull();
    }
    expect(readItem).not.toHaveBeenCalled();
  });

  it("invalidates when the reducer reuses the inner item index", () => {
    const threadId = `dock-mutable-${scenario.name}`;
    const item = {
      id: "control",
      type: scenario.name,
      state: "completed",
      payload: scenario.payload,
      streams: {},
    };
    const items = { control: item };
    const state = {
      runtimeItemIdsByThread: { [threadId]: ["control"] },
      runtimeItemsByIdByThread: { [threadId]: items },
    } as unknown as AppStoreState;
    const first = scenario.select(state, threadId);
    // RuntimeItemDraft mutates this inner index, then publishes a new outer
    // snapshot. The unchanged inner reference must not hide the control update.
    items.control = { ...item, payload: scenario.changed };
    const next = {
      ...state,
      runtimeItemsByIdByThread: { ...state.runtimeItemsByIdByThread },
    };
    expect(scenario.select(next, threadId)).not.toBe(first);
    expect(scenario.select(next, threadId)).toMatchObject(scenario.expected);
  });
});

describe.each(cases)("$name dock runtime snapshot hints", (scenario) => {
  it("keeps zero visible-history reads across 50 hinted background updates", () => {
    const threadId = `dock-hinted-${scenario.name}`;
    const control = {
      id: "control",
      type: scenario.name,
      state: "completed",
      payload: scenario.payload,
      streams: {},
    } as unknown as RuntimeChatItem;
    const { counter, state } = stableHistory(threadId, control, 5_000);
    const first = scenario.select(state, threadId);
    expect(first).toMatchObject(scenario.initialExpected);

    counter.reads = 0;
    let current = state;
    for (let index = 0; index < 50; index += 1) {
      current = hintedBackgroundState(current, `${threadId}:background`);
      expect(scenario.select(current, threadId)).toBe(first);
    }
    expect(counter.reads).toBe(0);
  });

  it("rescans after an own-thread mutable update even when the inner map is reused", () => {
    const threadId = `dock-own-mutable-${scenario.name}`;
    const control = {
      id: "control",
      type: scenario.name,
      state: "completed",
      payload: scenario.payload,
      streams: {},
    } as unknown as RuntimeChatItem;
    const { controlId, counter, source, state } = stableHistory(threadId, control);
    const first = scenario.select(state, threadId);
    expect(first).toMatchObject(scenario.initialExpected);

    const previous = state.runtimeItemsByIdByThread;
    const current = { ...previous };
    source.set(controlId, {
      ...source.get(controlId)!,
      payload: scenario.changed,
    } as unknown as RuntimeChatItem);
    recordRuntimeItemChanges(previous, current, new Set([threadId]));

    counter.reads = 0;
    const second = scenario.select(
      { ...state, runtimeItemsByIdByThread: current } as AppStoreState,
      threadId,
    );
    expect(second).not.toBe(first);
    expect(second).toMatchObject(scenario.expected);
    expect(counter.reads).toBeGreaterThan(0);
  });

  it("stays conservative when a hinted predecessor was never observed", () => {
    const threadId = `dock-missed-${scenario.name}`;
    const backgroundThreadId = `${threadId}:background`;
    const control = {
      id: "control",
      type: scenario.name,
      state: "completed",
      payload: scenario.payload,
      streams: {},
    } as unknown as RuntimeChatItem;
    const { counter, state } = stableHistory(threadId, control);
    const first = scenario.select(state, threadId);
    expect(first).toMatchObject(scenario.initialExpected);

    // Record a valid chain A -> B -> C but never observe B. The cached key is
    // still A, so C's hint must not be accepted against A.
    const skipped = hintedBackgroundState(state, backgroundThreadId);
    const current = hintedBackgroundState(skipped, backgroundThreadId);
    counter.reads = 0;
    expect(scenario.select(current, threadId)).toBe(first);
    expect(counter.reads).toBeGreaterThan(0);

    // The conservative pass refreshes the key, so the next consecutive hinted
    // background update is O(1) again.
    const next = hintedBackgroundState(current, backgroundThreadId);
    counter.reads = 0;
    expect(scenario.select(next, threadId)).toBe(first);
    expect(counter.reads).toBe(0);

    // An unhinted outer snapshot is also unknown and must scan.
    const unhinted = {
      ...next,
      runtimeItemsByIdByThread: { ...next.runtimeItemsByIdByThread },
    } as AppStoreState;
    counter.reads = 0;
    expect(scenario.select(unhinted, threadId)).toBe(first);
    expect(counter.reads).toBeGreaterThan(0);
  });
});
