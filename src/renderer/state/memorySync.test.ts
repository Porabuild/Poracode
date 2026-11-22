import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemorySyncResponse, MemorySyncState } from "@/shared/memory";
import { defaultMemorySettings } from "@/shared/memory";
import { useSharedSettings } from "./sharedSettingsStore";
import { useRemoteServersStore } from "./remoteServersStore";
import {
  syncMemoryAcrossEnvironments,
  syncMemoryAcrossEnvironmentsDetailed,
  useMemoryOperationsStore,
} from "./memorySync";

const bridgeMock = vi.hoisted(() => ({
  memoryCommand: vi.fn<(payload: unknown) => Promise<unknown>>(),
  isRemoteSession: vi.fn<() => boolean>(() => false),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ memoryCommand: bridgeMock.memoryCommand }),
  isRemoteSession: bridgeMock.isRemoteSession,
  hasClientCapability: () => true,
  isDevApp: () => false,
}));

const localState: MemorySyncState = {
  entries: [
    {
      id: "local-1",
      scope: "global",
      projectId: null,
      repoKey: null,
      category: "user",
      summary: "Use bun",
      body: "Use bun",
      confidence: 1,
      polarity: "positive",
      quote: null,
      lockedByUser: true,
      pinned: false,
      archived: false,
      usageCount: 0,
      lastUsedAt: null,
      createdAt: "2026-11-17T00:00:00.000Z",
      updatedAt: "2026-11-17T00:00:00.000Z",
      source: "user",
    },
  ],
  tombstones: [],
};

describe("syncMemoryAcrossEnvironments", () => {
  beforeEach(() => {
    bridgeMock.isRemoteSession.mockReturnValue(false);
    bridgeMock.memoryCommand.mockReset();
    useSharedSettings.setState({
      memory: { ...defaultMemorySettings, enabled: true, syncEnabled: true },
    });
  });

  it("skips sync when memory or syncEnabled is off", async () => {
    useSharedSettings.setState({
      memory: { ...defaultMemorySettings, enabled: false, syncEnabled: true },
    });
    expect(await syncMemoryAcrossEnvironments()).toEqual({ syncedHosts: 0, changed: false });
    expect(bridgeMock.memoryCommand).not.toHaveBeenCalled();

    useSharedSettings.setState({
      memory: { ...defaultMemorySettings, enabled: true, syncEnabled: false },
    });
    expect(await syncMemoryAcrossEnvironments()).toEqual({ syncedHosts: 0, changed: false });
    expect(bridgeMock.memoryCommand).not.toHaveBeenCalled();
  });

  it("exchanges states with online paired servers and skips offline ones", async () => {
    const peerSync = vi.fn<(state: MemorySyncState) => Promise<MemorySyncResponse>>(async () => ({
      synced: true,
      state: {
        entries: [
          ...localState.entries,
          {
            ...localState.entries[0]!,
            id: "peer-1",
            summary: "Keep diffs small",
            body: "Keep diffs small",
          },
        ],
        tombstones: [],
      },
    }));

    useRemoteServersStore.setState({
      servers: [
        {
          connectionId: "online-peer",
          desktopId: "online-peer",
          label: "Linux SSH",
          endpoint: "http://127.0.0.1:49152",
          scopes: ["session:operate"],
          pairedAt: "2026-11-17T00:00:00.000Z",
          transport: { kind: "direct", endpoint: "http://127.0.0.1:49152" },
        },
        {
          connectionId: "offline-peer",
          desktopId: "offline-peer",
          label: "Offline Mac",
          endpoint: "http://127.0.0.1:49153",
          scopes: ["session:operate"],
          pairedAt: "2026-11-17T00:00:00.000Z",
          transport: { kind: "direct", endpoint: "http://127.0.0.1:49153" },
        },
      ] as never,
      runtime: {
        "online-peer": { status: "online" },
        "offline-peer": { status: "offline" },
      } as never,
      withClient: vi.fn<
        (_id: string, invoke: (client: unknown) => Promise<unknown>) => Promise<unknown>
      >(async (_id, invoke) => invoke({ memorySync: peerSync })) as never,
    });

    bridgeMock.memoryCommand.mockImplementation(async (payload) => {
      const cmd = payload as { action: string; state?: MemorySyncState };
      if (cmd.action === "sync-export") return localState;
      if (cmd.action === "sync-merge") {
        return { synced: true, changed: true, state: cmd.state ?? localState };
      }
      return {};
    });

    const result = await syncMemoryAcrossEnvironments();
    expect(result).toEqual({ syncedHosts: 1, changed: true });
    expect(peerSync).toHaveBeenCalledTimes(1);
    expect(bridgeMock.memoryCommand).toHaveBeenCalledWith(
      expect.objectContaining({ action: "sync-export" }),
    );
    expect(bridgeMock.memoryCommand).toHaveBeenCalledWith(
      expect.objectContaining({ action: "sync-merge" }),
    );

    peerSync.mockRejectedValueOnce(new Error("Peer disconnected"));
    const background = syncMemoryAcrossEnvironments();
    await expect(syncMemoryAcrossEnvironments({ force: true })).rejects.toThrow(
      "Peer disconnected",
    );
    await expect(background).resolves.toEqual({ syncedHosts: 0, changed: false });
    expect(peerSync).toHaveBeenCalledTimes(2);
  });

  it("reports skipped peers and live sync progress via useMemoryOperationsStore", async () => {
    let observedProgress: unknown = null;
    const peerSync = vi.fn<(state: MemorySyncState) => Promise<MemorySyncResponse>>(async () => {
      observedProgress = useMemoryOperationsStore.getState().syncProgress;
      return { synced: false, state: { entries: [], tombstones: [] } };
    });

    useRemoteServersStore.setState({
      servers: [
        {
          connectionId: "mac-peer",
          desktopId: "mac-peer",
          label: "Mac Studio",
          endpoint: "http://127.0.0.1:49154",
          scopes: ["session:operate"],
          pairedAt: "2026-11-17T00:00:00.000Z",
          transport: { kind: "direct", endpoint: "http://127.0.0.1:49154" },
        },
      ] as never,
      runtime: {
        "mac-peer": { status: "online" },
      } as never,
      withClient: vi.fn<
        (_id: string, invoke: (client: unknown) => Promise<unknown>) => Promise<unknown>
      >(async (_id, invoke) => invoke({ memorySync: peerSync })) as never,
    });

    bridgeMock.memoryCommand.mockResolvedValue(localState);

    const details = await syncMemoryAcrossEnvironmentsDetailed({ force: true });
    expect(observedProgress).toEqual({
      phase: "syncing",
      current: 1,
      total: 1,
      hostLabel: "Mac Studio",
    });
    expect(useMemoryOperationsStore.getState().syncing).toBe(false);
    expect(useMemoryOperationsStore.getState().syncProgress).toBeNull();
    expect(details).toEqual({
      syncedHosts: 0,
      changed: false,
      onlineHosts: 1,
      skippedDisabledHosts: ["Mac Studio"],
      failedHosts: [],
    });
  });
});
