import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentEventEnvelope } from "@/shared/contracts";
import { WslBridgeServer } from "./index";

/**
 * The bridge manager talks to wsl.exe and the user's distro, so all real I/O
 * is replaced with stubs. We assert that:
 *   - the boot line resolves `ensureBridge` with the loopback URL
 *   - subsequent JSONL `event` lines are forwarded to the dispatcher
 *   - malformed envelopes are dropped (and reported via onError)
 *   - concurrent ensureBridge calls share the same in-flight promise
 *   - dispose terminates the child and rejects any future ensureBridge
 */

const tempDirs: string[] = [];

function makeHelpersDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "lc-bridge-helpers-"));
  tempDirs.push(dir);
  // The manager probes for `bridge.mjs` inside helpersDir; the actual
  // contents are irrelevant when we stub `spawn`.
  writeFileSync(join(dir, "bridge.mjs"), "// stub", "utf8");
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

class FakeChild extends EventEmitter {
  // Pid is left undefined so that `terminateChildProcessTree` becomes a
  // no-op in tests — we cover real OS termination elsewhere and only care
  // about the manager's bookkeeping here.
  readonly pid: number | undefined = undefined;
  readonly stdout = new EventEmitter();
}

/**
 * Build a stubbed bridge that emits its boot line on the next tick after
 * spawn(), so the manager's `attachLineSplitter` listener is guaranteed to
 * be wired before the data arrives.
 */
function makeStubbedManager(opts: {
  helpersDir: string;
  onEvent: (envelope: AgentEventEnvelope) => void;
  onError?: (message: string, error?: unknown) => void;
  onBridgeExit?: (distro: string) => void;
  bootPort?: number;
  child?: FakeChild;
  childFactory?: () => FakeChild;
  autoBoot?: (spawnCount: number) => boolean;
  spawnsRef?: { count: number };
  onSpawn?: (
    opts: Parameters<NonNullable<ConstructorParameters<typeof WslBridgeServer>[0]["spawn"]>>[0],
  ) => void;
}): { manager: WslBridgeServer; child: FakeChild; children: FakeChild[] } {
  const child = opts.child ?? new FakeChild();
  const children: FakeChild[] = [];
  const bootPort = opts.bootPort ?? 54321;
  const managerOpts: ConstructorParameters<typeof WslBridgeServer>[0] = {
    helpersDir: opts.helpersDir,
    onEvent: opts.onEvent,
    secret: "topsecret",
    protocolVersion: 1,
    resolveNode: async () => ({
      nodePath: "/usr/bin/node",
      nodeVersion: "22.11.0",
      source: "user-installed",
    }),
    deploy: () => ({ home: "/home/me", linuxBaseDir: "/home/me/.poracode" }),
    spawn: (childOpts) => {
      const spawnedChild = opts.childFactory?.() ?? child;
      children.push(spawnedChild);
      opts.onSpawn?.(childOpts);
      if (opts.spawnsRef) opts.spawnsRef.count += 1;
      // Emit boot AFTER spawn returns so attachLineSplitter has wired the
      // listener — without this the listener would miss the chunk.
      if (!opts.autoBoot || opts.autoBoot(children.length)) {
        setImmediate(() => {
          spawnedChild.stdout.emit(
            "data",
            Buffer.from(JSON.stringify({ type: "boot", port: bootPort }) + "\n"),
          );
        });
      }
      return spawnedChild as never;
    },
  };
  if (opts.onError) managerOpts.onError = opts.onError;
  if (opts.onBridgeExit) managerOpts.onBridgeExit = opts.onBridgeExit;
  return { manager: new WslBridgeServer(managerOpts), child, children };
}

function makeEnvelope(overrides: Partial<AgentEventEnvelope> = {}): AgentEventEnvelope {
  return {
    protocolVersion: 1,
    agentKind: "claude",
    pluginVersion: "1.0.0",
    threadId: "thread-1",
    ts: Date.now(),
    intent: "session.started",
    ...overrides,
  } as AgentEventEnvelope;
}

