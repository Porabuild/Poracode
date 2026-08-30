// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { AppStoreState } from "@/renderer/state/appStore";
import { getThreadTodoDockStateFromThreadItems } from "./threadTodoState";

function planItem(id: string, step: string, status: string) {
  return {
    id,
    type: "plan",
    state: "completed",
    payload: { steps: [{ step, status }] },
    streams: {},
  };
}

const handoffItem = {
  id: "handoff-1",
  type: "provider_handoff",
  state: "completed",
  payload: { fromAgentKind: "claude", toAgentKind: "codex", at: "2026-08-30T00:00:00Z" },
  streams: {},
};

function stateFor(itemIds: string[], items: Record<string, unknown>): AppStoreState {
  return {
    runtimeItemIdsByThread: { t1: itemIds },
    runtimeItemsByIdByThread: { t1: items },
  } as unknown as AppStoreState;
}

describe("threadTodoState", () => {
  it("docks the latest plan of the current provider", () => {
    const state = stateFor(["plan-1"], {
      "plan-1": planItem("plan-1", "Write the fix", "pending"),
    });

    expect(
      getThreadTodoDockStateFromThreadItems(
        state.runtimeItemIdsByThread.t1,
        state.runtimeItemsByIdByThread.t1,
      ),
    ).toMatchObject({ sourceItemId: "plan-1" });
  });

  it("drops a plan the previous provider left behind on the other side of a handoff", () => {
    const state = stateFor(["plan-1", "handoff-1"], {
      "plan-1": planItem("plan-1", "Write the fix", "pending"),
      "handoff-1": handoffItem,
    });

    expect(
      getThreadTodoDockStateFromThreadItems(
        state.runtimeItemIdsByThread.t1,
        state.runtimeItemsByIdByThread.t1,
      ),
    ).toBeNull();
  });

  it("keeps a plan the incoming provider wrote after the handoff", () => {
    const state = stateFor(["plan-1", "handoff-1", "plan-2"], {
      "plan-1": planItem("plan-1", "Old provider step", "pending"),
      "handoff-1": handoffItem,
      "plan-2": planItem("plan-2", "New provider step", "pending"),
    });

    expect(
      getThreadTodoDockStateFromThreadItems(
        state.runtimeItemIdsByThread.t1,
        state.runtimeItemsByIdByThread.t1,
      ),
    ).toMatchObject({ sourceItemId: "plan-2" });
  });
});
