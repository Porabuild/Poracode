import { describe, expect, it } from "vitest";
import type { PersistedRuntimeItem } from "./ipc/schemas";
import { selectThreadForkSnapshot } from "./threadFork";

const message = (id: string, type = "assistant_message"): PersistedRuntimeItem => ({
  id,
  type,
  state: "completed",
  streams: { assistant_text: id },
});
const turns = ["a1", "a2"].map((anchorItemId, index) => ({
  anchorItemId,
  startedAt: `2026-10-20T10:0${index}:00Z`,
  endedAt: `2026-10-20T10:0${index}:10Z`,
}));

describe("conversation fork snapshots", () => {
  it("keeps the selected completed turn inclusively and omits all later history", () => {
    const items = [message("u1", "user_message"), message("a1"), message("u2"), message("a2")];
    const result = selectThreadForkSnapshot(items, turns, "a1");
    expect(result.items.map((item) => item.id)).toEqual(["u1", "a1"]);
    expect(result.turns).toEqual([turns[0]]);
    expect(items).toHaveLength(4);
    expect(selectThreadForkSnapshot(items, turns).throughItemId).toBe("a2");
  });

  it("excludes goals, pending approvals and running background work with its children", () => {
    const items = [
      message("u1", "user_message"),
      message("goal", "goal"),
      message("approval", "pending_request"),
      { ...message("background", "tool_call"), payload: { status: "running" } },
      { ...message("child"), parentItemId: "background" },
      message("a1"),
    ];
    expect(selectThreadForkSnapshot(items, turns, "a1").items.map((item) => item.id)).toEqual([
      "u1",
      "a1",
    ]);
  });

  it("refuses missing, live and removed turn boundaries", () => {
    expect(() => selectThreadForkSnapshot([message("live")], turns, "live")).toThrow(
      "Choose a completed turn",
    );
    expect(() => selectThreadForkSnapshot([], turns, "a1")).toThrow("Choose a completed turn");
    expect(() => selectThreadForkSnapshot([], [])).toThrow("Choose a completed turn");
  });

  it("includes settled anchor descendants but excludes the following root turn", () => {
    const items = [
      message("u1", "user_message"),
      message("a1", "tool_call"),
      { ...message("child"), parentItemId: "a1" },
      message("u2", "user_message"),
      message("a2"),
    ];
    expect(selectThreadForkSnapshot(items, turns, "a1").items.map((item) => item.id)).toEqual([
      "u1",
      "a1",
      "child",
    ]);
  });

  it("resolves a hidden operational anchor to the last inherited root row", () => {
    const items = [message("u1", "user_message"), message("answer"), message("a1", "goal")];
    const result = selectThreadForkSnapshot(items, turns, "a1");
    expect(result.throughItemId).toBe("answer");
    expect(result.turns[0]?.anchorItemId).toBe("answer");
  });
});
