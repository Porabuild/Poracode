import { describe, expect, it, vi } from "vitest";
import type { McpSetServersResult, Query } from "@anthropic-ai/claude-agent-sdk";
import type { ResolvedMcpServer, ThreadConfig } from "@/shared/contracts";
import { ClaudeSdkMcpServers } from "./sdkMcp";
import { buildClaudeMcpServers } from "../userMcp";

const chrome: ResolvedMcpServer = {
  id: "chrome",
  name: "chrome",
  timeoutMs: 30_000,
  transport: { type: "http", url: "http://127.0.0.1:12345/mcp", headers: {} },
};

function createQuery() {
  const setMcpServers = vi.fn<Query["setMcpServers"]>().mockResolvedValue({
    added: [],
    removed: [],
    errors: {},
  });
  const reconnectMcpServer = vi.fn<Query["reconnectMcpServer"]>().mockResolvedValue(undefined);
  return {
    query: { setMcpServers, reconnectMcpServer } as unknown as Query,
    setMcpServers,
    reconnectMcpServer,
  };
}

describe("Claude SDK live MCP updates", () => {
  it("retains an unreconnected failure when Stop cancels a retry on the surviving query", async () => {
    const h = createQuery();
    const servers = new ClaudeSdkMcpServers(async () => [chrome]);
    servers.initialize(h.query, {});
    h.setMcpServers.mockResolvedValueOnce({
      added: [],
      removed: [],
      errors: { chrome: "connection refused" },
    });
    await expect(servers.sync(h.query, { model: "sonnet" }, () => true)).rejects.toThrow(
      "Could not connect MCP servers: chrome",
    );
    const set = Promise.withResolvers<McpSetServersResult>();
    h.setMcpServers.mockReturnValueOnce(set.promise);
    let current = true;
    const retry = servers.sync(h.query, { model: "sonnet" }, () => current);
    await vi.waitFor(() => expect(h.setMcpServers).toHaveBeenCalledTimes(2));
    current = false;
    set.resolve({ added: [], removed: [], errors: {} });
    await retry;
    expect(h.reconnectMcpServer).not.toHaveBeenCalled();
    current = true;
    await servers.sync(h.query, { model: "sonnet" }, () => current);
    expect(h.reconnectMcpServer).toHaveBeenCalledExactlyOnceWith("chrome");
  });

  it("restores the previous set after a partially failed native replacement", async () => {
    const unavailable = { ...chrome, id: "unavailable", name: "unavailable" };
    const resolve = vi
      .fn<(config: ThreadConfig) => Promise<readonly ResolvedMcpServer[]>>()
      .mockResolvedValueOnce([unavailable])
      .mockResolvedValueOnce([chrome]);
    const h = createQuery();
    const servers = new ClaudeSdkMcpServers(resolve);
    servers.initialize(h.query, buildClaudeMcpServers([chrome]));
    h.setMcpServers.mockResolvedValueOnce({
      added: [],
      removed: ["chrome"],
      errors: { unavailable: "connection refused" },
    });
    await expect(servers.sync(h.query, { model: "sonnet" }, () => true)).rejects.toThrow(
      "Could not connect MCP servers: unavailable",
    );
    await servers.sync(h.query, { model: "sonnet" }, () => true);
    expect(h.setMcpServers.mock.calls.map(([set]) => Object.keys(set))).toEqual([
      ["unavailable"],
      ["chrome"],
    ]);
  });

  it("orders an enable followed by a disable even when resolution is delayed", async () => {
    const resolved = Promise.withResolvers<readonly ResolvedMcpServer[]>();
    const resolve = vi
      .fn<(config: ThreadConfig) => Promise<readonly ResolvedMcpServer[]>>()
      .mockReturnValueOnce(resolved.promise)
      .mockResolvedValueOnce([]);
    const h = createQuery();
    const servers = new ClaudeSdkMcpServers(resolve);
    servers.initialize(h.query, {});
    const enable = servers.sync(h.query, { model: "sonnet", chromeMcp: true }, () => true);
    const disable = servers.sync(h.query, { model: "sonnet", chromeMcp: false }, () => true);
    await vi.waitFor(() => expect(resolve).toHaveBeenCalledOnce());
    expect(h.setMcpServers).not.toHaveBeenCalled();
    resolved.resolve([chrome]);
    await Promise.all([enable, disable]);
    expect(h.setMcpServers.mock.calls.map(([set]) => Object.keys(set))).toEqual([["chrome"], []]);
  });

  it("does not update a retired query after resolving its servers", async () => {
    const resolved = Promise.withResolvers<readonly ResolvedMcpServer[]>();
    const resolve = vi
      .fn<(config: ThreadConfig) => Promise<readonly ResolvedMcpServer[]>>()
      .mockReturnValue(resolved.promise);
    const h = createQuery();
    const servers = new ClaudeSdkMcpServers(resolve);
    servers.initialize(h.query, {});
    let current = true;
    const update = servers.sync(h.query, { model: "sonnet" }, () => current);
    await vi.waitFor(() => expect(resolve).toHaveBeenCalledOnce());
    current = false;
    resolved.resolve([chrome]);
    await update;
    expect(h.setMcpServers).not.toHaveBeenCalled();

    const replacement = createQuery();
    servers.initialize(replacement.query, {});
    await servers.sync(replacement.query, { model: "sonnet" }, () => true);
    expect(replacement.setMcpServers).toHaveBeenCalledOnce();
  });
});
