import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedMcpServer } from "@/shared/contracts";
import type { CreateStructuredSessionInput } from "../base";

const mocks = vi.hoisted(() => ({
  spawn: vi.fn<(...args: unknown[]) => unknown>(),
  terminateChildProcessTree: vi.fn<(child: unknown) => void>(),
}));

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: mocks.spawn,
}));
vi.mock("@/shared/processTree", () => ({
  terminateChildProcessTree: mocks.terminateChildProcessTree,
}));
vi.mock("./argv", () => ({
  buildCodexAppServerCommand: () => ({
    command: process.execPath,
    args: [],
  }),
}));
vi.mock("./mcpSkillConflicts", () => ({
  buildCodexMcpSkillConflictArgs: () => [],
}));

import {
  acquireCodexAppServer,
  codexAppServerPoolKey,
  shutdownSpawnedCodexAppServers,
} from "./serverPool";

function fakeChildProcess() {
  return Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    exitCode: null,
    killed: false,
  });
}

function browserServer(threadId: string, baseUrl = "http://127.0.0.1:9000"): ResolvedMcpServer {
  return {
    id: "browser",
    name: "browser",
    timeoutMs: 30_000,
    transport: {
      type: "http",
      url: `${baseUrl}/mcp?thread=${threadId}&title=task`,
      headers: { Authorization: "Bearer shared-token" },
    },
  };
}

function httpServer(id: string, url: string, token = "shared-token"): ResolvedMcpServer {
  return {
    id,
    name: id,
    timeoutMs: 30_000,
    transport: {
      type: "http",
      url,
      headers: { Authorization: `Bearer ${token}` },
    },
  };
}

function input(threadId: string, server: ResolvedMcpServer): CreateStructuredSessionInput {
  return {
    threadId,
    projectLocation: { kind: "windows", path: "C:\\repo" },
    config: { model: "gpt-5.6" },
    mcpServers: [server],
    presentationMode: "gui",
  };
}

