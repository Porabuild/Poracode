import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";

const mocks = vi.hoisted(() => ({
  servers: [] as { connectionId: string; desktopId: string; recentHistoryCacheId?: string }[],
  runtime: {} as Record<string, { status: string }>,
  scheduleServerRefresh: vi.fn<(desktopId: string) => void>(),
  managedOwner: vi.fn<(entity: { id: string }) => { threadId: string } | undefined>(),
}));

vi.mock("./remoteServersStore", () => ({
  useRemoteServersStore: {
    getState: () => ({
      scheduleServerRefresh: mocks.scheduleServerRefresh,
      runtime: mocks.runtime,
      servers: mocks.servers,
    }),
    subscribe: () => () => {},
  },
}));
vi.mock("./managedRootCatalog/rootCatalogCommands", () => ({
  managedRootOwner: mocks.managedOwner,
  managedRootOfflineError: () => new Error("offline"),
  isApplyingHostOriginatedManagedRootMutation: () => false,
  sendManagedRootThreadCommand: vi.fn<() => Promise<void>>(),
  sendManagedRootProjectCommand: vi.fn<() => Promise<void>>(),
}));

import { useAppStore } from "./appStore";
import { entityHost, hostHandle, isSameHost } from "./entityHost";
import { remoteProjectId, remoteThreadId } from "./remoteProjection";
import { bumpRemoteServerGeneration } from "./remoteServers/eventSocketRegistry";
import { pairedRecentHistoryAuthority } from "@/renderer/browser/recentHistoryCache";

const original = useAppStore.getState();

