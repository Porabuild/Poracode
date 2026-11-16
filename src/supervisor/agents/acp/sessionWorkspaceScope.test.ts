import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { spawn as spawnChild } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import {
  RequestError,
  type CreateTerminalRequest,
  type ReadTextFileRequest,
  type WriteTextFileRequest,
} from "@agentclientprotocol/sdk";
import type { ProjectLocation } from "@/shared/contracts";
import { makeConfigSyncSession } from "./sessionTestFixture";
import { snapshotAcpAdditionalDirectories } from "./sessionWorkspaceRoots";

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: vi.fn<() => import("node:child_process").ChildProcess>(
    () =>
      Object.assign(new EventEmitter(), {
        stdout: new PassThrough(),
        stderr: new PassThrough(),
      }) as unknown as import("node:child_process").ChildProcess,
  ),
}));

const cleanup: string[] = [];
afterEach(() => {
  for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});
function fixture(retry = false) {
  const base = mkdtempSync(join(tmpdir(), "acp-scope-"));
  cleanup.push(base);
  for (const name of ["primary", "extra-a", "extra-b", "denied", "extra-a-prefix"])
    mkdirSync(join(base, name));
  const location = (name: string): ProjectLocation => ({
    kind: process.platform === "win32" ? "windows" : "posix",
    path: join(base, name),
  });
  const test = makeConfigSyncSession(
    retry
      ? {
          agentMcpCapabilities: undefined,
          assumedMcpCapabilities: { http: true },
          mcpServers: [
            {
              id: "test",
              name: "test",
              timeoutMs: 1000,
              transport: { type: "http", url: "http://127.0.0.1:1234/mcp", headers: {} },
            },
          ],
        }
      : {},
  );
  const internal = test.session as unknown as Record<string, unknown>;
  internal.projectLocation = location("primary");
  internal.cwd = join(base, "primary");
  internal.additionalDirectories = snapshotAcpAdditionalDirectories(location("primary"), [
    location("extra-a"),
    location("extra-b"),
  ]);
  internal.agentSessionCapabilities = { additionalDirectories: {} };
  const handlers = test.session as unknown as {
    activate(): Promise<void>;
    handleCreateTerminal(params: CreateTerminalRequest): Promise<{ terminalId: string }>;
    handleReadTextFile(params: ReadTextFileRequest): Promise<{ content: string }>;
    handleWriteTextFile(params: WriteTextFileRequest): Promise<unknown>;
  };
  return { ...test, internal, handlers, base, location };
}
const ref = { providerSessionId: "session-1", discoveredAt: "2026-10-08T00:00:00Z" };

describe("ACP immutable workspace lifecycle", () => {
  it.each([undefined, {}, { additionalDirectories: null }])(
    "fails activation/open without authoritative support (%j)",
    async (capability) => {
      const { session, handlers, internal, connection } = fixture();
      internal.agentSessionCapabilities = capability;
      await expect(handlers.activate()).rejects.toThrow("does not support");
      await expect(session.openThread({ model: "test" })).rejects.toThrow("does not support");
      expect(connection.newSession).not.toHaveBeenCalled();
    },
  );

  it.each(["new", "load", "resume"] as const)(
    "sends the complete list on %s and reopen, including MCP retry",
    async (kind) => {
      const { session, internal, connection, base } = fixture(true);
      if (kind === "resume")
        internal.agentSessionCapabilities = { additionalDirectories: {}, resume: {} };
      const rpc =
        kind === "new"
          ? connection.newSession
          : kind === "load"
            ? connection.loadSession
            : connection.resumeSession;
      rpc.mockRejectedValueOnce(
        RequestError.internalError({ message: "MCP server transport is unsupported" }),
      );
      await session.openThread({ model: "test" }, kind === "new" ? undefined : ref);
      await session.openThread({ model: "test" }, kind === "new" ? undefined : ref);
      expect(rpc).toHaveBeenCalledTimes(3);
      for (const [params] of rpc.mock.calls)
        expect(params).toMatchObject({
          cwd: join(base, "primary"),
          additionalDirectories: [join(base, "extra-a"), join(base, "extra-b")],
        });
      expect(rpc.mock.calls[1]?.[0].mcpServers).toEqual([]);
    },
  );

  it("uses initialize's standard capability and rejects invalid directories before session/new", async () => {
    const { session, internal, handlers, connection, base } = fixture();
    connection.initialize.mockResolvedValue({
      protocolVersion: 1,
      agentCapabilities: { sessionCapabilities: { additionalDirectories: {} } },
    } as { protocolVersion: number });
    internal.agentSessionCapabilities = undefined;
    await handlers.activate();
    rmSync(join(base, "extra-a"), { recursive: true });
    await expect(session.openThread({ model: "test" })).rejects.toMatchObject({ code: "ENOENT" });
    expect(connection.newSession).not.toHaveBeenCalled();
  });

  it("empty legacy grants omit the field on all three open methods", async () => {
    for (const kind of ["new", "load", "resume"] as const) {
      const { session, internal, connection } = fixture();
      internal.additionalDirectories = [];
      internal.agentSessionCapabilities = kind === "resume" ? { resume: {} } : undefined;
      await session.openThread({ model: "test" }, kind === "new" ? undefined : ref);
      const rpc =
        kind === "new"
          ? connection.newSession
          : kind === "load"
            ? connection.loadSession
            : connection.resumeSession;
      expect(rpc.mock.calls[0]?.[0]).not.toHaveProperty("additionalDirectories");
    }
  });
});

