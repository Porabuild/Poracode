import { describe, expect, it } from "vitest";
import { createCodexMapperState, mapCodexNotification } from "../canonicalMapping";

describe("Codex reasoning turn completion", () => {
  it("closes unfinished thoughts before a completed turn ends while preserving background commands", () => {
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
      { turn: { id: "user-turn", status: "completed" } },
      state,
    );
    expect(events).toEqual([
      ...thoughtIds.map((itemId) => ({ type: "item.completed", threadId: "thread-1", itemId })),
      { type: "turn.completed", threadId: "thread-1", turnId: "user-turn", state: "completed" },
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
  });

  it.each(["interrupted", "failed"] as const)(
    "settles running commands when a turn ends %s and keeps their eventual native outcome on the same row",
    (status) => {
      const state = createCodexMapperState("thread-1");
      for (const [id, type] of [
        ["empty-thought", "reasoning"],
        ["running-command", "commandExecution"],
      ]) {
        mapCodexNotification("item/started", { item: { id, type } }, state);
      }
      const thoughtId = state.itemIdMap.get("empty-thought");
      const commandId = state.itemIdMap.get("running-command");
      mapCodexNotification(
        "item/commandExecution/outputDelta",
        { itemId: "running-command", delta: "partial" },
        state,
      );

      const events = mapCodexNotification(
        "turn/completed",
        { turn: { id: "user-turn", status } },
        state,
      );
      expect(events).toEqual([
        { type: "item.completed", threadId: "thread-1", itemId: thoughtId },
        {
          type: "item.completed",
          threadId: "thread-1",
          itemId: commandId,
          payload: { status: "error" },
        },
        { type: "turn.completed", threadId: "thread-1", turnId: "user-turn", state: status },
      ]);
      expect(state.itemIdMap.get("running-command")).toBe(commandId);
      expect(state.itemTypeMap.get("running-command")).toBe("command_execution");

      // Streaming output must not reopen the stopped row. A native completion
      // can still amend it because turn/interrupt does not kill unified exec.
      expect(
        mapCodexNotification(
          "item/commandExecution/outputDelta",
          { itemId: "running-command", delta: "orphan output" },
          state,
        ),
      ).toEqual([]);
      mapCodexNotification("turn/started", { turnId: "next-turn" }, state);
      mapCodexNotification("turn/completed", { turnId: "next-turn" }, state);
      expect(
        mapCodexNotification(
          "item/completed",
          {
            item: {
              id: "running-command",
              type: "commandExecution",
              status: "completed",
              exitCode: 0,
              aggregatedOutput: "actual final output",
            },
          },
          state,
        ),
      ).toEqual([
        {
          type: "content.delta",
          threadId: "thread-1",
          itemId: commandId,
          stream: "command_output",
          delta: "actual final output",
          replace: true,
        },
        {
          type: "item.completed",
          threadId: "thread-1",
          itemId: commandId,
          payload: { status: "success", exitCode: 0 },
        },
      ]);
      expect(state.itemIdMap.has("running-command")).toBe(false);
      expect(state.settledItemIds.has("running-command")).toBe(false);
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

  it("closes stranded non-command items when a turn settles", () => {
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
    ]) {
      mapCodexNotification("item/started", { item: { id: type, type } }, state);
    }
    const thoughtId = state.itemIdMap.get("reasoning");
    const commandId = state.itemIdMap.get("commandExecution");
    expect(thoughtId).toBeDefined();
    expect(commandId).toBeDefined();
    const events = mapCodexNotification("turn/completed", { turnId: "turn-1" }, state);
    const completed = events.filter((event) => event.type === "item.completed");
    // Every still-open non-command item is closed; command_execution survives
    // for its late completion, and none carry an error payload on a clean turn.
    expect(completed).toHaveLength(7);
    expect(completed.every((event) => event.payload === undefined)).toBe(true);
    expect(state.itemIdMap.has("commandExecution")).toBe(true);
    expect(state.itemIdMap.get("commandExecution")).toBe(commandId);
    expect(state.itemTypeMap.has("commandExecution")).toBe(true);
  });

  it("marks stranded items as error when the turn ends interrupted", () => {
    const state = createCodexMapperState("thread-1");
    for (const type of ["fileChange", "mcpToolCall", "commandExecution", "reasoning"]) {
      mapCodexNotification("item/started", { item: { id: type, type } }, state);
    }
    const fileChangeId = state.itemIdMap.get("fileChange");
    const mcpId = state.itemIdMap.get("mcpToolCall");
    const commandId = state.itemIdMap.get("commandExecution");
    const thoughtId = state.itemIdMap.get("reasoning");
    const events = mapCodexNotification(
      "turn/completed",
      { turn: { id: "turn-1", status: "interrupted" } },
      state,
    );
    expect(events).toEqual([
      {
        type: "item.completed",
        threadId: "thread-1",
        itemId: fileChangeId,
        payload: { status: "error" },
      },
      {
        type: "item.completed",
        threadId: "thread-1",
        itemId: mcpId,
        payload: { status: "error" },
      },
      {
        type: "item.completed",
        threadId: "thread-1",
        itemId: commandId,
        payload: { status: "error" },
      },
      // Reasoning keeps its payload-free completion even on a failed turn.
      { type: "item.completed", threadId: "thread-1", itemId: thoughtId },
      { type: "turn.completed", threadId: "thread-1", turnId: "turn-1", state: "interrupted" },
    ]);
  });

  it("keeps a running command execution mapped for its late completion", () => {
    const state = createCodexMapperState("thread-1");
    mapCodexNotification(
      "item/started",
      { item: { id: "cmd", type: "commandExecution", command: "sleep 60" } },
      state,
    );
    const internalId = state.itemIdMap.get("cmd");
    const events = mapCodexNotification("turn/completed", { turnId: "turn-1" }, state);
    expect(events.filter((event) => event.type === "item.completed")).toEqual([]);
    expect(state.itemIdMap.get("cmd")).toBe(internalId);
    // A later provider completion still resolves to the same internal row.
    const late = mapCodexNotification(
      "item/completed",
      { item: { id: "cmd", type: "commandExecution", status: "completed", exitCode: 0 } },
      state,
    );
    expect(late.find((event) => event.type === "item.completed")).toMatchObject({
      itemId: internalId,
    });
  });

  it("closes nothing when the turn does not settle", () => {
    const state = createCodexMapperState("thread-1");
    mapCodexNotification("item/started", { item: { id: "patch", type: "fileChange" } }, state);
    const events = mapCodexNotification(
      "turn/completed",
      { turn: { id: "sibling-turn", status: "completed" } },
      state,
      undefined,
      { turnSettled: false },
    );
    expect(events.filter((event) => event.type === "item.completed")).toEqual([]);
    expect(state.itemIdMap.has("patch")).toBe(true);
  });

  it.each(["interrupted", "failed"] as const)(
    "preserves a previous turn's background command when a later turn is %s",
    (status) => {
      const state = createCodexMapperState("thread-1");
      mapCodexNotification("turn/started", { turnId: "earlier" }, state);
      mapCodexNotification(
        "item/started",
        { turnId: "earlier", item: { id: "background", type: "commandExecution" } },
        state,
      );
      const backgroundId = state.itemIdMap.get("background");
      mapCodexNotification("turn/completed", { turnId: "earlier" }, state);
      mapCodexNotification("turn/started", { turnId: "later" }, state);
      mapCodexNotification(
        "item/started",
        { turnId: "later", item: { id: "foreground", type: "commandExecution" } },
        state,
      );
      const foregroundId = state.itemIdMap.get("foreground");
      const events = mapCodexNotification(
        "turn/completed",
        { turn: { id: "later", status } },
        state,
      );
      expect(events.filter((event) => event.type === "item.completed")).toEqual([
        {
          type: "item.completed",
          threadId: "thread-1",
          itemId: foregroundId,
          payload: { status: "error" },
        },
      ]);
      expect(state.itemIdMap.get("background")).toBe(backgroundId);
      expect(state.itemTurnIdMap.get("background")).toBe("earlier");
      expect(state.itemTurnIdMap.get("foreground")).toBe("later");
      expect(
        mapCodexNotification(
          "item/completed",
          {
            item: { id: "background", type: "commandExecution", status: "completed", exitCode: 0 },
          },
          state,
        ).at(-1),
      ).toMatchObject({
        type: "item.completed",
        itemId: backgroundId,
        payload: { status: "success" },
      });
      expect(state.itemTurnIdMap.size).toBe(1);
      mapCodexNotification(
        "item/completed",
        { item: { id: "foreground", type: "commandExecution", status: "interrupted" } },
        state,
      );
      expect(state.itemTurnIdMap.size).toBe(0);
    },
  );
});
