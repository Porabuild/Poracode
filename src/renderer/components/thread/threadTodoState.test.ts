// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { AppStoreState } from "@/renderer/state/appStore";
import {
  areThreadTodoStepsEqual,
  getThreadTodoDockStateForItem,
  selectThreadTodoDockItem,
  selectThreadTodoDockState,
} from "./threadTodoState";
import type { ThreadTodoDockState } from "./threadTodoState";

describe("threadTodoState", () => {
  it("returns a stable dock item across streaming deltas that do not change plans", () => {
    const planItem = {
      id: "plan-1",
      type: "plan",
      state: "updated",
      payload: {
        steps: [{ step: "Step one", status: "in_progress" }],
      },
      streams: {},
    };
    const state = {
      runtimeItemIdsByThread: {
        t1: ["plan-1", "assistant-1"],
      },
      runtimeItemsByIdByThread: {
        t1: {
          "plan-1": planItem,
          "assistant-1": {
            id: "assistant-1",
            type: "assistant_message",
            state: "running",
            payload: {},
            streams: { assistant_text: "hello" },
          },
        },
      },
    } as unknown as AppStoreState;

    const first = selectThreadTodoDockItem(state, "t1");
    expect(first).toBe(planItem);

    const itemsById = state.runtimeItemsByIdByThread.t1!;
    const nextState = {
      ...state,
      runtimeItemsByIdByThread: {
        t1: {
          ...itemsById,
          "assistant-1": {
            ...itemsById["assistant-1"]!,
            streams: { assistant_text: "hello world" },
          },
        },
      },
    } as unknown as AppStoreState;

    expect(selectThreadTodoDockItem(nextState, "t1")).toBe(planItem);
    expect(selectThreadTodoDockState(nextState, "t1")).toBe(selectThreadTodoDockState(state, "t1"));
  });

  it("selects the latest structured plan item and tracks the active step", () => {
    const state = {
      runtimeItemIdsByThread: {
        t1: ["plan-old", "plan-new"],
      },
      runtimeItemsByIdByThread: {
        t1: {
          "plan-old": {
            id: "plan-old",
            type: "plan",
            state: "completed",
            payload: {
              steps: [{ step: "Old step", status: "completed" }],
            },
            streams: {},
          },
          "plan-new": {
            id: "plan-new",
            type: "plan",
            state: "updated",
            payload: {
              steps: [
                { step: "Step one", status: "completed" },
                { step: "Step two", status: "in_progress" },
                { step: "Step three", status: "pending" },
              ],
            },
            streams: {},
          },
        },
      },
    } as unknown as AppStoreState;

    expect(selectThreadTodoDockState(state, "t1")).toMatchObject({
      sourceItemId: "plan-new",
      activeIndex: 1,
      steps: [
        { text: "Step one", status: "completed" },
        { text: "Step two", status: "in_progress" },
        { text: "Step three", status: "pending" },
      ],
    });
  });

  it("carries forward completion status from previous plans with compatible steps", () => {
    const state = {
      runtimeItemIdsByThread: {
        t1: ["plan-1", "plan-2"],
      },
      runtimeItemsByIdByThread: {
        t1: {
          "plan-1": {
            id: "plan-1",
            type: "plan",
            state: "completed",
            payload: {
              steps: [
                { step: "Analyze project", status: "completed" },
                { step: "Apply fix", status: "completed" },
              ],
            },
            streams: {},
          },
          "plan-2": {
            id: "plan-2",
            type: "plan",
            state: "updated",
            payload: {
              steps: [
                { step: "Analyze project", status: "pending" },
                { step: "Apply fix", status: "pending" },
                { step: "Validate fix", status: "pending" },
              ],
            },
            streams: {},
          },
        },
      },
    } as unknown as AppStoreState;

    expect(selectThreadTodoDockState(state, "t1")).toMatchObject({
      sourceItemId: "plan-2",
      activeIndex: 2,
      steps: [
        { text: "Analyze project", status: "completed" },
        { text: "Apply fix", status: "completed" },
        { text: "Validate fix", status: "pending" },
      ],
    });
  });

  it("does not carry forward completion status if plans are incompatible", () => {
    const state = {
      runtimeItemIdsByThread: {
        t1: ["plan-1", "plan-2"],
      },
      runtimeItemsByIdByThread: {
        t1: {
          "plan-1": {
            id: "plan-1",
            type: "plan",
            state: "completed",
            payload: {
              steps: [{ step: "Task A", status: "completed" }],
            },
            streams: {},
          },
          "plan-2": {
            id: "plan-2",
            type: "plan",
            state: "updated",
            payload: {
              steps: [{ step: "Task B", status: "pending" }],
            },
            streams: {},
          },
        },
      },
    } as unknown as AppStoreState;

    expect(selectThreadTodoDockState(state, "t1")).toMatchObject({
      sourceItemId: "plan-2",
      activeIndex: 0,
      steps: [{ text: "Task B", status: "pending" }],
    });
  });

  it("persists the plan across follow-up user messages", () => {
    const state = {
      runtimeItemIdsByThread: { t1: ["plan-1", "user-2"] },
      runtimeItemsByIdByThread: {
        t1: {
          "plan-1": {
            id: "plan-1",
            type: "plan",
            state: "updated",
            payload: {
              steps: [{ step: "Work", status: "in_progress" }],
            },
            streams: {},
          },
          "user-2": {
            id: "user-2",
            type: "user_message",
            state: "completed",
            streams: { assistant_text: "Go!" },
          },
        },
      },
    } as unknown as AppStoreState;

    expect(selectThreadTodoDockState(state, "t1")).toMatchObject({
      sourceItemId: "plan-1",
      steps: [{ text: "Work", status: "in_progress" }],
    });
  });

  it("retires the dock once every step in the latest plan is completed", () => {
    const state = {
      runtimeItemIdsByThread: { t1: ["plan-1"] },
      runtimeItemsByIdByThread: {
        t1: {
          "plan-1": {
            id: "plan-1",
            type: "plan",
            state: "completed",
            payload: {
              steps: [
                { step: "Step one", status: "completed" },
                { step: "Step two", status: "completed" },
              ],
            },
            streams: {},
          },
        },
      },
    } as unknown as AppStoreState;

    expect(selectThreadTodoDockState(state, "t1")).toBeNull();
  });

  describe("areThreadTodoStepsEqual", () => {
    const s1: ThreadTodoDockState = {
      sourceItemId: "p1",
      itemState: "started",
      steps: [{ text: "Step 1", status: "pending" }],
      activeIndex: 0,
      sourceKind: "steps",
    };

    it("returns true for identical states", () => {
      expect(areThreadTodoStepsEqual(s1, { ...s1 })).toBe(true);
      expect(areThreadTodoStepsEqual(null, null)).toBe(true);
    });

    it("returns false for different sourceItemIds", () => {
      expect(areThreadTodoStepsEqual(s1, { ...s1, sourceItemId: "p2" })).toBe(false);
    });

    it("returns false for different activeIndex", () => {
      expect(areThreadTodoStepsEqual(s1, { ...s1, activeIndex: 1 })).toBe(false);
    });

    it("returns false for different step status", () => {
      const s2: ThreadTodoDockState = {
        ...s1,
        steps: [{ text: "Step 1", status: "in_progress" as const }],
      };
      expect(areThreadTodoStepsEqual(s1, s2)).toBe(false);
    });

    it("returns false for different step text", () => {
      const s2: ThreadTodoDockState = {
        ...s1,
        steps: [{ text: "Step 2", status: "pending" as const }],
      };
      expect(areThreadTodoStepsEqual(s1, s2)).toBe(false);
    });

    it("returns false for different step count", () => {
      const s2: ThreadTodoDockState = {
        ...s1,
        steps: [
          { text: "Step 1", status: "pending" as const },
          { text: "Step 2", status: "pending" as const },
        ],
      };
      expect(areThreadTodoStepsEqual(s1, s2)).toBe(false);
    });
  });

  it("parses codex plan_text lists into todo steps when no structured steps exist", () => {
    const todoState = getThreadTodoDockStateForItem({
      id: "plan-codex",
      type: "plan",
      state: "updated",
      payload: {},
      streams: {
        plan_text: "1. [x] Done\n- [ ] Working\n* [ ] Pending",
      },
    });
    expect(todoState).toMatchObject({
      sourceItemId: "plan-codex",
      sourceKind: "plan_text",
      activeIndex: 1,
      steps: [
        { text: "Done", status: "completed" },
        { text: "Working", status: "pending" },
        { text: "Pending", status: "pending" },
      ],
    });
  });

  it("drops a plan left by the provider before a handoff", () => {
    const state = {
      runtimeItemIdsByThread: { t1: ["plan-1", "handoff-1"] },
      runtimeItemsByIdByThread: {
        t1: {
          "plan-1": {
            id: "plan-1",
            type: "plan",
            state: "updated",
            payload: { steps: [{ step: "Old provider step", status: "pending" }] },
            streams: {},
          },
          "handoff-1": {
            id: "handoff-1",
            type: "provider_handoff",
            state: "completed",
            payload: {
              fromAgentKind: "claude",
              toAgentKind: "codex",
              at: "2026-08-30T00:00:00Z",
            },
            streams: {},
          },
        },
      },
    } as unknown as AppStoreState;

    expect(selectThreadTodoDockState(state, "t1")).toBeNull();
  });

  it("keeps a plan written by the provider after a handoff", () => {
    const state = {
      runtimeItemIdsByThread: { t1: ["plan-1", "handoff-1", "plan-2"] },
      runtimeItemsByIdByThread: {
        t1: {
          "plan-1": {
            id: "plan-1",
            type: "plan",
            state: "updated",
            payload: { steps: [{ step: "Old provider step", status: "pending" }] },
            streams: {},
          },
          "handoff-1": {
            id: "handoff-1",
            type: "provider_handoff",
            state: "completed",
            payload: {
              fromAgentKind: "claude",
              toAgentKind: "codex",
              at: "2026-08-30T00:00:00Z",
            },
            streams: {},
          },
          "plan-2": {
            id: "plan-2",
            type: "plan",
            state: "updated",
            payload: { steps: [{ step: "New provider step", status: "pending" }] },
            streams: {},
          },
        },
      },
    } as unknown as AppStoreState;

    expect(selectThreadTodoDockState(state, "t1")).toMatchObject({ sourceItemId: "plan-2" });
  });
});
