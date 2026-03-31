import { beforeEach, describe, expect, it, vi } from "vitest";

const taskkillSpawnSyncMock = vi.hoisted(() => vi.fn());
const ptySpawnMock = vi.hoisted(() => vi.fn());

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

vi.mock("node-pty", () => ({
  spawn: ptySpawnMock,
}));

import { detectWslAgentStatuses, SupervisorRuntime, writeSubmittedPrompt } from "./runtime";

function createMockPty() {
  let onDataHandler: ((data: string) => void) | undefined;
  let onExitHandler: ((event: { exitCode: number | null }) => void) | undefined;

  return {
    pid: 4242,
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn((handler: (data: string) => void) => {
      onDataHandler = handler;
    }),
    onExit: vi.fn((handler: (event: { exitCode: number | null }) => void) => {
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
    terminalSize: {
      cols: 120,
      rows: 30,
    },
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
    taskkillSpawnSyncMock.mockReset();
    ptySpawnMock.mockReset();
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

  it("uses taskkill instead of pty.kill when closing a Windows shell session", async () => {
    const runtime = new SupervisorRuntime(() => undefined);
    const shell = {
      instanceId: "shell-instance-1",
      shellId: "shell-1",
      pty: {
        pid: 4242,
        kill: vi.fn(),
        write: vi.fn(),
        resize: vi.fn(),
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
    const runtime = new SupervisorRuntime((event) => {
      emitted.push(event);
    });
    const pty = createMockPty();
    const startTurn = vi.fn().mockResolvedValue(undefined);

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
        createInitialSessionRef: vi.fn(),
        buildLaunchCommand: vi.fn(),
        buildResumeCommand: vi.fn(),
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
        setListener: vi.fn(),
        dispose: vi.fn().mockResolvedValue(undefined),
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
    expect(emitted).toContainEqual(
      expect.objectContaining({
        type: "thread-state",
        threadId: "thread-2",
        status: "working",
        attention: "working",
      }),
    );
  });

  it("does not eagerly start a queued Codex turn during thread startup", async () => {
    const runtime = new SupervisorRuntime(() => undefined);
    const pty = createMockPty();
    const startTurn = vi.fn().mockResolvedValue(undefined);
    const activate = vi.fn().mockResolvedValue(undefined);
    const openThread = vi.fn().mockResolvedValue("session-1");
    const ensureResumeArtifacts = vi.fn().mockResolvedValue(undefined);

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
      detectInstall: vi.fn(),
      buildLaunchCommand: vi.fn(() => ({
        command: "codex",
        args: ["resume", "session-1"],
      })),
      buildResumeCommand: vi.fn(),
      createInitialSessionRef: vi.fn(),
      createStructuredSession: vi.fn().mockResolvedValue({
        launchOptions: {},
        activate,
        openThread,
        ensureResumeArtifacts,
        startTurn,
        setListener: vi.fn(),
        dispose: vi.fn().mockResolvedValue(undefined),
      }),
      isReadyForInitialPrompt: vi.fn(() => false),
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
    expect(ptySpawnMock).toHaveBeenCalledWith(
      "codex",
      ["resume", "session-1"],
      expect.objectContaining({
        cols: 132,
        rows: 42,
      }),
    );
  });

  it("skips TUI parsing hooks for server-backed GUI presentation", () => {
    const runtime = new SupervisorRuntime(() => undefined);
    const pty = createMockPty();
    const detectAutoResponse = vi.fn(() => null);
    const isReadyForInitialPrompt = vi.fn(() => false);
    const detectTerminalStatus = vi.fn(() => null);

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
        createInitialSessionRef: vi.fn(),
        buildLaunchCommand: vi.fn(),
        buildResumeCommand: vi.fn(),
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
});

describe("detectWslAgentStatuses", () => {
  it("detects statuses for every adapter in every distro", async () => {
    const detectInstall = vi.fn(
      async (ctx?: { envKind: "windows" | "wsl"; wslDistro?: string }) => ({
        kind: "codex" as const,
        label: `Codex ${ctx?.wslDistro ?? "windows"}`,
        installed: ctx?.wslDistro === "Ubuntu",
        authState: "unknown" as const,
        capabilities: {
          models: [],
          efforts: [],
          modelEfforts: {},
          modes: [],
          approvalPolicies: [],
          sandboxModes: [],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server" as const,
          presentationMode: "terminal" as const,
        },
      }),
    );

    const statuses = await detectWslAgentStatuses(
      [
        {
          kind: "codex",
          label: "Codex",
          capabilities: {
            models: [],
            efforts: [],
            modelEfforts: {},
            modes: [],
            approvalPolicies: [],
            sandboxModes: [],
            supportsResume: true,
            supportsDirectInput: true,
            liveInputMode: "server",
            presentationMode: "terminal",
          },
          detectInstall,
          buildLaunchCommand: vi.fn(),
          buildResumeCommand: vi.fn(),
          createInitialSessionRef: vi.fn(),
        },
      ],
      ["Ubuntu", "Debian"],
    );

    expect(detectInstall).toHaveBeenCalledTimes(2);
    expect(detectInstall).toHaveBeenNthCalledWith(1, { envKind: "wsl", wslDistro: "Ubuntu" });
    expect(detectInstall).toHaveBeenNthCalledWith(2, { envKind: "wsl", wslDistro: "Debian" });
    expect(statuses).toEqual([
      expect.objectContaining({ envKind: "wsl", envDistro: "Ubuntu", installed: true }),
      expect.objectContaining({ envKind: "wsl", envDistro: "Debian", installed: false }),
    ]);
  });
});
