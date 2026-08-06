import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChildProcess } from "node:child_process";
import type { ProjectLocation } from "@/shared/contracts";
import type { CommandSpec } from "../base";
import type { OpenCodeServerHandle } from "./sdkServer";

const mocks = vi.hoisted(() => ({
  buildOpenCodeServerCommand:
    vi.fn<
      (
        location: ProjectLocation,
        resolvedExecPath?: string,
        env?: Record<string, string>,
      ) => CommandSpec
    >(),
  createOpencodeClient: vi.fn<() => unknown>(),
  resolveAgentBinaryPath: vi.fn<() => string>(),
  resolveWslHomeDirectoryAsync: vi.fn<() => Promise<string>>(),
  installOpenCodePlugin: vi.fn<() => { ok: true; version: string }>(),
  spawnOpenCodeServer: vi.fn<() => OpenCodeServerHandle>(),
  disposeSpawnedOpenCodeServerHandles: vi.fn<() => void>(),
}));

vi.mock("../base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../base")>()),
  resolveWslHomeDirectoryAsync: mocks.resolveWslHomeDirectoryAsync,
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

vi.mock("./plugin/install", () => ({
  installOpenCodePlugin: mocks.installOpenCodePlugin,
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

function remoteMcp(
  name: string,
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 30_000,
) {
  return { id: name, name, timeoutMs, transport: { type: "http" as const, url, headers } };
}

describe("acquireOpenCodeServer", () => {
  const oldBrowserMcpUrl = process.env.PORACODE_BROWSER_MCP_URL;
  const oldBrowserMcpToken = process.env.PORACODE_BROWSER_MCP_TOKEN;

  beforeEach(() => {
    mocks.buildOpenCodeServerCommand.mockReset().mockReturnValue({
      command: "opencode",
      args: ["serve"],
      cwd: "/repo",
      env: {},
    });
    mocks.createOpencodeClient.mockReset().mockImplementation(() => makeSubagentClient());
    mocks.resolveAgentBinaryPath.mockReset().mockReturnValue("opencode");
    mocks.resolveWslHomeDirectoryAsync.mockReset().mockResolvedValue("/home/test");
    mocks.installOpenCodePlugin.mockReset().mockReturnValue({ ok: true, version: "1.0.0" });
    mocks.spawnOpenCodeServer.mockReset();
    mocks.disposeSpawnedOpenCodeServerHandles.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    process.env.PORACODE_BROWSER_MCP_URL = "http://127.0.0.1:9321";
    process.env.PORACODE_BROWSER_MCP_TOKEN = "test-token";
  });

  it("installs the routing plugin before starting the shared native server", async () => {
    const handle = makeHandle("http://127.0.0.1:4096");
    mocks.spawnOpenCodeServer.mockReturnValue(handle);

    const { acquireOpenCodeServer } = await import("./sdkClient");
    await acquireOpenCodeServer({
      projectLocation: { kind: "windows", path: "C:\\repo" },
    });

    expect(mocks.installOpenCodePlugin).toHaveBeenCalledWith(
      expect.objectContaining({ envKind: "windows" }),
    );
    expect(mocks.installOpenCodePlugin.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.spawnOpenCodeServer.mock.invocationCallOrder[0]!,
    );
  });

  it("does not leak a rejected server startup as an unhandled rejection", async () => {
    const handle = {
      ...makeHandle("http://127.0.0.1:4096"),
      baseUrl: Promise.reject(new Error("database is locked")),
    };
    mocks.spawnOpenCodeServer.mockReturnValue(handle);

    const { acquireOpenCodeServer } = await import("./sdkClient");
    await expect(
      acquireOpenCodeServer({
        projectLocation: { kind: "windows", path: "C:\\repo" },
      }),
    ).rejects.toThrow("database is locked");
    await new Promise((resolve) => setImmediate(resolve));

    expect(handle.dispose).toHaveBeenCalledOnce();
  });

  afterEach(async () => {
    const { shutdownSpawnedOpenCodeServers } = await import("./sdkClient");
    shutdownSpawnedOpenCodeServers();
    vi.unstubAllGlobals();
    if (oldBrowserMcpUrl === undefined) {
      delete process.env.PORACODE_BROWSER_MCP_URL;
    } else {
      process.env.PORACODE_BROWSER_MCP_URL = oldBrowserMcpUrl;
    }
    if (oldBrowserMcpToken === undefined) {
      delete process.env.PORACODE_BROWSER_MCP_TOKEN;
    } else {
      process.env.PORACODE_BROWSER_MCP_TOKEN = oldBrowserMcpToken;
    }
  });

  it("respawns once when Browser MCP sync hits a dead OpenCode server", async () => {
    const firstHandle = makeHandle("http://127.0.0.1:4096");
    const secondHandle = makeHandle("http://127.0.0.1:4097");
    const firstAdd = vi.fn<() => Promise<void>>().mockRejectedValue(new Error("fetch failed"));
    const secondAdd = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    mocks.spawnOpenCodeServer.mockReturnValueOnce(firstHandle).mockReturnValueOnce(secondHandle);
    mocks.createOpencodeClient
      .mockReturnValueOnce({})
      .mockReturnValueOnce({
        mcp: {
          add: firstAdd,
          connect: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        },
      })
      .mockReturnValueOnce({})
      .mockReturnValueOnce({
        mcp: {
          add: secondAdd,
        },
      });

    const { acquireOpenCodeServer } = await import("./sdkClient");
    const acquired = await acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo" },
      mcpServers: [
        remoteMcp("browser", "http://127.0.0.1:9321/mcp", {
          Authorization: "Bearer test-token",
        }),
      ],
    });

    expect(mocks.spawnOpenCodeServer).toHaveBeenCalledTimes(2);
    expect(firstAdd).toHaveBeenCalledTimes(1);
    expect(firstHandle.dispose).toHaveBeenCalledTimes(1);
    expect(secondAdd).toHaveBeenCalledTimes(1);
    expect(acquired.baseUrl).toBe("http://127.0.0.1:4097");

    await acquired.dispose();
    expect(secondHandle.dispose).not.toHaveBeenCalled();
  });

  function makeSubagentClient() {
    return {
      mcp: {
        add: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        connect: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        disconnect: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      },
      instance: {
        dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      },
    };
  }

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
      mcpServers: [remoteMcp("chrome", chromeMcp.url, chromeMcp.headers)],
    });

    expect(client.mcp.add).toHaveBeenCalledWith({
      directory: "/repo-chrome",
      name: "chrome",
      config: {
        type: "remote",
        url: chromeMcp.url,
        headers: chromeMcp.headers,
        enabled: true,
        timeout: 30_000,
      },
    });
    expect(client.mcp.connect).not.toHaveBeenCalled();

    await acquired.dispose();
    expect(handle.dispose).not.toHaveBeenCalled();
  });

  it("shares an authenticated native sidecar across directories", async () => {
    const handle = makeHandle("http://127.0.0.1:4300");
    const eventClient = makeSubagentClient();
    const firstClient = makeSubagentClient();
    const secondClient = makeSubagentClient();
    mocks.spawnOpenCodeServer.mockReturnValue(handle);
    mocks.createOpencodeClient
      .mockReturnValueOnce(eventClient)
      .mockReturnValueOnce(firstClient)
      .mockReturnValueOnce(secondClient);

    const { acquireOpenCodeServer } = await import("./sdkClient");
    const first = await acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo-a" },
    });
    const second = await acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo-b" },
    });

    expect(mocks.spawnOpenCodeServer).toHaveBeenCalledTimes(1);
    expect(first.client).toBe(firstClient);
    expect(second.client).toBe(secondClient);
    expect(first.eventClient).toBe(eventClient);
    expect(second.eventClient).toBe(eventClient);

    const credentials = mocks.buildOpenCodeServerCommand.mock.calls[0]?.[2] as Record<
      string,
      string
    >;
    expect(credentials.OPENCODE_SERVER_USERNAME).toBe("opencode");
    expect(credentials.OPENCODE_SERVER_PASSWORD).toEqual(expect.any(String));
    expect(credentials.PORACODE_OPENCODE_SESSION_ROUTING).toBe("1");
    const authorization = `Basic ${Buffer.from(
      `opencode:${credentials.OPENCODE_SERVER_PASSWORD}`,
    ).toString("base64")}`;
    expect(mocks.createOpencodeClient).toHaveBeenNthCalledWith(1, {
      baseUrl: "http://127.0.0.1:4300",
      headers: { Authorization: authorization },
      throwOnError: true,
    });
    expect(mocks.createOpencodeClient).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ directory: "/repo-a" }),
    );
    expect(mocks.createOpencodeClient).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ directory: "/repo-b" }),
    );

    await first.dispose();
    await second.dispose();
    expect(handle.dispose).not.toHaveBeenCalled();
  });

  it("pools WSL directories by distro", async () => {
    const ubuntuHandle = makeHandle("http://127.0.0.1:4400");
    const debianHandle = makeHandle("http://127.0.0.1:4401");
    mocks.spawnOpenCodeServer.mockReturnValueOnce(ubuntuHandle).mockReturnValueOnce(debianHandle);

    const { acquireOpenCodeServer } = await import("./sdkClient");
    const ubuntuA = await acquireOpenCodeServer({
      projectLocation: {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/repo-a",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\repo-a",
      },
    });
    const ubuntuB = await acquireOpenCodeServer({
      projectLocation: {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/repo-b",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\repo-b",
      },
    });
    const debian = await acquireOpenCodeServer({
      projectLocation: {
        kind: "wsl",
        distro: "Debian",
        linuxPath: "/repo-a",
        uncPath: "\\\\wsl.localhost\\Debian\\repo-a",
      },
    });

    expect(mocks.spawnOpenCodeServer).toHaveBeenCalledTimes(2);
    expect(ubuntuA.baseUrl).toBe(ubuntuB.baseUrl);
    expect(debian.baseUrl).not.toBe(ubuntuA.baseUrl);

    await ubuntuA.dispose();
    await ubuntuB.dispose();
    await debian.dispose();
    expect(ubuntuHandle.dispose).not.toHaveBeenCalled();
    expect(debianHandle.dispose).not.toHaveBeenCalled();
  });

  it("rebuilds MCP state for only the changed directory", async () => {
    const handle = makeHandle("http://127.0.0.1:4500");
    const eventClient = makeSubagentClient();
    const firstAClient = makeSubagentClient();
    const firstBClient = makeSubagentClient();
    mocks.spawnOpenCodeServer.mockReturnValue(handle);
    mocks.createOpencodeClient
      .mockReturnValueOnce(eventClient)
      .mockReturnValueOnce(firstAClient)
      .mockReturnValueOnce(firstBClient);

    const { acquireOpenCodeServer } = await import("./sdkClient");
    const firstA = await acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo-a" },
      mcpServers: [remoteMcp("memory", "http://127.0.0.1:9500/mcp")],
    });
    const firstB = await acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo-b" },
      mcpServers: [remoteMcp("chrome", chromeMcp.url, chromeMcp.headers)],
    });
    await firstA.updateMcpServers([]);

    expect(mocks.spawnOpenCodeServer).toHaveBeenCalledTimes(1);
    expect(firstAClient.mcp.disconnect).toHaveBeenCalledWith({
      directory: "/repo-a",
      name: "memory",
    });
    expect(firstAClient.instance.dispose).toHaveBeenCalledWith({ directory: "/repo-a" });
    expect(firstBClient.instance.dispose).not.toHaveBeenCalled();
    expect(handle.dispose).not.toHaveBeenCalled();

    await firstA.dispose();
    await firstB.dispose();
  });

  it("updates an existing MCP config without disposing the directory", async () => {
    const handle = makeHandle("http://127.0.0.1:4550");
    const eventClient = makeSubagentClient();
    const client = makeSubagentClient();
    mocks.spawnOpenCodeServer.mockReturnValue(handle);
    mocks.createOpencodeClient.mockReturnValueOnce(eventClient).mockReturnValueOnce(client);

    const { acquireOpenCodeServer } = await import("./sdkClient");
    const acquired = await acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo" },
      mcpServers: [remoteMcp("memory", "http://127.0.0.1:9500/mcp")],
    });
    await acquired.updateMcpServers([remoteMcp("memory", "http://127.0.0.1:9501/mcp")]);

    expect(client.mcp.add).toHaveBeenCalledTimes(2);
    expect(client.mcp.disconnect).not.toHaveBeenCalled();
    expect(client.instance.dispose).not.toHaveBeenCalled();

    await acquired.dispose();
  });

  it("leaves managed MCP state unchanged when a caller omits mcpServers", async () => {
    const handle = makeHandle("http://127.0.0.1:4600");
    const eventClient = makeSubagentClient();
    const settingsClient = makeSubagentClient();
    const oneShotClient = makeSubagentClient();
    mocks.spawnOpenCodeServer.mockReturnValue(handle);
    mocks.createOpencodeClient
      .mockReturnValueOnce(eventClient)
      .mockReturnValueOnce(settingsClient)
      .mockReturnValueOnce(oneShotClient);

    const { acquireOpenCodeServer } = await import("./sdkClient");
    const settings = await acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo" },
      mcpServers: [remoteMcp("chrome", chromeMcp.url, chromeMcp.headers)],
    });
    const oneShot = await acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo" },
    });

    expect(oneShotClient.mcp.add).not.toHaveBeenCalled();
    expect(oneShotClient.mcp.disconnect).not.toHaveBeenCalled();
    expect(oneShotClient.instance.dispose).not.toHaveBeenCalled();

    await settings.dispose();
    await oneShot.dispose();
  });

  it("serializes concurrent MCP updates for the same directory", async () => {
    const handle = makeHandle("http://127.0.0.1:4700");
    const eventClient = makeSubagentClient();
    const firstClient = makeSubagentClient();
    const secondClient = makeSubagentClient();
    let markStarted!: () => void;
    let releaseAdd!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const blockedAdd = new Promise<void>((resolve) => {
      releaseAdd = resolve;
    });
    firstClient.mcp.add.mockImplementation(async () => {
      markStarted();
      await blockedAdd;
    });
    mocks.spawnOpenCodeServer.mockReturnValue(handle);
    mocks.createOpencodeClient
      .mockReturnValueOnce(eventClient)
      .mockReturnValueOnce(firstClient)
      .mockReturnValueOnce(secondClient);

    const { acquireOpenCodeServer } = await import("./sdkClient");
    const firstPromise = acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo" },
      mcpServers: [remoteMcp("chrome", chromeMcp.url, chromeMcp.headers)],
    });
    await started;
    const secondPromise = acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo" },
      mcpServers: [],
    });
    await Promise.resolve();

    expect(secondClient.instance.dispose).not.toHaveBeenCalled();
    releaseAdd();
    const first = await firstPromise;
    const second = await secondPromise;
    expect(secondClient.instance.dispose).toHaveBeenCalledWith({ directory: "/repo" });

    await first.dispose();
    await second.dispose();
  });

  it("shutdownSpawnedOpenCodeServers clears pool bookkeeping and disposes tracked spawns only", async () => {
    const { acquireOpenCodeServer, shutdownSpawnedOpenCodeServers } = await import("./sdkClient");
    const handle = makeHandle("http://127.0.0.1:4096");
    mocks.spawnOpenCodeServer.mockReturnValue(handle);

    const acquired = await acquireOpenCodeServer({
      projectLocation: { kind: "windows", path: "C:\\repo" },
    });
    expect(acquired.baseUrl).toBe("http://127.0.0.1:4096");

    shutdownSpawnedOpenCodeServers();

    expect(mocks.disposeSpawnedOpenCodeServerHandles).toHaveBeenCalledTimes(1);
    expect(handle.dispose).not.toHaveBeenCalled();

    await expect(
      acquireOpenCodeServer({
        projectLocation: { kind: "windows", path: "C:\\repo" },
      }),
    ).resolves.toBeDefined();
    expect(mocks.spawnOpenCodeServer).toHaveBeenCalledTimes(2);
  });
});