function thread(id: string, overrides: Partial<Thread> = {}): Thread {
  return {
    id,
    projectId: "project",
    title: id,
    agentKind: "claude",
    config: { model: "default" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: true,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const pairedRow = (hostId: string, overrides: Partial<Thread> = {}): Thread =>
  thread(remoteThreadId("pc", hostId), {
    remoteServerId: "pc",
    remoteId: hostId,
    ...overrides,
  });

beforeEach(() => {
  mocks.managedOwner.mockImplementation((entity) =>
    entity.id.startsWith("remote:") ? undefined : { threadId: entity.id },
  );
});

afterEach(() => {
  mocks.scheduleServerRefresh.mockReset();
  mocks.managedOwner.mockReset();
  useAppStore.setState(original, true);
});

describe("entityHost", () => {
  it("resolves the owning host of a projected row and of the desktop's own row", () => {
    const paired = entityHost(pairedRow("t1"))!;
    expect(paired).toMatchObject({ kind: "paired", connectionKey: "pc", hostId: "t1" });
    expect(paired.runsOnThisMachine).toBe(false);
    expect(paired.sharesClientWorkspaces).toBe(false);

    const managed = entityHost(thread("local-1"))!;
    expect(managed).toMatchObject({ kind: "managed", connectionKey: undefined, hostId: "local-1" });
    expect(managed.runsOnThisMachine).toBe(true);
    expect(managed.sharesClientWorkspaces).toBe(true);

    expect(entityHost(undefined)).toBeUndefined();
    expect(isSameHost(paired, entityHost(pairedRow("t2"))!)).toBe(true);
    expect(isSameHost(paired, managed)).toBe(false);
  });

  it("maps ids between the store's namespace and each host's own", () => {
    const paired = entityHost(pairedRow("t1"))!;
    expect(paired.hostThreadId(remoteThreadId("pc", "t9"))).toBe("t9");
    expect(paired.hostThreadId(remoteThreadId("other", "t9"))).toBeUndefined();
    expect(paired.hostThreadId("local-1")).toBeUndefined();
    expect(paired.projectThreadRow("t9")).toEqual({
      threadId: remoteThreadId("pc", "t9"),
      remoteServerId: "pc",
      remoteId: "t9",
    });
    useAppStore.setState({
      projects: [
        {
          id: remoteProjectId("pc", "p1"),
          name: "P",
          location: { kind: "posix", path: "/p" },
          createdAt: "2026-01-01T00:00:00Z",
          remoteServerId: "pc",
          remoteId: "p1",
        },
      ],
    });
    expect(paired.hostProjectId(remoteProjectId("pc", "p1"))).toBe("p1");

    const managed = entityHost(thread("local-1"))!;
    expect(managed.hostThreadId("local-2")).toBe("local-2");
    expect(managed.hostThreadId(remoteThreadId("pc", "t9"))).toBeUndefined();
    expect(managed.projectThreadRow("local-2")).toEqual({ threadId: "local-2" });
  });

  it("degrades a thread mention another host cannot resolve to its inline text", () => {
    const paired = entityHost(pairedRow("t1"))!;
    const segments = paired.toHostSegments([
      { kind: "thread", threadId: remoteThreadId("pc", "t2"), title: "Same host" },
      { kind: "thread", threadId: "local-9", title: "Other host" },
      { kind: "text", content: "plain" },
    ] as never);
    expect(segments[0]).toMatchObject({ kind: "thread", threadId: "t2" });
    expect(segments[1]).toMatchObject({ kind: "text" });
    expect(segments[2]).toEqual({ kind: "text", content: "plain" });
  });

  it("resolves a host with no row, by connection key or the desktop's own", () => {
    expect(hostHandle("pc")).toMatchObject({ kind: "paired", connectionKey: "pc", hostId: "" });
    expect(hostHandle(undefined)).toMatchObject({ kind: "managed" });
    mocks.managedOwner.mockReturnValue(undefined);
    expect(hostHandle(undefined)).toBeUndefined();
  });

  describe("recent history authority", () => {
    afterEach(() => {
      mocks.servers.length = 0;
      for (const key of Object.keys(mocks.runtime)) delete mocks.runtime[key];
    });

    it("is bound to a verified, connected, persisted connection", () => {
      expect(entityHost(pairedRow("t1"))!.recentHistoryKey).toBeUndefined();

      mocks.servers.push({ connectionId: "pc", desktopId: "host-desktop" });
      mocks.runtime.pc = { status: "online" };
      // A record not yet verified (no cache id) has no authority.
      expect(entityHost(pairedRow("t1"))!.recentHistoryKey).toBeUndefined();

      mocks.servers[0]!.recentHistoryCacheId = "pair-1";
      mocks.runtime.pc = { status: "connecting" };
      expect(entityHost(pairedRow("t1"))!.recentHistoryKey).toBeUndefined();

      mocks.runtime.pc = { status: "online" };
      const key = entityHost(pairedRow("t1"))!.recentHistoryKey;
      expect(key).toBe(pairedRecentHistoryAuthority("pc", "pair-1", "host-desktop"));
      // A fresh pairing's id selects a different authority.
      mocks.servers[0]!.recentHistoryCacheId = "pair-2";
      expect(entityHost(pairedRow("t1"))!.recentHistoryKey).not.toBe(key);
      mocks.servers[0]!.recentHistoryCacheId = "pair-1";
      expect(key?.startsWith("managed:")).toBe(false);
      // The same authorization reconnecting resolves the same authority.
      expect(entityHost(pairedRow("t2"))!.recentHistoryKey).toBe(key);
    });

    it("is withdrawn from a handle whose connection incarnation was replaced", () => {
      mocks.servers.push({
        connectionId: "pc",
        desktopId: "host-desktop",
        recentHistoryCacheId: "pair-1",
      });
      mocks.runtime.pc = { status: "online" };
      const host = entityHost(pairedRow("t1"))!;
      expect(host.recentHistoryKey).toBeDefined();
      bumpRemoteServerGeneration("pc");
      expect(host.recentHistoryKey).toBeUndefined();
      expect(entityHost(pairedRow("t1"))!.recentHistoryKey).toBeDefined();
    });
  });

  it("fences a handle to its connection incarnation", () => {
    const host = entityHost(pairedRow("t1"))!;
    expect(host.isCurrent()).toBe(true);
    const listener = vi.fn<() => void>();
    const stop = host.onReplaced(listener);
    stop();
    expect(listener).not.toHaveBeenCalled();
  });

  describe("adoptThreadRow on a paired host", () => {
    it("keeps the row's place in the order and the resident row's newer client state", () => {
      const first = pairedRow("a");
      const running = pairedRow("b", {
        status: "working",
        lastTurnStartedAt: "2026-01-01T00:00:00Z",
        activeTurnStartedAt: "2026-01-01T01:00:00Z",
      });
      const last = pairedRow("c");
      useAppStore.setState({ threads: [first, running, last] });

      // The host's read-back restates the same turn with a later start time.
      const adopted = entityHost(running)!.adoptThreadRow(
        thread("b", {
          status: "working",
          lastTurnStartedAt: "2026-01-01T00:00:00Z",
          activeTurnStartedAt: "2026-01-01T01:00:09Z",
        }),
      );

      const ids = useAppStore.getState().threads.map((row) => row.id);
      expect(ids).toEqual([first.id, running.id, last.id]);
      expect(adopted.activeTurnStartedAt).toBe("2026-01-01T01:00:00Z");
      expect(mocks.scheduleServerRefresh).toHaveBeenCalledWith("pc");
    });

    it("appends a thread the store did not have yet", () => {
      useAppStore.setState({ threads: [pairedRow("a")] });
      const adopted = entityHost(pairedRow("a"))!.adoptThreadRow(thread("z"));
      expect(adopted.id).toBe(remoteThreadId("pc", "z"));
      expect(useAppStore.getState().threads.map((row) => row.id)).toEqual([
        remoteThreadId("pc", "a"),
        remoteThreadId("pc", "z"),
      ]);
    });
  });
});
