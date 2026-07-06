import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import type { SessionRuntime } from "./runtime/sessionTypes";

const taskkillSpawnSyncMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => unknown>());
const ptySpawnMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => unknown>());
const appendFileMock = vi.hoisted(() =>
  vi.fn<(path: string, data: string, encoding: string) => Promise<void>>(),
);

vi.mock("node:child_process", async (importActual) => {
  const actual = await importActual<typeof import("node:child_process")>();
  return {
    ...actual,
    spawnSync: ((command, args, options) => {
      if (command === "taskkill") {
        return taskkillSpawnSyncMock(command, args, options);
      }
      return actual.spawnSync(command, args, options);
    }) as typeof actual.spawnSync,
  };
});

vi.mock("node:fs/promises", async (importActual) => {
  const actual = await importActual<typeof import("node:fs/promises")>();
  return {
    ...actual,
    appendFile: appendFileMock,
  };
});

vi.mock("node-pty", () => ({
  spawn: ptySpawnMock,
}));

// Skip the slow $SHELL -l -c probe on non-Windows hosts. The tests using
// `windowsProject` only exercise argv-shaping logic; resolving the binary
// against the host PATH is irrelevant and adds 1-2s per cold call on macOS.
vi.mock("./agents/binaryResolver", async (importActual) => {
  const actual = await importActual<typeof import("./agents/binaryResolver")>();
  return {
    ...actual,
    resolveAgentBinaryPath: (location: { kind: string }, binary: string) =>
      location.kind === "windows" && process.platform !== "win32"
        ? undefined
        : actual.resolveAgentBinaryPath(location as never, binary),
  };
});

// Suppress supervisor [supervisor] console output during tests so vitest's
// onUserConsoleLog RPC does not remain pending at worker teardown.
vi.spyOn(console, "warn").mockImplementation(() => {});
vi.spyOn(console, "log").mockImplementation(() => {});

import { codexExtraArgsPosition } from "./agents/codex/argv";
import { SupervisorRuntime } from "./supervisorRuntime";

const tempDirs: string[] = [];
const runtimesToDispose: SupervisorRuntime[] = [];
const lightcodeDataDirBeforeTests = process.env.LIGHTCODE_DATA_DIR;

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "lightcode-runtime-"));
  tempDirs.push(dir);
  return dir;
}

function makeRuntime(emit: ConstructorParameters<typeof SupervisorRuntime>[0]): SupervisorRuntime {
  const runtime = new SupervisorRuntime(emit);
  runtimesToDispose.push(runtime);
  return runtime;
}

