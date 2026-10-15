import { describe, expect, it } from "vitest";
import { createCodexMapperState, mapCodexNotification } from "../canonicalMapping";

describe("Codex reasoning turn completion", () => {
  it.each(["completed", "interrupted", "failed"])(
    "closes unfinished thoughts before a %s turn ends while preserving background commands",
    (status) => {
      const state = createCodexMapperState("thread-1");
      for (const [id, type] of [
        ["empty-thought", "reasoning"],
        ["streamed-thought", "reasoning"],
        ["background-command", "commandExecution"],
      ]) {
        mapCodexNotification("item/started", { item: { id, type } }, state);
      }
      mapCodexNotification(
        "item/reasoning/summaryTextDelta",
        { itemId: "streamed-thought", delta: "Checking the result" },
        state,
      );
      const thoughtIds = ["empty-thought", "streamed-thought"].map((id) => state.itemIdMap.get(id));
      const commandId = state.itemIdMap.get("background-command");

      expect(
        mapCodexNotification(
          "turn/completed",
          { turn: { id: "compaction-turn", status: "completed" } },
          state,
          undefined,
          { turnSettled: false },
        ),
      ).not.toContainEqual(expect.objectContaining({ type: "item.completed" }));

      const events = mapCodexNotification(
        "turn/completed",
        { turn: { id: "user-turn", status } },
        state,
      );
      expect(events).toEqual([
        ...thoughtIds.map((itemId) => ({ type: "item.completed", threadId: "thread-1", itemId })),
        { type: "turn.completed", threadId: "thread-1", turnId: "user-turn", state: status },
      ]);
      expect(state.itemIdMap.has("empty-thought")).toBe(false);
      expect(state.itemIdMap.get("background-command")).toBe(commandId);
      expect(
        mapCodexNotification(
          "item/commandExecution/outputDelta",
          { itemId: "background-command", delta: "late output" },
          state,
        ),
      ).toEqual([
        {
          type: "content.delta",
          threadId: "thread-1",
          itemId: commandId,
          stream: "command_output",
          delta: "late output",
        },
      ]);
    },
  );

  it("does not complete an already completed thought twice", () => {
    const state = createCodexMapperState("thread-1");
    const params = { item: { id: "thought", type: "reasoning" } };
    mapCodexNotification("item/started", params, state);
    mapCodexNotification("item/completed", params, state);
    expect(mapCodexNotification("turn/completed", { turnId: "turn-1" }, state)).toEqual([
      { type: "turn.completed", threadId: "thread-1", turnId: "turn-1", state: "completed" },
    ]);
  });

  it("does not complete ongoing tool items when settling a thought", () => {
    const state = createCodexMapperState("thread-1");
    for (const type of [
      "reasoning",
      "commandExecution",
      "mcpToolCall",
      "dynamicToolCall",
      "fileChange",
      "webSearch",
      "imageView",
      "collabAgentToolCall",
      "contextCompaction",
    ]) {
      mapCodexNotification("item/started", { item: { id: type, type } }, state);
    }
    const thoughtId = state.itemIdMap.get("reasoning");
    expect(thoughtId).toBeDefined();
    const events = mapCodexNotification("turn/completed", { turnId: "turn-1" }, state);
    expect(events.filter((event) => event.type === "item.completed")).toEqual([
      { type: "item.completed", threadId: "thread-1", itemId: thoughtId },
    ]);
  });
});
