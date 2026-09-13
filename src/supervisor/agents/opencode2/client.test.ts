import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChildProcess } from "node:child_process";
import type { ProjectLocation, ResolvedMcpServer } from "@/shared/contracts";
import type { CommandSpec } from "../base";
import type { OpenCode2Client } from "./clientTypes";
import type { OpenCode2ServerHandle } from "./server";

const mocks = vi.hoisted(() => ({
  buildOpenCode2ServerCommand:
    vi.fn<
      (
        location: ProjectLocation,
        resolvedExecPath?: string,
        env?: Record<string, string>,
      ) => CommandSpec
    >(),
  makeOpenCodeClient: vi.fn<() => unknown>(),
  resolveAgentBinaryPath: vi.fn<() => string>(),
  spawnOpenCode2Server: vi.fn<() => OpenCode2ServerHandle>(),
  disposeSpawnedOpenCode2ServerHandles: vi.fn<() => void>(),
}));

vi.mock("./binary", () => ({
  resolveOpenCode2Binary: mocks.resolveAgentBinaryPath,
}));

vi.mock("./argv", () => ({
  buildOpenCode2ServerCommand: mocks.buildOpenCode2ServerCommand,
}));

vi.mock("./server", () => ({
  spawnOpenCode2Server: mocks.spawnOpenCode2Server,
  disposeSpawnedOpenCode2ServerHandles: mocks.disposeSpawnedOpenCode2ServerHandles,
}));

vi.mock("@opencode/client", () => ({
  OpenCode: { make: mocks.makeOpenCodeClient },
}));

function makeHandle(baseUrl: string, password = "server-password") {
  return {
    child: new EventEmitter() as ChildProcess,
    baseUrl: Promise.resolve(baseUrl),
    password: Promise.resolve(password),
    formatOutput: () => "",
    dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } satisfies OpenCode2ServerHandle;
}

function makeClientStub(): OpenCode2Client {
  return {
    mcp: {
      add: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      remove: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    },
  } as unknown as OpenCode2Client;
}

function remoteMcp(
  name: string,
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 30_000,
): ResolvedMcpServer {
  return { id: name, name, timeoutMs, transport: { type: "http" as const, url, headers } };
}