afterEach(() => {
  // Dispose any runtimes the test created so their owned services (LSP
  // manager, project watcher, session manager, hook coordinator) stop
  // scheduling async work. Without this, lingering operations can log to
  // console after the test file completes — vitest's worker IPC then
  // rejects the queued `onUserConsoleLog` forward as it tears down,
  // surfacing as an unhandled rejection that fails the CI run.
  for (const runtime of runtimesToDispose.splice(0)) {
    try {
      runtime.dispose();
    } catch {
      // best-effort cleanup
    }
  }
  // Restoring an env var to `undefined` coerces it to the literal string
  // "undefined" (Node stringifies anything assigned to `process.env.X`).
  // That bug used to cause the supervisor to resolve its baseDir as the
  // string "undefined" and create `./undefined/settings.json` in cwd on
  // the next `SupervisorRuntime` construction. Use `delete` when the
  // original value was absent; assign otherwise.
  if (lightcodeDataDirBeforeTests === undefined) {
    delete process.env.LIGHTCODE_DATA_DIR;
  } else {
    process.env.LIGHTCODE_DATA_DIR = lightcodeDataDirBeforeTests;
  }
  taskkillSpawnSyncMock.mockReset();
  ptySpawnMock.mockReset();
  appendFileMock.mockReset();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createMockPty() {
  let onDataHandler: ((data: string) => void) | undefined;
  let onExitHandler: ((event: { exitCode: number | null }) => void) | undefined;

  return {
    pid: 4242,
    write: vi.fn<(data: string) => void>(),
    resize: vi.fn<(cols: number, rows: number) => void>(),
    kill: vi.fn<() => void>(),
    onData: vi.fn<(handler: (data: string) => void) => void>((handler) => {
      onDataHandler = handler;
    }),
    onExit: vi.fn<(handler: (event: { exitCode: number | null }) => void) => void>((handler) => {
      onExitHandler = handler;
    }),
    emitData(data: string) {
      onDataHandler?.(data);
    },
    emitExit(exitCode: number | null) {
      onExitHandler?.({ exitCode });
    },
  };
}

function decodeSpawnCommand(spawnArgs: string[]): string {
  // On Windows hosts, supervisor wraps spawns through PowerShell with
  // -EncodedCommand and quoted args; on non-Windows hosts the test sees the
  // cmd.exe fallback (raw, unquoted). Strip surrounding quotes so assertions
  // can search for the same tokens regardless of host.
  const raw = spawnArgs.includes("-EncodedCommand")
    ? Buffer.from(spawnArgs.at(-1)!, "base64").toString("utf16le")
    : spawnArgs.join(" ");
  return raw.replaceAll("'", "");
}

function createRuntimeSession(overrides: Record<string, unknown> = {}) {
  return {
    instanceId: "instance-1",
    threadId: "thread-1",
    agentKind: "codex",
    adapter: {
      kind: "codex",
      label: "Codex",
      capabilities: {
        models: [],
        efforts: [],
        modes: [],
        approvalPolicies: [],
        sandboxModes: [],
        supportsResume: true,
        supportsDirectInput: true,
        liveInputMode: "server",
        presentationMode: "terminal",
      },
    },
    pty: {
      write: vi.fn<(data: string) => void>(),
      resize: vi.fn<(cols: number, rows: number) => void>(),
      kill: vi.fn<() => void>(),
    },
    projectLocation: {
      kind: "windows",
      path: "C:\\repo",
    },
    config: {
      model: "gpt-5.4",
    },
    status: "idle",
    attention: "none",
    canResumeWithConfig: true,
    terminalSize: {
      cols: 120,
      rows: 30,
    },
    logPath: "thread.log",
    outputLength: 0,
    prevChunk: "",
    lastStrippedPtyChunk: "",
    structuredSession: {
      launchOptions: {},
      activate: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      startTurn: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      resolveServerRequest: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      setListener: vi.fn<(listener: unknown) => void>(),
      dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

describe("SupervisorRuntime thread input", () => {
  beforeEach(() => {
    vi.useRealTimers();
    taskkillSpawnSyncMock.mockReset();
    ptySpawnMock.mockReset();
    appendFileMock.mockReset();
  });

  it("routes server-controlled thread input through structured turn start", async () => {
    const emitted: unknown[] = [];
    const runtime = makeRuntime((event) => {
      emitted.push(event);
    });
    const session = createRuntimeSession();

    (runtime as unknown as { sessions: Map<string, typeof session> }).sessions.set(
      session.threadId,
      session,
    );

    await runtime.sendThreadInput({
      threadId: session.threadId,
      prompt: "hello",
      config: {
        model: "gpt-5.4",
      },
    });

    expect(session.structuredSession.startTurn).toHaveBeenCalledWith(
      "hello",
      {
        model: "gpt-5.4",
      },
      undefined,
      undefined,
    );
    expect(session.pty.write).not.toHaveBeenCalled();
    expect(emitted).toEqual([]);
  });

  it("returns immediately while server-controlled turn start continues in the background", async () => {
    let resolveStartTurn: (() => void) | undefined;
    const emitted: unknown[] = [];
    const runtime = makeRuntime((event) => {
      emitted.push(event);
    });
    const session = createRuntimeSession({
      structuredSession: {
        launchOptions: {},
        activate: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        startTurn: vi.fn<() => Promise<void>>(
          () =>
            new Promise<void>((resolve) => {
              resolveStartTurn = resolve;
            }),
        ),
        resolveServerRequest: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        setListener: vi.fn<(listener: unknown) => void>(),
        dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      },
    });

    (runtime as unknown as { sessions: Map<string, typeof session> }).sessions.set(
      session.threadId,
      session,
    );

    await expect(
      runtime.sendThreadInput({
        threadId: session.threadId,
        prompt: "hello",
        config: {
          model: "gpt-5.4",
        },
      }),
    ).resolves.toBeUndefined();

    expect(session.structuredSession.startTurn).toHaveBeenCalledWith(
      "hello",
      {
        model: "gpt-5.4",
      },
      undefined,
      undefined,
    );
    expect(emitted).toEqual([]);

    resolveStartTurn?.();
  });

  it("marks the thread as error when server-controlled turn start fails asynchronously", async () => {
    const emitted: unknown[] = [];
    const runtime = makeRuntime((event) => {
      emitted.push(event);
    });
    const session = createRuntimeSession({
      structuredSession: {
        launchOptions: {},
        activate: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        startTurn: vi.fn<() => Promise<void>>().mockRejectedValue(new Error("request failed")),
        resolveServerRequest: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        setListener: vi.fn<(listener: unknown) => void>(),
        dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      },
    });

    (runtime as unknown as { sessions: Map<string, typeof session> }).sessions.set(
      session.threadId,
      session,
    );

    await runtime.sendThreadInput({
      threadId: session.threadId,
      prompt: "hello",
      config: {
        model: "gpt-5.4",
      },
    });
    await Promise.resolve();

    expect(emitted).toEqual([
      expect.objectContaining({
        type: "thread-state",
        threadId: session.threadId,
        status: "error",
        attention: "error",
        errorMessage: "request failed",
      }),
    ]);
  });

  it("rolls back provider conversation through the structured session", async () => {
    const runtime = makeRuntime(() => undefined);
    const rollbackThread = vi
      .fn<(numTurns: number) => Promise<{ providerSessionId: string; messages: [] }>>()
      .mockResolvedValue({ providerSessionId: "provider-session-1", messages: [] });
    const session = createRuntimeSession({
      sessionRef: { providerSessionId: "provider-session-1" },
      structuredSession: {
        launchOptions: {},
        activate: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        startTurn: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        rollbackThread,
        resolveServerRequest: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        setListener: vi.fn<(listener: unknown) => void>(),
        dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      },
    });

    (runtime as unknown as { sessions: Map<string, typeof session> }).sessions.set(
      session.threadId,
      session,
    );

    await runtime.rollbackThreadConversation({ threadId: session.threadId, numTurns: 2 });

    expect(rollbackThread).toHaveBeenCalledWith(2);
  });

  it("rejects checkpoint rollback when the provider does not support it", async () => {
    const runtime = makeRuntime(() => undefined);
    const session = createRuntimeSession();

    (runtime as unknown as { sessions: Map<string, typeof session> }).sessions.set(
      session.threadId,
      session,
    );

    await expect(
      runtime.rollbackThreadConversation({ threadId: session.threadId, numTurns: 1 }),
    ).rejects.toThrow("Codex does not support checkpoint rollback.");
    expect(session.structuredSession.startTurn).not.toHaveBeenCalled();
  });

  it("stages GUI submit-while-working as a single pending steer with replace-latest, interrupts once, and drains the latest on idle", async () => {
    const runtime = makeRuntime(() => undefined);
    const startTurn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const interruptTurn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    (
      runtime as unknown as {
        spawnThread: (input: {
          threadId: string;
          agentKind: string;
          adapter: Record<string, unknown>;
          projectLocation: { kind: "windows"; path: string };
          config: { model: string };
          initialSize: { cols: number; rows: number };
          launchPrompt: string;
          structuredSession: Record<string, unknown>;
          presentationMode: "gui";
        }) => { status: string };
      }
    ).spawnThread({
      threadId: "thread-gui-queue",
      agentKind: "codex",
      adapter: {
        kind: "codex",
        label: "Codex",
        capabilities: {
          models: [{ id: "gpt-5.4", label: "5.4" }],
          efforts: ["low"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: [{ id: "on-request", label: "On Request" }],
          sandboxModes: [{ id: "read-only", label: "Read Only" }],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "gui",
        },
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
      config: {
        model: "gpt-5.4",
      },
      initialSize: {
        cols: 120,
        rows: 30,
      },
      launchPrompt: "",
      structuredSession: {
        launchOptions: {},
        setListener: vi.fn<(listener: unknown) => void>(),
        dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        startTurn,
        interruptTurn,
      },
      presentationMode: "gui",
    });

    (
      runtime as unknown as {
        sessions: Map<
          string,
          {
            status: string;
            structuredSession: { setListener: ReturnType<typeof vi.fn> };
          }
        >;
      }
    ).sessions.get("thread-gui-queue")!.status = "working";

    await runtime.sendThreadInput({
      threadId: "thread-gui-queue",
      prompt: "first",
      config: {
        model: "gpt-5.4",
      },
      userMessageItemId: "user-first",
    });
    await runtime.sendThreadInput({
      threadId: "thread-gui-queue",
      prompt: "second",
      config: {
        model: "gpt-5.4",
      },
      userMessageItemId: "user-second",
    });

    // Replace-latest: both submits stage into the same slot. interruptTurn
    // fires once; startTurn waits for cancel-ack via the idle transition.
    expect(interruptTurn).toHaveBeenCalledTimes(1);
    expect(startTurn).not.toHaveBeenCalled();

    const listener = (
      (
        runtime as unknown as {
          sessions: Map<
            string,
            {
              structuredSession: { setListener: ReturnType<typeof vi.fn> };
            }
          >;
        }
      ).sessions.get("thread-gui-queue")!.structuredSession.setListener as ReturnType<typeof vi.fn>
    ).mock.calls[0]?.[0] as { onUpdate: (update: { status: string; attention: string }) => void };

    listener.onUpdate({ status: "idle", attention: "none" });
    await Promise.resolve();

    // Only the latest submit drains; the earlier one was replaced.
    expect(startTurn).toHaveBeenCalledTimes(1);
    expect(startTurn).toHaveBeenCalledWith(
      "second",
      {
        model: "gpt-5.4",
      },
      undefined,
      { userMessageItemId: "user-second" },
    );
  });

  it("flushes buffered runtime events before emitting a structured turn-end idle", () => {
    const emitted: Array<Record<string, unknown>> = [];
    const runtime = makeRuntime((event) => {
      emitted.push(event as Record<string, unknown>);
    });

    (
      runtime as unknown as {
        spawnThread: (input: Record<string, unknown>) => { status: string };
      }
    ).spawnThread({
      threadId: "thread-gui-flush",
      agentKind: "codex",
      adapter: {
        kind: "codex",
        label: "Codex",
        capabilities: {
          models: [{ id: "gpt-5.4", label: "5.4" }],
          efforts: ["low"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: [{ id: "on-request", label: "On Request" }],
          sandboxModes: [{ id: "read-only", label: "Read Only" }],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "gui",
        },
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
      config: {
        model: "gpt-5.4",
      },
      initialSize: {
        cols: 120,
        rows: 30,
      },
      launchPrompt: "",
      structuredSession: {
        launchOptions: {},
        setListener: vi.fn<(listener: unknown) => void>(),
        dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        startTurn: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      },
      presentationMode: "gui",
    });

    const session = (
      runtime as unknown as {
        sessions: Map<
          string,
          {
            status: string;
            attention: string;
            structuredSession: { setListener: ReturnType<typeof vi.fn> };
          }
        >;
      }
    ).sessions.get("thread-gui-flush")!;
    session.status = "working";
    session.attention = "working";

    const listener = (session.structuredSession.setListener as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as {
      onUpdate: (update: { status: string; attention: string }) => void;
      onRuntimeEvent: (event: RuntimeEvent) => void;
    };

    // Isolate the turn-end sequence from any spawn-time emits.
    emitted.length = 0;

    // The turn's final assistant delta is appended to the 16ms runtime-event
    // batch buffer (timer not yet fired — no emit yet).
    listener.onRuntimeEvent({
      type: "content.delta",
      threadId: "thread-gui-flush",
      itemId: "assistant-1",
      stream: "assistant_text",
      delta: "done",
    });

    // Turn completes: the structured session reports idle. The status
    // `thread-state` is emitted immediately, so without flushing first it would
    // overtake the still-buffered runtime event on the wire and let the renderer
    // re-open the GUI turn to "working".
    listener.onUpdate({ status: "idle", attention: "none" });

    const runtimeIdx = emitted.findIndex(
      (e) =>
        e.type === "thread-runtime-event" ||
        e.type === "thread-runtime-events" ||
        e.type === "thread-runtime-events-multi",
    );
    const idleIdx = emitted.findIndex((e) => e.type === "thread-state" && e.status === "idle");

    expect(runtimeIdx).toBeGreaterThanOrEqual(0);
    expect(idleIdx).toBeGreaterThanOrEqual(0);
    expect(runtimeIdx).toBeLessThan(idleIdx);
  });

  it("drains a pending steer when the working turn fails with error status", async () => {
    const runtime = makeRuntime(() => undefined);
    const startTurn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const interruptTurn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    (
      runtime as unknown as {
        spawnThread: (input: Record<string, unknown>) => { status: string };
      }
    ).spawnThread({
      threadId: "thread-gui-error",
      agentKind: "codex",
      adapter: {
        kind: "codex",
        label: "Codex",
        capabilities: {
          models: [{ id: "gpt-5.4", label: "5.4" }],
          efforts: ["low"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: [{ id: "on-request", label: "On Request" }],
          sandboxModes: [{ id: "read-only", label: "Read Only" }],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "gui",
        },
      },
      projectLocation: { kind: "windows", path: "C:\\repo" },
      config: { model: "gpt-5.4" },
      initialSize: { cols: 120, rows: 30 },
      launchPrompt: "",
      structuredSession: {
        launchOptions: {},
        setListener: vi.fn<(listener: unknown) => void>(),
        dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        startTurn,
        interruptTurn,
      },
      presentationMode: "gui",
    });

    (
      runtime as unknown as {
        sessions: Map<string, { status: string }>;
      }
    ).sessions.get("thread-gui-error")!.status = "working";

    await runtime.sendThreadInput({
      threadId: "thread-gui-error",
      prompt: "redirect",
      config: { model: "gpt-5.4" },
      userMessageItemId: "user-redirect",
    });

    expect(interruptTurn).toHaveBeenCalledTimes(1);
    expect(startTurn).not.toHaveBeenCalled();

    const listener = (
      (
        runtime as unknown as {
          sessions: Map<string, { structuredSession: { setListener: ReturnType<typeof vi.fn> } }>;
        }
      ).sessions.get("thread-gui-error")!.structuredSession.setListener as ReturnType<typeof vi.fn>
    ).mock.calls[0]?.[0] as {
      onUpdate: (update: { status: string; attention: string; errorMessage?: string }) => void;
    };

    // The turn fails instead of reaching idle. The steer must still drain —
    // otherwise the strip sticks on "waiting for agent to stop" forever.
    listener.onUpdate({ status: "error", attention: "error", errorMessage: "Claude turn failed." });
    await Promise.resolve();

    expect(startTurn).toHaveBeenCalledTimes(1);
    expect(startTurn).toHaveBeenCalledWith("redirect", { model: "gpt-5.4" }, undefined, {
      userMessageItemId: "user-redirect",
    });
  });

  it("drains a steer staged after the turn already errored", async () => {
    const runtime = makeRuntime(() => undefined);
    const startTurn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const interruptTurn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    (
      runtime as unknown as {
        spawnThread: (input: Record<string, unknown>) => { status: string };
      }
    ).spawnThread({
      threadId: "thread-gui-post-error",
      agentKind: "codex",
      adapter: {
        kind: "codex",
        label: "Codex",
        capabilities: {
          models: [{ id: "gpt-5.4", label: "5.4" }],
          efforts: ["low"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: [{ id: "on-request", label: "On Request" }],
          sandboxModes: [{ id: "read-only", label: "Read Only" }],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "gui",
        },
      },
      projectLocation: { kind: "windows", path: "C:\\repo" },
      config: { model: "gpt-5.4" },
      initialSize: { cols: 120, rows: 30 },
      launchPrompt: "",
      structuredSession: {
        launchOptions: {},
        setListener: vi.fn<(listener: unknown) => void>(),
        dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        startTurn,
        interruptTurn,
      },
      presentationMode: "gui",
    });

    // The turn already failed before the user types their steer.
    (
      runtime as unknown as {
        sessions: Map<string, { status: string }>;
      }
    ).sessions.get("thread-gui-post-error")!.status = "error";

    await runtime.sendThreadInput({
      threadId: "thread-gui-post-error",
      prompt: "retry this",
      config: { model: "gpt-5.4" },
      userMessageItemId: "user-retry",
    });

    // Nothing to interrupt — the agent already stopped — so the steer drains
    // immediately into a fresh turn rather than waiting on a stop that never comes.
    expect(interruptTurn).not.toHaveBeenCalled();
    expect(startTurn).toHaveBeenCalledTimes(1);
    expect(startTurn).toHaveBeenCalledWith("retry this", { model: "gpt-5.4" }, undefined, {
      userMessageItemId: "user-retry",
    });
  });

  it("does not emit runtime status updates for raw terminal writes", async () => {
    const emitted: unknown[] = [];
    const runtime = makeRuntime((event) => {
      emitted.push(event);
    });
    const session = createRuntimeSession({
      adapter: {
        kind: "claude",
        label: "Claude Code",
        capabilities: {
          models: [],
          efforts: [],
          modes: [],
          approvalPolicies: [],
          sandboxModes: [],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "terminal",
          presentationMode: "terminal",
        },
      },
      structuredSession: undefined,
    });

    (runtime as unknown as { sessions: Map<string, typeof session> }).sessions.set(
      session.threadId,
      session,
    );

    await runtime.writeTerminal({
      threadId: session.threadId,
      data: "hello\r",
    });

    expect(session.pty.write).toHaveBeenCalledWith("hello\r");
    expect(emitted).toHaveLength(0);
  });

  it("promotes routed CLI hook session ids into resumable thread session refs", () => {
    const emitted: Array<Record<string, unknown>> = [];
    const runtime = makeRuntime((event) => {
      emitted.push(event as Record<string, unknown>);
    });
    const session = createRuntimeSession({
      sessionRef: undefined,
      canResumeWithConfig: false,
      hasCliHookPluginActivity: true,
    }) as unknown as SessionRuntime;

    (runtime as unknown as { sessions: Map<string, SessionRuntime> }).sessions.set(
      session.threadId,
      session,
    );

    const manager = (
      runtime as unknown as {
        threadSessionManager: {
          findSessionForCliHookPlugin(input: {
            threadId?: string;
            sessionId?: string;
          }): SessionRuntime | undefined;
          noteCliHookPluginActivity(
            runtimeSession: SessionRuntime,
            envelope: {
              protocolVersion: 1;
              agentKind: "codex";
              pluginVersion: string;
              threadId: string;
              sessionId: string;
              ts: number;
              intent: "session.started";
            },
          ): void;
        };
      }
    ).threadSessionManager;

    manager.noteCliHookPluginActivity(session, {
      protocolVersion: 1,
      agentKind: "codex",
      pluginVersion: "1.0.0",
      threadId: session.threadId,
      sessionId: "codex-session-1",
      ts: Date.now(),
      intent: "session.started",
    });

    expect(session.sessionRef?.providerSessionId).toBe("codex-session-1");
    expect(session.canResumeWithConfig).toBe(true);
    expect(manager.findSessionForCliHookPlugin({ sessionId: "codex-session-1" })).toBe(session);
    expect(emitted).toContainEqual(
      expect.objectContaining({
        type: "thread-state",
        threadId: session.threadId,
        canResumeWithConfig: true,
        sessionRef: expect.objectContaining({
          providerSessionId: "codex-session-1",
        }),
      }),
    );
  });

  it("starts terminal session ref discovery immediately after spawn without hooks", async () => {
    vi.useFakeTimers();
    const emitted: Array<Record<string, unknown>> = [];
    const runtime = makeRuntime((event) => {
      emitted.push(event as Record<string, unknown>);
    });
    const pty = createMockPty();
    const discoverSessionRef = vi
      .fn<() => Promise<{ providerSessionId: string; discoveredAt: string } | undefined>>()
      .mockResolvedValue({
        providerSessionId: "codex-rollout-session-1",
        discoveredAt: "2026-05-11T00:00:00.000Z",
      });

    ptySpawnMock.mockReturnValueOnce(pty);

    (
      runtime as unknown as {
        spawnThread: (input: {
          threadId: string;
          agentKind: string;
          adapter: Record<string, unknown>;
          projectLocation: { kind: "windows"; path: string };
          config: { model: string };
          initialSize: { cols: number; rows: number };
          launchPrompt: string;
          command: { command: string; args: string[] };
        }) => SessionRuntime;
      }
    ).spawnThread({
      threadId: "thread-codex-no-hooks",
      agentKind: "codex",
      adapter: {
        kind: "codex",
        label: "Codex",
        capabilities: {
          models: [{ id: "gpt-5.4", label: "5.4" }],
          efforts: ["high"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: [{ id: "on-request", label: "On Request" }],
          sandboxModes: [{ id: "workspace-write", label: "Workspace Write" }],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "terminal",
        },
        initialSessionRefDiscoveryDelayMs: 1000,
        discoverSessionRef,
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
      config: {
        model: "gpt-5.4",
      },
      initialSize: {
        cols: 120,
        rows: 30,
      },
      launchPrompt: "",
      command: {
        command: "codex",
        args: [],
      },
    });

    expect(discoverSessionRef).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);

    expect(discoverSessionRef).toHaveBeenCalledTimes(1);
    expect(emitted).toContainEqual(
      expect.objectContaining({
        type: "thread-state",
        threadId: "thread-codex-no-hooks",
        canResumeWithConfig: true,
        sessionRef: {
          providerSessionId: "codex-rollout-session-1",
          discoveredAt: "2026-05-11T00:00:00.000Z",
        },
      }),
    );
    vi.useRealTimers();
  });

  it("allows session ref watcher events to discover after timed polling expires", async () => {
    vi.useFakeTimers();
    const emitted: Array<Record<string, unknown>> = [];
    const runtime = makeRuntime((event) => {
      emitted.push(event as Record<string, unknown>);
    });
    const pty = createMockPty();
    let onWatcherChanged: (() => void) | undefined;
    const stopWatcher = vi.fn<() => void>();
    const discoverSessionRef =
      vi.fn<() => Promise<{ providerSessionId: string; discoveredAt: string } | undefined>>();
    discoverSessionRef
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        providerSessionId: "antigravity-conversation-1",
        discoveredAt: "2026-05-20T00:00:00.000Z",
      });

    ptySpawnMock.mockReturnValueOnce(pty);

    (
      runtime as unknown as {
        spawnThread: (input: {
          threadId: string;
          agentKind: string;
          adapter: Record<string, unknown>;
          projectLocation: { kind: "windows"; path: string };
          config: { model: string };
          initialSize: { cols: number; rows: number };
          launchPrompt: string;
          command: { command: string; args: string[] };
        }) => SessionRuntime;
      }
    ).spawnThread({
      threadId: "thread-antigravity-late-session",
      agentKind: "antigravity",
      adapter: {
        kind: "antigravity",
        label: "Antigravity",
        capabilities: {
          models: [{ id: "Gemini 3.5 Flash", label: "Gemini 3.5 Flash" }],
          efforts: [],
          modelEfforts: {},
          modes: [],
          approvalPolicies: [{ id: "default", label: "Default" }],
          sandboxModes: [],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "terminal",
          presentationMode: "terminal",
        },
        initialSessionRefDiscoveryDelayMs: 1000,
        discoverSessionRef,
        watchSessionRef: vi.fn<(_location: unknown, onChanged: () => void) => () => void>(
          (_location, onChanged) => {
            onWatcherChanged = onChanged;
            return stopWatcher;
          },
        ),
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
      config: {
        model: "Gemini 3.5 Flash",
      },
      initialSize: {
        cols: 120,
        rows: 30,
      },
      launchPrompt: "",
      command: {
        command: "agy",
        args: [],
      },
    });

    await vi.advanceTimersByTimeAsync(1000);
    for (let i = 0; i < 4; i += 1) {
      await vi.advanceTimersByTimeAsync(3000);
    }

    expect(discoverSessionRef).toHaveBeenCalledTimes(5);
    expect(
      emitted.some(
        (event) =>
          event.type === "thread-state" &&
          (event.sessionRef as { providerSessionId?: string } | undefined)?.providerSessionId ===
            "antigravity-conversation-1",
      ),
    ).toBe(false);

    onWatcherChanged?.();
    await Promise.resolve();

    expect(discoverSessionRef).toHaveBeenCalledTimes(6);
    expect(stopWatcher).toHaveBeenCalledTimes(1);
    expect(emitted).toContainEqual(
      expect.objectContaining({
        type: "thread-state",
        threadId: "thread-antigravity-late-session",
        canResumeWithConfig: true,
        sessionRef: {
          providerSessionId: "antigravity-conversation-1",
          discoveredAt: "2026-05-20T00:00:00.000Z",
        },
      }),
    );
    vi.useRealTimers();
  });

  it("keeps terminal scrollback in a capped transcript buffer", () => {
    const runtime = makeRuntime(() => undefined);
    const session = createRuntimeSession({ prevChunk: "" });

    (runtime as unknown as { sessions: Map<string, typeof session> }).sessions.set(
      session.threadId,
      session,
    );

    (
      runtime as unknown as {
        handlePtyData: (runtimeSession: Record<string, unknown>, data: string) => void;
      }
    ).handlePtyData(session, "a".repeat(120_000));
    (
      runtime as unknown as {
        handlePtyData: (runtimeSession: Record<string, unknown>, data: string) => void;
      }
    ).handlePtyData(session, "b".repeat(120_000));

    const scrollback = runtime.readTerminalScrollback(session.threadId);
    expect(scrollback).toHaveLength(100_000);
    expect(scrollback.startsWith("b")).toBe(true);
  });

  it("buffers dev PTY log writes instead of writing each chunk synchronously", async () => {
    vi.useFakeTimers();
    process.env.VITE_DEV_SERVER_URL = "http://localhost:5173";
    const tempDir = makeTempDir();
    process.env.LIGHTCODE_DATA_DIR = tempDir;
    const runtime = makeRuntime(() => undefined);
    const session = createRuntimeSession({ prevChunk: "" });

    (runtime as unknown as { sessions: Map<string, typeof session> }).sessions.set(
      session.threadId,
      session,
    );

    (
      runtime as unknown as {
        handlePtyData: (runtimeSession: Record<string, unknown>, data: string) => void;
      }
    ).handlePtyData(session, "first");
    (
      runtime as unknown as {
        handlePtyData: (runtimeSession: Record<string, unknown>, data: string) => void;
      }
    ).handlePtyData(session, "second");

    expect(appendFileMock).not.toHaveBeenCalled();
    // Advance only past the 25ms dev-log buffer flush, not `runAllTimersAsync`:
    // the runtime's UsageService auto-refresh tick reschedules itself forever
    // (by design), so draining every timer trips fake-timers' 10000-iteration
    // infinite-loop guard non-deterministically under load.
    await vi.advanceTimersByTimeAsync(25);
    expect(appendFileMock).toHaveBeenCalledTimes(1);
    expect(appendFileMock.mock.calls[0]?.[1]).toBe("firstsecond");
    delete process.env.VITE_DEV_SERVER_URL;
    vi.useRealTimers();
  });

  it("keeps a working thread active when the last corroborated terminal hint is still working", async () => {
    vi.useFakeTimers();
    const emitted: Array<Record<string, unknown>> = [];
    const runtime = makeRuntime((event) => {
      emitted.push(event as Record<string, unknown>);
    });
    const session = createRuntimeSession({
      status: "working",
      attention: "working",
      prevChunk: "",
      adapter: {
        kind: "codex",
        label: "Codex",
        capabilities: {
          models: [],
          efforts: [],
          modes: [],
          approvalPolicies: [],
          sandboxModes: [],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "terminal",
        },
        detectTerminalStatus: (text: string) =>
          text.includes("Working (3m 38s")
            ? {
                status: "working" as const,
                attention: "working" as const,
                corroborated: true,
              }
            : null,
      },
    });

    (
      runtime as unknown as {
        handlePtyData: (session: Record<string, unknown>, data: string) => void;
      }
    ).handlePtyData(session, "Working (3m 38s • esc to interrupt)");

    await vi.advanceTimersByTimeAsync(2000);

    expect(session.status).toBe("working");
    expect(
      emitted.filter((event) => event.type === "thread-state" && event.status === "idle"),
    ).toHaveLength(0);
    vi.useRealTimers();
  });

  it("promotes Codex question screens to needs_reply before silence can mark them idle", async () => {
    vi.useFakeTimers();
    const emitted: Array<Record<string, unknown>> = [];
    const runtime = makeRuntime((event) => {
      emitted.push(event as Record<string, unknown>);
    });
    const session = createRuntimeSession({
      status: "working",
      attention: "working",
      prevChunk: "",
      adapter: {
        kind: "codex",
        label: "Codex",
        capabilities: {
          models: [],
          efforts: [],
          modes: [],
          approvalPolicies: [],
          sandboxModes: [],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "terminal",
        },
        detectTerminalStatus: (text: string) =>
          text.includes("enter to submit answer")
            ? {
                status: "needs_reply" as const,
                attention: "needs_reply" as const,
                corroborated: true,
              }
            : null,
      },
    });

    (
      runtime as unknown as {
        handlePtyData: (session: Record<string, unknown>, data: string) => void;
      }
    ).handlePtyData(
      session,
      [
        "Question 1/2 (2 unanswered)",
        "For the project tree search, what should v1 search across?",
        "",
        "tab to add notes | enter to submit answer | ←/→ to navigate questions | esc to interrupt",
      ].join("\n"),
    );

    await vi.advanceTimersByTimeAsync(2000);

    expect(session.status).toBe("needs_reply");
    expect(session.attention).toBe("needs_reply");
    expect(
      emitted.filter((event) => event.type === "thread-state" && event.status === "idle"),
    ).toHaveLength(0);
    vi.useRealTimers();
  });

  it("still falls back to idle after silence when no strong terminal hint remains", async () => {
    vi.useFakeTimers();
    const emitted: Array<Record<string, unknown>> = [];
    const runtime = makeRuntime((event) => {
      emitted.push(event as Record<string, unknown>);
    });
    const session = createRuntimeSession({
      status: "working",
      attention: "working",
      prevChunk: "",
      adapter: {
        kind: "codex",
        label: "Codex",
        capabilities: {
          models: [],
          efforts: [],
          modes: [],
          approvalPolicies: [],
          sandboxModes: [],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "terminal",
        },
        detectTerminalStatus: () => null,
      },
    });

    (
      runtime as unknown as {
        handlePtyData: (session: Record<string, unknown>, data: string) => void;
      }
    ).handlePtyData(session, "Partial output without a strong status marker");

    await vi.advanceTimersByTimeAsync(2000);

    expect(session.status).toBe("idle");
    expect(
      emitted.filter((event) => event.type === "thread-state" && event.status === "idle"),
    ).toHaveLength(1);
    vi.useRealTimers();
  });

  it("does not fall back to idle when the adapter disables the silence watchdog", async () => {
    vi.useFakeTimers();
    const emitted: Array<Record<string, unknown>> = [];
    const runtime = makeRuntime((event) => {
      emitted.push(event as Record<string, unknown>);
    });
    const session = createRuntimeSession({
      agentKind: "claude",
      status: "working",
      attention: "working",
      prevChunk: "",
      adapter: {
        kind: "claude",
        label: "Claude Code",
        capabilities: {
          models: [],
          efforts: [],
          modes: [],
          approvalPolicies: [],
          sandboxModes: [],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "terminal",
          presentationMode: "terminal",
        },
        detectTerminalStatus: () => null,
        workingSilenceTimeoutMs: null,
      },
    });

    (
      runtime as unknown as {
        handlePtyData: (session: Record<string, unknown>, data: string) => void;
      }
    ).handlePtyData(session, "Puttering… (1m 34s · ↑ 3.4k tokens · thinking with high effort)");

    await vi.advanceTimersByTimeAsync(2000);

    expect(session.status).toBe("working");
    expect(
      emitted.filter((event) => event.type === "thread-state" && event.status === "idle"),
    ).toHaveLength(0);
    vi.useRealTimers();
  });

  it("uses taskkill instead of pty.kill when closing a Windows shell session", async () => {
    const runtime = makeRuntime(() => undefined);
    const shell = {
      instanceId: "shell-instance-1",
      shellId: "shell-1",
      pty: {
        pid: 4242,
        kill: vi.fn<() => void>(),
        write: vi.fn<(data: string) => void>(),
        resize: vi.fn<(cols: number, rows: number) => void>(),
      },
      logPath: "shell.log",
      outputLength: 0,
    };
    const processKillSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");

    taskkillSpawnSyncMock.mockReturnValue({
      pid: 0,
      output: [],
      stdout: null,
      stderr: null,
      status: 0,
      signal: null,
    });

    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32",
    });

    (runtime as unknown as { shellSessions: Map<string, typeof shell> }).shellSessions.set(
      shell.shellId,
      shell,
    );

    try {
      await runtime.closeThread({ threadId: shell.shellId });
    } finally {
      processKillSpy.mockRestore();
      if (platformDescriptor) {
        Object.defineProperty(process, "platform", platformDescriptor);
      }
    }

    expect(taskkillSpawnSyncMock).toHaveBeenCalledWith(
      "taskkill",
      ["/PID", "4242", "/T", "/F"],
      expect.objectContaining({
        stdio: "ignore",
        windowsHide: true,
      }),
    );
    expect(shell.pty.kill).not.toHaveBeenCalled();
  });

  it("starts the queued launch prompt when isReadyForInitialPrompt fires", async () => {
    const emitted: unknown[] = [];
    const runtime = makeRuntime((event) => {
      emitted.push(event);
    });
    const pty = createMockPty();
    const startTurn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    ptySpawnMock.mockReturnValueOnce(pty);

    (
      runtime as unknown as {
        spawnThread: (input: {
          threadId: string;
          agentKind: string;
          adapter: Record<string, unknown>;
          projectLocation: { kind: "windows"; path: string };
          config: { model: string };
          initialSize: { cols: number; rows: number };
          launchPrompt: string;
          command: { command: string; args: string[] };
          structuredSession: Record<string, unknown>;
          pendingLaunchPrompt: string;
        }) => unknown;
      }
    ).spawnThread({
      threadId: "thread-2",
      agentKind: "codex",
      adapter: {
        kind: "codex",
        label: "Codex",
        capabilities: {
          models: [{ id: "gpt-5.4", label: "5.4" }],
          efforts: ["high"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: [{ id: "on-request", label: "On Request" }],
          sandboxModes: [{ id: "workspace-write", label: "Workspace Write" }],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "terminal",
        },
        createInitialSessionRef: vi
          .fn<() => { providerSessionId: string; discoveredAt: string } | undefined>()
          .mockReturnValue(undefined),
        buildLaunchArgv: vi.fn<() => void>(),
        buildResumeArgv: vi.fn<() => void>(),
        isReadyForInitialPrompt: (text: string) =>
          text.includes("OpenAI Codex") &&
          text.includes("directory:") &&
          text.includes("/model to change"),
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
      config: {
        model: "gpt-5.4",
      },
      initialSize: {
        cols: 120,
        rows: 30,
      },
      launchPrompt: "",
      command: {
        command: "codex",
        args: [],
      },
      structuredSession: {
        launchOptions: {},
        setListener: vi.fn<(listener: unknown) => void>(),
        dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        startTurn,
      },
      pendingLaunchPrompt: "hi",
    });

    pty.emitData(
      [
        "OpenAI Codex (v0.116.0)",
        "model: gpt-5.4-mini high /model to change",
        "directory: ~/work/site-search-ui",
      ].join("\n"),
    );
    await Promise.resolve();

    expect(startTurn).toHaveBeenCalledTimes(1);
    expect(startTurn).toHaveBeenCalledWith("hi", {
      model: "gpt-5.4",
    });
  });

  it.skipIf(process.platform !== "win32")(
    "does not eagerly start a queued Codex turn during thread startup",
    async () => {
      const runtime = makeRuntime(() => undefined);
      const pty = createMockPty();
      const startTurn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const activate = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const openThread = vi.fn<() => Promise<string>>().mockResolvedValue("session-1");
      const ensureResumeArtifacts = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

      ptySpawnMock.mockReturnValueOnce(pty);

      const adapter = {
        kind: "codex" as const,
        label: "Codex",
        capabilities: {
          models: [{ id: "gpt-5.4", label: "5.4" }],
          efforts: ["high"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: [{ id: "on-request", label: "On Request" }],
          sandboxModes: [{ id: "workspace-write", label: "Workspace Write" }],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server" as const,
          presentationMode: "terminal" as const,
        },
        detectInstall: vi.fn<() => void>(),
        buildLaunchArgv: vi.fn<() => { binary: string; args: string[] }>(() => ({
          binary: "codex",
          args: ["resume", "session-1"],
        })),
        buildResumeArgv: vi.fn<() => void>(),
        createInitialSessionRef: vi
          .fn<() => { providerSessionId: string; discoveredAt: string } | undefined>()
          .mockReturnValue(undefined),
        createStructuredSession: vi.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue({
          launchOptions: {},
          activate,
          openThread,
          ensureResumeArtifacts,
          startTurn,
          setListener: vi.fn<(listener: unknown) => void>(),
          dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        }),
        isReadyForInitialPrompt: vi.fn<(text: string) => boolean>(() => false),
      };

      (
        runtime as unknown as {
          adapters: Map<string, typeof adapter>;
        }
      ).adapters.set("codex", adapter);

      await runtime.startThread({
        threadId: "thread-3",
        projectLocation: {
          kind: "windows",
          path: "C:\\repo",
        },
        agentKind: "codex",
        config: {
          model: "gpt-5.4",
        },
        prompt: "hi",
        initialSize: {
          cols: 132,
          rows: 42,
        },
      });

      expect(activate).toHaveBeenCalledTimes(1);
      expect(openThread).toHaveBeenCalledTimes(1);
      expect(ensureResumeArtifacts).toHaveBeenCalledTimes(1);
      expect(startTurn).not.toHaveBeenCalled();
      expect(ptySpawnMock).toHaveBeenCalledTimes(1);
      const [, spawnArgs, spawnOpts] = ptySpawnMock.mock.calls[0] as [
        string,
        string[],
        { cols: number; rows: number },
      ];
      // argv is wrapped by resolveLaunchSpec (PowerShell on Windows);
      // the binary name and resume arg appear inside the encoded script.
      const encoded = spawnArgs.includes("-EncodedCommand")
        ? Buffer.from(spawnArgs.at(-1)!, "base64").toString("utf16le")
        : spawnArgs.join(" ");
      expect(encoded).toContain("codex");
      expect(encoded).toContain("session-1");
      expect(spawnOpts).toMatchObject({ cols: 132, rows: 42 });
    },
  );

  it("starts Codex GUI presentation on the structured session without a PTY and stays visually working", async () => {
    const emitted: Array<Record<string, unknown>> = [];
    const runtime = makeRuntime((event) => {
      emitted.push(event as Record<string, unknown>);
    });
    const startTurn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const setListener = vi.fn<
      (listener: { onUpdate(update: Record<string, unknown>): void }) => void
    >((listener) => {
      listener.onUpdate({
        status: "idle",
        attention: "none",
        sessionRef: {
          providerSessionId: "session-1",
          discoveredAt: "2026-05-10T12:00:00.000Z",
        },
      });
    });

    const adapter = {
      kind: "generic-gui" as const,
      label: "Codex",
      capabilities: {
        models: [{ id: "gpt-5.4", label: "5.4" }],
        efforts: ["high"],
        modelEfforts: {},
        modes: ["agent"],
        approvalPolicies: [{ id: "on-request", label: "On Request" }],
        sandboxModes: [{ id: "workspace-write", label: "Workspace Write" }],
        supportsResume: true,
        supportsDirectInput: true,
        liveInputMode: "terminal" as const,
        presentationMode: "terminal" as const,
        presentationModes: ["terminal", "gui"] as const,
      },
      detectInstall: vi.fn<() => void>(),
      buildLaunchArgv: vi.fn<() => { binary: string; args: string[] }>(() => ({
        binary: "generic-gui",
        args: ["should-not-spawn"],
      })),
      buildResumeArgv: vi.fn<() => void>(),
      createInitialSessionRef: vi
        .fn<() => { providerSessionId: string; discoveredAt: string } | undefined>()
        .mockReturnValue(undefined),
      createStructuredSession: vi.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue({
        launchOptions: { suppressResumeConfigOverrides: true, resumeThreadId: "session-1" },
        activate: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        openThread: vi.fn<() => Promise<string>>().mockResolvedValue("session-1"),
        startTurn,
        setListener,
        dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      }),
    };

    (runtime as unknown as { adapters: Map<string, typeof adapter> }).adapters.set(
      "codex",
      adapter,
    );

    await runtime.startThread({
      threadId: "thread-gui-start",
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
      agentKind: "codex",
      config: {
        model: "gpt-5.4",
      },
      prompt: "hi",
      presentationMode: "gui",
      initialSize: {
        cols: 132,
        rows: 42,
      },
    });

    expect(adapter.buildLaunchArgv).not.toHaveBeenCalled();
    expect(ptySpawnMock).not.toHaveBeenCalled();
    expect(setListener).toHaveBeenCalledTimes(1);
    expect(startTurn).toHaveBeenCalledWith("hi", { model: "gpt-5.4" }, undefined, {
      userMessageItemId: expect.stringMatching(/^user-/),
    });
    expect(
      (runtime as unknown as { sessions: Map<string, { pty?: unknown }> }).sessions.get(
        "thread-gui-start",
      )?.pty,
    ).toBeUndefined();
    const threadStates = emitted.filter(
      (event) => event.type === "thread-state" && event.threadId === "thread-gui-start",
    );
    expect(threadStates[0]).toMatchObject({
      type: "thread-state",
      threadId: "thread-gui-start",
      status: "working",
      attention: "working",
      threadStatusSource: "server",
    });
    expect(threadStates).not.toContainEqual(
      expect.objectContaining({
        status: "launching",
      }),
    );
    expect(threadStates).not.toContainEqual(
      expect.objectContaining({
        status: "idle",
      }),
    );
    expect(threadStates.at(-1)).toMatchObject({
      status: "working",
      sessionRef: {
        providerSessionId: "session-1",
      },
    });
  });

  it("lets canonical turn completion close an optimistic GUI launch turn without assistant items", async () => {
    const emitted: Array<Record<string, unknown>> = [];
    const runtime = makeRuntime((event) => {
      emitted.push(event as Record<string, unknown>);
    });
    let runtimeListener:
      | {
          onUpdate(update: Record<string, unknown>): void;
          onRuntimeEvent(event: RuntimeEvent): void;
        }
      | undefined;
    const startTurn = vi.fn<() => Promise<void>>(async () => {
      runtimeListener?.onRuntimeEvent({
        type: "turn.completed",
        threadId: "thread-gui-complete-only",
        turnId: "turn-1",
        state: "completed",
      });
      runtimeListener?.onUpdate({ status: "idle", attention: "none" });
    });
    const setListener = vi.fn<
      (listener: {
        onUpdate(update: Record<string, unknown>): void;
        onRuntimeEvent(event: RuntimeEvent): void;
      }) => void
    >((listener) => {
      runtimeListener = listener;
      listener.onUpdate({
        status: "idle",
        attention: "none",
        sessionRef: {
          providerSessionId: "session-1",
          discoveredAt: "2026-05-10T12:00:00.000Z",
        },
      });
    });

    const adapter = {
      kind: "generic-gui" as const,
      label: "Generic GUI Provider",
      capabilities: {
        models: [{ id: "gpt-5.4", label: "5.4" }],
        efforts: ["high"],
        modelEfforts: {},
        modes: ["agent"],
        approvalPolicies: [{ id: "on-request", label: "On Request" }],
        sandboxModes: [{ id: "workspace-write", label: "Workspace Write" }],
        supportsResume: true,
        supportsDirectInput: true,
        liveInputMode: "terminal" as const,
        presentationMode: "terminal" as const,
        presentationModes: ["terminal", "gui"] as const,
      },
      detectInstall: vi.fn<() => void>(),
      buildLaunchArgv: vi.fn<() => { binary: string; args: string[] }>(() => ({
        binary: "generic-gui",
        args: ["should-not-spawn"],
      })),
      buildResumeArgv: vi.fn<() => void>(),
      createInitialSessionRef: vi
        .fn<() => { providerSessionId: string; discoveredAt: string } | undefined>()
        .mockReturnValue(undefined),
      createStructuredSession: vi.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue({
        launchOptions: { suppressResumeConfigOverrides: true, resumeThreadId: "session-1" },
        activate: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        openThread: vi.fn<() => Promise<string>>().mockResolvedValue("session-1"),
        startTurn,
        setListener,
        dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      }),
    };

    (runtime as unknown as { adapters: Map<string, typeof adapter> }).adapters.set(
      "generic-gui",
      adapter,
    );

    await runtime.startThread({
      threadId: "thread-gui-complete-only",
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
      agentKind: "generic-gui",
      config: {
        model: "gpt-5.4",
      },
      prompt: "hi",
      presentationMode: "gui",
      initialSize: {
        cols: 132,
        rows: 42,
      },
    });
    await Promise.resolve();

    const threadStates = emitted.filter(
      (event) => event.type === "thread-state" && event.threadId === "thread-gui-complete-only",
    );
    expect(threadStates[0]).toMatchObject({
      status: "working",
      attention: "working",
    });
    expect(threadStates.at(-1)).toMatchObject({
      status: "idle",
      attention: "none",
      sessionRef: {
        providerSessionId: "session-1",
      },
    });
  });

  it("lets a quick stop close an optimistic GUI launch turn before provider output", async () => {
    const emitted: Array<Record<string, unknown>> = [];
    const runtime = makeRuntime((event) => {
      emitted.push(event as Record<string, unknown>);
    });
    let runtimeListener: { onUpdate(update: Record<string, unknown>): void } | undefined;
    const startTurn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const interruptTurn = vi.fn<() => Promise<void>>(async () => {
      runtimeListener?.onUpdate({ status: "idle", attention: "none" });
    });
    const setListener = vi.fn<
      (listener: { onUpdate(update: Record<string, unknown>): void }) => void
    >((listener) => {
      runtimeListener = listener;
      listener.onUpdate({
        status: "idle",
        attention: "none",
        sessionRef: {
          providerSessionId: "session-1",
          discoveredAt: "2026-05-10T12:00:00.000Z",
        },
      });
    });

    const adapter = {
      kind: "generic-gui" as const,
      label: "Generic GUI Provider",
      capabilities: {
        models: [{ id: "gpt-5.4", label: "5.4" }],
        efforts: ["high"],
        modelEfforts: {},
        modes: ["agent"],
        approvalPolicies: [{ id: "on-request", label: "On Request" }],
        sandboxModes: [{ id: "workspace-write", label: "Workspace Write" }],
        supportsResume: true,
        supportsDirectInput: true,
        liveInputMode: "terminal" as const,
        presentationMode: "terminal" as const,
        presentationModes: ["terminal", "gui"] as const,
      },
      detectInstall: vi.fn<() => void>(),
      buildLaunchArgv: vi.fn<() => { binary: string; args: string[] }>(() => ({
        binary: "generic-gui",
        args: ["should-not-spawn"],
      })),
      buildResumeArgv: vi.fn<() => void>(),
      createInitialSessionRef: vi
        .fn<() => { providerSessionId: string; discoveredAt: string } | undefined>()
        .mockReturnValue(undefined),
      createStructuredSession: vi.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue({
        launchOptions: { suppressResumeConfigOverrides: true, resumeThreadId: "session-1" },
        activate: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        openThread: vi.fn<() => Promise<string>>().mockResolvedValue("session-1"),
        startTurn,
        interruptTurn,
        setListener,
        dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      }),
    };

    (runtime as unknown as { adapters: Map<string, typeof adapter> }).adapters.set(
      "generic-gui",
      adapter,
    );

    await runtime.startThread({
      threadId: "thread-gui-quick-stop",
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
      agentKind: "generic-gui",
      config: {
        model: "gpt-5.4",
      },
      prompt: "hi",
      presentationMode: "gui",
      initialSize: {
        cols: 132,
        rows: 42,
      },
    });

    emitted.length = 0;
    await runtime.interruptThread({ threadId: "thread-gui-quick-stop" });

    expect(interruptTurn).toHaveBeenCalledTimes(1);
    expect(emitted).toContainEqual(
      expect.objectContaining({
        type: "thread-state",
        threadId: "thread-gui-quick-stop",
        status: "idle",
        attention: "none",
      }),
    );
  });

  it("queues stop during GUI startup before the provider session exists", async () => {
    const emitted: Array<Record<string, unknown>> = [];
    const runtime = makeRuntime((event) => {
      emitted.push(event as Record<string, unknown>);
    });
    let resolveStructuredSession:
      | ((session: {
          launchOptions: Record<string, never>;
          activate: () => Promise<void>;
          openThread: () => Promise<string>;
          startTurn: () => Promise<void>;
          interruptTurn: () => Promise<void>;
          setListener: (listener: { onUpdate(update: Record<string, unknown>): void }) => void;
          dispose: () => Promise<void>;
        }) => void)
      | undefined;
    const startTurn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const interruptTurn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const setListener =
      vi.fn<(listener: { onUpdate(update: Record<string, unknown>): void }) => void>();
    const structuredSessionPromise = new Promise<{
      launchOptions: Record<string, never>;
      activate: () => Promise<void>;
      openThread: () => Promise<string>;
      startTurn: () => Promise<void>;
      interruptTurn: () => Promise<void>;
      setListener: (listener: { onUpdate(update: Record<string, unknown>): void }) => void;
      dispose: () => Promise<void>;
    }>((resolve) => {
      resolveStructuredSession = resolve;
    });

    const adapter = {
      kind: "generic-gui" as const,
      label: "Generic GUI Provider",
      capabilities: {
        models: [{ id: "model-a", label: "Model A" }],
        efforts: ["high"],
        modelEfforts: {},
        modes: ["agent"],
        approvalPolicies: [{ id: "on-request", label: "On Request" }],
        sandboxModes: [{ id: "workspace-write", label: "Workspace Write" }],
        supportsResume: true,
        supportsDirectInput: true,
        liveInputMode: "terminal" as const,
        presentationMode: "terminal" as const,
        presentationModes: ["terminal", "gui"] as const,
      },
      detectInstall: vi.fn<() => void>(),
      buildLaunchArgv: vi.fn<() => { binary: string; args: string[] }>(() => ({
        binary: "generic-gui",
        args: ["should-not-spawn"],
      })),
      buildResumeArgv: vi.fn<() => void>(),
      createInitialSessionRef: vi
        .fn<() => { providerSessionId: string; discoveredAt: string } | undefined>()
        .mockReturnValue(undefined),
      createStructuredSession: vi.fn<() => Promise<Record<string, unknown>>>(
        () => structuredSessionPromise,
      ),
    };

    (runtime as unknown as { adapters: Map<string, typeof adapter> }).adapters.set(
      "generic-gui",
      adapter,
    );

    const startPromise = runtime.startThread({
      threadId: "thread-gui-pre-session-stop",
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
      agentKind: "generic-gui",
      config: {
        model: "model-a",
      },
      prompt: "hi",
      presentationMode: "gui",
      initialSize: {
        cols: 132,
        rows: 42,
      },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(emitted).toContainEqual(
      expect.objectContaining({
        type: "thread-state",
        threadId: "thread-gui-pre-session-stop",
        status: "working",
      }),
    );

    emitted.length = 0;
    await runtime.interruptThread({ threadId: "thread-gui-pre-session-stop" });
    const dispose = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    expect(emitted).toContainEqual(
      expect.objectContaining({
        type: "thread-state",
        threadId: "thread-gui-pre-session-stop",
        status: "idle",
        attention: "none",
        forceCloseActiveTurn: true,
      }),
    );

    resolveStructuredSession?.({
      launchOptions: {},
      activate: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      openThread: vi.fn<() => Promise<string>>().mockResolvedValue("session-1"),
      startTurn,
      interruptTurn,
      setListener,
      dispose,
    });
    await startPromise;

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(setListener).not.toHaveBeenCalled();
    expect(startTurn).not.toHaveBeenCalled();
    expect(interruptTurn).not.toHaveBeenCalled();
    expect(emitted).toContainEqual(
      expect.objectContaining({
        type: "thread-state",
        threadId: "thread-gui-pre-session-stop",
        status: "idle",
        attention: "none",
      }),
    );
  });

  it("settles a queued GUI startup stop when ACP closes during activate", async () => {
    const emitted: Array<Record<string, unknown>> = [];
    const runtime = makeRuntime((event) => {
      emitted.push(event as Record<string, unknown>);
    });
    let resolveStructuredSession:
      | ((session: {
          launchOptions: Record<string, never>;
          activate: () => Promise<void>;
          openThread: () => Promise<string>;
          startTurn: () => Promise<void>;
          interruptTurn: () => Promise<void>;
          setListener: (listener: { onUpdate(update: Record<string, unknown>): void }) => void;
          dispose: () => Promise<void>;
        }) => void)
      | undefined;
    const activate = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(new Error("ACP connection closed"));
    const openThread = vi.fn<() => Promise<string>>().mockResolvedValue("session-1");
    const startTurn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const interruptTurn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const setListener =
      vi.fn<(listener: { onUpdate(update: Record<string, unknown>): void }) => void>();
    const dispose = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const structuredSessionPromise = new Promise<{
      launchOptions: Record<string, never>;
      activate: () => Promise<void>;
      openThread: () => Promise<string>;
      startTurn: () => Promise<void>;
      interruptTurn: () => Promise<void>;
      setListener: (listener: { onUpdate(update: Record<string, unknown>): void }) => void;
      dispose: () => Promise<void>;
    }>((resolve) => {
      resolveStructuredSession = resolve;
    });

    const adapter = {
      kind: "generic-gui" as const,
      label: "Generic GUI Provider",
      capabilities: {
        models: [{ id: "model-a", label: "Model A" }],
        efforts: ["high"],
        modelEfforts: {},
        modes: ["agent"],
        approvalPolicies: [{ id: "on-request", label: "On Request" }],
        sandboxModes: [{ id: "workspace-write", label: "Workspace Write" }],
        supportsResume: true,
        supportsDirectInput: true,
        liveInputMode: "terminal" as const,
        presentationMode: "terminal" as const,
        presentationModes: ["terminal", "gui"] as const,
      },
      detectInstall: vi.fn<() => void>(),
      buildLaunchArgv: vi.fn<() => { binary: string; args: string[] }>(() => ({
        binary: "generic-gui",
        args: ["should-not-spawn"],
      })),
      buildResumeArgv: vi.fn<() => void>(),
      createInitialSessionRef: vi
        .fn<() => { providerSessionId: string; discoveredAt: string } | undefined>()
        .mockReturnValue(undefined),
      createStructuredSession: vi.fn<() => Promise<Record<string, unknown>>>(
        () => structuredSessionPromise,
      ),
    };

    (runtime as unknown as { adapters: Map<string, typeof adapter> }).adapters.set(
      "generic-gui",
      adapter,
    );

    const startPromise = runtime.startThread({
      threadId: "thread-gui-activate-stop",
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
      agentKind: "generic-gui",
      config: {
        model: "model-a",
      },
      prompt: "hi",
      presentationMode: "gui",
      initialSize: {
        cols: 132,
        rows: 42,
      },
    });
    await Promise.resolve();
    await Promise.resolve();

    await runtime.interruptThread({ threadId: "thread-gui-activate-stop" });

    resolveStructuredSession?.({
      launchOptions: {},
      activate,
      openThread,
      startTurn,
      interruptTurn,
      setListener,
      dispose,
    });

    await expect(startPromise).resolves.toEqual({ threadId: "thread-gui-activate-stop" });
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(openThread).not.toHaveBeenCalled();
    expect(setListener).not.toHaveBeenCalled();
    expect(startTurn).not.toHaveBeenCalled();
    expect(interruptTurn).not.toHaveBeenCalled();
  });

  it("settles a Codex GUI /goal initial turn after the goal item is emitted", async () => {
    const emitted: Array<Record<string, unknown>> = [];
    const runtime = makeRuntime((event) => {
      emitted.push(event as Record<string, unknown>);
    });
    let runtimeListener:
      | {
          onUpdate(update: Record<string, unknown>): void;
          onRuntimeEvent(event: RuntimeEvent): void;
        }
      | undefined;
    const startTurn = vi.fn<() => Promise<void>>(async () => {
      runtimeListener?.onRuntimeEvent({
        type: "item.started",
        threadId: "thread-gui-goal",
        itemId: "goal-turn-1",
        itemType: "goal",
        payload: {
          action: "set",
          objective: "ship GUI goal support",
          status: "active",
        },
      });
      runtimeListener?.onRuntimeEvent({
        type: "item.completed",
        threadId: "thread-gui-goal",
        itemId: "goal-turn-1",
      });
      runtimeListener?.onUpdate({ status: "idle", attention: "none" });
    });
    const setListener = vi.fn<
      (listener: {
        onUpdate(update: Record<string, unknown>): void;
        onRuntimeEvent(event: RuntimeEvent): void;
      }) => void
    >((listener) => {
      runtimeListener = listener;
      listener.onUpdate({
        status: "idle",
        attention: "none",
        sessionRef: {
          providerSessionId: "session-1",
          discoveredAt: "2026-05-10T12:00:00.000Z",
        },
      });
    });

    const adapter = {
      kind: "codex" as const,
      label: "Codex",
      capabilities: {
        models: [{ id: "gpt-5.4", label: "5.4" }],
        efforts: ["high"],
        modelEfforts: {},
        modes: ["agent"],
        approvalPolicies: [{ id: "on-request", label: "On Request" }],
        sandboxModes: [{ id: "workspace-write", label: "Workspace Write" }],
        supportsResume: true,
        supportsDirectInput: true,
        liveInputMode: "terminal" as const,
        presentationMode: "terminal" as const,
        presentationModes: ["terminal", "gui"] as const,
      },
      detectInstall: vi.fn<() => void>(),
      buildLaunchArgv: vi.fn<() => { binary: string; args: string[] }>(() => ({
        binary: "codex",
        args: ["should-not-spawn"],
      })),
      buildResumeArgv: vi.fn<() => void>(),
      createInitialSessionRef: vi
        .fn<() => { providerSessionId: string; discoveredAt: string } | undefined>()
        .mockReturnValue(undefined),
      createStructuredSession: vi.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue({
        launchOptions: { suppressResumeConfigOverrides: true, resumeThreadId: "session-1" },
        activate: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        openThread: vi.fn<() => Promise<string>>().mockResolvedValue("session-1"),
        startTurn,
        setListener,
        dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      }),
    };

    (runtime as unknown as { adapters: Map<string, typeof adapter> }).adapters.set(
      "codex",
      adapter,
    );

    await runtime.startThread({
      threadId: "thread-gui-goal",
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
      agentKind: "codex",
      config: {
        model: "gpt-5.4",
      },
      prompt: "/goal ship GUI goal support",
      presentationMode: "gui",
      initialSize: {
        cols: 132,
        rows: 42,
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 25));

    const goalEvents = emitted.filter(
      (event) =>
        (event.type === "thread-runtime-event" || event.type === "thread-runtime-events") &&
        event.threadId === "thread-gui-goal",
    );
    const runtimeEvents = goalEvents.flatMap((event) =>
      event.type === "thread-runtime-events"
        ? ((event.events as RuntimeEvent[] | undefined) ?? [])
        : event.event
          ? [event.event as RuntimeEvent]
          : [],
    );
    expect(runtimeEvents).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        itemType: "goal",
      }),
    );
    const threadStates = emitted.filter(
      (event) => event.type === "thread-state" && event.threadId === "thread-gui-goal",
    );
    expect(threadStates[0]).toMatchObject({
      status: "working",
      attention: "working",
    });
    expect(threadStates.at(-1)).toMatchObject({
      status: "idle",
      attention: "none",
      sessionRef: {
        providerSessionId: "session-1",
      },
    });
  });

  it("inserts Codex hook enable flags before the positional prompt", async () => {
    const runtime = makeRuntime(() => undefined);
    const pty = createMockPty();

    ptySpawnMock.mockReturnValueOnce(pty);

    const adapter = {
      kind: "codex" as const,
      label: "Codex",
      capabilities: {
        models: [{ id: "gpt-5.4", label: "5.4" }],
        efforts: ["high"],
        modelEfforts: {},
        modes: ["agent"],
        approvalPolicies: [{ id: "on-request", label: "On Request" }],
        sandboxModes: [{ id: "workspace-write", label: "Workspace Write" }],
        supportsResume: true,
        supportsDirectInput: true,
        liveInputMode: "terminal" as const,
        presentationMode: "terminal" as const,
      },
      detectInstall: vi.fn<() => void>(),
      extraArgsPosition: codexExtraArgsPosition,
      buildLaunchArgv: vi.fn<() => { binary: string; args: string[] }>(() => ({
        binary: "codex",
        args: ["hello"],
      })),
      buildResumeArgv: vi.fn<() => void>(),
      createInitialSessionRef: vi
        .fn<() => { providerSessionId: string; discoveredAt: string } | undefined>()
        .mockReturnValue(undefined),
    };

    (runtime as unknown as { adapters: Map<string, typeof adapter> }).adapters.set(
      "codex",
      adapter,
    );
    (
      runtime as unknown as {
        cliHookPluginCoordinator: {
          resolvePluginEnvForSpawn: (input: unknown) => Promise<{
            env: Record<string, string>;
            extraArgs: string[];
          }>;
        };
      }
    ).cliHookPluginCoordinator.resolvePluginEnvForSpawn = vi.fn<
      (input: unknown) => Promise<{ env: Record<string, string>; extraArgs: string[] }>
    >(async () => ({
      env: { LIGHTCODE_HOOK_URL: "http://127.0.0.1:43123/v1/agent-event" },
      extraArgs: ["--enable", "hooks"],
    }));

    await runtime.startThread({
      threadId: "thread-hook-order",
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
      agentKind: "codex",
      config: {
        model: "gpt-5.4",
      },
      prompt: "hello",
      initialSize: {
        cols: 120,
        rows: 30,
      },
    });

    const [, spawnArgs] = ptySpawnMock.mock.calls[0] as [string, string[]];
    const command = decodeSpawnCommand(spawnArgs);
    expect(command.indexOf("--enable")).toBeGreaterThan(-1);
    expect(command.indexOf("hooks")).toBeGreaterThan(command.indexOf("--enable"));
    expect(command.indexOf("hello")).toBeGreaterThan(command.indexOf("hooks"));
  });

  it("inserts Codex hook enable flags before the resume session id", async () => {
    const runtime = makeRuntime(() => undefined);
    const pty = createMockPty();

    ptySpawnMock.mockReturnValueOnce(pty);

    const adapter = {
      kind: "codex" as const,
      label: "Codex",
      capabilities: {
        models: [{ id: "gpt-5.4", label: "5.4" }],
        efforts: ["high"],
        modelEfforts: {},
        modes: ["agent"],
        approvalPolicies: [{ id: "on-request", label: "On Request" }],
        sandboxModes: [{ id: "workspace-write", label: "Workspace Write" }],
        supportsResume: true,
        supportsDirectInput: true,
        liveInputMode: "terminal" as const,
        presentationMode: "terminal" as const,
      },
      detectInstall: vi.fn<() => void>(),
      extraArgsPosition: codexExtraArgsPosition,
      buildLaunchArgv: vi.fn<() => void>(),
      buildResumeArgv: vi.fn<() => { binary: string; args: string[] }>(() => ({
        binary: "codex",
        args: ["resume", "session-123", "next prompt"],
      })),
      createInitialSessionRef: vi
        .fn<() => { providerSessionId: string; discoveredAt: string } | undefined>()
        .mockReturnValue(undefined),
    };

    (runtime as unknown as { adapters: Map<string, typeof adapter> }).adapters.set(
      "codex",
      adapter,
    );
    (
      runtime as unknown as {
        cliHookPluginCoordinator: {
          resolvePluginEnvForSpawn: (input: unknown) => Promise<{
            env: Record<string, string>;
            extraArgs: string[];
          }>;
        };
      }
    ).cliHookPluginCoordinator.resolvePluginEnvForSpawn = vi.fn<
      (input: unknown) => Promise<{ env: Record<string, string>; extraArgs: string[] }>
    >(async () => ({
      env: { LIGHTCODE_HOOK_URL: "http://127.0.0.1:43123/v1/agent-event" },
      extraArgs: ["--enable", "hooks"],
    }));

    await runtime.startThread({
      threadId: "thread-hook-resume-order",
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
      agentKind: "codex",
      config: {
        model: "gpt-5.4",
      },
      sessionRef: {
        providerSessionId: "session-123",
        discoveredAt: new Date().toISOString(),
      },
      prompt: "next prompt",
      initialSize: {
        cols: 120,
        rows: 30,
      },
    });

    const [, spawnArgs] = ptySpawnMock.mock.calls[0] as [string, string[]];
    const command = decodeSpawnCommand(spawnArgs);
    expect(command.indexOf("--enable")).toBeGreaterThan(-1);
    expect(command.indexOf("hooks")).toBeGreaterThan(command.indexOf("--enable"));
    expect(command.indexOf("session-123")).toBeGreaterThan(command.indexOf("hooks"));
    expect(command.indexOf("next prompt")).toBeGreaterThan(command.indexOf("session-123"));
  });

  it("skips TUI parsing hooks for server-backed GUI presentation", () => {
    const runtime = makeRuntime(() => undefined);
    const pty = createMockPty();
    const detectAutoResponse = vi.fn<(text: string) => unknown>(() => null);
    const isReadyForInitialPrompt = vi.fn<(text: string) => boolean>(() => false);
    const detectTerminalStatus = vi.fn<(text: string) => unknown>(() => null);

    ptySpawnMock.mockReturnValueOnce(pty);

    (
      runtime as unknown as {
        spawnThread: (input: {
          threadId: string;
          agentKind: string;
          adapter: Record<string, unknown>;
          projectLocation: { kind: "windows"; path: string };
          config: { model: string };
          initialSize: { cols: number; rows: number };
          launchPrompt: string;
          command: { command: string; args: string[] };
        }) => unknown;
      }
    ).spawnThread({
      threadId: "thread-gui",
      agentKind: "codex",
      adapter: {
        kind: "codex",
        label: "Codex",
        capabilities: {
          models: [{ id: "gpt-5.4", label: "5.4" }],
          efforts: ["high"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: [{ id: "on-request", label: "On Request" }],
          sandboxModes: [{ id: "workspace-write", label: "Workspace Write" }],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "gui",
        },
        createInitialSessionRef: vi
          .fn<() => { providerSessionId: string; discoveredAt: string } | undefined>()
          .mockReturnValue(undefined),
        buildLaunchArgv: vi.fn<() => void>(),
        buildResumeArgv: vi.fn<() => void>(),
        detectAutoResponse,
        isReadyForInitialPrompt,
        detectTerminalStatus,
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
      config: {
        model: "gpt-5.4",
      },
      initialSize: {
        cols: 120,
        rows: 30,
      },
      launchPrompt: "",
      command: {
        command: "codex",
        args: [],
      },
    });

    pty.emitData("Update available!\nOpenAI Codex");

    expect(detectAutoResponse).not.toHaveBeenCalled();
    expect(isReadyForInitialPrompt).not.toHaveBeenCalled();
    expect(detectTerminalStatus).not.toHaveBeenCalled();
  });

  it.each(
    [
      {
        name: "posix",
        projectLocation: { kind: "posix" as const, path: "/tmp/repo" },
      },
      {
        name: "windows",
        projectLocation: { kind: "windows" as const, path: "C:\\repo" },
      },
    ].filter((variant) => variant.name !== "windows" || process.platform === "win32"),
  )(
    "passes a text + attachment prompt with special chars through to the launch arg unchanged on $name",
    async ({ projectLocation }) => {
      const runtime = makeRuntime(() => undefined);
      const pty = createMockPty();
      ptySpawnMock.mockReturnValueOnce(pty);

      const buildLaunchArgv = vi.fn<
        (location: unknown, config: unknown, prompt: string) => { binary: string; args: string[] }
      >((_location, _config, prompt) => ({
        binary: "claude",
        args: prompt.length > 0 ? ["--allow-dangerously-skip-permissions", prompt] : [],
      }));

      const adapter = {
        kind: "claude" as const,
        label: "Claude",
        capabilities: {
          models: [{ id: "opus", label: "Opus" }],
          efforts: ["high"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: [{ id: "default", label: "Default" }],
          sandboxModes: [],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "terminal" as const,
          presentationMode: "terminal" as const,
        },
        detectInstall: vi.fn<() => void>(),
        buildLaunchArgv,
        buildResumeArgv: vi.fn<() => void>(),
        createInitialSessionRef: vi.fn<() => undefined>().mockReturnValue(undefined),
        formatPromptSegments: (
          segments: Array<{ kind: string; content?: string; path?: string }>,
        ) => {
          const attachments = segments.filter((s) => s.kind === "attachment");
          const rest = segments.filter((s) => s.kind !== "attachment");
          const restStr = rest
            .map((s) => (s.kind === "file" ? `@${s.path}` : (s.content ?? "")))
            .join("");
          const attachmentLines = attachments.map((s) => `@${s.path}`).join(" ");
          return attachmentLines ? `${restStr}\n\n${attachmentLines} ` : restStr;
        },
      };

      (runtime as unknown as { adapters: Map<string, typeof adapter> }).adapters.set(
        "claude",
        adapter,
      );

      const spicyPrompt = "let's `do` $this\nwith 'quotes'";
      await runtime.startThread({
        threadId: "thread-prompt-quoting",
        projectLocation,
        agentKind: "claude",
        config: { model: "opus" },
        prompt: spicyPrompt,
        segments: [
          { kind: "text", content: spicyPrompt },
          { kind: "attachment", path: "/tmp/Image 1.png" },
        ],
        initialSize: { cols: 120, rows: 30 },
      });

      const formattedPrompt = `${spicyPrompt}\n\n@/tmp/Image 1.png `;
      const launchArgvCalls = buildLaunchArgv.mock.calls;
      expect(launchArgvCalls.length).toBeGreaterThan(0);
      expect(launchArgvCalls[0]![2]).toBe(formattedPrompt);

      const [, spawnArgs] = ptySpawnMock.mock.calls[0] as [string, string[]];
      const command = decodeSpawnCommand(spawnArgs);
      // Each problematic substring must survive the shell-quoting layer.
      expect(command).toContain("let");
      expect(command).toContain("do");
      expect(command).toContain("$this");
      expect(command).toContain("with");
      expect(command).toContain("quotes");
      expect(command).toContain("@/tmp/Image 1.png");
    },
  );
});