describe("ACP approved text filesystem scope", () => {
  it("rejects terminal creates after Stop until a fresh turn is accepted", async () => {
    const { session, handlers, connection } = fixture();
    let completeCancel!: () => void;
    let completePrompt!: (result: { stopReason: string }) => void;
    connection.prompt.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          completePrompt = resolve;
        }),
    );
    connection.cancel.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          completeCancel = resolve;
        }),
    );
    const activeTurn = session.startTurn("old turn", { model: "test" });
    await vi.waitFor(() => {
      expect(connection.prompt).toHaveBeenCalledOnce();
    });
    vi.mocked(spawnChild).mockClear();
    const interrupt = session.interruptTurn();
    const params = { sessionId: "session-1", command: "test-command", args: ["argument"] };
    await expect(handlers.handleCreateTerminal(params)).rejects.toMatchObject({ code: -32602 });
    expect(spawnChild).not.toHaveBeenCalled();
    completeCancel();
    await interrupt;
    completePrompt({ stopReason: "cancelled" });
    await activeTurn;
    await expect(handlers.handleCreateTerminal(params)).rejects.toMatchObject({ code: -32602 });
    await session.startTurn("next turn", { model: "test" });
    await expect(handlers.handleCreateTerminal(params)).resolves.toHaveProperty("terminalId");
    expect(spawnChild).toHaveBeenCalledOnce();
  });

  it("preserves the explicit Home exception outside all workspace roots", async () => {
    const { handlers, internal, base } = fixture();
    internal.projectLocation = {
      kind: process.platform === "win32" ? "windows" : "posix",
      path:
        process.platform === "win32"
          ? "C:\\Users\\poracode-home-scope"
          : "/Users/poracode-home-scope",
    };
    const path = join(base, "denied", "home-scope-file");
    await handlers.handleWriteTextFile({ sessionId: "session-1", path, content: "home" });
    expect(await handlers.handleReadTextFile({ sessionId: "session-1", path })).toEqual({
      content: "home",
    });
  });

  it.skipIf(process.platform === "win32")(
    "passes the same snapshot to terminal creation and defaults its cwd to primary",
    async () => {
      const { handlers, base } = fixture();
      vi.mocked(spawnChild).mockClear();
      mkdirSync(join(base, "primary", "subdir"));
      for (const cwd of [undefined, join(base, "extra-a"), "subdir"]) {
        await handlers.handleCreateTerminal({
          sessionId: "session-1",
          command: "test-command",
          args: ["argument"],
          ...(cwd ? { cwd } : {}),
        });
      }
      expect(vi.mocked(spawnChild).mock.calls.map((call) => call[2]?.cwd)).toEqual([
        join(base, "primary"),
        join(base, "extra-a"),
        join(base, "primary", "subdir"),
      ]);
      await expect(
        handlers.handleCreateTerminal({
          sessionId: "session-1",
          command: "test-command",
          cwd: join(base, "denied"),
        }),
      ).rejects.toThrow("Invalid params");
      expect(spawnChild).toHaveBeenCalledTimes(3);
    },
  );

  it.skipIf(process.platform === "win32")(
    "rejects a symlink cwd escaping to an unapproved sibling before spawn",
    async () => {
      const { handlers, base } = fixture();
      vi.mocked(spawnChild).mockClear();
      symlinkSync(join(base, "denied"), join(base, "primary", "escape"));
      await expect(
        handlers.handleCreateTerminal({
          sessionId: "session-1",
          command: "test-command",
          cwd: join(base, "primary", "escape"),
        }),
      ).rejects.toMatchObject({ code: -32602 });
      expect(spawnChild).not.toHaveBeenCalled();
      symlinkSync(join(base, "extra-b"), join(base, "primary", "granted"));
      await handlers.handleCreateTerminal({
        sessionId: "session-1",
        command: "test-command",
        cwd: join(base, "primary", "granted"),
      });
      expect(spawnChild).toHaveBeenCalledOnce();
    },
  );

  it("requires an existing directory for terminal cwd", async () => {
    const { handlers, base } = fixture();
    vi.mocked(spawnChild).mockClear();
    const file = join(base, "extra-a", "file");
    writeFileSync(file, "fixture");
    await expect(
      handlers.handleCreateTerminal({ sessionId: "session-1", command: "test-command", cwd: file }),
    ).rejects.toMatchObject({ code: -32602 });
    await expect(
      handlers.handleCreateTerminal({
        sessionId: "session-1",
        command: "test-command",
        cwd: join(base, "extra-a", "missing"),
      }),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(spawnChild).not.toHaveBeenCalled();
  });

  it.each(["isDisposed", "transportClosed", "sessionId", "sessionGeneration"])(
    "does not spawn if %s changes while cwd validation awaits",
    async (field) => {
      const { handlers, internal } = fixture();
      vi.mocked(spawnChild).mockClear();
      const pending = handlers.handleCreateTerminal({
        sessionId: "session-1",
        command: "test-command",
      });
      internal[field] =
        field === "sessionId" ? "successor" : field === "sessionGeneration" ? 1 : true;
      await expect(pending).rejects.toMatchObject({ code: -32602 });
      expect(spawnChild).not.toHaveBeenCalled();
    },
  );

  it("reads/writes granted siblings while relative paths keep the primary base", async () => {
    const { handlers, base } = fixture();
    for (const name of ["primary", "extra-a", "extra-b"]) {
      const path = join(base, name, "marker");
      await handlers.handleWriteTextFile({ sessionId: "session-1", path, content: name });
      expect(await handlers.handleReadTextFile({ sessionId: "session-1", path })).toEqual({
        content: name,
      });
    }
    expect(await handlers.handleReadTextFile({ sessionId: "session-1", path: "marker" })).toEqual({
      content: "primary",
    });
    await handlers.handleWriteTextFile({
      sessionId: "session-1",
      path: "relative",
      content: "primary",
    });
    expect(readFileSync(join(base, "primary", "relative"), "utf8")).toBe("primary");
  });

  it("denies sibling traversal/prefix matches and notification-reported roots", async () => {
    const { session, handlers, base } = fixture();
    session.handleSessionUpdate({
      update: {
        sessionUpdate: "config_option_update",
        configOptions: [
          {
            id: "directories",
            name: "Directories",
            type: "select",
            currentValue: JSON.stringify([join(base, "denied")]),
            options: [],
          },
        ],
      },
    });
    for (const path of [
      "../denied/marker",
      join(base, "extra-a-prefix", "marker"),
      join(base, "extra-a", "..", "denied", "marker"),
    ]) {
      await expect(
        handlers.handleReadTextFile({ sessionId: "session-1", path }),
      ).rejects.toMatchObject({ code: -32602 });
      await expect(
        handlers.handleWriteTextFile({ sessionId: "session-1", path, content: "denied" }),
      ).rejects.toMatchObject({ code: -32602 });
    }
  });

  it.skipIf(process.platform === "win32")(
    "denies symlinks to an unapproved sibling, including new writes below links",
    async () => {
      const { handlers, base } = fixture();
      writeFileSync(join(base, "denied", "marker"), "unchanged");
      symlinkSync(join(base, "denied"), join(base, "primary", "escape"));
      symlinkSync(join(base, "denied", "missing"), join(base, "extra-a", "dangling"));
      for (const path of [
        join(base, "primary", "escape", "marker"),
        join(base, "primary", "escape", "new-file"),
        join(base, "primary", "escape", "missing-dir", "new-file"),
        join(base, "extra-a", "dangling", "new-file"),
      ]) {
        await expect(
          handlers.handleReadTextFile({ sessionId: "session-1", path }),
        ).rejects.toMatchObject({ code: -32602 });
        await expect(
          handlers.handleWriteTextFile({ sessionId: "session-1", path, content: "denied" }),
        ).rejects.toMatchObject({ code: -32602 });
      }
      expect(readFileSync(join(base, "denied", "marker"), "utf8")).toBe("unchanged");
      symlinkSync(join(base, "extra-b"), join(base, "extra-a", "granted-link"));
      await handlers.handleWriteTextFile({
        sessionId: "session-1",
        path: join(base, "extra-a", "granted-link", "new-file"),
        content: "granted",
      });
      expect(readFileSync(join(base, "extra-b", "new-file"), "utf8")).toBe("granted");
    },
  );
});
