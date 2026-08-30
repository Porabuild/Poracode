// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { AppStoreState } from "@/renderer/state/appStore";
import { getThreadGoalDockStateFromThreadItems } from "./threadGoalState";

describe("threadGoalState", () => {
  it("selects the latest active goal as a composer dock state", () => {
    const state = {
      runtimeItemIdsByThread: {
        t1: ["goal-1", "assistant-1", "goal-2"],
      },
      runtimeItemsByIdByThread: {
        t1: {
          "goal-1": {
            id: "goal-1",
            type: "goal",
            state: "completed",
            payload: {
              action: "set",
              objective: "Ship old goal",
              status: "active",
            },
            streams: {},
          },
          "assistant-1": {
            id: "assistant-1",
            type: "assistant_message",
            state: "completed",
            streams: { assistant_text: "ok" },
          },
          "goal-2": {
            id: "goal-2",
            type: "goal",
            state: "completed",
            payload: {
              action: "updated",
              objective: "Ship goal dock",
              status: "active",
              tokenBudget: 1000,
              tokensUsed: 120,
              timeUsedSeconds: 5,
              updatedAt: 1778570005,
            },
            streams: {},
          },
        },
      },
    } as unknown as AppStoreState;

    expect(
      getThreadGoalDockStateFromThreadItems(
        state.runtimeItemIdsByThread.t1,
        state.runtimeItemsByIdByThread.t1,
      ),
    ).toMatchObject({
      sourceItemId: "goal-2",
      objective: "Ship goal dock",
      status: "active",
      tokenBudget: 1000,
      tokensUsed: 120,
      timeUsedSeconds: 5,
      updatedAt: 1778570005,
    });
  });

  it("removes the dock when the latest goal state is cleared", () => {
    const state = {
      runtimeItemIdsByThread: {
        t1: ["goal-1"],
      },
      runtimeItemsByIdByThread: {
        t1: {
          "goal-1": {
            id: "goal-1",
            type: "goal",
            state: "completed",
            payload: {
              action: "cleared",
              objective: "Ship goal dock",
              status: "active",
            },
            streams: {},
          },
        },
      },
    } as unknown as AppStoreState;

    expect(
      getThreadGoalDockStateFromThreadItems(
        state.runtimeItemIdsByThread.t1,
        state.runtimeItemsByIdByThread.t1,
      ),
    ).toBeNull();
  });

  it("drops a goal the previous provider left behind on the other side of a handoff", () => {
    const state = {
      runtimeItemIdsByThread: {
        t1: ["goal-1", "handoff-1"],
      },
      runtimeItemsByIdByThread: {
        t1: {
          "goal-1": {
            id: "goal-1",
            type: "goal",
            state: "completed",
            payload: { action: "set", objective: "Old provider goal", status: "active" },
            streams: {},
          },
          "handoff-1": {
            id: "handoff-1",
            type: "provider_handoff",
            state: "completed",
            payload: { fromAgentKind: "claude", toAgentKind: "codex", at: "2026-08-30T00:00:00Z" },
            streams: {},
          },
        },
      },
    } as unknown as AppStoreState;

    expect(
      getThreadGoalDockStateFromThreadItems(
        state.runtimeItemIdsByThread.t1,
        state.runtimeItemsByIdByThread.t1,
      ),
    ).toBeNull();
  });

  it("keeps a goal the incoming provider set after the handoff", () => {
    const state = {
      runtimeItemIdsByThread: {
        t1: ["goal-1", "handoff-1", "goal-2"],
      },
      runtimeItemsByIdByThread: {
        t1: {
          "goal-1": {
            id: "goal-1",
            type: "goal",
            state: "completed",
            payload: { action: "set", objective: "Old provider goal", status: "active" },
            streams: {},
          },
          "handoff-1": {
            id: "handoff-1",
            type: "provider_handoff",
            state: "completed",
            payload: { fromAgentKind: "claude", toAgentKind: "codex", at: "2026-08-30T00:00:00Z" },
            streams: {},
          },
          "goal-2": {
            id: "goal-2",
            type: "goal",
            state: "completed",
            payload: { action: "set", objective: "New provider goal", status: "active" },
            streams: {},
          },
        },
      },
    } as unknown as AppStoreState;

    expect(
      getThreadGoalDockStateFromThreadItems(
        state.runtimeItemIdsByThread.t1,
        state.runtimeItemsByIdByThread.t1,
      ),
    ).toMatchObject({ sourceItemId: "goal-2", objective: "New provider goal" });
  });
});
