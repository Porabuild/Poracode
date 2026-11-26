import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChildProcess } from "node:child_process";
import type { ProjectLocation, ResolvedMcpServer } from "@/shared/contracts";
import type { CommandSpec } from "../base";
import type { OpenCodeClient, SessionInterruptResponse } from "./clientTypes";
import type { OpenCodeServerHandle } from "./server";

const mocks = vi.hoisted(() => ({
  buildOpenCodeServerCommand:
    vi.fn<
      (
        location: ProjectLocation,
        resolvedExecPath?: string,
        env?: Record<string, string>,
      ) => CommandSpec
    >(),
  makeOpenCodeClient: vi.fn<() => unknown>(),
  resolveAgentBinaryPath: vi.fn<() => string>(),
  spawnOpenCodeServer: vi.fn<() => OpenCodeServerHandle>(),
  disposeSpawnedOpenCodeServerHandles: vi.fn<() => void>(),
}));

vi.mock("./binary", () => ({
  resolveOpenCodeBinary: mocks.resolveAgentBinaryPath,
}));

vi.mock("./credentialCompatibility", () => ({
  synchronizeOpenCodeCredentials: vi
    .fn<typeof import("./credentialCompatibility").synchronizeOpenCodeCredentials>()
    .mockResolvedValue(undefined),
  revokeOpenCodeCredential: vi
    .fn<typeof import("./credentialCompatibility").revokeOpenCodeCredential>()
    .mockResolvedValue(undefined),
  clearOpenCodeCredentialCompatibility:
    vi.fn<typeof import("./credentialCompatibility").clearOpenCodeCredentialCompatibility>(),
}));

vi.mock("./argv", () => ({
  buildOpenCodeServerCommand: mocks.buildOpenCodeServerCommand,
}));

