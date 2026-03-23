import { beforeEach, describe, expect, it, vi } from "vitest";
import { SupervisorRuntime, writeSubmittedPrompt } from "./runtime";

function createRuntimeSession(overrides: Record<string, unknown> = {}) {
  return {
    instanceId: "instance-1",
    threadId: "thread-1",
    agentKind: "codex",
    adapter: {
      kind: "codex",
      label: "Codex CLI",
      capabilities: {
        models: [],
        efforts: [],
        modes: [],
        approvalPolicies: [],
        sandboxModes: [],
        supportsResume: true,
        supportsDirectInput: true,
        liveInputMode: "server",
      },
    },
    pty: {
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
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
    logPath: "thread.log",
    outputLength: 0,
    structuredSession: {
      launchOptions: {},
      activate: vi.fn().mockResolvedValue(undefined),
      startTurn: vi.fn().mockResolvedValue(undefined),
      resolveServerRequest: vi.fn().mockResolvedValue(undefined),
      setListener: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

describe("writeSubmittedPrompt", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("writes direct-input chunks sequentially with delays between them", async () => {
    vi.useFakeTimers();
    const write = vi.fn<(data: string) => void>();

    const pending = writeSubmittedPrompt({ write }, ["h", "i", "\r"]);

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenNthCalledWith(1, "h");

    await vi.runAllTimersAsync();
    await pending;

    expect(write).toHaveBeenCalledTimes(3);
    expect(write).toHaveBeenNthCalledWith(2, "i");
    expect(write).toHaveBeenNthCalledWith(3, "\r");
    vi.useRealTimers();
  });

  it("routes server-controlled thread input through structured turn start", async () => {
    const emitted: unknown[] = [];
    const runtime = new SupervisorRuntime((event) => {
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

    expect(session.structuredSession.startTurn).toHaveBeenCalledWith("hello", {
      model: "gpt-5.4",
    });
    expect(session.pty.write).not.toHaveBeenCalled();
    expect(emitted).toEqual([
      expect.objectContaining({
        type: "thread-state",
        threadId: session.threadId,
        status: "working",
        attention: "working",
      }),
    ]);
  });

  it("returns immediately while server-controlled turn start continues in the background", async () => {
    let resolveStartTurn: (() => void) | undefined;
    const emitted: unknown[] = [];
    const runtime = new SupervisorRuntime((event) => {
      emitted.push(event);
    });
    const session = createRuntimeSession({
      structuredSession: {
        launchOptions: {},
        activate: vi.fn().mockResolvedValue(undefined),
        startTurn: vi.fn(
          () =>
            new Promise<void>((resolve) => {
              resolveStartTurn = resolve;
            }),
        ),
        resolveServerRequest: vi.fn().mockResolvedValue(undefined),
        setListener: vi.fn(),
        dispose: vi.fn().mockResolvedValue(undefined),
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

    expect(session.structuredSession.startTurn).toHaveBeenCalledWith("hello", {
      model: "gpt-5.4",
    });
    expect(emitted).toEqual([
      expect.objectContaining({
        type: "thread-state",
        threadId: session.threadId,
        status: "working",
        attention: "working",
      }),
    ]);

    resolveStartTurn?.();
  });

  it("marks the thread as error when server-controlled turn start fails asynchronously", async () => {
    const emitted: unknown[] = [];
    const runtime = new SupervisorRuntime((event) => {
      emitted.push(event);
    });
    const session = createRuntimeSession({
      structuredSession: {
        launchOptions: {},
        activate: vi.fn().mockResolvedValue(undefined),
        startTurn: vi.fn().mockRejectedValue(new Error("request failed")),
        resolveServerRequest: vi.fn().mockResolvedValue(undefined),
        setListener: vi.fn(),
        dispose: vi.fn().mockResolvedValue(undefined),
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
        status: "working",
        attention: "working",
      }),
      expect.objectContaining({
        type: "thread-state",
        threadId: session.threadId,
        status: "error",
        attention: "error",
        errorMessage: "request failed",
      }),
    ]);
  });

  it("does not emit runtime status updates for raw terminal writes", async () => {
    const emitted: unknown[] = [];
    const runtime = new SupervisorRuntime((event) => {
      emitted.push(event);
    });
    const session = createRuntimeSession({
      adapter: {
        kind: "claude",
        label: "Claude Code CLI",
        capabilities: {
          models: [],
          efforts: [],
          modes: [],
          approvalPolicies: [],
          sandboxModes: [],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "terminal",
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
});
