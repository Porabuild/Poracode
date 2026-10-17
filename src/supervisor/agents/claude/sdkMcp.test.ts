import { describe, expect, it, vi } from "vitest";
import type {
  McpSetServersResult,
  Query,
  ResolvedSettings,
  resolveSettings,
} from "@anthropic-ai/claude-agent-sdk";
import type { ResolvedMcpServer, ThreadConfig } from "@/shared/contracts";
import { canDeferClaudeMcpConnections, ClaudeSdkMcpServers } from "./sdkMcp";
import { buildClaudeMcpServers } from "../userMcp";

const chrome: ResolvedMcpServer = {
  id: "chrome",
  name: "chrome",
  timeoutMs: 30_000,
  transport: { type: "http", url: "http://127.0.0.1:12345/mcp", headers: {} },
};

describe("Claude initial MCP connection policy", () => {
  const location = { kind: "posix", path: "/fixture" } as const;
  const settings = (effective: ResolvedSettings["effective"] = {}) =>
    vi.fn<typeof resolveSettings>().mockResolvedValue({ effective, provenance: {}, sources: [] });

  it("uses the SDK's effective settings before enabling late discovery", async () => {
    const read = settings();
    expect(await canDeferClaudeMcpConnections(location, "haiku", {}, read)).toBe(true);
    expect(read).toHaveBeenCalledExactlyOnceWith({
      cwd: "/fixture",
      settingSources: ["user", "project", "local"],
    });
  });

  it.each([
    { ENABLE_TOOL_SEARCH: "false" },
    { ANTHROPIC_BASE_URL: "https://example.test" },
    { ANTHROPIC_MODEL: "custom" },
    { ANTHROPIC_DEFAULT_HAIKU_MODEL: "custom" },
    { CLAUDE_CODE_USE_BEDROCK: "1" },
    { CLAUDE_CODE_USE_VERTEX: "1" },
    { CLAUDE_CODE_USE_FOUNDRY: "1" },
  ])("preserves initial tools for environment overrides %j", async (env) => {
    expect(await canDeferClaudeMcpConnections(location, "haiku", env, settings())).toBe(false);
    expect(await canDeferClaudeMcpConnections(location, "haiku", {}, settings({ env }))).toBe(
      false,
    );
  });

  it("preserves initial tools for custom models, profiles, and unreadable settings", async () => {
    expect(await canDeferClaudeMcpConnections(location, "custom", {}, settings())).toBe(false);
    expect(
      await canDeferClaudeMcpConnections(
        location,
        "haiku",
        { CLAUDE_CONFIG_DIR: "/profile" },
        settings(),
      ),
    ).toBe(false);
    const failed = vi.fn<typeof resolveSettings>().mockRejectedValue(new Error("cannot read"));
    expect(await canDeferClaudeMcpConnections(location, "haiku", {}, failed)).toBe(false);
  });

  it("does not assume host settings describe WSL", async () => {
    const read = settings();
    expect(
      await canDeferClaudeMcpConnections(
        {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/fixture",
          uncPath: "\\\\wsl$\\Ubuntu\\fixture",
        },
        "haiku",
        {},
        read,
      ),
    ).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });

  it.each(["ToolSearch", "ToolSearch(*)", "*"])(
    "preserves initial tools when discovery needs permission: %s",
    async (rule) => {
      expect(
        await canDeferClaudeMcpConnections(
          location,
          "haiku",
          {},
          settings({ permissions: { deny: [rule] } }),
        ),
      ).toBe(false);
    },
  );
});

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
  it("connects initial servers once after readiness without blocking unchanged turns", async () => {
    const h = createQuery();
    const connected = Promise.withResolvers<McpSetServersResult>();
    h.setMcpServers.mockReturnValueOnce(connected.promise);
    const servers = new ClaudeSdkMcpServers(async () => [chrome]);
    servers.deferUntilReady(h.query, buildClaudeMcpServers([chrome]));
    await servers.sync(h.query, { model: "sonnet" }, () => true);
    expect(h.setMcpServers).not.toHaveBeenCalled();
    const initial = servers.connectDeferred(h.query, () => true);
    await servers.connectDeferred(h.query, () => true);
    await servers.sync(h.query, { model: "sonnet" }, () => true);
    expect(h.setMcpServers).toHaveBeenCalledOnce();
    connected.resolve({ added: ["chrome"], removed: [], errors: {} });
    await initial;
  });

  it("applies a disable after initial setup finishes instead of restoring disabled servers", async () => {
    const h = createQuery();
    const connected = Promise.withResolvers<McpSetServersResult>();
    h.setMcpServers.mockReturnValueOnce(connected.promise);
    const resolve = vi.fn<() => Promise<readonly ResolvedMcpServer[]>>().mockResolvedValue([]);
    const servers = new ClaudeSdkMcpServers(resolve);
    servers.deferUntilReady(h.query, buildClaudeMcpServers([chrome]));
    const initial = servers.connectDeferred(h.query, () => true);
    const disabled = servers.sync(h.query, { model: "sonnet" }, () => true);
    await vi.waitFor(() => expect(resolve).toHaveBeenCalledOnce());
    expect(h.setMcpServers).toHaveBeenCalledOnce();
    connected.resolve({ added: ["chrome"], removed: [], errors: {} });
    await Promise.all([initial, disabled]);
    expect(h.setMcpServers.mock.calls.map(([set]) => Object.keys(set))).toEqual([["chrome"], []]);
  });

  it("cancels a deferred set when it changes before readiness", async () => {
    const h = createQuery();
    const servers = new ClaudeSdkMcpServers(async () => []);
    servers.deferUntilReady(h.query, buildClaudeMcpServers([chrome]));
    await servers.sync(h.query, { model: "sonnet" }, () => true);
    await servers.connectDeferred(h.query, () => true);
    expect(h.setMcpServers).toHaveBeenCalledExactlyOnceWith({});
  });

  it("does not apply a changed set after Stop during initial connection", async () => {
    const h = createQuery();
    const connected = Promise.withResolvers<McpSetServersResult>();
    h.setMcpServers.mockReturnValueOnce(connected.promise);
    const resolve = vi.fn<() => Promise<readonly ResolvedMcpServer[]>>().mockResolvedValue([]);
    const servers = new ClaudeSdkMcpServers(resolve);
    servers.deferUntilReady(h.query, buildClaudeMcpServers([chrome]));
    const initial = servers.connectDeferred(h.query, () => true);
    let current = true;
    const disabled = servers.sync(h.query, { model: "sonnet" }, () => current);
    await vi.waitFor(() => expect(resolve).toHaveBeenCalledOnce());
    current = false;
    connected.resolve({ added: ["chrome"], removed: [], errors: {} });
    await Promise.all([initial, disabled]);
    expect(h.setMcpServers).toHaveBeenCalledOnce();
    current = true;
    await servers.sync(h.query, { model: "sonnet" }, () => current);
    expect(h.setMcpServers).toHaveBeenLastCalledWith({});
  });

  it.each(["rejected", "failed server"])(
    "retries %s setup in the background on an unchanged turn",
    async (failure) => {
      const h = createQuery();
      if (failure === "rejected")
        h.setMcpServers.mockRejectedValueOnce(new Error("connection closed"));
      else
        h.setMcpServers.mockResolvedValueOnce({
          added: [],
          removed: [],
          errors: { chrome: "offline" },
        });
      const connected = Promise.withResolvers<McpSetServersResult>();
      h.setMcpServers.mockReturnValueOnce(connected.promise);
      const resolve = vi
        .fn<() => Promise<readonly ResolvedMcpServer[]>>()
        .mockResolvedValue([chrome]);
      const servers = new ClaudeSdkMcpServers(resolve);
      servers.deferUntilReady(h.query, buildClaudeMcpServers([chrome]));
      await servers.connectDeferred(h.query, () => true);
      await servers.sync(h.query, { model: "sonnet" }, () => true);
      await servers.sync(h.query, { model: "sonnet" }, () => true);
      expect(h.setMcpServers).toHaveBeenCalledTimes(2);
      connected.resolve({ added: [], removed: [], errors: {} });
      await vi.waitFor(() => expect(h.reconnectMcpServer).toHaveBeenCalledOnce());
      await servers.sync(h.query, { model: "sonnet" }, () => true);
      expect(h.reconnectMcpServer).toHaveBeenCalledExactlyOnceWith("chrome");
      expect(h.setMcpServers).toHaveBeenCalledTimes(2);
    },
  );

  it("orders a disable after background recovery", async () => {
    const h = createQuery();
    h.setMcpServers.mockRejectedValueOnce(new Error("offline"));
    const connected = Promise.withResolvers<McpSetServersResult>();
    h.setMcpServers.mockReturnValueOnce(connected.promise);
    const resolve = vi
      .fn<() => Promise<readonly ResolvedMcpServer[]>>()
      .mockResolvedValue([chrome]);
    const servers = new ClaudeSdkMcpServers(resolve);
    servers.deferUntilReady(h.query, buildClaudeMcpServers([chrome]));
    await servers.connectDeferred(h.query, () => true);
    await servers.sync(h.query, { model: "sonnet" }, () => true);
    resolve.mockResolvedValue([]);
    const disabled = servers.sync(h.query, { model: "sonnet" }, () => true);
    await vi.waitFor(() => expect(resolve).toHaveBeenCalledTimes(2));
    expect(h.setMcpServers).toHaveBeenCalledTimes(2);
    connected.resolve({ added: [], removed: [], errors: {} });
    await disabled;
    expect(h.setMcpServers.mock.calls.map(([set]) => Object.keys(set))).toEqual([
      ["chrome"],
      ["chrome"],
      [],
    ]);
  });

  it("never connects deferred servers belonging to a retired query", async () => {
    const h = createQuery();
    const servers = new ClaudeSdkMcpServers(undefined);
    servers.deferUntilReady(h.query, buildClaudeMcpServers([chrome]));
    await servers.connectDeferred(h.query, () => false);
    expect(h.setMcpServers).not.toHaveBeenCalled();
  });

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