describe("WslBridgeServer", () => {
  it("resolves ensureBridge once the child emits a boot line", async () => {
    const helpersDir = makeHelpersDir();
    const events: AgentEventEnvelope[] = [];
    const { manager, child } = makeStubbedManager({
      helpersDir,
      onEvent: (envelope) => events.push(envelope),
    });

    const handle = await manager.ensureBridge("Ubuntu");
    expect(handle).toEqual({
      baseUrl: "http://127.0.0.1:54321",
      hookUrl: "http://127.0.0.1:54321/v1/agent-event",
      secret: "topsecret",
    });

    child.stdout.emit(
      "data",
      Buffer.from(JSON.stringify({ type: "event", payload: makeEnvelope() }) + "\n"),
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.intent).toBe("session.started");

    await manager.dispose();
    // After dispose, ensureBridge should refuse to start a new bridge.
    const reentry = await manager.ensureBridge("Ubuntu");
    expect(reentry).toBeUndefined();
  });

  it("returns the cached handle on subsequent ensureBridge calls", async () => {
    const helpersDir = makeHelpersDir();
    const spawnsRef = { count: 0 };
    const { manager } = makeStubbedManager({
      helpersDir,
      onEvent: () => undefined,
      spawnsRef,
      bootPort: 1,
    });

    const first = await manager.ensureBridge("Ubuntu");
    const second = await manager.ensureBridge("Ubuntu");
    expect(spawnsRef.count).toBe(1);
    expect(first?.hookUrl).toBe("http://127.0.0.1:1/v1/agent-event");
    expect(first?.baseUrl).toBe("http://127.0.0.1:1");
    expect(second?.hookUrl).toBe("http://127.0.0.1:1/v1/agent-event");

    await manager.dispose();
  });

  it("releases a bridge without treating the intentional exit as a crash", async () => {
    const helpersDir = makeHelpersDir();
    const onBridgeExit = vi.fn<(distro: string) => void>();
    const { manager, children } = makeStubbedManager({
      helpersDir,
      onEvent: () => undefined,
      onBridgeExit,
      childFactory: () => new FakeChild(),
    });

    await manager.ensureBridge("Ubuntu");
    manager.releaseBridge("Ubuntu");
    children[0]!.emit("exit", 0, null);
    await manager.ensureBridge("Ubuntu");

    expect(children).toHaveLength(2);
    expect(onBridgeExit).not.toHaveBeenCalled();
    await manager.dispose();
  });

  it("releases a bridge that is still booting", async () => {
    const helpersDir = makeHelpersDir();
    const { manager, children } = makeStubbedManager({
      helpersDir,
      onEvent: () => undefined,
      childFactory: () => new FakeChild(),
      autoBoot: (spawnCount) => spawnCount > 1,
    });

    const firstBoot = manager.ensureBridge("Ubuntu");
    await vi.waitFor(() => expect(children).toHaveLength(1));
    manager.releaseBridge("Ubuntu");
    children[0]!.stdout.emit("data", Buffer.from('{"type":"boot","port":54001}\n'));
    await firstBoot;
    await manager.ensureBridge("Ubuntu");

    expect(children).toHaveLength(2);
    await manager.dispose();
  });

  it("forwards Browser MCP upstream env into the in-WSL bridge", async () => {
    const oldUrl = process.env.PORACODE_BROWSER_MCP_URL;
    const oldToken = process.env.PORACODE_BROWSER_MCP_TOKEN;
    process.env.PORACODE_BROWSER_MCP_URL = "http://127.0.0.1:65093";
    process.env.PORACODE_BROWSER_MCP_TOKEN = "browser-token";
    const helpersDir = makeHelpersDir();
    let capturedEnv: Record<string, string> | undefined;
    try {
      const { manager } = makeStubbedManager({
        helpersDir,
        onEvent: () => undefined,
        onSpawn: (opts) => {
          capturedEnv = opts.env;
        },
      });

      await manager.ensureBridge("Ubuntu");

      expect(capturedEnv).toMatchObject({
        PORACODE_BROWSER_MCP_URL: "http://127.0.0.1:65093",
        PORACODE_BROWSER_MCP_TOKEN: "browser-token",
      });
    } finally {
      if (oldUrl === undefined) {
        delete process.env.PORACODE_BROWSER_MCP_URL;
      } else {
        process.env.PORACODE_BROWSER_MCP_URL = oldUrl;
      }
      if (oldToken === undefined) {
        delete process.env.PORACODE_BROWSER_MCP_TOKEN;
      } else {
        process.env.PORACODE_BROWSER_MCP_TOKEN = oldToken;
      }
    }
  });

  it("returns undefined when no node runtime is available in the distro", async () => {
    const helpersDir = makeHelpersDir();
    const manager = new WslBridgeServer({
      helpersDir,
      onEvent: () => undefined,
      secret: "s",
      protocolVersion: 1,
      resolveNode: async () => null,
      deploy: () => ({ home: "/h", linuxBaseDir: "/h/.poracode" }),
      spawn: () => {
        throw new Error("should not spawn");
      },
    });
    const handle = await manager.ensureBridge("Ubuntu");
    expect(handle).toBeUndefined();
  });

  it("returns undefined when deploy fails (e.g. UNC path unreachable)", async () => {
    const helpersDir = makeHelpersDir();
    const manager = new WslBridgeServer({
      helpersDir,
      onEvent: () => undefined,
      secret: "s",
      protocolVersion: 1,
      resolveNode: async () => ({
        nodePath: "/usr/bin/node",
        nodeVersion: "22.11.0",
        source: "user-installed",
      }),
      deploy: () => null,
      spawn: () => {
        throw new Error("should not spawn");
      },
    });
    const handle = await manager.ensureBridge("Ubuntu");
    expect(handle).toBeUndefined();
  });

  it("drops malformed event payloads and reports via onError", async () => {
    const helpersDir = makeHelpersDir();
    const events: AgentEventEnvelope[] = [];
    const errors: string[] = [];
    const { manager, child } = makeStubbedManager({
      helpersDir,
      onEvent: (envelope) => events.push(envelope),
      onError: (message) => errors.push(message),
    });

    await manager.ensureBridge("Ubuntu");

    child.stdout.emit(
      "data",
      Buffer.from(
        JSON.stringify({ type: "event", payload: { agentKind: "claude" } /* missing fields */ }) +
          "\n",
      ),
    );
    expect(events).toHaveLength(0);
    expect(errors.some((message) => message.includes("malformed envelope"))).toBe(true);

    await manager.dispose();
  });

  it("rejects ensureBridge when the bridge exits before booting", async () => {
    const helpersDir = makeHelpersDir();
    const child = new FakeChild();
    const manager = new WslBridgeServer({
      helpersDir,
      onEvent: () => undefined,
      onError: () => undefined,
      secret: "s",
      protocolVersion: 1,
      resolveNode: async () => ({
        nodePath: "/usr/bin/node",
        nodeVersion: "22.11.0",
        source: "user-installed",
      }),
      deploy: () => ({ home: "/h", linuxBaseDir: "/h/.poracode" }),
      spawn: () => {
        // Schedule the early exit AFTER spawn returns so the manager has
        // already attached its `once("exit")` handler.
        setImmediate(() => child.emit("exit", 1, null));
        return child as never;
      },
    });

    const handle = await manager.ensureBridge("Ubuntu");
    expect(handle).toBeUndefined();
  });

  it("respawns once when the booted bridge reports a stale version", async () => {
    // Simulates: a previous supervisor left a bridge running inside WSL, we
    // deployed a newer bridge.mjs, and the in-memory child is still the
    // stale one. The manager should kill it and respawn from the fresh
    // file on disk (which — in this stub — reports the expected version).
    const helpersDir = mkdtempSync(join(tmpdir(), "lc-bridge-helpers-"));
    tempDirs.push(helpersDir);
    writeFileSync(join(helpersDir, "bridge.mjs"), `const BRIDGE_VERSION = "2.0.0";\n`, "utf8");

    const children: FakeChild[] = [];
    const versions = ["1.0.0", "2.0.0"]; // stale first, fresh second
    const manager = new WslBridgeServer({
      helpersDir,
      onEvent: () => undefined,
      onError: () => undefined,
      secret: "s",
      protocolVersion: 1,
      resolveNode: async () => ({
        nodePath: "/usr/bin/node",
        nodeVersion: "22.11.0",
        source: "user-installed",
      }),
      deploy: () => ({ home: "/h", linuxBaseDir: "/h/.poracode" }),
      spawn: () => {
        const child = new FakeChild();
        const version = versions[children.length] ?? "2.0.0";
        children.push(child);
        setImmediate(() => {
          child.stdout.emit(
            "data",
            Buffer.from(
              JSON.stringify({ type: "boot", port: 9000 + children.length, version }) + "\n",
            ),
          );
        });
        return child as never;
      },
    });

    const handle = await manager.ensureBridge("Ubuntu");
    expect(children).toHaveLength(2);
    expect(handle?.hookUrl).toBe("http://127.0.0.1:9002/v1/agent-event");

    await manager.dispose();
  });

  it("replaces a cached bridge when the bundled helper version changes", async () => {
    const helpersDir = mkdtempSync(join(tmpdir(), "lc-bridge-helpers-"));
    tempDirs.push(helpersDir);
    writeFileSync(join(helpersDir, "bridge.mjs"), `const BRIDGE_VERSION = "2.0.0";\n`, "utf8");

    const children: FakeChild[] = [];
    const manager = new WslBridgeServer({
      helpersDir,
      onEvent: () => undefined,
      onError: () => undefined,
      secret: "s",
      protocolVersion: 1,
      resolveNode: async () => ({
        nodePath: "/usr/bin/node",
        nodeVersion: "22.11.0",
        source: "user-installed",
      }),
      deploy: () => ({ home: "/h", linuxBaseDir: "/h/.poracode" }),
      spawn: () => {
        const child = new FakeChild();
        const version = children.length === 0 ? "2.0.0" : "2.0.1";
        const port = children.length === 0 ? 9100 : 9101;
        children.push(child);
        setImmediate(() => {
          child.stdout.emit(
            "data",
            Buffer.from(JSON.stringify({ type: "boot", port, version }) + "\n"),
          );
        });
        return child as never;
      },
    });

    const first = await manager.ensureBridge("Ubuntu");
    writeFileSync(join(helpersDir, "bridge.mjs"), `const BRIDGE_VERSION = "2.0.1";\n`, "utf8");
    const second = await manager.ensureBridge("Ubuntu");

    expect(children).toHaveLength(2);
    expect(first?.hookUrl).toBe("http://127.0.0.1:9100/v1/agent-event");
    expect(second?.hookUrl).toBe("http://127.0.0.1:9101/v1/agent-event");

    await manager.dispose();
  });

  it("does not respawn when booted version matches the bundled version", async () => {
    const helpersDir = mkdtempSync(join(tmpdir(), "lc-bridge-helpers-"));
    tempDirs.push(helpersDir);
    writeFileSync(join(helpersDir, "bridge.mjs"), `const BRIDGE_VERSION = "3.1.4";\n`, "utf8");

    const children: FakeChild[] = [];
    const manager = new WslBridgeServer({
      helpersDir,
      onEvent: () => undefined,
      onError: () => undefined,
      secret: "s",
      protocolVersion: 1,
      resolveNode: async () => ({
        nodePath: "/usr/bin/node",
        nodeVersion: "22.11.0",
        source: "user-installed",
      }),
      deploy: () => ({ home: "/h", linuxBaseDir: "/h/.poracode" }),
      spawn: () => {
        const child = new FakeChild();
        children.push(child);
        setImmediate(() => {
          child.stdout.emit(
            "data",
            Buffer.from(JSON.stringify({ type: "boot", port: 42000, version: "3.1.4" }) + "\n"),
          );
        });
        return child as never;
      },
    });

    const handle = await manager.ensureBridge("Ubuntu");
    expect(children).toHaveLength(1);
    expect(handle?.hookUrl).toBe("http://127.0.0.1:42000/v1/agent-event");

    await manager.dispose();
  });

  it("tolerates missing bundled version (old deploys without BRIDGE_VERSION)", async () => {
    // `bridge.mjs` in helpersDir has no `BRIDGE_VERSION` constant (older
    // build). `readBundledHelperVersion` returns undefined → version check
    // is skipped regardless of what the child reports.
    const helpersDir = makeHelpersDir(); // writes `// stub` — no constant
    const manager = new WslBridgeServer({
      helpersDir,
      onEvent: () => undefined,
      onError: () => undefined,
      secret: "s",
      protocolVersion: 1,
      resolveNode: async () => ({
        nodePath: "/usr/bin/node",
        nodeVersion: "22.11.0",
        source: "user-installed",
      }),
      deploy: () => ({ home: "/h", linuxBaseDir: "/h/.poracode" }),
      spawn: () => {
        const child = new FakeChild();
        setImmediate(() => {
          child.stdout.emit(
            "data",
            Buffer.from(JSON.stringify({ type: "boot", port: 1234, version: "9.9.9" }) + "\n"),
          );
        });
        return child as never;
      },
    });

    const handle = await manager.ensureBridge("Ubuntu");
    expect(handle?.hookUrl).toBe("http://127.0.0.1:1234/v1/agent-event");

    await manager.dispose();
  });
});
