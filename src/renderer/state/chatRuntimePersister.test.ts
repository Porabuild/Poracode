import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  markThreadRuntimeForPersistence,
  type CompletedTurnRecord,
  type RuntimeChatItem,
} from "./slices/runtimeEventSlice";
import { useAppStore } from "./appStore";
import {
  installRuntimeItemsPersister,
  prepareRuntimeSnapshotForPersistence,
} from "./chatRuntimePersister";

const bridge = vi.hoisted(() => ({
  dbGetProjects: vi.fn<() => Promise<[]>>(),
  dbGetThreads: vi.fn<() => Promise<[]>>(),
  dbGetState: vi.fn<(key: string) => Promise<string | null>>(),
  dbSetState: vi.fn<(key: string, value: string) => Promise<void>>(),
  dbSyncAll: vi.fn<(projects: unknown[], threads: unknown[], viewJson: string) => Promise<void>>(),
  dbReplaceThreadRuntimeSnapshot: vi.fn<(payload: unknown) => Promise<void>>(),
}));

vi.mock("../bridge", () => ({
  readBridge: () => bridge,
}));

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

function makeTurn(anchorItemId: string | null): CompletedTurnRecord {
  return { startedAt: 1, endedAt: 2, anchorItemId };
}

beforeEach(() => {
  vi.useFakeTimers();
  bridge.dbGetProjects.mockReset().mockResolvedValue([]);
  bridge.dbGetThreads.mockReset().mockResolvedValue([]);
  bridge.dbGetState.mockReset().mockResolvedValue(null);
  bridge.dbSetState.mockReset().mockResolvedValue(undefined);
  bridge.dbSyncAll.mockReset().mockResolvedValue(undefined);
  bridge.dbReplaceThreadRuntimeSnapshot.mockReset().mockResolvedValue(undefined);
  useAppStore.setState({
    runtimeItemIdsByThread: {},
    runtimeItemsByIdByThread: {},
    runtimeRequestsByThread: {},
    runtimeContextByThread: {},
    runtimeStructuralVersionByThread: {},
    runtimeCompletedTurnsByThread: {},
  });
  window.lightcode = {} as typeof window.lightcode;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("prepareRuntimeSnapshotForPersistence", () => {
  it("remaps completed-turn anchors to the persisted summary id for compacted runs", () => {
    const snapshot = prepareRuntimeSnapshotForPersistence(
      [
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
      ],
      [makeTurn("tool-1"), makeTurn("search-1"), makeTurn("command-1")],
    );

    const summaryId = "tool-call-summary:tool-1:command-1:3";
    expect(snapshot.items.map((item) => item.id)).toEqual([
      "assistant-1",
      summaryId,
      "assistant-2",
    ]);
    expect(snapshot.turns.map((turn) => turn.anchorItemId)).toEqual([
      summaryId,
      summaryId,
      summaryId,
    ]);
  });

  it("does not compact edits together with other tool calls", () => {
    const snapshot = prepareRuntimeSnapshotForPersistence(
      [
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
      ],
      [makeTurn("edit-1"), makeTurn("edit-2"), makeTurn("command-1"), makeTurn("edit-3")],
    );

    const editSummaryId = "tool-call-summary:edit-1:edit-2:2";
    const commandSummaryId = "tool-call-summary:command-1:command-2:2";
    expect(snapshot.items.map((item) => item.id)).toEqual([
      "assistant-1",
      editSummaryId,
      commandSummaryId,
      "edit-3",
    ]);
    expect(snapshot.turns.map((turn) => turn.anchorItemId)).toEqual([
      editSummaryId,
      editSummaryId,
      commandSummaryId,
      "edit-3",
    ]);
  });

  it("keeps an image-bearing tool call discrete so the image survives reload", () => {
    // A PNG base64 prefix — recognized as a renderable inline image.
    const imagePayload = {
      name: "imageGeneration",
      status: "success",
      result: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwAD",
    };
    const snapshot = prepareRuntimeSnapshotForPersistence(
      [
        makeItem({
          id: "command-1",
          type: "command_execution",
          payload: { command: "ls", exitCode: 0 },
        }),
        makeItem({ id: "image-1", type: "image_view", payload: imagePayload }),
      ],
      [],
    );

    const ids = snapshot.items.map((item) => item.id);
    // The image is NOT folded into a "1 command, 1 tool" summary (which would
    // strip the payload); it stays a discrete row with its image intact.
    expect(ids).toEqual(["command-1", "image-1"]);
    expect(snapshot.items.find((item) => item.id === "image-1")?.payload).toEqual(imagePayload);
    expect(ids.some((id) => id.startsWith("tool-call-summary:"))).toBe(false);
  });

  it("keeps dropped-anchor markers attached to the previous surviving row", () => {
    const snapshot = prepareRuntimeSnapshotForPersistence(
      [
        makeItem({ id: "assistant-1", type: "assistant_message" }),
        makeItem({
          id: "reason-1",
          type: "reasoning",
          streams: { reasoning_text: "   " },
        }),
        makeItem({ id: "assistant-2", type: "assistant_message" }),
      ],
      [makeTurn("reason-1")],
    );

    expect(snapshot.items.map((item) => item.id)).toEqual(["assistant-1", "assistant-2"]);
    expect(snapshot.turns[0]?.anchorItemId).toBe("assistant-1");
  });
});

describe("installRuntimeItemsPersister", () => {
  it("collects the thread snapshot only when the debounce fires", async () => {
    const unsubscribe = installRuntimeItemsPersister();
    const first = makeItem({
      id: "assistant-1",
      type: "assistant_message",
      state: "updated",
      streams: { assistant_text: "first" },
    });
    const latest = {
      ...first,
      streams: { assistant_text: "latest" },
    };

    try {
      useAppStore.setState({
        runtimeItemIdsByThread: { t1: [first.id] },
        runtimeItemsByIdByThread: { t1: { [first.id]: first } },
      });
      markThreadRuntimeForPersistence("t1");

      await vi.advanceTimersByTimeAsync(150);
      expect(bridge.dbReplaceThreadRuntimeSnapshot).not.toHaveBeenCalled();

      useAppStore.setState({
        runtimeItemsByIdByThread: { t1: { [latest.id]: latest } },
      });
      markThreadRuntimeForPersistence("t1");

      await vi.advanceTimersByTimeAsync(299);
      expect(bridge.dbReplaceThreadRuntimeSnapshot).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);

      expect(bridge.dbReplaceThreadRuntimeSnapshot).toHaveBeenCalledTimes(1);
      expect(bridge.dbReplaceThreadRuntimeSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          threadId: "t1",
          items: [
            expect.objectContaining({
              id: latest.id,
              streams: latest.streams,
            }),
          ],
        }),
      );
    } finally {
      unsubscribe();
    }
  });
});