vi.mock("./server", () => ({
  spawnOpenCodeServer: mocks.spawnOpenCodeServer,
  disposeSpawnedOpenCodeServerHandles: mocks.disposeSpawnedOpenCodeServerHandles,
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
  } satisfies OpenCodeServerHandle;
}

function makeClientStub(): OpenCodeClient {
  return {
    session: { get: vi.fn<() => Promise<object>>().mockResolvedValue({ id: "existing" }) },
    experimental: {
      mcp: {
        add: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        remove: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      },
    },
  } as unknown as OpenCodeClient;
}

function remoteMcp(
  name: string,
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 30_000,
): ResolvedMcpServer {
  return { id: name, name, timeoutMs, transport: { type: "http" as const, url, headers } };
}

describe("acquireOpenCodeServer", () => {
  beforeEach(() => {
    mocks.buildOpenCodeServerCommand.mockReset().mockReturnValue({
      command: "opencode",
      args: ["serve"],
      cwd: "/repo",
      env: {},
    });
    mocks.makeOpenCodeClient.mockReset().mockImplementation(() => makeClientStub());
    mocks.resolveAgentBinaryPath.mockReset().mockReturnValue("opencode");
    mocks.spawnOpenCodeServer.mockReset();
    mocks.disposeSpawnedOpenCodeServerHandles.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
  });

  afterEach(async () => {
    const { shutdownSpawnedOpenCodeServers } = await import("./client");
    shutdownSpawnedOpenCodeServers();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("skips credential compatibility and the legacy database for private profiles", async () => {
    mocks.spawnOpenCodeServer.mockReturnValue(makeHandle("http://127.0.0.1:4310"));
    const { acquireOpenCodeServer } = await import("./client");
    const { synchronizeOpenCodeCredentials, revokeOpenCodeCredential } =
      await import("./credentialCompatibility");
    const profile = {
      key: "poracode-profile:work",
      env: {
        OPENCODE_CONFIG_CONTENT: "{}",
        OPENCODE_CONFIG_DIR: "/home/user/.poracode/opencode-profiles/work",
        OPENCODE_DB: "opencode-profile-work.db",
      },
    };
    const acquired = await acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo" },
      profile,
      resumeSessionId: "missing-session",
    });
    expect(acquired.database).toBe("native");
    expect(mocks.spawnOpenCodeServer).toHaveBeenCalledOnce();
    expect(mocks.buildOpenCodeServerCommand).toHaveBeenCalledWith(
      { kind: "posix", path: "/repo" },
      "opencode",
      profile.env,
    );
    expect(synchronizeOpenCodeCredentials).not.toHaveBeenCalled();
    expect(revokeOpenCodeCredential).not.toHaveBeenCalled();
    await acquired.dispose();
  });

  it("uses the native credential/session database for new acquisitions", async () => {
    mocks.spawnOpenCodeServer.mockReturnValue(makeHandle("http://127.0.0.1:4300"));
    const { acquireOpenCodeServer } = await import("./client");
    const acquired = await acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo" },
    });
    expect(acquired.database).toBe("native");
    expect(mocks.buildOpenCodeServerCommand).toHaveBeenCalledExactlyOnceWith(
      { kind: "posix", path: "/repo" },
      "opencode",
      {},
    );
    await acquired.dispose();
  });

  it("preserves pre-upgrade isolated sessions and their terminal database", async () => {
    const native = makeClientStub();
    const legacy = makeClientStub();
    vi.mocked(native.session.get).mockRejectedValue({
      _tag: "SessionNotFoundError",
      sessionID: "old-session",
    });
    mocks.makeOpenCodeClient.mockReturnValueOnce(native).mockReturnValueOnce(legacy);
    mocks.spawnOpenCodeServer
      .mockReturnValueOnce(makeHandle("http://127.0.0.1:4300"))
      .mockReturnValueOnce(makeHandle("http://127.0.0.1:4301"));
    const { acquireOpenCodeServer } = await import("./client");
    const { openCodeSessionDatabaseEnv } = await import("./database");
    const location: ProjectLocation = { kind: "posix", path: "/repo" };
    const input = { projectLocation: location, resumeSessionId: "old-session" };
    const acquired = await acquireOpenCodeServer(input);
    expect(acquired.database).toBe("legacy-isolated");
    expect(acquired.client).toBe(legacy);
    expect(mocks.buildOpenCodeServerCommand).toHaveBeenLastCalledWith(location, "opencode", {
      OPENCODE_DB: "opencode-v2.db",
    });
    expect(openCodeSessionDatabaseEnv(location, "old-session")).toEqual({
      OPENCODE_DB: "opencode-v2.db",
    });
    const resumed = await acquireOpenCodeServer(input);
    expect(resumed.client).toBe(legacy);
    expect(native.session.get).toHaveBeenCalledOnce();
    expect(mocks.spawnOpenCodeServer).toHaveBeenCalledTimes(2);
    await acquired.dispose();
    await resumed.dispose();
  });

  it("does not switch databases when native resume fails for another reason", async () => {
    const native = makeClientStub();
    vi.mocked(native.session.get).mockRejectedValue(new Error("connection failed"));
    mocks.makeOpenCodeClient.mockReturnValue(native);
    mocks.spawnOpenCodeServer.mockReturnValue(makeHandle("http://127.0.0.1:4300"));
    const { acquireOpenCodeServer } = await import("./client");
    await expect(
      acquireOpenCodeServer({
        projectLocation: { kind: "posix", path: "/repo" },
        resumeSessionId: "old-session",
      }),
    ).rejects.toThrow("connection failed");
    expect(mocks.spawnOpenCodeServer).toHaveBeenCalledOnce();
  });

  it("shares one authenticated sidecar across directories of the same runtime", async () => {
    const handle = makeHandle("http://127.0.0.1:4300");
    const client = makeClientStub();
    mocks.spawnOpenCodeServer.mockReturnValue(handle);
    mocks.makeOpenCodeClient.mockReturnValue(client);

    const { acquireOpenCodeServer } = await import("./client");
    const first = await acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo-a" },
    });
    const second = await acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo-b" },
    });

    expect(mocks.spawnOpenCodeServer).toHaveBeenCalledTimes(1);
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

  it("resolves the opencode binary before building the server command", async () => {
    const handle = makeHandle("http://127.0.0.1:4310");
    mocks.spawnOpenCodeServer.mockReturnValue(handle);

    const { acquireOpenCodeServer } = await import("./client");
    const acquired = await acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo" },
    });

    // Policies are persisted per session, never injected into a shared server.
    expect(mocks.buildOpenCodeServerCommand).toHaveBeenCalledWith(
      { kind: "posix", path: "/repo" },
      "opencode",
      {},
    );

    await acquired.dispose();
  });

  it("shares one pooled server across GUI, terminal, and sibling leases and refcounts directory MCPs", async () => {
    vi.useFakeTimers();
    const sharedHandle = makeHandle("http://127.0.0.1:4300");
    const client = makeClientStub();
    mocks.spawnOpenCodeServer.mockReturnValue(sharedHandle);
    mocks.makeOpenCodeClient.mockReturnValue(client);
    const { acquireOpenCodeServer } = await import("./client");
    const projectLocation = { kind: "posix", path: "/repo" } as const;
    const poracode = remoteMcp("poracode", "http://127.0.0.1:9/mcp");
    const browser = remoteMcp("browser", "http://127.0.0.1:9321/mcp");
    const linear = remoteMcp("linear", "http://127.0.0.1:9400/mcp");

    const gui = await acquireOpenCodeServer({ projectLocation, mcpServers: [poracode, browser] });
    const listener = vi.fn<() => void>();
    const unsubscribe = gui.onDirectoryMcpChanged(listener);
    expect(gui.getDirectoryMcpNames().sort()).toEqual(["browser", "poracode"]);

    const preparation = await acquireOpenCodeServer({
      projectLocation,
      mcpServers: [poracode, browser],
    });
    const terminal = await acquireOpenCodeServer({
      projectLocation,
      mcpServers: [poracode, browser],
    });
    const sibling = await acquireOpenCodeServer({
      projectLocation,
      mcpServers: [poracode, linear],
    });

    expect(mocks.spawnOpenCodeServer).toHaveBeenCalledTimes(1);
    expect(terminal.handle).toBe(gui.handle);
    expect(sibling.handle).toBe(gui.handle);
    expect(gui.getDirectoryMcpNames().sort()).toEqual(["browser", "linear", "poracode"]);
    expect(listener).toHaveBeenCalled();

    // Terminal PTY lease holds the server alive after preparation disposes.
    await preparation.dispose();
    await vi.advanceTimersByTimeAsync(30_001);
    expect(sharedHandle.dispose).not.toHaveBeenCalled();

    // Disposing sibling removes linear immediately because the server stays up for remaining leases.
    await sibling.dispose({ closeServerIfIdle: true });
    expect(client.experimental.mcp.remove).toHaveBeenCalledWith({
      server: "linear",
      location: { directory: "/repo" },
    });
    expect(gui.getDirectoryMcpNames().sort()).toEqual(["browser", "poracode"]);
    expect(sharedHandle.dispose).not.toHaveBeenCalled();

    unsubscribe();
    await terminal.dispose();
    await gui.dispose({ closeServerIfIdle: true });
    expect(sharedHandle.dispose).toHaveBeenCalledOnce();
  });

  it("keeps directory MCP state untouched when one lease disposes without closeServerIfIdle", async () => {
    const sharedHandle = makeHandle("http://127.0.0.1:4301");
    const client = makeClientStub();
    mocks.spawnOpenCodeServer.mockReturnValue(sharedHandle);
    mocks.makeOpenCodeClient.mockReturnValue(client);
    const { acquireOpenCodeServer } = await import("./client");
    const projectLocation = { kind: "posix", path: "/repo" } as const;

    const first = await acquireOpenCodeServer({
      projectLocation,
      mcpServers: [remoteMcp("browser", "http://127.0.0.1:9321/mcp")],
    });
    const second = await acquireOpenCodeServer({
      projectLocation,
      mcpServers: [remoteMcp("linear", "http://127.0.0.1:9400/mcp")],
    });

    // When disposing the only lease holding `browser` while the server stays warm,
    // `browser` is removed before releaseLease.
    await first.dispose();
    expect(client.experimental.mcp.remove).toHaveBeenCalledExactlyOnceWith({
      server: "browser",
      location: { directory: "/repo" },
    });
    expect(second.getDirectoryMcpNames()).toEqual(["linear"]);

    // Final closeServerIfIdle shuts the server down directly without redundant mcp.remove RPCs.
    vi.mocked(client.experimental.mcp.remove).mockClear();
    await second.dispose({ closeServerIfIdle: true });
    expect(client.experimental.mcp.remove).not.toHaveBeenCalled();
    expect(sharedHandle.dispose).toHaveBeenCalledOnce();
  });

  it.each([
    { database: "native" as const, interruptFails: false },
    { database: "legacy-isolated" as const, interruptFails: true },
  ])(
    "fences $database resume through interrupt and disposal, even on failure",
    async ({ database, interruptFails }) => {
      const interrupt = Promise.withResolvers<SessionInterruptResponse>();
      const disposal = Promise.withResolvers<void>();
      const oldHandle = makeHandle("http://127.0.0.1:4300");
      oldHandle.dispose.mockReturnValue(disposal.promise);
      const client = makeClientStub();
      const interruptSession = vi
        .fn<OpenCodeClient["session"]["interrupt"]>()
        .mockReturnValue(interrupt.promise);
      client.session.interrupt = interruptSession;
      mocks.makeOpenCodeClient.mockReturnValueOnce(client);
      mocks.spawnOpenCodeServer
        .mockReturnValueOnce(oldHandle)
        .mockReturnValueOnce(makeHandle("http://127.0.0.1:4301"));
      const { acquireOpenCodeServer, retireOpenCodeTerminalServer } = await import("./client");
      const { rememberOpenCodeSessionDatabase } = await import("./database");
      const location = { kind: "posix", path: "/repo" } as const;
      rememberOpenCodeSessionDatabase(location, "ses_retiring", database);
      const old = await acquireOpenCodeServer({
        projectLocation: location,
        database,
        mcpServers: [],
      });
      const retirement = retireOpenCodeTerminalServer(location, "ses_retiring", old);
      const retirementOutcome = retirement.then(
        () => null,
        (error: unknown) => error,
      );
      let resumed = false;
      // A session spans directories; changing cwd cannot escape its old interrupt.
      const successor = acquireOpenCodeServer({
        projectLocation: { ...location, path: "/other" },
        resumeSessionId: "ses_retiring",
        mcpServers: [],
      }).then((value) => {
        resumed = true;
        return value;
      });
      await vi.waitFor(() => expect(interruptSession).toHaveBeenCalledOnce());
      expect(resumed).toBe(false);
      expect(mocks.spawnOpenCodeServer).toHaveBeenCalledOnce();
      if (interruptFails) interrupt.reject(new Error("interrupt failed"));
      else interrupt.resolve({ interrupted: true });
      await vi.waitFor(() => expect(oldHandle.dispose).toHaveBeenCalledOnce());
      expect(resumed).toBe(false);
      disposal.resolve();
      expect(await retirementOutcome).toEqual(
        interruptFails ? new Error("interrupt failed") : null,
      );
      const acquired = await successor;
      expect(acquired.database).toBe(database);
      expect(mocks.spawnOpenCodeServer).toHaveBeenCalledTimes(2);
      await acquired.dispose({ closeServerIfIdle: true });
    },
  );

  it("keeps a resume fenced through overlapping terminal retirements", async () => {
    const first = Promise.withResolvers<void>();
    const second = Promise.withResolvers<void>();
    const { acquireOpenCodeServer, retireOpenCodeTerminalServer } = await import("./client");
    const { rememberOpenCodeSessionDatabase } = await import("./database");
    const location = { kind: "posix", path: "/repo" } as const;
    rememberOpenCodeSessionDatabase(location, "ses_overlap", "native");
    const dispose = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const retiring = (completion: Promise<void>) =>
      ({
        client: { session: { interrupt: () => completion } },
        dispose,
      }) as unknown as Awaited<ReturnType<typeof acquireOpenCodeServer>>;
    const old = retireOpenCodeTerminalServer(location, "ses_overlap", retiring(first.promise));
    const latest = retireOpenCodeTerminalServer(location, "ses_overlap", retiring(second.promise));
    mocks.spawnOpenCodeServer.mockReturnValue(makeHandle("http://127.0.0.1:4300"));
    const successor = acquireOpenCodeServer({
      projectLocation: location,
      resumeSessionId: "ses_overlap",
    });
    first.resolve();
    await old;
    expect(mocks.spawnOpenCodeServer).not.toHaveBeenCalled();
    second.resolve();
    await latest;
    const acquired = await successor;
    expect(dispose).toHaveBeenCalledTimes(2);
    await acquired.dispose({ closeServerIfIdle: true });
  });

  it("pools WSL directories by distro and confirms reachability first", async () => {
    const ubuntuHandle = makeHandle("http://127.0.0.1:4400");
    const debianHandle = makeHandle("http://127.0.0.1:4401");
    mocks.spawnOpenCodeServer.mockReturnValueOnce(ubuntuHandle).mockReturnValueOnce(debianHandle);
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const { acquireOpenCodeServer } = await import("./client");
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
    // A 401 still proves the localhost relay round-trips.
    expect(fetchMock).toHaveBeenCalled();

    await ubuntuA.dispose();
    await ubuntuB.dispose();
    await debian.dispose();
  });

  it("does not poll reachability for a native server", async () => {
    const handle = makeHandle("http://127.0.0.1:4410");
    mocks.spawnOpenCodeServer.mockReturnValue(handle);
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const { acquireOpenCodeServer } = await import("./client");
    const acquired = await acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo" },
    });

    expect(fetchMock).not.toHaveBeenCalled();
    await acquired.dispose();
  });

  it("stops the shared sidecar after its last lease stays idle", async () => {
    vi.useFakeTimers();
    const handle = makeHandle("http://127.0.0.1:4350");
    mocks.spawnOpenCodeServer.mockReturnValue(handle);

    const { acquireOpenCodeServer } = await import("./client");
    const first = await acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo-a" },
    });
    const second = await acquireOpenCodeServer({
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

    await acquireOpenCodeServer({ projectLocation: { kind: "posix", path: "/repo-c" } });
    expect(mocks.spawnOpenCodeServer).toHaveBeenCalledTimes(2);
  });

  it("closes the shared sidecar immediately when the last probe lease is released", async () => {
    const handle = makeHandle("http://127.0.0.1:4375");
    mocks.spawnOpenCodeServer.mockReturnValue(handle);

    const { acquireOpenCodeServer } = await import("./client");
    const activeSession = await acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo-active" },
    });
    const probe = await acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo-probe" },
    });

    await probe.dispose({ closeServerIfIdle: true });
    expect(handle.dispose).not.toHaveBeenCalled();

    await activeSession.dispose({ closeServerIfIdle: true });
    expect(handle.dispose).toHaveBeenCalledOnce();
  });

  it("keeps the sidecar alive for an acquisition that is still starting", async () => {
    const handle = makeHandle("http://127.0.0.1:4380");
    mocks.spawnOpenCodeServer.mockReturnValue(handle);

    const { acquireOpenCodeServer } = await import("./client");
    const probe = await acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo-probe" },
    });
    const sessionPromise = acquireOpenCodeServer({
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
    mocks.spawnOpenCodeServer.mockReturnValueOnce(failed).mockReturnValueOnce(recovered);

    const { acquireOpenCodeServer } = await import("./client");
    await expect(
      acquireOpenCodeServer({ projectLocation: { kind: "posix", path: "/repo" } }),
    ).rejects.toThrow("database is locked");
    await new Promise((resolve) => setImmediate(resolve));

    expect(failed.dispose).toHaveBeenCalledOnce();

    const acquired = await acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo" },
    });
    expect(mocks.spawnOpenCodeServer).toHaveBeenCalledTimes(2);
    await acquired.dispose();
  });

  it("evicts a crashed server, notifies lease holders, and respawns fresh", async () => {
    const crashed = makeHandle("http://127.0.0.1:4420");
    const fresh = makeHandle("http://127.0.0.1:4421");
    mocks.spawnOpenCodeServer.mockReturnValueOnce(crashed).mockReturnValueOnce(fresh);

    const { acquireOpenCodeServer } = await import("./client");
    const acquired = await acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo" },
    });
    const onServerExit = vi.fn<() => void>();
    const unsubscribe = acquired.onServerExit?.(onServerExit);

    (crashed.child as unknown as EventEmitter).emit("exit", 137, null);
    await new Promise((resolve) => setImmediate(resolve));
    expect(onServerExit).toHaveBeenCalledOnce();

    const next = await acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo" },
    });
    expect(mocks.spawnOpenCodeServer).toHaveBeenCalledTimes(2);
    expect(next.baseUrl).toBe("http://127.0.0.1:4421");

    unsubscribe?.();
    await next.dispose();
  });

  it("registers resolved MCP servers through the V2 add endpoint", async () => {
    const handle = makeHandle("http://127.0.0.1:4500");
    const client = makeClientStub();
    mocks.spawnOpenCodeServer.mockReturnValue(handle);
    mocks.makeOpenCodeClient.mockReturnValue(client);

    const { acquireOpenCodeServer } = await import("./client");
    const acquired = await acquireOpenCodeServer({
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

    expect(client.experimental.mcp.add).toHaveBeenNthCalledWith(1, {
      server: "browser",
      location: { directory: "/repo" },
      config: {
        type: "remote",
        url: "http://127.0.0.1:9321/mcp",
        headers: { Authorization: "Bearer token" },
        timeout: { execution: 30_000 },
      },
    });
    expect(client.experimental.mcp.add).toHaveBeenNthCalledWith(2, {
      server: "memory",
      location: { directory: "/repo" },
      config: {
        type: "local",
        command: ["npx", "-y", "memory-server"],
        environment: { MEMORY_FILE: "/tmp/memory.json" },
        timeout: { execution: 10_000 },
      },
    });
    expect(client.experimental.mcp.add).toHaveBeenNthCalledWith(3, {
      server: "legacy",
      location: { directory: "/repo" },
      config: { type: "remote", url: "http://127.0.0.1:9402/sse", timeout: { execution: 30_000 } },
    });
    expect(client.experimental.mcp.remove).not.toHaveBeenCalled();

    await acquired.dispose();
  });

  it("leaves managed MCP state unchanged when a caller omits mcpServers", async () => {
    const handle = makeHandle("http://127.0.0.1:4600");
    const settingsClient = makeClientStub();
    const oneShotClient = makeClientStub();
    mocks.spawnOpenCodeServer.mockReturnValue(handle);
    mocks.makeOpenCodeClient.mockReturnValueOnce(settingsClient).mockReturnValueOnce(oneShotClient);

    const { acquireOpenCodeServer } = await import("./client");
    const settings = await acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo" },
      mcpServers: [remoteMcp("browser", "http://127.0.0.1:9321/mcp")],
    });
    const oneShot = await acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo" },
    });

    expect(oneShotClient.experimental.mcp.add).not.toHaveBeenCalled();
    expect(oneShotClient.experimental.mcp.remove).not.toHaveBeenCalled();

    await settings.dispose();
    await oneShot.dispose();
  });

  it("keeps MCP state isolated per location directory", async () => {
    const handle = makeHandle("http://127.0.0.1:4610");
    const client = makeClientStub();
    mocks.spawnOpenCodeServer.mockReturnValue(handle);
    mocks.makeOpenCodeClient.mockReturnValue(client);

    const { acquireOpenCodeServer } = await import("./client");
    const first = await acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo-a" },
      mcpServers: [remoteMcp("browser", "http://127.0.0.1:9321/mcp")],
    });
    const second = await acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo-b" },
      mcpServers: [],
    });

    expect(client.experimental.mcp.add).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ location: { directory: "/repo-a" } }),
    );

    await first.dispose();
    await second.dispose();
  });

  it("removes servers dropped from the set instead of disposing the location", async () => {
    const handle = makeHandle("http://127.0.0.1:4620");
    const client = makeClientStub();
    mocks.spawnOpenCodeServer.mockReturnValue(handle);
    mocks.makeOpenCodeClient.mockReturnValue(client);

    const { acquireOpenCodeServer } = await import("./client");
    const acquired = await acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo" },
      mcpServers: [
        remoteMcp("browser", "http://127.0.0.1:9321/mcp"),
        remoteMcp("memory", "http://127.0.0.1:9500/mcp"),
      ],
    });
    await acquired.updateMcpServers([remoteMcp("browser", "http://127.0.0.1:9321/mcp")]);

    expect(client.experimental.mcp.remove).toHaveBeenCalledExactlyOnceWith({
      server: "memory",
      location: { directory: "/repo" },
    });
    // The surviving server's config is unchanged, so only the initial
    // acquire's two adds were ever issued.
    expect(client.experimental.mcp.add).toHaveBeenCalledTimes(2);
    expect(handle.dispose).not.toHaveBeenCalled();

    await acquired.dispose();
  });

  it("updates an existing MCP config in place and clears the set on an empty array", async () => {
    const handle = makeHandle("http://127.0.0.1:4630");
    const client = makeClientStub();
    mocks.spawnOpenCodeServer.mockReturnValue(handle);
    mocks.makeOpenCodeClient.mockReturnValue(client);

    const { acquireOpenCodeServer } = await import("./client");
    const acquired = await acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo" },
      mcpServers: [remoteMcp("browser", "http://127.0.0.1:9321/mcp")],
    });
    await acquired.updateMcpServers([remoteMcp("browser", "http://127.0.0.1:9399/mcp")]);
    await acquired.updateMcpServers([]);

    expect(client.experimental.mcp.add).toHaveBeenCalledTimes(2);
    expect(client.experimental.mcp.remove).toHaveBeenCalledExactlyOnceWith({
      server: "browser",
      location: { directory: "/repo" },
    });

    await acquired.dispose();
  });

  it("serializes concurrent MCP updates for the same location", async () => {
    const handle = makeHandle("http://127.0.0.1:4700");
    const client = {
      experimental: {
        mcp: {
          add: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
          remove: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        },
      },
    } as unknown as OpenCodeClient & {
      experimental: { mcp: { add: ReturnType<typeof vi.fn<() => Promise<void>>> } };
    };
    let markStarted!: () => void;
    let releaseAdd!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const blockedAdd = new Promise<void>((resolve) => {
      releaseAdd = resolve;
    });
    vi.mocked(client.experimental.mcp.add).mockImplementationOnce(async () => {
      markStarted();
      await blockedAdd;
    });
    mocks.spawnOpenCodeServer.mockReturnValue(handle);
    mocks.makeOpenCodeClient.mockReturnValue(client);

    const { acquireOpenCodeServer } = await import("./client");
    const firstPromise = acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo" },
      mcpServers: [remoteMcp("browser", "http://127.0.0.1:9321/mcp")],
    });
    await started;
    const secondPromise = firstPromise.then((first) => first.updateMcpServers([]));

    // The clear is queued behind the in-flight add, so nothing is removed yet.
    await Promise.resolve();
    expect(client.experimental.mcp.remove).not.toHaveBeenCalled();

    releaseAdd();
    const first = await firstPromise;
    await secondPromise;

    expect(client.experimental.mcp.remove).toHaveBeenCalledExactlyOnceWith({
      server: "browser",
      location: { directory: "/repo" },
    });
    await first.dispose();
  });

  it("waits for partially failed additions and revokes their attempted servers", async () => {
    const client = makeClientStub();
    mocks.spawnOpenCodeServer.mockReturnValue(makeHandle("http://127.0.0.1:4701"));
    mocks.makeOpenCodeClient.mockReturnValue(client);
    const { acquireOpenCodeServer } = await import("./client");
    const acquired = await acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo" },
      mcpServers: [],
    });
    const delayed = Promise.withResolvers<void>();
    vi.mocked(client.experimental.mcp.add)
      .mockImplementationOnce(() => delayed.promise)
      .mockRejectedValueOnce(new Error("invalid config"));
    const updating = acquired.updateMcpServers([
      remoteMcp("a", "http://localhost/a"),
      remoteMcp("b", "http://localhost/b"),
    ]);
    const failed = updating.catch((error: unknown) => error);
    await vi.waitFor(() => expect(client.experimental.mcp.add).toHaveBeenCalledTimes(2));
    const clearing = acquired.updateMcpServers([]);
    await Promise.resolve();
    expect(client.experimental.mcp.remove).not.toHaveBeenCalled();
    delayed.resolve();
    expect(await failed).toEqual(new Error("invalid config"));
    await clearing;
    expect(
      vi.mocked(client.experimental.mcp.remove).mock.calls.map(([input]) => input.server),
    ).toEqual(["a", "b"]);
    await acquired.dispose();
  });

  it("restores the previous config after a partially failed removal", async () => {
    const client = makeClientStub();
    mocks.spawnOpenCodeServer.mockReturnValue(makeHandle("http://127.0.0.1:4702"));
    mocks.makeOpenCodeClient.mockReturnValue(client);
    const { acquireOpenCodeServer } = await import("./client");
    const servers = [remoteMcp("a", "http://localhost/a"), remoteMcp("b", "http://localhost/b")];
    const acquired = await acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo" },
      mcpServers: servers,
    });
    vi.mocked(client.experimental.mcp.remove)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("remove failed"));
    await expect(acquired.updateMcpServers([])).rejects.toThrow("remove failed");
    vi.mocked(client.experimental.mcp.add).mockClear();
    await acquired.updateMcpServers(servers);
    expect(
      vi.mocked(client.experimental.mcp.add).mock.calls.map(([input]) => input.server),
    ).toEqual(["a", "b"]);
    await acquired.dispose();
  });

  it("respawns once when MCP sync hits a dead OpenCode server", async () => {
    const firstHandle = makeHandle("http://127.0.0.1:4096");
    const secondHandle = makeHandle("http://127.0.0.1:4097");
    const firstAdd = vi.fn<() => Promise<void>>().mockRejectedValue(new Error("fetch failed"));
    const secondAdd = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const firstClient = {
      experimental: { mcp: { add: firstAdd, remove: vi.fn<() => Promise<void>>() } },
    };
    const secondClient = {
      experimental: { mcp: { add: secondAdd, remove: vi.fn<() => Promise<void>>() } },
    };

    mocks.spawnOpenCodeServer.mockReturnValueOnce(firstHandle).mockReturnValueOnce(secondHandle);
    mocks.makeOpenCodeClient.mockReturnValueOnce(firstClient).mockReturnValueOnce(secondClient);

    const { acquireOpenCodeServer } = await import("./client");
    const acquired = await acquireOpenCodeServer({
      projectLocation: { kind: "posix", path: "/repo" },
      mcpServers: [remoteMcp("browser", "http://127.0.0.1:9321/mcp")],
    });

    expect(mocks.spawnOpenCodeServer).toHaveBeenCalledTimes(2);
    expect(firstAdd).toHaveBeenCalledTimes(1);
    expect(firstHandle.dispose).toHaveBeenCalledTimes(1);
    expect(secondAdd).toHaveBeenCalledTimes(1);
    expect(acquired.baseUrl).toBe("http://127.0.0.1:4097");

    await acquired.dispose();
    expect(secondHandle.dispose).not.toHaveBeenCalled();
  });

  it("shutdownSpawnedOpenCodeServers clears pool bookkeeping and disposes tracked spawns only", async () => {
    const { acquireOpenCodeServer, shutdownSpawnedOpenCodeServers } = await import("./client");
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
      acquireOpenCodeServer({ projectLocation: { kind: "windows", path: "C:\\repo" } }),
    ).resolves.toBeDefined();
    expect(mocks.spawnOpenCodeServer).toHaveBeenCalledTimes(2);
  });
});