describe("acquireOpenCode2Server", () => {
  beforeEach(() => {
    mocks.buildOpenCode2ServerCommand.mockReset().mockReturnValue({
      command: "opencode2",
      args: ["serve"],
      cwd: "/repo",
      env: {},
    });
    mocks.makeOpenCodeClient.mockReset().mockImplementation(() => makeClientStub());
    mocks.resolveAgentBinaryPath.mockReset().mockReturnValue("opencode2");
    mocks.spawnOpenCode2Server.mockReset();
    mocks.disposeSpawnedOpenCode2ServerHandles.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
  });

  afterEach(async () => {
    const { shutdownSpawnedOpenCode2Servers } = await import("./client");
    shutdownSpawnedOpenCode2Servers();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("shares one authenticated sidecar across directories of the same runtime", async () => {
    const handle = makeHandle("http://127.0.0.1:4300");
    const client = makeClientStub();
    mocks.spawnOpenCode2Server.mockReturnValue(handle);
    mocks.makeOpenCodeClient.mockReturnValue(client);

    const { acquireOpenCode2Server } = await import("./client");
    const first = await acquireOpenCode2Server({
      projectLocation: { kind: "posix", path: "/repo-a" },
    });
    const second = await acquireOpenCode2Server({
      projectLocation: { kind: "posix", path: "/repo-b" },
    });

    expect(mocks.spawnOpenCode2Server).toHaveBeenCalledTimes(1);
    expect(mocks.resolveAgentBinaryPath).toHaveBeenCalledWith({ kind: "posix", path: "/repo-a" });
    expect(first.client).toBe(client);
    expect(second.client).toBe(client);
    expect(first.baseUrl).toBe("http://127.0.0.1:4300");

    // The server generates the password; the client signs every request with
    // Basic auth over `opencode:<password>`.
    expect(mocks.makeOpenCodeClient).toHaveBeenCalledExactlyOnceWith({
      baseUrl: "http://127.0.0.1:4300",
      headers: {
        Authorization: `Basic ${Buffer.from("opencode:server-password").toString("base64")}`,
      },
    });

    await first.dispose();
    await second.dispose();
    expect(handle.dispose).not.toHaveBeenCalled();
  });

  it("resolves the opencode2 binary before building the server command", async () => {
    const handle = makeHandle("http://127.0.0.1:4310");
    mocks.spawnOpenCode2Server.mockReturnValue(handle);

    const { acquireOpenCode2Server } = await import("./client");
    const acquired = await acquireOpenCode2Server({
      projectLocation: { kind: "posix", path: "/repo" },
    });

    // Policies are persisted per session, never injected into a shared server.
    expect(mocks.buildOpenCode2ServerCommand).toHaveBeenCalledWith(
      { kind: "posix", path: "/repo" },
      "opencode2",
      {},
    );

    await acquired.dispose();
  });

  it("pools WSL directories by distro and confirms reachability first", async () => {
    const ubuntuHandle = makeHandle("http://127.0.0.1:4400");
    const debianHandle = makeHandle("http://127.0.0.1:4401");
    mocks.spawnOpenCode2Server.mockReturnValueOnce(ubuntuHandle).mockReturnValueOnce(debianHandle);
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const { acquireOpenCode2Server } = await import("./client");
    const ubuntuA = await acquireOpenCode2Server({
      projectLocation: {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/repo-a",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\repo-a",
      },
    });
    const ubuntuB = await acquireOpenCode2Server({
      projectLocation: {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/repo-b",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\repo-b",
      },
    });
    const debian = await acquireOpenCode2Server({
      projectLocation: {
        kind: "wsl",
        distro: "Debian",
        linuxPath: "/repo-a",
        uncPath: "\\\\wsl.localhost\\Debian\\repo-a",
      },
    });

    expect(mocks.spawnOpenCode2Server).toHaveBeenCalledTimes(2);
    expect(ubuntuA.baseUrl).toBe(ubuntuB.baseUrl);
    expect(debian.baseUrl).not.toBe(ubuntuA.baseUrl);
    // A 401 still proves the localhost relay round-trips.
    expect(fetchMock).toHaveBeenCalled();

    await ubuntuA.dispose();
    await ubuntuB.dispose();
    await debian.dispose();
  });

  it("does not poll reachability for a native server", async () => {
    const handle = makeHandle("http://127.0.0.1:4410");
    mocks.spawnOpenCode2Server.mockReturnValue(handle);
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const { acquireOpenCode2Server } = await import("./client");
    const acquired = await acquireOpenCode2Server({
      projectLocation: { kind: "posix", path: "/repo" },
    });

    expect(fetchMock).not.toHaveBeenCalled();
    await acquired.dispose();
  });

  it("stops the shared sidecar after its last lease stays idle", async () => {
    vi.useFakeTimers();
    const handle = makeHandle("http://127.0.0.1:4350");
    mocks.spawnOpenCode2Server.mockReturnValue(handle);

    const { acquireOpenCode2Server } = await import("./client");
    const first = await acquireOpenCode2Server({
      projectLocation: { kind: "posix", path: "/repo-a" },
    });
    const second = await acquireOpenCode2Server({
      projectLocation: { kind: "posix", path: "/repo-b" },
    });

    await first.dispose();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(handle.dispose).not.toHaveBeenCalled();

    await second.dispose();
    await vi.advanceTimersByTimeAsync(29_999);
    expect(handle.dispose).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(handle.dispose).toHaveBeenCalledOnce();

    await acquireOpenCode2Server({ projectLocation: { kind: "posix", path: "/repo-c" } });
    expect(mocks.spawnOpenCode2Server).toHaveBeenCalledTimes(2);
  });

  it("closes the shared sidecar immediately when the last probe lease is released", async () => {
    const handle = makeHandle("http://127.0.0.1:4375");
    mocks.spawnOpenCode2Server.mockReturnValue(handle);

    const { acquireOpenCode2Server } = await import("./client");
    const activeSession = await acquireOpenCode2Server({
      projectLocation: { kind: "posix", path: "/repo-active" },
    });
    const probe = await acquireOpenCode2Server({
      projectLocation: { kind: "posix", path: "/repo-probe" },
    });

    await probe.dispose({ closeServerIfIdle: true });
    expect(handle.dispose).not.toHaveBeenCalled();

    await activeSession.dispose({ closeServerIfIdle: true });
    expect(handle.dispose).toHaveBeenCalledOnce();
  });

  it("keeps the sidecar alive for an acquisition that is still starting", async () => {
    const handle = makeHandle("http://127.0.0.1:4380");
    mocks.spawnOpenCode2Server.mockReturnValue(handle);

    const { acquireOpenCode2Server } = await import("./client");
    const probe = await acquireOpenCode2Server({
      projectLocation: { kind: "posix", path: "/repo-probe" },
    });
    const sessionPromise = acquireOpenCode2Server({
      projectLocation: { kind: "posix", path: "/repo-session" },
    });

    await probe.dispose({ closeServerIfIdle: true });
    expect(handle.dispose).not.toHaveBeenCalled();

    const session = await sessionPromise;
    await session.dispose({ closeServerIfIdle: true });
    expect(handle.dispose).toHaveBeenCalledOnce();
  });

  it("does not leak a rejected server startup and respawns on the next acquire", async () => {
    const failed = {
      ...makeHandle("http://127.0.0.1:4096"),
      baseUrl: Promise.reject(new Error("database is locked")),
      password: Promise.reject(new Error("database is locked")),
    };
    const recovered = makeHandle("http://127.0.0.1:4097");
    mocks.spawnOpenCode2Server.mockReturnValueOnce(failed).mockReturnValueOnce(recovered);

    const { acquireOpenCode2Server } = await import("./client");
    await expect(
      acquireOpenCode2Server({ projectLocation: { kind: "posix", path: "/repo" } }),
    ).rejects.toThrow("database is locked");
    await new Promise((resolve) => setImmediate(resolve));

    expect(failed.dispose).toHaveBeenCalledOnce();

    const acquired = await acquireOpenCode2Server({
      projectLocation: { kind: "posix", path: "/repo" },
    });
    expect(mocks.spawnOpenCode2Server).toHaveBeenCalledTimes(2);
    await acquired.dispose();
  });

  it("evicts a crashed server, notifies lease holders, and respawns fresh", async () => {
    const crashed = makeHandle("http://127.0.0.1:4420");
    const fresh = makeHandle("http://127.0.0.1:4421");
    mocks.spawnOpenCode2Server.mockReturnValueOnce(crashed).mockReturnValueOnce(fresh);

    const { acquireOpenCode2Server } = await import("./client");
    const acquired = await acquireOpenCode2Server({
      projectLocation: { kind: "posix", path: "/repo" },
    });
    const onServerExit = vi.fn<() => void>();
    const unsubscribe = acquired.onServerExit?.(onServerExit);

    (crashed.child as unknown as EventEmitter).emit("exit", 137, null);
    await new Promise((resolve) => setImmediate(resolve));
    expect(onServerExit).toHaveBeenCalledOnce();

    const next = await acquireOpenCode2Server({
      projectLocation: { kind: "posix", path: "/repo" },
    });
    expect(mocks.spawnOpenCode2Server).toHaveBeenCalledTimes(2);
    expect(next.baseUrl).toBe("http://127.0.0.1:4421");

    unsubscribe?.();
    await next.dispose();
  });

  it("registers resolved MCP servers through the V2 add endpoint", async () => {
    const handle = makeHandle("http://127.0.0.1:4500");
    const client = makeClientStub();
    mocks.spawnOpenCode2Server.mockReturnValue(handle);
    mocks.makeOpenCodeClient.mockReturnValue(client);

    const { acquireOpenCode2Server } = await import("./client");
    const acquired = await acquireOpenCode2Server({
      projectLocation: { kind: "posix", path: "/repo" },
      mcpServers: [
        remoteMcp("browser", "http://127.0.0.1:9321/mcp", { Authorization: "Bearer token" }),
        {
          id: "memory",
          name: "memory",
          timeoutMs: 10_000,
          transport: {
            type: "stdio",
            command: "npx",
            args: ["-y", "memory-server"],
            env: { MEMORY_FILE: "/tmp/memory.json" },
          },
        },
        {
          id: "legacy",
          name: "legacy",
          timeoutMs: 30_000,
          transport: { type: "sse", url: "http://127.0.0.1:9402/sse", headers: {} },
        },
      ],
    });

    expect(client.mcp.add).toHaveBeenNthCalledWith(1, {
      server: "browser",
      location: { directory: "/repo" },
      config: {
        type: "remote",
        url: "http://127.0.0.1:9321/mcp",
        headers: { Authorization: "Bearer token" },
        timeout: { execution: 30_000 },
      },
    });
    expect(client.mcp.add).toHaveBeenNthCalledWith(2, {
      server: "memory",
      location: { directory: "/repo" },
      config: {
        type: "local",
        command: ["npx", "-y", "memory-server"],
        environment: { MEMORY_FILE: "/tmp/memory.json" },
        timeout: { execution: 10_000 },
      },
    });
    expect(client.mcp.add).toHaveBeenNthCalledWith(3, {
      server: "legacy",
      location: { directory: "/repo" },
      config: { type: "remote", url: "http://127.0.0.1:9402/sse", timeout: { execution: 30_000 } },
    });
    expect(client.mcp.remove).not.toHaveBeenCalled();

    await acquired.dispose();
  });

  it("leaves managed MCP state unchanged when a caller omits mcpServers", async () => {
    const handle = makeHandle("http://127.0.0.1:4600");
    const settingsClient = makeClientStub();
    const oneShotClient = makeClientStub();
    mocks.spawnOpenCode2Server.mockReturnValue(handle);
    mocks.makeOpenCodeClient.mockReturnValueOnce(settingsClient).mockReturnValueOnce(oneShotClient);

    const { acquireOpenCode2Server } = await import("./client");
    const settings = await acquireOpenCode2Server({
      projectLocation: { kind: "posix", path: "/repo" },
      mcpServers: [remoteMcp("browser", "http://127.0.0.1:9321/mcp")],
    });
    const oneShot = await acquireOpenCode2Server({
      projectLocation: { kind: "posix", path: "/repo" },
    });

    expect(oneShotClient.mcp.add).not.toHaveBeenCalled();
    expect(oneShotClient.mcp.remove).not.toHaveBeenCalled();

    await settings.dispose();
    await oneShot.dispose();
  });

  it("keeps MCP state isolated per location directory", async () => {
    const handle = makeHandle("http://127.0.0.1:4610");
    const client = makeClientStub();
    mocks.spawnOpenCode2Server.mockReturnValue(handle);
    mocks.makeOpenCodeClient.mockReturnValue(client);

    const { acquireOpenCode2Server } = await import("./client");
    const first = await acquireOpenCode2Server({
      projectLocation: { kind: "posix", path: "/repo-a" },
      mcpServers: [remoteMcp("browser", "http://127.0.0.1:9321/mcp")],
    });
    const second = await acquireOpenCode2Server({
      projectLocation: { kind: "posix", path: "/repo-b" },
      mcpServers: [],
    });

    expect(client.mcp.add).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ location: { directory: "/repo-a" } }),
    );

    await first.dispose();
    await second.dispose();
  });

  it("removes servers dropped from the set instead of disposing the location", async () => {
    const handle = makeHandle("http://127.0.0.1:4620");
    const client = makeClientStub();
    mocks.spawnOpenCode2Server.mockReturnValue(handle);
    mocks.makeOpenCodeClient.mockReturnValue(client);

    const { acquireOpenCode2Server } = await import("./client");
    const acquired = await acquireOpenCode2Server({
      projectLocation: { kind: "posix", path: "/repo" },
      mcpServers: [
        remoteMcp("browser", "http://127.0.0.1:9321/mcp"),
        remoteMcp("memory", "http://127.0.0.1:9500/mcp"),
      ],
    });
    await acquired.updateMcpServers([remoteMcp("browser", "http://127.0.0.1:9321/mcp")]);

    expect(client.mcp.remove).toHaveBeenCalledExactlyOnceWith({
      server: "memory",
      location: { directory: "/repo" },
    });
    // The surviving server's config is unchanged, so only the initial
    // acquire's two adds were ever issued.
    expect(client.mcp.add).toHaveBeenCalledTimes(2);
    expect(handle.dispose).not.toHaveBeenCalled();

    await acquired.dispose();
  });

  it("updates an existing MCP config in place and clears the set on an empty array", async () => {
    const handle = makeHandle("http://127.0.0.1:4630");
    const client = makeClientStub();
    mocks.spawnOpenCode2Server.mockReturnValue(handle);
    mocks.makeOpenCodeClient.mockReturnValue(client);

    const { acquireOpenCode2Server } = await import("./client");
    const acquired = await acquireOpenCode2Server({
      projectLocation: { kind: "posix", path: "/repo" },
      mcpServers: [remoteMcp("browser", "http://127.0.0.1:9321/mcp")],
    });
    await acquired.updateMcpServers([remoteMcp("browser", "http://127.0.0.1:9399/mcp")]);
    await acquired.updateMcpServers([]);

    expect(client.mcp.add).toHaveBeenCalledTimes(2);
    expect(client.mcp.remove).toHaveBeenCalledExactlyOnceWith({
      server: "browser",
      location: { directory: "/repo" },
    });

    await acquired.dispose();
  });

  it("serializes concurrent MCP updates for the same location", async () => {
    const handle = makeHandle("http://127.0.0.1:4700");
    const client = {
      mcp: {
        add: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        remove: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      },
    } as unknown as OpenCode2Client & {
      mcp: { add: ReturnType<typeof vi.fn<() => Promise<void>>> };
    };
    let markStarted!: () => void;
    let releaseAdd!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const blockedAdd = new Promise<void>((resolve) => {
      releaseAdd = resolve;
    });
    vi.mocked(client.mcp.add).mockImplementationOnce(async () => {
      markStarted();
      await blockedAdd;
    });
    mocks.spawnOpenCode2Server.mockReturnValue(handle);
    mocks.makeOpenCodeClient.mockReturnValue(client);

    const { acquireOpenCode2Server } = await import("./client");
    const firstPromise = acquireOpenCode2Server({
      projectLocation: { kind: "posix", path: "/repo" },
      mcpServers: [remoteMcp("browser", "http://127.0.0.1:9321/mcp")],
    });
    await started;
    const secondPromise = firstPromise.then((first) => first.updateMcpServers([]));

    // The clear is queued behind the in-flight add, so nothing is removed yet.
    await Promise.resolve();
    expect(client.mcp.remove).not.toHaveBeenCalled();

    releaseAdd();
    const first = await firstPromise;
    await secondPromise;

    expect(client.mcp.remove).toHaveBeenCalledExactlyOnceWith({
      server: "browser",
      location: { directory: "/repo" },
    });
    await first.dispose();
  });

  it("waits for partially failed additions and revokes their attempted servers", async () => {
    const client = makeClientStub();
    mocks.spawnOpenCode2Server.mockReturnValue(makeHandle("http://127.0.0.1:4701"));
    mocks.makeOpenCodeClient.mockReturnValue(client);
    const { acquireOpenCode2Server } = await import("./client");
    const acquired = await acquireOpenCode2Server({
      projectLocation: { kind: "posix", path: "/repo" },
      mcpServers: [],
    });
    const delayed = Promise.withResolvers<void>();
    vi.mocked(client.mcp.add)
      .mockImplementationOnce(() => delayed.promise)
      .mockRejectedValueOnce(new Error("invalid config"));
    const updating = acquired.updateMcpServers([
      remoteMcp("a", "http://localhost/a"),
      remoteMcp("b", "http://localhost/b"),
    ]);
    const failed = updating.catch((error: unknown) => error);
    await vi.waitFor(() => expect(client.mcp.add).toHaveBeenCalledTimes(2));
    const clearing = acquired.updateMcpServers([]);
    await Promise.resolve();
    expect(client.mcp.remove).not.toHaveBeenCalled();
    delayed.resolve();
    expect(await failed).toEqual(new Error("invalid config"));
    await clearing;
    expect(vi.mocked(client.mcp.remove).mock.calls.map(([input]) => input.server)).toEqual([
      "a",
      "b",
    ]);
    await acquired.dispose();
  });

  it("restores the previous config after a partially failed removal", async () => {
    const client = makeClientStub();
    mocks.spawnOpenCode2Server.mockReturnValue(makeHandle("http://127.0.0.1:4702"));
    mocks.makeOpenCodeClient.mockReturnValue(client);
    const { acquireOpenCode2Server } = await import("./client");
    const servers = [remoteMcp("a", "http://localhost/a"), remoteMcp("b", "http://localhost/b")];
    const acquired = await acquireOpenCode2Server({
      projectLocation: { kind: "posix", path: "/repo" },
      mcpServers: servers,
    });
    vi.mocked(client.mcp.remove)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("remove failed"));
    await expect(acquired.updateMcpServers([])).rejects.toThrow("remove failed");
    vi.mocked(client.mcp.add).mockClear();
    await acquired.updateMcpServers(servers);
    expect(vi.mocked(client.mcp.add).mock.calls.map(([input]) => input.server)).toEqual(["a", "b"]);
    await acquired.dispose();
  });

  it("respawns once when MCP sync hits a dead OpenCode 2 server", async () => {
    const firstHandle = makeHandle("http://127.0.0.1:4096");
    const secondHandle = makeHandle("http://127.0.0.1:4097");
    const firstAdd = vi.fn<() => Promise<void>>().mockRejectedValue(new Error("fetch failed"));
    const secondAdd = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const firstClient = { mcp: { add: firstAdd, remove: vi.fn<() => Promise<void>>() } };
    const secondClient = { mcp: { add: secondAdd, remove: vi.fn<() => Promise<void>>() } };

    mocks.spawnOpenCode2Server.mockReturnValueOnce(firstHandle).mockReturnValueOnce(secondHandle);
    mocks.makeOpenCodeClient.mockReturnValueOnce(firstClient).mockReturnValueOnce(secondClient);

    const { acquireOpenCode2Server } = await import("./client");
    const acquired = await acquireOpenCode2Server({
      projectLocation: { kind: "posix", path: "/repo" },
      mcpServers: [remoteMcp("browser", "http://127.0.0.1:9321/mcp")],
    });

    expect(mocks.spawnOpenCode2Server).toHaveBeenCalledTimes(2);
    expect(firstAdd).toHaveBeenCalledTimes(1);
    expect(firstHandle.dispose).toHaveBeenCalledTimes(1);
    expect(secondAdd).toHaveBeenCalledTimes(1);
    expect(acquired.baseUrl).toBe("http://127.0.0.1:4097");

    await acquired.dispose();
    expect(secondHandle.dispose).not.toHaveBeenCalled();
  });

  it("shutdownSpawnedOpenCode2Servers clears pool bookkeeping and disposes tracked spawns only", async () => {
    const { acquireOpenCode2Server, shutdownSpawnedOpenCode2Servers } = await import("./client");
    const handle = makeHandle("http://127.0.0.1:4096");
    mocks.spawnOpenCode2Server.mockReturnValue(handle);

    const acquired = await acquireOpenCode2Server({
      projectLocation: { kind: "windows", path: "C:\\repo" },
    });
    expect(acquired.baseUrl).toBe("http://127.0.0.1:4096");

    shutdownSpawnedOpenCode2Servers();

    expect(mocks.disposeSpawnedOpenCode2ServerHandles).toHaveBeenCalledTimes(1);
    expect(handle.dispose).not.toHaveBeenCalled();

    await expect(
      acquireOpenCode2Server({ projectLocation: { kind: "windows", path: "C:\\repo" } }),
    ).resolves.toBeDefined();
    expect(mocks.spawnOpenCode2Server).toHaveBeenCalledTimes(2);
  });
});
