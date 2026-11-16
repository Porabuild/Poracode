import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import type { PersistedPromptIndex } from "@/shared/ipc";
import { useThreadPromptIndex } from "@/renderer/components/thread/ChatPane/useThreadPromptIndex";
import {
  cachedThreadPromptIndex,
  forgetThreadPromptIndex,
  loadThreadPromptIndex,
  threadPromptIndexNeedsRefresh,
} from "./threadPromptIndexCache";
import {
  createRuntimeEventSlice,
  type RuntimeChatItem,
  type RuntimeEventSlice,
} from "./slices/runtimeEventSlice";

const mountedRead = vi.hoisted(() => ({
  read: undefined as undefined | (() => Promise<unknown>),
  owner: "host" as unknown,
}));
// The hook runs over the REAL cache; only the host read and its owner are fixtures.
vi.mock("@/renderer/state/threadPromptIndex", async () => {
  const cache = await import("./threadPromptIndexCache");
  return {
    threadPromptIndexOwner: () => mountedRead.owner,
    readCachedThreadPromptIndex: (threadId: string) =>
      cache.cachedThreadPromptIndex(threadId, mountedRead.owner),
    shouldRefreshThreadPromptIndex: (threadId: string) =>
      cache.threadPromptIndexNeedsRefresh(threadId, mountedRead.owner),
    readThreadPromptIndex: async (threadId: string, signal?: AbortSignal) => {
      const owner = mountedRead.owner;
      const loaded = await cache.loadThreadPromptIndex(
        threadId,
        owner,
        () => mountedRead.read!() as Promise<PersistedPromptIndex | null>,
        () => mountedRead.owner === owner,
      );
      return signal?.aborted ? null : loaded;
    },
  };
});

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
  it.each(["keepTranscript", "keepPromptIndex"] as const)(
    "retains the full outline during %s recovery and deduplicates its refresh",
    async (preserve) => {
      const threadId = `index-recovery-${preserve}`;
      const owner = {};
      const saved = index(5);
      const refreshed = index(6);
      const store = create<RuntimeEventSlice>()((set, get, api) =>
        createRuntimeEventSlice(set as never, get as never, api as never),
      );
      store.getState().hydrateThreadRuntimeItems(threadId, [prompt("prompt-4")]);
      await loadThreadPromptIndex(
        threadId,
        owner,
        () => Promise.resolve(saved),
        () => true,
      );

      store.getState().clearThreadRuntimeEvents(threadId, { [preserve]: true });
      expect(cachedThreadPromptIndex(threadId, owner)).toBe(saved);
      expect(threadPromptIndexNeedsRefresh(threadId, owner)).toBe(true);
      const pending = Promise.withResolvers<PersistedPromptIndex>();
      const read = vi.fn<() => Promise<PersistedPromptIndex>>(() => pending.promise);
      const first = loadThreadPromptIndex(threadId, owner, read, () => true);
      const second = loadThreadPromptIndex(threadId, owner, read, () => true);
      expect(first).toBe(second);
      expect(cachedThreadPromptIndex(threadId, owner)).toBe(saved);
      pending.resolve(refreshed);
      await first;
      expect(read).toHaveBeenCalledOnce();
      expect(cachedThreadPromptIndex(threadId, owner)).toBe(refreshed);
      expect(threadPromptIndexNeedsRefresh(threadId, owner)).toBe(false);
    },
  );

  it("keeps the outline on a failed refresh but drops it for another connection", async () => {
    const threadId = "index-failed-refresh";
    const owner = {};
    const saved = index(5);
    const store = create<RuntimeEventSlice>()((set, get, api) =>
      createRuntimeEventSlice(set as never, get as never, api as never),
    );
    await loadThreadPromptIndex(
      threadId,
      owner,
      () => Promise.resolve(saved),
      () => true,
    );
    store.getState().clearThreadRuntimeEvents(threadId, { keepTranscript: true });
    await loadThreadPromptIndex(
      threadId,
      owner,
      () => Promise.reject(new Error("offline")),
      () => true,
    );
    expect(cachedThreadPromptIndex(threadId, owner)).toBe(saved);
    expect(threadPromptIndexNeedsRefresh(threadId, owner)).toBe(true);
    expect(cachedThreadPromptIndex(threadId, {})).toBeUndefined();
    store.getState().clearThreadRuntimeEvents(threadId);
    expect(cachedThreadPromptIndex(threadId, owner)).toBeUndefined();
  });

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

