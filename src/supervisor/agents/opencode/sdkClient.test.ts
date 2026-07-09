import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChildProcess } from "node:child_process";
import type { CommandSpec } from "../base";
import type { OpenCodeServerHandle } from "./sdkServer";

const mocks = vi.hoisted(() => ({
  buildOpenCodeServerCommand: vi.fn<() => CommandSpec>(),
  createOpencodeClient: vi.fn<() => unknown>(),
  resolveAgentBinaryPath: vi.fn<() => string>(),
  spawnOpenCodeServer: vi.fn<() => OpenCodeServerHandle>(),
  disposeSpawnedOpenCodeServerHandles: vi.fn<() => void>(),
}));

vi.mock("../binaryResolver", () => ({
  resolveAgentBinaryPath: mocks.resolveAgentBinaryPath,
}));

vi.mock("./argv", () => ({
  buildOpenCodeServerCommand: mocks.buildOpenCodeServerCommand,
}));

vi.mock("./sdkServer", () => ({
  spawnOpenCodeServer: mocks.spawnOpenCodeServer,
  disposeSpawnedOpenCodeServerHandles: mocks.disposeSpawnedOpenCodeServerHandles,
}));

vi.mock("@opencode-ai/sdk/v2/client", () => ({
  createOpencodeClient: mocks.createOpencodeClient,
}));

function makeHandle(baseUrl: string) {
  return {
    child: new EventEmitter() as ChildProcess,
    baseUrl: Promise.resolve(baseUrl),
    formatOutput: () => "",
    dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } satisfies OpenCodeServerHandle;
}

