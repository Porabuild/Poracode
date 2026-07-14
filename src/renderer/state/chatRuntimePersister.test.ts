import { describe, expect, it } from "vitest";
import type { RuntimeChatItem } from "./slices/runtimeEventSlice";
import { compactRuntimeItemsForHydration } from "./chatRuntimePersister";

function makeItem(
  input: Partial<RuntimeChatItem> & Pick<RuntimeChatItem, "id" | "type">,
): RuntimeChatItem {
  return {
    id: input.id,
    type: input.type,
    state: input.state ?? "completed",
    streams: input.streams ?? {},
    ...(input.payload !== undefined ? { payload: input.payload } : {}),
    ...(input.parentItemId ? { parentItemId: input.parentItemId } : {}),
  };
}

describe("compactRuntimeItemsForHydration", () => {
  it("compacts completed tool-call runs", () => {
    const items = compactRuntimeItemsForHydration([
      makeItem({ id: "assistant-1", type: "assistant_message" }),
      makeItem({
        id: "tool-1",
        type: "tool_call",
        payload: { name: "Viewing src/a.ts", status: "success" },
      }),
      makeItem({ id: "search-1", type: "web_search" }),
      makeItem({
        id: "command-1",
        type: "command_execution",
        payload: { command: "pnpm run test", exitCode: 0 },
      }),
      makeItem({ id: "assistant-2", type: "assistant_message" }),
    ]);

    expect(items.map((item) => item.id)).toEqual([
      "assistant-1",
      "tool-call-summary:tool-1:command-1:3",
      "assistant-2",
    ]);
  });

  it("compacts edits together with the rest of the tool-call run", () => {
    const items = compactRuntimeItemsForHydration([
      makeItem({ id: "assistant-1", type: "assistant_message" }),
      makeItem({
        id: "edit-1",
        type: "file_change",
        payload: { path: "src/foo.ts", changeKind: "edit" },
      }),
      makeItem({
        id: "edit-2",
        type: "file_change",
        payload: { path: "src/foo.ts", changeKind: "edit" },
      }),
      makeItem({
        id: "command-1",
        type: "command_execution",
        payload: { command: "pnpm run typecheck", exitCode: 0 },
      }),
      makeItem({
        id: "command-2",
        type: "command_execution",
        payload: { command: "pnpm run lint", exitCode: 0 },
      }),
      makeItem({
        id: "edit-3",
        type: "file_change",
        payload: { path: "src/bar.ts", changeKind: "edit" },
      }),
    ]);

    expect(items.map((item) => item.id)).toEqual([
      "assistant-1",
      "tool-call-summary:edit-1:edit-3:5",
    ]);
  });

  it("keeps an image-bearing tool call discrete so the image survives reload", () => {
    const imagePayload = {
      name: "imageGeneration",
      status: "success",
      result: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwAD",
    };
    const items = compactRuntimeItemsForHydration([
      makeItem({
        id: "command-1",
        type: "command_execution",
        payload: { command: "ls", exitCode: 0 },
      }),
      makeItem({ id: "image-1", type: "image_view", payload: imagePayload }),
    ]);

    const ids = items.map((item) => item.id);
    expect(ids).toEqual(["command-1", "image-1"]);
    expect(items.find((item) => item.id === "image-1")?.payload).toEqual(imagePayload);
    expect(ids.some((id) => id.startsWith("tool-call-summary:"))).toBe(false);
  });

  it("drops error items so stale errors do not resurface on reopen", () => {
    const items = compactRuntimeItemsForHydration([
      makeItem({ id: "user-1", type: "user_message" }),
      makeItem({ id: "assistant-1", type: "assistant_message" }),
      makeItem({ id: "err-1", type: "error", payload: { message: "boom" } }),
    ]);

    expect(items.map((item) => item.id)).toEqual(["user-1", "assistant-1"]);
  });

  it("drops empty completed reasoning items", () => {
    const items = compactRuntimeItemsForHydration([
      makeItem({ id: "assistant-1", type: "assistant_message" }),
      makeItem({
        id: "reason-1",
        type: "reasoning",
        streams: { reasoning_text: "   " },
      }),
      makeItem({ id: "assistant-2", type: "assistant_message" }),
    ]);

    expect(items.map((item) => item.id)).toEqual(["assistant-1", "assistant-2"]);
  });
});
