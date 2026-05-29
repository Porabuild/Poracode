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