describe("a first prompt-index read that is still in flight", () => {
  const newStore = () =>
    create<RuntimeEventSlice>()((set, get, api) =>
      createRuntimeEventSlice(set as never, get as never, api as never),
    );

  it.each([
    ["keepPromptIndex", { keepPromptIndex: true }],
    ["keepTranscript", { keepTranscript: true }],
  ] as const)("survives a same-connection %s soft invalidation", async (_name, options) => {
    const threadId = `first-read-soft-${_name}`;
    const owner = {};
    const pending = Promise.withResolvers<PersistedPromptIndex>();
    const read = vi.fn<() => Promise<PersistedPromptIndex>>(() => pending.promise);
    const first = loadThreadPromptIndex(threadId, owner, read, () => true);

    // The baseline's install retires the transcript coverage, not the host's outline.
    newStore().getState().clearThreadRuntimeEvents(threadId, options);

    const joined = loadThreadPromptIndex(threadId, owner, read, () => true);
    expect(joined).toBe(first);
    pending.resolve(index(3));
    expect(await first).toEqual(index(3));
    expect(read).toHaveBeenCalledOnce();
    expect(cachedThreadPromptIndex(threadId, owner)).toEqual(index(3));
    expect(threadPromptIndexNeedsRefresh(threadId, owner)).toBe(false);
  });

  it.each([
    ["an explicit forget", (threadId: string) => forgetThreadPromptIndex(threadId)],
    [
      "a hard reset",
      (threadId: string) => newStore().getState().clearThreadRuntimeEvents(threadId),
    ],
    ["an eviction", (threadId: string) => newStore().getState().evictThreadRuntimeItems(threadId)],
  ])("is still discarded by %s", async (_name, retire) => {
    const threadId = `first-read-hard-${_name}`;
    const owner = {};
    const pending = Promise.withResolvers<PersistedPromptIndex>();
    const first = loadThreadPromptIndex(
      threadId,
      owner,
      () => pending.promise,
      () => true,
    );
    retire(threadId);
    pending.resolve(index(3));
    expect(await first).toBeNull();
    expect(cachedThreadPromptIndex(threadId, owner)).toBeUndefined();
  });

  it("is discarded when the connection owner changes while it is pending", async () => {
    const threadId = "first-read-owner";
    const owner = {};
    let current = owner;
    const pending = Promise.withResolvers<PersistedPromptIndex>();
    const first = loadThreadPromptIndex(
      threadId,
      owner,
      () => pending.promise,
      () => current === owner,
    );
    newStore().getState().clearThreadRuntimeEvents(threadId, { keepPromptIndex: true });
    current = {};
    pending.resolve(index(3));
    expect(await first).toBeNull();
    expect(cachedThreadPromptIndex(threadId, owner)).toBeUndefined();
    expect(cachedThreadPromptIndex(threadId, current)).toBeUndefined();
  });
});

describe("a mounted pane over a navigation-prefetched first read", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    mountedRead.owner = "host";
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the completed outline without a retry after the baseline soft-invalidates", async () => {
    const threadId = "mounted-first-read";
    const { readThreadPromptIndex } = await import("@/renderer/state/threadPromptIndex");
    const pending = Promise.withResolvers<PersistedPromptIndex>();
    const read = vi.fn<() => Promise<PersistedPromptIndex>>(() => pending.promise);
    mountedRead.read = read;

    // Navigation starts the read before the pane mounts.
    void readThreadPromptIndex(threadId);
    const { result } = renderHook(() => useThreadPromptIndex(threadId, true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current).toBeUndefined();

    // The first history baseline lands while the outline is still being read.
    create<RuntimeEventSlice>()((set, get, api) =>
      createRuntimeEventSlice(set as never, get as never, api as never),
    )
      .getState()
      .clearThreadRuntimeEvents(threadId, { keepPromptIndex: true });

    await act(async () => {
      pending.resolve(index(600));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current).toEqual(index(600));
    // No retry was needed or scheduled.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(read).toHaveBeenCalledOnce();
    expect(result.current).toEqual(index(600));
  });
});
