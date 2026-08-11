import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "./appStore";
import type { RuntimeChatItem } from "./slices/runtimeEventSlice";
import {
  compactRuntimeItemsForHydration,
  hydrateThreadRuntimeItems,
  loadOlderThreadRuntimeItems,
  releaseThreadRuntimeItems,
  retainThreadRuntimeItems,
  seedOlderThreadRuntimeItemsCursor,
} from "./chatRuntimePersister";

const { bridge } = vi.hoisted(() => ({
  bridge: {
    dbGetThreadRuntimeItemsPage: vi.fn<
      (input: {
        threadId: string;
        beforePosition?: number;
        limit: number;
        targetTimelineEntryCount?: number;
      }) => Promise<{
        items: RuntimeChatItem[];
        nextCursor: number | null;
      }>
    >(),
    dbGetThreadCompletedTurns: vi
      .fn<(threadId: string) => Promise<never[]>>()
      .mockResolvedValue([]),
    dbGetThreadContextUsage: vi.fn<(threadId: string) => Promise<null>>().mockResolvedValue(null),
  },
}));

vi.mock("../bridge", () => ({ readBridge: () => bridge }));

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

describe("paged runtime hydration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.dbGetThreadCompletedTurns.mockResolvedValue([]);
    bridge.dbGetThreadContextUsage.mockResolvedValue(null);
    useAppStore.setState((state) => ({
      ...state,
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      runtimeStructuralVersionByThread: {},
    }));
  });

  it("hydrates the tail and coalesces concurrent requests for the next cursor", async () => {
    bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
      items: [makeItem({ id: "newer", type: "assistant_message" })],
      nextCursor: 100,
    });

    await hydrateThreadRuntimeItems("paged-thread");

    expect(bridge.dbGetThreadRuntimeItemsPage).toHaveBeenCalledWith({
      threadId: "paged-thread",
      limit: 500,
      targetTimelineEntryCount: 40,
    });

    let resolveOlderPage: (page: {
      items: RuntimeChatItem[];
      nextCursor: number | null;
    }) => void = () => undefined;
    bridge.dbGetThreadRuntimeItemsPage.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOlderPage = resolve;
      }),
    );

    const firstLoad = loadOlderThreadRuntimeItems("paged-thread");
    const duplicateLoad = loadOlderThreadRuntimeItems("paged-thread");
    expect(bridge.dbGetThreadRuntimeItemsPage).toHaveBeenCalledTimes(2);
    expect(bridge.dbGetThreadRuntimeItemsPage).toHaveBeenLastCalledWith({
      threadId: "paged-thread",
      beforePosition: 100,
      limit: 500,
      targetTimelineEntryCount: 40,
    });

    resolveOlderPage({
      items: [makeItem({ id: "older", type: "user_message" })],
      nextCursor: null,
    });
    await expect(Promise.all([firstLoad, duplicateLoad])).resolves.toEqual([true, true]);

    expect(useAppStore.getState().runtimeItemIdsByThread["paged-thread"]).toEqual([
      "older",
      "newer",
    ]);
    await expect(loadOlderThreadRuntimeItems("paged-thread")).resolves.toBe(false);
    expect(bridge.dbGetThreadRuntimeItemsPage).toHaveBeenCalledTimes(2);
  });

  it("keeps the remote snapshot cursor through ChatPane hydration", async () => {
    seedOlderThreadRuntimeItemsCursor("remote-paged-thread", 77);
    await hydrateThreadRuntimeItems("remote-paged-thread");
    expect(bridge.dbGetThreadRuntimeItemsPage).not.toHaveBeenCalled();

    bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
      items: [makeItem({ id: "remote-older", type: "assistant_message" })],
      nextCursor: null,
    });

    await expect(loadOlderThreadRuntimeItems("remote-paged-thread")).resolves.toBe(true);

    expect(bridge.dbGetThreadRuntimeItemsPage).toHaveBeenCalledWith({
      threadId: "remote-paged-thread",
      beforePosition: 77,
      limit: 500,
      targetTimelineEntryCount: 40,
    });
    expect(useAppStore.getState().runtimeItemIdsByThread["remote-paged-thread"]).toEqual([
      "remote-older",
    ]);
  });

  it("does not rewind an advanced remote cursor on a periodic tail refresh", async () => {
    seedOlderThreadRuntimeItemsCursor("remote-refresh-thread", 80);
    bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
      items: [makeItem({ id: "middle-page", type: "assistant_message" })],
      nextCursor: 40,
    });
    await expect(loadOlderThreadRuntimeItems("remote-refresh-thread")).resolves.toBe(true);

    seedOlderThreadRuntimeItemsCursor("remote-refresh-thread", 80, {
      preserveExistingCursor: true,
    });
    bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
      items: [makeItem({ id: "oldest-page", type: "assistant_message" })],
      nextCursor: null,
    });
    await expect(loadOlderThreadRuntimeItems("remote-refresh-thread")).resolves.toBe(true);

    expect(bridge.dbGetThreadRuntimeItemsPage).toHaveBeenLastCalledWith({
      threadId: "remote-refresh-thread",
      beforePosition: 40,
      limit: 500,
      targetTimelineEntryCount: 40,
    });
    expect(useAppStore.getState().runtimeItemIdsByThread["remote-refresh-thread"]).toEqual([
      "oldest-page",
      "middle-page",
    ]);
  });

  it("adopts a fresh cursor when the authoritative tail is disjoint", async () => {
    seedOlderThreadRuntimeItemsCursor("remote-disjoint-thread", 80);
    bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
      items: [makeItem({ id: "replaced-middle-page", type: "assistant_message" })],
      nextCursor: 40,
    });
    await expect(loadOlderThreadRuntimeItems("remote-disjoint-thread")).resolves.toBe(true);

    seedOlderThreadRuntimeItemsCursor("remote-disjoint-thread", 120);
    bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
      items: [makeItem({ id: "fresh-middle-page", type: "assistant_message" })],
      nextCursor: null,
    });
    await expect(loadOlderThreadRuntimeItems("remote-disjoint-thread")).resolves.toBe(true);

    expect(bridge.dbGetThreadRuntimeItemsPage).toHaveBeenLastCalledWith({
      threadId: "remote-disjoint-thread",
      beforePosition: 120,
      limit: 500,
      targetTimelineEntryCount: 40,
    });
  });

  it("rehydrates a transcript after the inactive cache evicts it", async () => {
    const threadIds = Array.from({ length: 11 }, (_, index) => `cached-thread-${index}`);
    bridge.dbGetThreadRuntimeItemsPage.mockImplementation(async ({ threadId }) => ({
      items: [makeItem({ id: `${threadId}-item`, type: "assistant_message" })],
      nextCursor: null,
    }));

    for (const threadId of threadIds) {
      await hydrateThreadRuntimeItems(threadId);
      retainThreadRuntimeItems(threadId);
      releaseThreadRuntimeItems(threadId);
    }

    expect(useAppStore.getState().runtimeItemIdsByThread[threadIds[0]!]).toBeUndefined();
    for (const threadId of threadIds.slice(1)) {
      expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toBeDefined();
    }

    bridge.dbGetThreadRuntimeItemsPage.mockClear();
    await hydrateThreadRuntimeItems(threadIds[0]!);
    expect(bridge.dbGetThreadRuntimeItemsPage).toHaveBeenCalledWith({
      threadId: threadIds[0],
      limit: 500,
      targetTimelineEntryCount: 40,
    });
    expect(useAppStore.getState().runtimeItemIdsByThread[threadIds[0]!]).toEqual([
      `${threadIds[0]}-item`,
    ]);
  });
});
