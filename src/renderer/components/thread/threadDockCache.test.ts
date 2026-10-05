// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { AppStoreState } from "@/renderer/state/appStore";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { selectThreadGoalDockState } from "./threadGoalState";
import { selectThreadTodoDockState } from "./threadTodoState";

const cases = [
  {
    name: "goal",
    select: selectThreadGoalDockState,
    payload: { action: "set", objective: "First", status: "active" },
    changed: { action: "updated", objective: "Second", status: "active" },
    expected: { objective: "Second" },
  },
  {
    name: "plan",
    select: selectThreadTodoDockState,
    payload: { steps: [{ step: "First", status: "in_progress" }] },
    changed: { steps: [{ step: "Second", status: "in_progress" }] },
    expected: { steps: [{ text: "Second", status: "in_progress" }] },
  },
];

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
