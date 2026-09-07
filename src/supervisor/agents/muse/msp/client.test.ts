import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { terminateChildProcessTree } from "@/shared/processTree";
import { MuseMspClient, spawnMuseServeHost } from "./client";
import { MspRpcError } from "./protocol";
import type { MuseMspTransport, MuseMspTransportListener } from "./stdioTransport";
import { MuseMspStdioTransport } from "./stdioTransport";
import type {
  MspRpcErrorFrame,
  MspRpcNotification,
  MspRpcRequest,
  MspRpcSuccess,
} from "./protocol";

const spawnMock = vi.hoisted(() =>
  vi.fn<(command: string, args: string[], options?: Record<string, unknown>) => unknown>(),
);

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return { ...actual, spawn: spawnMock };
});

vi.mock("@/shared/processTree", () => ({
  terminateChildProcessTree: vi.fn<(child: unknown) => void>(),
}));

class FakeTransport implements MuseMspTransport {
  readonly written: Array<MspRpcRequest | MspRpcNotification | MspRpcSuccess | MspRpcErrorFrame> =
    [];
  listener: MuseMspTransportListener | undefined;
  disposed = false;
  writeBehavior: "ok" | "throw" = "ok";

  setListener(listener: MuseMspTransportListener): void {
    this.listener = listener;
  }

  write(message: MspRpcRequest | MspRpcNotification | MspRpcSuccess | MspRpcErrorFrame): void {
    if (this.writeBehavior === "throw") throw new Error("stdin gone");
    this.written.push(message);
  }

  dispose(): void {
    this.disposed = true;
  }

  deliver(message: unknown): void {
    this.listener?.onMessage(message);
  }
}

describe("MuseMspClient", () => {
  it("handshakes with initialize then the bare initialized notification", async () => {
    const transport = new FakeTransport();
    const client = new MuseMspClient(transport, 1_000);
    const pending = client.initialize("poracode_probe", "1.0.0");
    expect(transport.written).toEqual([
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { clientInfo: { name: "poracode_probe", version: "1.0.0" } },
      },
    ]);
    transport.deliver({
      jsonrpc: "2.0",
      id: 1,
      result: {
        serverInfo: { name: "muse", version: "1.0.2" },
        schema: { fingerprint: "fp", version: 1 },
      },
    });
    await expect(pending).resolves.toMatchObject({ serverInfo: { name: "muse" } });
    expect(transport.written.at(-1)).toEqual({ jsonrpc: "2.0", method: "initialized" });
    client.dispose();
  });

  it("routes concurrent responses by id and surfaces error kinds", async () => {
    const transport = new FakeTransport();
    const client = new MuseMspClient(transport, 1_000);
    const first = client.request("model/list");
    const second = client.request("session/list", { limit: 1 });
    transport.deliver({ jsonrpc: "2.0", id: 2, result: { sessions: [] } });
    transport.deliver({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32600, message: "Not initialized", data: { kind: "notInitialized" } },
    });
    await expect(second).resolves.toEqual({ sessions: [] });
    const failure = await first.catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(MspRpcError);
    expect(failure as MspRpcError).toMatchObject({
      code: -32600,
      kind: "notInitialized",
      requestId: 1,
    });
    client.dispose();
  });

  it("rejects on timeout and on dispose", async () => {
    const transport = new FakeTransport();
    const client = new MuseMspClient(transport, 5);
    await expect(client.request("model/list")).rejects.toThrow(/timed out: model\/list/);

    const hanging = client.request("model/list");
    client.dispose();
    await expect(hanging).rejects.toThrow(/disposed/);
    expect(transport.disposed).toBe(true);
    await expect(client.request("model/list")).rejects.toThrow(/disposed/);
  });

  it("rejects a failing write", async () => {
    const transport = new FakeTransport();
    transport.writeBehavior = "throw";
    const client = new MuseMspClient(transport, 1_000);
    await expect(client.request("model/list")).rejects.toThrow(/stdin gone/);
    client.dispose();
  });

  it("fans notifications out and isolates subscriber errors", () => {
    const transport = new FakeTransport();
    const client = new MuseMspClient(transport, 1_000);
    const seen: Array<[string, Record<string, unknown>]> = [];
    client.onNotification((method, params) => seen.push([method, params]));
    client.onNotification(() => {
      throw new Error("subscriber bug");
    });
    transport.deliver({ jsonrpc: "2.0", method: "turn/started", params: { turnId: "t1" } });
    // Unknown methods and garbage pass through untouched / are ignored.
    transport.deliver({ jsonrpc: "2.0", method: "session/started", params: {} });
    transport.deliver({ nope: true });
    expect(seen).toEqual([
      ["turn/started", { turnId: "t1" }],
      ["session/started", {}],
    ]);
    client.dispose();
  });

  it("fails pending requests when the server closes", async () => {
    const transport = new FakeTransport();
    const client = new MuseMspClient(transport, 1_000);
    const hanging = client.request("model/list");
    transport.listener?.onClose();
    await expect(hanging).rejects.toThrow(/closed the connection/);
    client.dispose();
  });

  it("surfaces transport errors even without a pending request", () => {
    const transport = new FakeTransport();
    const client = new MuseMspClient(transport, 1_000);
    const errors: string[] = [];
    client.onError((error) => errors.push(error.message));

    transport.listener?.onError(new Error("EPIPE"));

    expect(errors).toEqual(["EPIPE"]);
    client.dispose();
  });

  it("answers server-initiated requests through the registered handler", async () => {
    const transport = new FakeTransport();
    const client = new MuseMspClient(transport, 1_000);
    const seen: Array<{ id: unknown; method: string }> = [];
    client.onServerRequest(({ id, method }) => {
      seen.push({ id, method });
      return { acknowledged: method };
    });
    transport.deliver({
      jsonrpc: "2.0",
      id: 41,
      method: "approval/request",
      params: { approvalId: "a1" },
    });
    await vi.waitFor(() => {
      expect(transport.written).toContainEqual({
        jsonrpc: "2.0",
        id: 41,
        result: { acknowledged: "approval/request" },
      });
    });
    expect(seen).toEqual([{ id: 41, method: "approval/request" }]);
    client.dispose();
  });

  it("answers unhandled server requests with methodNotFound", async () => {
    const transport = new FakeTransport();
    const client = new MuseMspClient(transport, 1_000);
    transport.deliver({ jsonrpc: "2.0", id: 7, method: "userInput/request", params: {} });
    await vi.waitFor(() => {
      expect(transport.written).toContainEqual({
        jsonrpc: "2.0",
        id: 7,
        error: { code: -32601, message: "Unknown method: userInput/request" },
      });
    });
    client.dispose();
  });

  it("answers internal when the server-request handler throws", async () => {
    const transport = new FakeTransport();
    const client = new MuseMspClient(transport, 1_000);
    client.onServerRequest(() => {
      throw new Error("handler bug");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      transport.deliver({ jsonrpc: "2.0", id: 9, method: "approval/request", params: {} });
      await vi.waitFor(() => {
        expect(transport.written).toContainEqual({
          jsonrpc: "2.0",
          id: 9,
          error: { code: -32603, message: "Handler failed for approval/request" },
        });
      });
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
    client.dispose();
  });
});