describe("Codex app-server pool", () => {
  beforeEach(() => {
    mocks.spawn.mockReset();
    mocks.terminateChildProcessTree.mockReset();
    mocks.spawn.mockImplementation(() => fakeChildProcess());
  });

  afterEach(() => {
    shutdownSpawnedCodexAppServers();
  });

  it("reuses one process when only thread-scoped MCP query values differ", async () => {
    const first = await acquireCodexAppServer(input("local-a", browserServer("local-a")));
    const secondInput = {
      ...input("local-b", browserServer("local-b")),
      projectLocation: { kind: "windows" as const, path: "D:\\other-repo" },
    };
    const second = await acquireCodexAppServer(secondInput);

    expect(mocks.spawn).toHaveBeenCalledOnce();
    expect(second.connection).toBe(first.connection);

    first.dispose();
    expect(mocks.terminateChildProcessTree).not.toHaveBeenCalled();
    second.dispose();
    expect(mocks.terminateChildProcessTree).toHaveBeenCalledOnce();
  });

  it("starts a fresh process after the final lease is released", async () => {
    const launch = input("local-a", browserServer("local-a"));
    const first = await acquireCodexAppServer(launch);

    first.dispose();
    await acquireCodexAppServer(launch);

    expect(mocks.spawn).toHaveBeenCalledTimes(2);
  });

  it("does not reuse a process across different MCP endpoints", async () => {
    await acquireCodexAppServer(input("local-a", browserServer("local-a")));
    await acquireCodexAppServer(
      input("local-b", browserServer("local-b", "http://127.0.0.1:9100")),
    );

    expect(mocks.spawn).toHaveBeenCalledTimes(2);
  });

  it("keeps incompatible execution runtimes in separate pools", () => {
    const server = browserServer("local-a");
    const windows = codexAppServerPoolKey({ kind: "windows", path: "C:\\repo" }, [server]);
    const posix = codexAppServerPoolKey({ kind: "posix", path: "/repo" }, [server]);
    const ubuntu = codexAppServerPoolKey(
      { kind: "wsl", distro: "Ubuntu", linuxPath: "/repo", uncPath: "\\\\wsl$\\Ubuntu\\repo" },
      [server],
    );
    const debian = codexAppServerPoolKey(
      { kind: "wsl", distro: "Debian", linuxPath: "/repo", uncPath: "\\\\wsl$\\Debian\\repo" },
      [server],
    );

    expect(new Set([windows, posix, ubuntu, debian])).toHaveLength(4);
  });

  it("reuses a pool across project roots within the same execution runtime", () => {
    expect(
      codexAppServerPoolKey({ kind: "windows", path: "C:\\repo-a" }, [browserServer("local-a")]),
    ).toBe(
      codexAppServerPoolKey({ kind: "windows", path: "D:\\repo-b" }, [browserServer("local-b")]),
    );
    expect(
      codexAppServerPoolKey({ kind: "posix", path: "/repo-a" }, [browserServer("local-a")]),
    ).toBe(codexAppServerPoolKey({ kind: "posix", path: "/repo-b" }, [browserServer("local-b")]));
    expect(
      codexAppServerPoolKey(
        {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/repo-a",
          uncPath: "\\\\wsl$\\Ubuntu\\repo-a",
        },
        [browserServer("local-a")],
        "C:\\Windows\\System32\\wsl.exe",
        "/usr/bin/node",
      ),
    ).toBe(
      codexAppServerPoolKey(
        {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/repo-b",
          uncPath: "\\\\wsl$\\Ubuntu\\repo-b",
        },
        [browserServer("local-b")],
        "C:\\Windows\\System32\\wsl.exe",
        "/usr/bin/node",
      ),
    );
  });

  it("keeps different WSL launch runtimes in separate pools", () => {
    const location = {
      kind: "wsl" as const,
      distro: "Ubuntu",
      linuxPath: "/repo",
      uncPath: "\\\\wsl$\\Ubuntu\\repo",
    };
    const server = browserServer("local-a");
    const baseline = codexAppServerPoolKey(location, [server], "wsl.exe", "/usr/bin/node");

    expect(codexAppServerPoolKey(location, [server], "other-wsl.exe", "/usr/bin/node")).not.toBe(
      baseline,
    );
    expect(codexAppServerPoolKey(location, [server], "wsl.exe", "/opt/node/bin/node")).not.toBe(
      baseline,
    );
  });

  it.each(["app-controls", "browser", "chrome", "computer-use"])(
    "normalizes thread-scoped query values for %s",
    (id) => {
      const first = httpServer(
        id,
        `http://127.0.0.1:9000/mcp?thread=local-a&title=first&disable=one&stable=yes`,
      );
      const second = httpServer(
        id,
        `http://127.0.0.1:9000/mcp?thread=local-b&title=second&disable=two&stable=yes`,
      );

      expect(codexAppServerPoolKey({ kind: "windows", path: "C:\\repo" }, [first])).toBe(
        codexAppServerPoolKey({ kind: "windows", path: "C:\\repo" }, [second]),
      );
    },
  );

  it("does not normalize custom MCP query values", () => {
    const first = httpServer("custom", "http://127.0.0.1:9000/mcp?thread=local-a");
    const second = httpServer("custom", "http://127.0.0.1:9000/mcp?thread=local-b");

    expect(codexAppServerPoolKey({ kind: "windows", path: "C:\\repo" }, [first])).not.toBe(
      codexAppServerPoolKey({ kind: "windows", path: "C:\\repo" }, [second]),
    );
  });

  it("does not reuse a pool when MCP credentials differ", () => {
    const first = httpServer("browser", "http://127.0.0.1:9000/mcp?thread=local-a", "token-a");
    const second = httpServer("browser", "http://127.0.0.1:9000/mcp?thread=local-b", "token-b");

    expect(codexAppServerPoolKey({ kind: "windows", path: "C:\\repo" }, [first])).not.toBe(
      codexAppServerPoolKey({ kind: "windows", path: "C:\\repo" }, [second]),
    );
  });

  it("evicts an exited process before the next acquisition", async () => {
    const firstChild = fakeChildProcess();
    mocks.spawn.mockImplementationOnce(() => firstChild);
    const launch = input("local-a", browserServer("local-a"));

    await acquireCodexAppServer(launch);
    firstChild.emit("exit", 1);
    await acquireCodexAppServer(launch);

    expect(mocks.spawn).toHaveBeenCalledTimes(2);
  });

  it("evicts a failed spawn so the next acquisition can retry", async () => {
    mocks.spawn.mockImplementationOnce(() => {
      const child = fakeChildProcess();
      queueMicrotask(() => child.emit("error", new Error("spawn failed")));
      return child;
    });

    const launch = input("local-a", browserServer("local-a"));
    await expect(acquireCodexAppServer(launch)).rejects.toThrow(
      "Codex app-server failed to spawn: spawn failed",
    );
    await acquireCodexAppServer(launch);

    expect(mocks.spawn).toHaveBeenCalledTimes(2);
  });
});
