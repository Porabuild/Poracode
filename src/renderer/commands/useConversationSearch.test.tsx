import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationSearchPage } from "@/shared/conversationSearch";
import type { RemoteServerRecord } from "@/renderer/state/remoteServers/types";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useConversationSearch } from "./useConversationSearch";

const mocks = vi.hoisted(() => ({
  local: vi.fn<() => Promise<ConversationSearchPage>>(),
  remote: vi.fn<() => Promise<ConversationSearchPage>>(),
  generation: 1,
}));
vi.mock("@/renderer/hostTransport/loopbackHttpWsTransport", () => {
  const activation = { seq: 1, client: { searchConversations: mocks.local } };
  return {
    readManagedLoopbackActivation: () => activation,
    subscribeManagedLoopbackActivation: () => () => {},
  };
});
vi.mock("@/renderer/state/remoteServers/eventSocketRegistry", () => ({
  currentRemoteServerGeneration: () => mocks.generation,
}));
vi.mock("@/renderer/state/remoteServersStore", async () => {
  const { create } = await import("zustand");
  return {
    useRemoteServersStore: create(() => ({
      servers: [],
      runtime: {},
      excludedProjectIds: {},
      withClient: (_key: string, read: (client: unknown) => unknown) =>
        read({ searchConversations: mocks.remote }),
    })),
  };
});
const server: RemoteServerRecord = {
  connectionId: "remote",
  desktopId: "host",
  label: "Other host",
  endpoint: "http://host",
  accessToken: "test-token",
  scopes: ["session:read"],
};
function page(id: string, nextCursor: string | null = null): ConversationSearchPage {
  return {
    version: 1,
    entries: [
      {
        threadId: "thread",
        itemId: id,
        projectId: "project",
        title: "Saved",
        projectName: "Project",
        archived: false,
        role: "user",
        excerpt: id,
      },
    ],
    nextCursor,
    indexing: false,
  };
}
function deferred() {
  let resolve!: (value: ConversationSearchPage) => void;
  const promise = new Promise<ConversationSearchPage>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const debounce = () => act(() => vi.advanceTimersByTimeAsync(150));
beforeEach(() => {
  vi.useFakeTimers();
  mocks.local.mockReset();
  mocks.remote.mockReset();
  mocks.generation = 1;
  useRemoteServersStore.setState({ servers: [], runtime: {}, excludedProjectIds: {} });
});
afterEach(() => vi.useRealTimers());

describe("saved message search sources", () => {
  it("debounces and discards obsolete queries and disabled results", async () => {
    const old = deferred();
    mocks.local.mockReturnValueOnce(old.promise).mockResolvedValueOnce(page("new"));
    const { result, rerender } = renderHook(
      ({ query, enabled }) => useConversationSearch(query, enabled),
      { initialProps: { query: "old", enabled: true } },
    );
    await debounce();
    rerender({ query: "new", enabled: true });
    expect(result.current.entries).toEqual([]);
    await debounce();
    await act(async () => old.resolve(page("old")));
    expect(result.current.entries.map((entry) => entry.itemId)).toEqual(["new"]);
    rerender({ query: "n", enabled: true });
    await debounce();
    expect(result.current.loading).toBe(false);
    expect(mocks.local).toHaveBeenCalledTimes(2);
    rerender({ query: "new", enabled: false });
    expect(result.current.entries).toEqual([]);
  });

  it("keeps each host's continuation attached to its source when another host fails", async () => {
    useRemoteServersStore.setState({
      servers: [server],
      runtime: { remote: { status: "online", projects: [], threads: [] } },
    });
    mocks.local
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(new Error("offline"));
    mocks.remote
      .mockResolvedValueOnce(page("remote-first", "next"))
      .mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useConversationSearch("needle", true));
    await debounce();
    expect(result.current.failed).toBe(true);
    expect(result.current.entries).toHaveLength(1);
    act(() => result.current.loadMore());
    await debounce();
    expect(result.current.entries.map((entry) => entry.itemId)).toEqual(["remote-first"]);
    expect(result.current.entries[0]?.source).toEqual({
      kind: "remote",
      connectionKey: "remote",
      generation: 1,
    });
    expect(mocks.remote).toHaveBeenLastCalledWith(
      { query: "needle", cursor: "next" },
      expect.anything(),
    );
  });

  it("invalidates old results after a same-endpoint re-pair and filters excluded projects", async () => {
    useRemoteServersStore.setState({
      servers: [server],
      runtime: { remote: { status: "online", projects: [], threads: [] } },
    });
    mocks.local.mockResolvedValue({ ...page("local"), entries: [] });
    mocks.remote.mockResolvedValue(page("old"));
    const { result } = renderHook(() => useConversationSearch("needle", true));
    await debounce();
    expect(result.current.entries[0]?.source).toMatchObject({ generation: 1 });
    const repaired = deferred();
    mocks.remote.mockReturnValueOnce(repaired.promise);
    mocks.generation = 2;
    await act(() =>
      useRemoteServersStore.setState({ servers: [{ ...server, accessToken: "new-test-token" }] }),
    );
    expect(result.current.entries).toEqual([]);
    await debounce();
    await act(async () => repaired.resolve(page("new")));
    expect(result.current.entries[0]?.source).toMatchObject({ generation: 2 });
    await act(() =>
      useRemoteServersStore.setState({ excludedProjectIds: { remote: ["project"] } }),
    );
    expect(result.current.entries).toEqual([]);
  });
});
