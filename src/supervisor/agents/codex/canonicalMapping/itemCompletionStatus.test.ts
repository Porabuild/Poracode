import { describe, expect, it } from "vitest";
import { createCodexMapperState, mapCodexNotification } from "../canonicalMapping";

describe("command execution completion", () => {
  describe.each([
    ["after a live start", true],
    ["without a retained start", false],
  ] as const)("%s", (_title, sawStart) => {
    it.each([
      ["declined", "error"],
      ["failed", "error"],
      ["completed", "success"],
    ] as const)("normalizes native %s to %s", (status, expectedStatus) => {
      const state = createCodexMapperState("thread");
      const item = {
        id: "command",
        type: "commandExecution",
        command: "pwd",
        cwd: "/fixture",
      };
      if (sawStart) mapCodexNotification("item/started", { item }, state);

      const events = mapCodexNotification(
        "item/completed",
        { item: { ...item, status, aggregatedOutput: "", exitCode: null } },
        state,
      );
      const completed = events.find((event) => event.type === "item.completed");
      expect(completed).toMatchObject({
        type: "item.completed",
        payload: { status: expectedStatus },
      });
      expect(completed?.payload).not.toHaveProperty("exitCode");
      expect(events.some((event) => event.type === "content.delta")).toBe(false);
      expect(state.itemIdMap.has(item.id)).toBe(false);
      expect(state.itemTypeMap.has(item.id)).toBe(false);
    });

    it("preserves legacy completion without a native status", () => {
      const state = createCodexMapperState("thread");
      const item = {
        id: "legacy-command",
        type: "commandExecution",
        command: "pwd",
        cwd: "/fixture",
      };
      if (sawStart) mapCodexNotification("item/started", { item }, state);
      const events = mapCodexNotification(
        "item/completed",
        { item: { ...item, exitCode: 0, aggregatedOutput: "/fixture\n" } },
        state,
      );
      expect(events.find((event) => event.type === "item.completed")).toMatchObject({
        payload: { exitCode: 0 },
      });
      expect(events.find((event) => event.type === "item.completed")?.payload).not.toHaveProperty(
        "status",
      );
      expect(events.find((event) => event.type === "content.delta")).toMatchObject({
        stream: "command_output",
        delta: "/fixture\n",
      });
    });
  });
});

describe("file change completion", () => {
  for (const sawStart of [true, false]) {
    it.each([
      ["declined", "error"],
      ["failed", "error"],
      ["completed", "success"],
    ] as const)(
      `normalizes native %s to %s ${sawStart ? "after a live start" : "without a retained start"}`,
      (status, expectedStatus) => {
        const state = createCodexMapperState("thread");
        const item = { id: "patch", type: "fileChange", path: "src/example.ts" };
        if (sawStart) mapCodexNotification("item/started", { item }, state);
        const events = mapCodexNotification("item/completed", { item: { ...item, status } }, state);
        expect(events.find((event) => event.type === "item.completed")).toMatchObject({
          type: "item.completed",
          payload: { status: expectedStatus },
        });
        expect(events.some((event) => event.type === "content.delta")).toBe(false);
        expect(state.itemIdMap.has(item.id)).toBe(false);
        expect(state.itemTypeMap.has(item.id)).toBe(false);
      },
    );
  }
});