class FakeStdio extends EventEmitter {
  setEncoding = vi.fn<(encoding: string) => void>();
}

class FakeStdin extends EventEmitter {
  writable = true;
  written: string[] = [];
  ended = false;

  write(text: string): void {
    this.written.push(text);
  }

  end(): void {
    this.ended = true;
  }
}

class FakeChildProcess extends EventEmitter {
  stdout = new FakeStdio();
  stderr = new FakeStdio();
  stdin = new FakeStdin();
  exitCode: number | null = null;
  killed = false;
}

describe("spawnMuseServeHost", () => {
  const posix = { kind: "posix", path: "/tmp/proj" } as ProjectLocation;
  const wsl = { kind: "wsl", distro: "Ubuntu", linuxPath: "/tmp/proj" } as ProjectLocation;

  it("spawns the serve host with piped stdio on posix", async () => {
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child);
    const hosted = await spawnMuseServeHost(posix, {
      executablePath: "/usr/bin/muse",
      serveArgs: ["serve", "--no-session-log", "--trust-workspace"],
      label: "[test]",
    });
    expect(spawnMock).toHaveBeenCalledWith(
      // The resolved executable path wins over the bare binary name.
      "/usr/bin/muse",
      ["serve", "--no-session-log", "--trust-workspace"],
      expect.objectContaining({ stdio: ["pipe", "pipe", "pipe"], shell: false, windowsHide: true }),
    );
    expect(hosted.transport).toBeInstanceOf(MuseMspStdioTransport);
  });

  it("keeps durable hosts in the project while probes stay isolated", async () => {
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child);
    await spawnMuseServeHost(posix, {
      executablePath: "/usr/bin/muse",
      serveArgs: ["serve"],
      isolateCwd: false,
    });
    expect(spawnMock).toHaveBeenLastCalledWith(
      "/usr/bin/muse",
      ["serve"],
      expect.objectContaining({ cwd: "/tmp/proj" }),
    );

    await spawnMuseServeHost(posix, {
      executablePath: "/usr/bin/muse",
      serveArgs: ["serve", "--no-session-log"],
    });
    const options = spawnMock.mock.calls.at(-1)?.[2] as { cwd?: string };
    expect(options.cwd).not.toBe("/tmp/proj");
  });

  it("routes through the WSL login shell on wsl locations", async () => {
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child);
    await spawnMuseServeHost(wsl, {
      executablePath: "/home/demo/.local/bin/muse",
      serveArgs: ["serve", "--no-session-log", "--trust-workspace"],
      label: "[test]",
    });
    const [command, args] = spawnMock.mock.calls.at(-1) as [string, string[]];
    expect(command).toMatch(/wsl\.exe$/i);
    expect(args.join(" ")).toContain("muse");
    expect(args.join(" ")).toContain("serve");
  });

  it("rejects when the host exits immediately", async () => {
    const child = new FakeChildProcess();
    child.exitCode = 1;
    spawnMock.mockReturnValue(child);
    const terminate = vi.mocked(terminateChildProcessTree);
    terminate.mockClear();
    await expect(
      spawnMuseServeHost(posix, {
        executablePath: "/usr/bin/muse",
        serveArgs: ["serve"],
        label: "[test]",
      }),
    ).rejects.toThrow(/exited before handshake/);
    expect(terminate).toHaveBeenCalled();
  });
});
