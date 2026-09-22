import { afterEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@/shared/contracts";
import {
  readCurrentServers,
  removeServerRow,
  sharedSettingsServerPersistence,
  updateServerRow,
} from "./mcpServersMutation";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";

const server: McpServer = {
  id: "memory-id",
  name: "memory",
  description: "Memory tools",
  enabled: true,
  timeoutMs: 30_000,
  transport: { type: "stdio", command: "npx", args: ["-y", "server-memory"], env: {} },
};

const teammate: McpServer = { ...server, id: "teammate-id", name: "teammate" };

function makeSink(options: {
  servers?: McpServer[];
  loadServers?: () => Promise<McpServer[]>;
  saveServers?: (servers: McpServer[]) => Promise<void>;
}) {
  return {
    servers: options.servers ?? [],
    ...(options.loadServers ? { loadServers: options.loadServers } : {}),
    saveServers: options.saveServers ?? (async () => undefined),
  };
}

describe("mcpServersMutation", () => {
  it("readCurrentServers prefers the fresh read over the captured list", async () => {
    const loadServers = vi.fn<() => Promise<McpServer[]>>(async () => [teammate]);
    const sink = makeSink({ servers: [server], loadServers });
    await expect(readCurrentServers(sink)).resolves.toEqual([teammate]);
    expect(loadServers).toHaveBeenCalledOnce();
  });

  it("updateServerRow applies the intent to the fresh list and preserves the rest", async () => {
    const saveServers = vi.fn<(servers: McpServer[]) => Promise<void>>(async () => undefined);
    // The fresh list carries the row's latest fields plus another client's
    // server; the captured display list has neither.
    const sink = makeSink({
      servers: [server],
      loadServers: async () => [{ ...server, timeoutMs: 99 }, teammate],
      saveServers,
    });
    await updateServerRow(sink, server.id, (item) => ({ ...item, enabled: false }));
    expect(saveServers).toHaveBeenCalledExactlyOnceWith([
      { ...server, timeoutMs: 99, enabled: false },
      teammate,
    ]);
  });

  it("updateServerRow writes nothing when the row is already gone", async () => {
    const saveServers = vi.fn<(servers: McpServer[]) => Promise<void>>(async () => undefined);
    const sink = makeSink({
      servers: [server],
      loadServers: async () => [teammate],
      saveServers,
    });
    await updateServerRow(sink, server.id, (item) => ({ ...item, enabled: false }));
    expect(saveServers).not.toHaveBeenCalled();
  });

  it("updateServerRow propagates a saveServers refusal", async () => {
    const saveServers = vi.fn<(servers: McpServer[]) => Promise<void>>(async () => {
      throw new Error("refused");
    });
    const sink = makeSink({ servers: [server], loadServers: async () => [server], saveServers });
    await expect(
      updateServerRow(sink, server.id, (item) => ({ ...item, enabled: false })),
    ).rejects.toThrow("refused");
    expect(saveServers).toHaveBeenCalledExactlyOnceWith([{ ...server, enabled: false }]);
  });

  it("removeServerRow removes only the targeted id from the fresh list", async () => {
    const saveServers = vi.fn<(servers: McpServer[]) => Promise<void>>(async () => undefined);
    const sink = makeSink({
      servers: [server],
      loadServers: async () => [teammate, server],
      saveServers,
    });
    await removeServerRow(sink, server.id);
    expect(saveServers).toHaveBeenCalledExactlyOnceWith([teammate]);
  });

  it("removeServerRow writes nothing when the row is already gone", async () => {
    const saveServers = vi.fn<(servers: McpServer[]) => Promise<void>>(async () => undefined);
    const sink = makeSink({ servers: [server], loadServers: async () => [], saveServers });
    await removeServerRow(sink, server.id);
    expect(saveServers).not.toHaveBeenCalled();
  });
});

describe("sharedSettingsServerPersistence", () => {
  afterEach(() => {
    useSharedSettings.setState({ mcpServers: [], sharedSettingsHydrated: true });
  });

  it("loadServers waits for hydration and returns the live store list", async () => {
    useSharedSettings.setState({ sharedSettingsHydrated: false, mcpServers: [] });
    const pending = sharedSettingsServerPersistence().loadServers();
    const states: string[] = [];
    void pending.then(() => states.push("resolved"));
    // Two microtask turns: a read that ignored hydration would have resolved
    // to the empty default list by now.
    await Promise.resolve();
    await Promise.resolve();
    expect(states).toEqual([]);
    useSharedSettings.setState({ mcpServers: [server], sharedSettingsHydrated: true });
    await pending;
    expect(states).toEqual(["resolved"]);
  });

  it("saveServers waits for hydration before committing to the store", async () => {
    useSharedSettings.setState({ sharedSettingsHydrated: false, mcpServers: [] });
    const pending = sharedSettingsServerPersistence().saveServers([server]);
    const states: string[] = [];
    void pending.then(() => states.push("resolved"));
    await Promise.resolve();
    await Promise.resolve();
    // Unhydrated: neither a commit nor a confirmation — an unhydrated flush
    // would skip the bridge write, so this save could not be credited.
    expect(states).toEqual([]);
    expect(useSharedSettings.getState().mcpServers).toEqual([]);
    useSharedSettings.setState({ sharedSettingsHydrated: true });
    await pending;
    expect(states).toEqual(["resolved"]);
    expect(useSharedSettings.getState().mcpServers).toEqual([server]);
  });

  it("saveServers commits the store list once hydrated", async () => {
    await sharedSettingsServerPersistence().saveServers([teammate]);
    expect(useSharedSettings.getState().mcpServers).toEqual([teammate]);
  });
});