describe("acquireOpenCodeServer", () => {
  const oldBrowserMcpUrl = process.env.LIGHTCODE_BROWSER_MCP_URL;
  const oldBrowserMcpToken = process.env.LIGHTCODE_BROWSER_MCP_TOKEN;

  beforeEach(() => {
    mocks.buildOpenCodeServerCommand.mockReset().mockReturnValue({
      command: "opencode",
      args: ["serve"],
      cwd: "/repo",
      env: {},
    });
    mocks.createOpencodeClient.mockReset();
    mocks.resolveAgentBinaryPath.mockReset().mockReturnValue("opencode");
    mocks.spawnOpenCodeServer.mockReset();
    process.env.LIGHTCODE_BROWSER_MCP_URL = "http://127.0.0.1:9321";
    process.env.LIGHTCODE_BROWSER_MCP_TOKEN = "test-token";
  });

  afterEach(() => {
    if (oldBrowserMcpUrl === undefined) {
      delete process.env.LIGHTCODE_BROWSER_MCP_URL;
    } else {
      process.env.LIGHTCODE_BROWSER_MCP_URL = oldBrowserMcpUrl;
    }
    if (oldBrowserMcpToken === undefined) {
      delete process.env.LIGHTCODE_BROWSER_MCP_TOKEN;
    } else {
      process.env.LIGHTCODE_BROWSER_MCP_TOKEN = oldBrowserMcpToken;
    }
  });

  it("respawns once when Browser MCP sync hits a dead OpenCode server", async () => {
    const firstHandle = makeHandle("http://127.0.0.1:4096");
    const secondHandle = makeHandle("http://127.0.0.1:4097");
    const firstAdd = vi.fn<() => Promise<void>>().mockRejectedValue(new Error("fetch failed"));
    const secondAdd = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const secondConnect = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    mocks.spawnOpenCodeServer.mockReturnValueOnce(firstHandle).mockReturnValueOnce(secondHandle);
    mocks.createOpencodeClient
      .mockReturnValueOnce({
        mcp: {
          add: firstAdd,
          connect: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        },
      })
      .mockReturnValueOnce({
        mcp: {
          add: secondAdd,
          connect: secondConnect,
        },
      });

    const { acquireOpenCodeServer } = await import("./sdkClient");
    const acquired = await acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo" },
      browserMcpEnabled: true,
    });

    expect(mocks.spawnOpenCodeServer).toHaveBeenCalledTimes(2);
    expect(firstAdd).toHaveBeenCalledTimes(1);
    expect(firstHandle.dispose).toHaveBeenCalledTimes(1);
    expect(secondAdd).toHaveBeenCalledTimes(1);
    expect(secondConnect).toHaveBeenCalledTimes(1);
    expect(acquired.baseUrl).toBe("http://127.0.0.1:4097");

    await acquired.dispose();
    expect(secondHandle.dispose).toHaveBeenCalledTimes(1);
  });

  function makeSubagentClient() {
    return {
      mcp: {
        add: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        connect: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      },
    };
  }

  const subagentMcp = {
    url: "http://127.0.0.1:9400/mcp",
    token: "parent-thread-token",
    headers: { Authorization: "Bearer parent-thread-token" },
  };

  const chromeMcp = {
    url: "http://127.0.0.1:9401/mcp",
    token: "chrome-token",
    headers: { Authorization: "Bearer chrome-token" },
  };

  it("registers the external Chrome MCP on an opted-in server", async () => {
    const handle = makeHandle("http://127.0.0.1:4199");
    mocks.spawnOpenCodeServer.mockReturnValue(handle);
    const client = makeSubagentClient();
    mocks.createOpencodeClient.mockReturnValue(client);

    const { acquireOpenCodeServer } = await import("./sdkClient");
    const acquired = await acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo-chrome" },
      chromeMcpEnabled: true,
      chromeMcp,
    });

    expect(client.mcp.add).toHaveBeenCalledWith({
      directory: "/repo-chrome",
      name: "chrome",
      config: {
        type: "remote",
        url: chromeMcp.url,
        headers: chromeMcp.headers,
        enabled: true,
      },
    });
    expect(client.mcp.connect).toHaveBeenCalledWith({
      directory: "/repo-chrome",
      name: "chrome",
    });

    await acquired.dispose();
    expect(handle.dispose).toHaveBeenCalledTimes(1);
  });

  it("dedicates a per-thread server and registers the subagents MCP via mcp.add", async () => {
    const handle = makeHandle("http://127.0.0.1:4200");
    mocks.spawnOpenCodeServer.mockReturnValue(handle);
    const client = makeSubagentClient();
    mocks.createOpencodeClient.mockReturnValue(client);

    const { acquireOpenCodeServer } = await import("./sdkClient");
    const acquired = await acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo-dedicated" },
      subagentMcp,
      dedicatedKey: "thread-parent",
    });

    expect(client.mcp.add).toHaveBeenCalledTimes(1);
    expect(client.mcp.add).toHaveBeenCalledWith({
      directory: "/repo-dedicated",
      name: "subagents",
      config: {
        type: "remote",
        url: subagentMcp.url,
        headers: subagentMcp.headers,
        enabled: true,
      },
    });
    expect(client.mcp.connect).toHaveBeenCalledWith({
      directory: "/repo-dedicated",
      name: "subagents",
    });

    // Dedicated entry has a single tenant → disposes with the thread.
    await acquired.dispose();
    expect(handle.dispose).toHaveBeenCalledTimes(1);
  });

  it("keys the dedicated server distinctly from the shared per-project pool", async () => {
    const sharedHandle = makeHandle("http://127.0.0.1:4300");
    const dedicatedHandle = makeHandle("http://127.0.0.1:4301");
    mocks.spawnOpenCodeServer
      .mockReturnValueOnce(sharedHandle)
      .mockReturnValueOnce(dedicatedHandle);
    mocks.createOpencodeClient.mockReturnValueOnce({}).mockReturnValueOnce(makeSubagentClient());

    const { acquireOpenCodeServer } = await import("./sdkClient");
    const location = { kind: "posix", path: "/repo-split" } as const;

    // A plain (child / non-hosting) acquire joins the shared pool …
    const shared = await acquireOpenCodeServer({ projectLocation: location });
    // … while a hosting thread on the SAME project gets its own server.
    const dedicated = await acquireOpenCodeServer({
      projectLocation: location,
      subagentMcp,
      dedicatedKey: "thread-host",
    });

    expect(mocks.spawnOpenCodeServer).toHaveBeenCalledTimes(2);
    expect(shared.baseUrl).toBe("http://127.0.0.1:4300");
    expect(dedicated.baseUrl).toBe("http://127.0.0.1:4301");

    // Tearing down the dedicated server must not touch the shared one.
    await dedicated.dispose();
    expect(dedicatedHandle.dispose).toHaveBeenCalledTimes(1);
    expect(sharedHandle.dispose).not.toHaveBeenCalled();
    await shared.dispose();
    expect(sharedHandle.dispose).toHaveBeenCalledTimes(1);
  });

  it("shares one server for two child acquires that do not host the subagents MCP", async () => {
    const handle = makeHandle("http://127.0.0.1:4400");
    mocks.spawnOpenCodeServer.mockReturnValue(handle);
    mocks.createOpencodeClient.mockReturnValue({});

    const { acquireOpenCodeServer } = await import("./sdkClient");
    const location = { kind: "posix", path: "/repo-shared" } as const;

    const first = await acquireOpenCodeServer({ projectLocation: location });
    const second = await acquireOpenCodeServer({ projectLocation: location });

    expect(mocks.spawnOpenCodeServer).toHaveBeenCalledTimes(1);
    expect(first.baseUrl).toBe(second.baseUrl);

    await first.dispose();
    expect(handle.dispose).not.toHaveBeenCalled(); // second still holds a ref
    await second.dispose();
    expect(handle.dispose).toHaveBeenCalledTimes(1);
  });

  it("shutdownSpawnedOpenCodeServers clears pool bookkeeping and disposes tracked spawns only", async () => {
    const { acquireOpenCodeServer, shutdownSpawnedOpenCodeServers } = await import("./sdkClient");
    const handle = makeHandle("http://127.0.0.1:4096");
    mocks.spawnOpenCodeServer.mockReturnValue(handle);

    const acquired = await acquireOpenCodeServer({
      projectLocation: { kind: "windows", path: "C:\\repo" },
      browserMcpEnabled: false,
    });
    expect(acquired.baseUrl).toBe("http://127.0.0.1:4096");

    shutdownSpawnedOpenCodeServers();

    expect(mocks.disposeSpawnedOpenCodeServerHandles).toHaveBeenCalledTimes(1);
    expect(handle.dispose).not.toHaveBeenCalled();

    await expect(
      acquireOpenCodeServer({
        projectLocation: { kind: "windows", path: "C:\\repo" },
        browserMcpEnabled: false,
      }),
    ).resolves.toBeDefined();
    expect(mocks.spawnOpenCodeServer).toHaveBeenCalledTimes(2);
  });
});
