import { describe, expect, it } from "vitest";
import { compactRuntimeItemsForHydration } from "./runtimeHistoryCompaction";
import { runtimeHistorySourceStart } from "./runtimeHistoryBoundary";
import type { RuntimeChatItem } from "./slices/runtimeEventSlice";

function successfulTool(id: string): RuntimeChatItem {
  return {
    id,
    type: "tool_call",
    state: "completed",
    payload: { name: "Read resource", kind: "read", status: "success" },
    streams: {},
  };
}

function expectFailureRetained(failed: RuntimeChatItem): void {
  const input = [
    successfulTool("before-1"),
    successfulTool("before-2"),
    failed,
    successfulTool("after-1"),
    successfulTool("after-2"),
  ];
  const original = structuredClone(input);
  const result = compactRuntimeItemsForHydration(input);

  expect(result.map((item) => item.id)).toEqual([
    "tool-call-summary:before-1:before-2:2",
    failed.id,
    "tool-call-summary:after-1:after-2:2",
  ]);
  // The failed canonical row keeps every payload field and streamed detail.
  expect(result[1]).toBe(failed);
  expect(input).toEqual(original);
  expect(result[0]?.payload).toEqual({ name: "2 views", status: "success" });
  expect(result[2]?.payload).toEqual({ name: "2 views", status: "success" });
  // Successful summaries still anchor paging at their first original row.
  expect(runtimeHistorySourceStart(result[0]!)).toBe("before-1");
  expect(runtimeHistorySourceStart(result[1]!)).toBe(failed.id);
  expect(runtimeHistorySourceStart(result[2]!)).toBe("after-1");
}

describe("hydrated history failure fidelity", () => {
  it.each(["tool_call", "mcp_tool_call", "dynamic_tool_call", "image_view"] as const)(
    "keeps a completed %s failure between successful compacted runs",
    (type) => {
      expect.assertions(8);
      expectFailureRetained({
        id: `failed:${type}`,
        type,
        state: "completed",
        payload: {
          name: "Read resource",
          status: "error",
          args: { path: "missing.txt" },
          result: { message: "Resource unavailable", diagnostic: { code: "NOT_FOUND" } },
        },
        streams: {},
      });
    },
  );

  it("keeps a completed failed file change and its streamed details", () => {
    expect.assertions(8);
    expectFailureRetained({
      id: "failed-edit",
      type: "file_change",
      state: "completed",
      payload: { path: "locked.txt", changeKind: "edit", status: "error", errorMessage: "Locked" },
      streams: { file_change_output: "Cannot write locked.txt\n" },
    });
  });

  it.each([
    { status: "error", exitCode: 0 },
    { status: "success", exitCode: 1 },
    { exitCode: -1 },
    { exitCode: 127 },
  ])("keeps a failed completed command with %j", (outcome) => {
    expect.assertions(8);
    expectFailureRetained({
      id: "failed-command",
      type: "command_execution",
      state: "completed",
      payload: { command: "check-resource", ...outcome },
      streams: { command_output: "Resource check failed\n" },
    });
  });

  it("preserves an existing failed summary instead of normalizing it to success", () => {
    const failed: RuntimeChatItem = {
      id: "tool-call-summary:legacy-first:legacy-last:2",
      type: "tool_call",
      state: "completed",
      payload: { name: "2 tools", status: "error", result: "Existing failure detail" },
      streams: {},
    };
    expect(compactRuntimeItemsForHydration([failed])).toEqual([failed]);
    expect(compactRuntimeItemsForHydration([failed])[0]).toBe(failed);
  });

  it.each([0, undefined])("still compacts a completed command with exit code %s", (exitCode) => {
    const command: RuntimeChatItem = {
      id: "successful-command",
      type: "command_execution",
      state: "completed",
      payload: { command: "check-resource", ...(exitCode !== undefined ? { exitCode } : {}) },
      streams: { command_output: "Resource available\n" },
    };
    const result = compactRuntimeItemsForHydration([successfulTool("read"), command]);
    expect(result).toMatchObject([
      { id: "tool-call-summary:read:successful-command:2", payload: { status: "success" } },
    ]);
    expect(runtimeHistorySourceStart(result[0]!)).toBe("read");
  });
});
