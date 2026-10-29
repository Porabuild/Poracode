import { describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import type { PersistedPromptIndex } from "@/shared/ipc";
import { cachedThreadPromptIndex, loadThreadPromptIndex } from "./threadPromptIndexCache";
import {
  createRuntimeEventSlice,
  type RuntimeChatItem,
  type RuntimeEventSlice,
} from "./slices/runtimeEventSlice";

function index(count: number): PersistedPromptIndex {
  return {
    prompts: Array.from({ length: count }, (_, position) => ({
      itemId: `prompt-${position}`,
      position,
      text: `Question ${position}`,
    })),
    truncated: false,
  };
}

function prompt(id: string): RuntimeChatItem {
  return { id, type: "user_message", state: "completed", streams: {} };
}

describe("prompt index retention", () => {
  it.each(["eviction", "reset", "trim", "rollback"])(
    "reloads prompts omitted by a bounded tail after %s",
    async (operation) => {
      const threadId = `index-${operation}`;
      const owner = {};
      const read = vi
        .fn<() => Promise<PersistedPromptIndex | null>>()
        .mockResolvedValueOnce(index(2))
        .mockResolvedValueOnce(index(5));
      const store = create<RuntimeEventSlice>()((set, get, api) =>
        createRuntimeEventSlice(set as never, get as never, api as never),
      );
      store
        .getState()
        .hydrateThreadRuntimeItems(threadId, [prompt("prompt-0"), prompt("prompt-1")]);
      await loadThreadPromptIndex(threadId, owner, read, () => true);
      // Prompts submitted since the index read are initially covered by the
      // loaded transcript. Losing that coverage must retire the old outline.
      store.getState().applyRuntimeEvent(threadId, {
        type: "item.started",
        threadId,
        itemId: "prompt-2",
        itemType: "user_message",
      });
      expect(cachedThreadPromptIndex(threadId, owner)).toEqual(index(2));
      if (operation === "eviction") store.getState().evictThreadRuntimeItems(threadId);
      else if (operation === "reset") store.getState().clearThreadRuntimeEvents(threadId);
      else if (operation === "trim") store.getState().trimThreadRuntimeItems(threadId, 0, 2);
      else
        store.getState().applyRuntimeEvent(threadId, {
          type: "runtime.truncated",
          threadId,
          itemId: "prompt-0",
          removedCompletedTurnAnchors: [],
        });
      expect(cachedThreadPromptIndex(threadId, owner)).toBeUndefined();
      store.getState().hydrateThreadRuntimeItems(threadId, [prompt("prompt-4")]);
      expect(await loadThreadPromptIndex(threadId, owner, read, () => true)).toEqual(index(5));
      expect(read).toHaveBeenCalledTimes(2);
    },
  );

  it("keeps recently reopened threads when the entry limit is reached", async () => {
    const owner = {};
    const read = () => Promise.resolve(index(1));
    for (let i = 0; i < 32; i++) await loadThreadPromptIndex(`lru-${i}`, owner, read, () => true);
    expect(cachedThreadPromptIndex("lru-0", owner)).toEqual(index(1));
    await loadThreadPromptIndex("lru-new", owner, read, () => true);
    expect(cachedThreadPromptIndex("lru-0", owner)).toEqual(index(1));
    expect(cachedThreadPromptIndex("lru-1", owner)).toBeUndefined();
  });
});
