import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentKind } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import type { AgentAdapter, StructuredSessionHandle } from "../agents/base";
import type { SessionRuntime } from "./sessionTypes";

const captureSupervisorException = vi.hoisted(() =>
  vi.fn<(error: unknown, tags?: Record<string, string>) => void>(),
);

vi.mock("../diagnostics/sentry", async (importActual) => {
  const actual = await importActual<typeof import("../diagnostics/sentry")>();
  return { ...actual, captureSupervisorException };
});

vi.mock("../agents/base", async (importActual) => {
  const actual = await importActual<typeof import("../agents/base")>();
  return {
    ...actual,
    primeProjectShellEnv: vi.fn<(cwd: string) => Promise<Record<string, string> | undefined>>(() =>
      Promise.resolve(undefined),
    ),
  };
});

// These tests synchronize lifecycle races with explicit deferred promises;
// the production-only 150ms process-settle pause adds no behavioral coverage.
vi.mock("node:timers/promises", async (importActual) => {
  const actual = await importActual<typeof import("node:timers/promises")>();
  return {
    ...actual,
    setTimeout: vi.fn<(delay?: number) => Promise<void>>(async () => undefined),
  };
});

import { ThreadSessionManager } from "./threadSessionManager";

vi.mock("node-pty", () => ({
  spawn: vi.fn<
    () => {
      pid: number;
      kill: () => void;
      onData: () => void;
      onExit: () => void;
      write: () => void;
    }
  >(() => ({
    pid: 123,
    kill: vi.fn<() => void>(),
    onData: vi.fn<() => void>(),
    onExit: vi.fn<() => void>(),
    write: vi.fn<() => void>(),
  })),
}));

function deferred<T = void>(): {
  promise: Promise<T>;
  resolve(value: T | PromiseLike<T>): void;
  reject(reason?: unknown): void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createManager(
  agentKind: AgentKind,
  adapter: AgentAdapter,
  emit: (event: SupervisorEvent) => void = vi.fn<(event: SupervisorEvent) => void>(),
): ThreadSessionManager {
  const tempDir = mkdtempSync(join(tmpdir(), "poracode-start-close-"));
  tempDirs.push(tempDir);
  const manager = new ThreadSessionManager({
    emit,
    isDev: false,
    logsDir: join(tempDir, "logs"),
    settingsPath: join(tempDir, "settings.json"),
    readDisableCliHookPlugin: () => false,
    adapters: new Map([[agentKind, adapter]]),
    windowsShell: { shell: "powershell.exe", kind: "powershell", args: ["-NoLogo"] },
  });
  managersToDispose.push(manager);
  return manager;
}

function createStructuredSession(
  activation: Promise<void>,
  onActivate?: () => void,
): StructuredSessionHandle {
  return {
    launchOptions: {},
    activate: vi.fn<NonNullable<StructuredSessionHandle["activate"]>>(() => {
      onActivate?.();
      return activation;
    }),
    openThread: vi.fn<NonNullable<StructuredSessionHandle["openThread"]>>(async () => "ses_test"),
    setListener: vi.fn<StructuredSessionHandle["setListener"]>(),
    dispose: vi.fn<StructuredSessionHandle["dispose"]>(async () => undefined),
  };
}

function createAdapter(
  agentKind: AgentKind,
  structuredSession: StructuredSessionHandle,
): AgentAdapter {
  return {
    kind: agentKind,
    label: agentKind,
    binary: agentKind,
    capabilities: {
      models: [],
      efforts: [],
      modelEfforts: {},
      modes: [],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "terminal",
      presentationMode: "terminal",
      presentationModes: ["terminal", "gui"],
      settingDefs: [],
    },
    detectInstall: vi.fn<AgentAdapter["detectInstall"]>(),
    buildLaunchArgv: vi.fn<AgentAdapter["buildLaunchArgv"]>(() => ({
      binary: agentKind,
      args: [],
    })),
    buildResumeArgv: vi.fn<AgentAdapter["buildResumeArgv"]>(() => ({
      binary: agentKind,
      args: [],
    })),
    createInitialSessionRef: vi.fn<AgentAdapter["createInitialSessionRef"]>(() => undefined),
    createStructuredSession: vi.fn<NonNullable<AgentAdapter["createStructuredSession"]>>(
      async () => structuredSession,
    ),
  };
}

function createInactiveRuntime(
  agentKind: AgentKind,
  adapter: AgentAdapter,
  structuredSession: StructuredSessionHandle,
): SessionRuntime {
  return {
    instanceId: `instance-${agentKind}`,
    threadId: `thread-${agentKind}`,
    agentKind,
    adapter,
    projectLocation: { kind: "windows", path: "C:\\repo" },
    config: { model: `${agentKind}/model` },
    terminalSize: { cols: 80, rows: 24 },
    launchPrompt: "",
    sessionRef: { providerSessionId: "ses_existing" },
    status: "inactive",
    attention: "none",
    canResumeWithConfig: true,
    outputLength: 0,
    prevChunk: "",
    lastStrippedPtyChunk: "",
    ptyOscCarry: "",
    presentationMode: "gui",
    structuredSession,
    mcpLaunchSnapshot: { mcpServers: [], disabledBuiltInMcpServerIds: [] },
  } as unknown as SessionRuntime;
}

const guardedStructuredProviders = ["codex", "opencode"] as const;
const managersToDispose: ThreadSessionManager[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  for (const manager of managersToDispose.splice(0)) {
    await manager.dispose();
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("ThreadSessionManager provider-session routing", () => {
  it("resolves both root and provider-owned child sessions to the live thread", () => {
    const structuredSession = createStructuredSession(Promise.resolve());
    structuredSession.ownsProviderSession = (sessionId) => sessionId === "ses_child";
    const adapter = createAdapter("opencode", structuredSession);
    adapter.capabilities.crossagentMcpRouting = "provider-session";
    const manager = createManager("opencode", adapter);
    const runtime = createInactiveRuntime("opencode", adapter, structuredSession);
    manager.sessions.set(runtime.threadId, runtime);
    manager.sessionsBySessionId.set("ses_existing", runtime);

    expect(manager.getThreadIdByProviderSessionId("ses_existing")).toBe(runtime.threadId);
    expect(manager.getThreadIdByProviderSessionId("ses_child")).toBe(runtime.threadId);
    expect(manager.getThreadIdByProviderSessionId("ses_unknown")).toBeUndefined();

    delete adapter.capabilities.crossagentMcpRouting;
    expect(manager.getThreadIdByProviderSessionId("ses_existing")).toBeUndefined();
  });
});

describe("ThreadSessionManager start guards", () => {
  it("waits for a reconnect before delivering input to the new live session", async () => {
    const activation = deferred();
    const structuredSession = createStructuredSession(activation.promise);
    structuredSession.startTurn = vi.fn<NonNullable<StructuredSessionHandle["startTurn"]>>(
      async () => undefined,
    );
    const adapter = createAdapter("codex", structuredSession);
    const manager = createManager("codex", adapter);
    const start = manager.startThread({
      threadId: "reconnecting-input",
      projectLocation: { kind: "windows", path: "C:\\repo" },
      agentKind: "codex",
      config: { model: "codex/model" },
      prompt: "",
      initialSize: { cols: 80, rows: 24 },
      sessionRef: {
        providerSessionId: "ses_existing",
        discoveredAt: "2026-08-15T00:00:00.000Z",
      },
      presentationMode: "gui",
    });
    await vi.waitFor(() => expect(structuredSession.activate).toHaveBeenCalledOnce());

    const delivered = vi.fn<() => void>();
    const send = manager
      .sendThreadInput({
        threadId: "reconnecting-input",
        prompt: "send after reconnect",
        config: { model: "codex/model" },
      })
      .then(delivered);
    await Promise.resolve();
    expect(delivered).not.toHaveBeenCalled();

    activation.resolve();
    await start;
    await send;
    expect(structuredSession.startTurn).toHaveBeenCalledWith(
      "send after reconnect",
      { model: "codex/model" },
      undefined,
      { userMessageItemId: expect.stringMatching(/^user-/) },
    );
  });

  it("reclassifies a premature reconnect steer from authoritative idle state", async () => {
    const activation = deferred();
    const structuredSession = createStructuredSession(activation.promise);
    structuredSession.startTurn = vi.fn<NonNullable<StructuredSessionHandle["startTurn"]>>(
      async () => undefined,
    );
    structuredSession.interruptTurn = vi.fn<NonNullable<StructuredSessionHandle["interruptTurn"]>>(
      async () => undefined,
    );
    structuredSession.steerTurn = vi.fn<NonNullable<StructuredSessionHandle["steerTurn"]>>(
      async () => undefined,
    );
    const adapter = createAdapter("codex", structuredSession);
    const manager = createManager("codex", adapter);
    const start = manager.startThread({
      threadId: "reconnecting-steer",
      projectLocation: { kind: "windows", path: "C:\\repo" },
      agentKind: "codex",
      config: { model: "codex/model" },
      prompt: "",
      initialSize: { cols: 80, rows: 24 },
      sessionRef: {
        providerSessionId: "ses_existing",
        discoveredAt: "2026-08-15T00:00:00.000Z",
      },
      presentationMode: "gui",
    });
    await vi.waitFor(() => expect(structuredSession.activate).toHaveBeenCalledOnce());

    const steer = manager.setPendingSteer({
      threadId: "reconnecting-steer",
      prompt: "normal turn after reconnect",
      config: { model: "codex/model" },
    });
    activation.resolve();
    await start;
    await steer;

    expect(structuredSession.startTurn).toHaveBeenCalledWith(
      "normal turn after reconnect",
      { model: "codex/model" },
      undefined,
      { userMessageItemId: expect.stringMatching(/^user-/) },
    );
    expect(structuredSession.interruptTurn).not.toHaveBeenCalled();
    expect(structuredSession.steerTurn).not.toHaveBeenCalled();
  });

  it("lets the IPC boundary exclusively own a structured GUI factory failure", async () => {
    captureSupervisorException.mockClear();
    const structuredSession = createStructuredSession(Promise.resolve());
    const adapter = createAdapter("codex", structuredSession);
    vi.mocked(adapter.createStructuredSession!).mockRejectedValueOnce(
      new Error("factory output with private provider details"),
    );
    const manager = createManager("codex", adapter);

    await expect(
      manager.startThread({
        threadId: "factory-failure",
        projectLocation: { kind: "windows", path: "C:\\repo" },
        agentKind: "codex",
        config: { model: "codex/model" },
        prompt: "",
        initialSize: { cols: 80, rows: 24 },
        presentationMode: "gui",
      }),
    ).rejects.toMatchObject({
      name: "StructuredRuntimeDiagnosticError",
      message: "Structured runtime session creation failed.",
    });
    expect(captureSupervisorException).not.toHaveBeenCalled();
  });

  it("reports an optional terminal structured factory failure once and falls back", async () => {
    captureSupervisorException.mockClear();
    const structuredSession = createStructuredSession(Promise.resolve());
    const adapter = createAdapter("codex", structuredSession);
    vi.mocked(adapter.createStructuredSession!).mockRejectedValueOnce(
      new Error("factory output with private provider details"),
    );
    const manager = createManager("codex", adapter);

    await expect(
      manager.startThread({
        threadId: "terminal-factory-failure",
        projectLocation: { kind: "windows", path: "C:\\repo" },
        agentKind: "codex",
        config: { model: "codex/model" },
        prompt: "",
        initialSize: { cols: 80, rows: 24 },
        presentationMode: "terminal",
      }),
    ).resolves.toEqual({ threadId: "terminal-factory-failure" });
    expect(captureSupervisorException).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        name: "StructuredRuntimeDiagnosticError",
        message: "Structured runtime session creation failed.",
      }),
      expect.objectContaining({
        "poracode.feature_area": "structured-runtime-session-creation",
      }),
    );
  });

  it("settles a closed working session so consumers never freeze at working", async () => {
    const structuredSession = createStructuredSession(Promise.resolve());
    const adapter = createAdapter("codex", structuredSession);
    const emit = vi.fn<(event: SupervisorEvent) => void>();
    const manager = createManager("codex", adapter, emit);
    const runtime = createInactiveRuntime("codex", adapter, structuredSession);
    runtime.threadId = "closed-thread";
    runtime.status = "working";
    runtime.attention = "working";
    manager.sessions.set(runtime.threadId, runtime);

    await manager.closeThread({ threadId: runtime.threadId });

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "thread-state",
        threadId: "closed-thread",
        status: "inactive",
        attention: "none",
        forceCloseActiveTurn: true,
      }),
    );
  });

  it("rejects a prompt for a closed session instead of dropping it", async () => {
    const structuredSession = createStructuredSession(Promise.resolve());
    const adapter = createAdapter("codex", structuredSession);
    const manager = createManager("codex", adapter);
    const runtime = createInactiveRuntime("codex", adapter, structuredSession);
    runtime.threadId = "closed-thread";
    manager.sessions.set(runtime.threadId, runtime);
    await manager.closeThread({ threadId: runtime.threadId });

    await expect(
      manager.sendThreadInput({
        threadId: "closed-thread",
        prompt: "late",
        config: { model: "codex/model" },
      }),
    ).rejects.toThrow("Unknown thread session: closed-thread");
    // Raw keystrokes racing a close stay idempotent — only prompts must survive.
    await expect(
      manager.writeTerminal({ threadId: "closed-thread", data: "late" }),
    ).resolves.toBeUndefined();
  });

  it.each(guardedStructuredProviders)(
    "delivers a prompt sent while a %s start is still in flight",
    async (agentKind) => {
      const activation = deferred<void>();
      const activationStarted = deferred<void>();
      const structuredSession: StructuredSessionHandle = {
        ...createStructuredSession(activation.promise, () => activationStarted.resolve()),
        startTurn: vi.fn<NonNullable<StructuredSessionHandle["startTurn"]>>(async () => undefined),
      };
      const adapter = createAdapter(agentKind, structuredSession);
      const manager = createManager(agentKind, adapter);

      const start = manager.startThread({
        threadId: `thread-${agentKind}`,
        projectLocation: { kind: "windows", path: "C:\\repo" },
        agentKind,
        config: { model: `${agentKind}/model` },
        prompt: "",
        initialSize: { cols: 80, rows: 24 },
        presentationMode: "gui",
      });
      await activationStarted.promise;

      // The session only lands in the map when the start settles; a prompt
      // typed during the spawn must wait for it, not fail as unknown.
      const send = manager.sendThreadInput({
        threadId: `thread-${agentKind}`,
        prompt: "queued while starting",
        config: { model: `${agentKind}/model` },
      });
      activation.resolve();
      await start;
      await expect(send).resolves.toBeUndefined();
      expect(structuredSession.startTurn).toHaveBeenCalledWith(
        "queued while starting",
        expect.objectContaining({ model: `${agentKind}/model` }),
        undefined,
        expect.objectContaining({ userMessageItemId: expect.any(String) }),
      );
    },
  );

  it("recovers a closed thread's state on interrupt", async () => {
    const structuredSession = createStructuredSession(Promise.resolve());
    const adapter = createAdapter("codex", structuredSession);
    const emit = vi.fn<(event: SupervisorEvent) => void>();
    const manager = createManager("codex", adapter, emit);
    const runtime = createInactiveRuntime("codex", adapter, structuredSession);
    runtime.threadId = "closed-thread";
    manager.sessions.set(runtime.threadId, runtime);
    await manager.closeThread({ threadId: runtime.threadId });
    emit.mockClear();

    await expect(manager.interruptThread({ threadId: "closed-thread" })).resolves.toBeUndefined();
    expect(emit).toHaveBeenCalledWith({
      type: "thread-state",
      threadId: "closed-thread",
      status: "inactive",
      attention: "none",
      canResumeWithConfig: false,
      forceCloseActiveTurn: true,
    });
  });

  it("preserves bookkeeping errors for never-known session ids", async () => {
    const structuredSession = createStructuredSession(Promise.resolve());
    const adapter = createAdapter("codex", structuredSession);
    const emit = vi.fn<(event: SupervisorEvent) => void>();
    const manager = createManager("codex", adapter, emit);

    await expect(
      manager.sendThreadInput({
        threadId: "never-known",
        prompt: "late",
        config: { model: "codex/model" },
      }),
    ).rejects.toThrow("Unknown thread session: never-known");
    await expect(manager.writeTerminal({ threadId: "never-known", data: "late" })).rejects.toThrow(
      "Unknown thread session: never-known",
    );
    // Interrupt is idempotent "ensure not running", so it settles rather than throws.
    await expect(manager.interruptThread({ threadId: "never-known" })).resolves.toBeUndefined();
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: "never-known", status: "inactive" }),
    );
  });

  it("bounds removal tombstones and clears one when the thread id is reused", async () => {
    const structuredSession = createStructuredSession(Promise.resolve());
    const adapter = createAdapter("codex", structuredSession);
    const manager = createManager("codex", adapter);
    const internal = manager as unknown as {
      recentlyRemovedThreadIds: Set<string>;
      rememberRemovedThread(threadId: string): void;
    };

    for (let index = 0; index < 257; index++) {
      internal.rememberRemovedThread(`removed-${index}`);
    }
    expect(internal.recentlyRemovedThreadIds.size).toBe(256);
    expect(internal.recentlyRemovedThreadIds.has("removed-0")).toBe(false);
    expect(internal.recentlyRemovedThreadIds.has("removed-256")).toBe(true);

    internal.rememberRemovedThread("reused-thread");
    await manager.startThread({
      threadId: "reused-thread",
      projectLocation: { kind: "windows", path: "C:\\repo" },
      agentKind: "codex",
      config: { model: "codex/model" },
      prompt: "",
      initialSize: { cols: 80, rows: 24 },
      presentationMode: "gui",
    });
    expect(internal.recentlyRemovedThreadIds.has("reused-thread")).toBe(false);
  });

  it("passes an empty MCP set to provider-owned structured sessions", async () => {
    const structuredSession = createStructuredSession(Promise.resolve());
    const adapter = createAdapter("opencode", structuredSession);
    adapter.capabilities.mcpConfigSource = "agentSettings";
    const manager = createManager("opencode", adapter);

    await manager.startThread({
      threadId: "thread-opencode-empty-mcp",
      projectLocation: { kind: "windows", path: "C:\\repo" },
      agentKind: "opencode",
      config: { model: "opencode/model" },
      prompt: "",
      initialSize: { cols: 80, rows: 24 },
      presentationMode: "gui",
      disabledBuiltInMcpServerIds: ["app-controls"],
    });

    expect(adapter.createStructuredSession).toHaveBeenCalledWith(
      expect.objectContaining({ mcpServers: [] }),
    );
  });

  it.each(guardedStructuredProviders)(
    "disposes a %s structured GUI session that is closed before activation completes",
    async (agentKind) => {
      const activation = deferred<void>();
      const activationStarted = deferred<void>();
      const structuredSession = createStructuredSession(activation.promise, () =>
        activationStarted.resolve(),
      );
      const adapter = createAdapter(agentKind, structuredSession);
      const manager = createManager(agentKind, adapter);

      const start = manager.startThread({
        threadId: `thread-${agentKind}`,
        projectLocation: { kind: "windows", path: "C:\\repo" },
        agentKind,
        config: { model: `${agentKind}/model` },
        prompt: "",
        initialSize: { cols: 80, rows: 24 },
        presentationMode: "gui",
      });
      await activationStarted.promise;
      expect(structuredSession.activate).toHaveBeenCalledTimes(1);

      await manager.closeThread({ threadId: `thread-${agentKind}` });
      activation.resolve();
      await start;

      expect(structuredSession.dispose).toHaveBeenCalledTimes(1);
      expect(structuredSession.openThread).not.toHaveBeenCalled();
      expect(manager.sessions.has(`thread-${agentKind}`)).toBe(false);
    },
  );

  it.each(guardedStructuredProviders)(
    "disposes a %s structured GUI session that is interrupted before activation completes",
    async (agentKind) => {
      const activation = deferred<void>();
      const activationStarted = deferred<void>();
      const structuredSession = createStructuredSession(activation.promise, () =>
        activationStarted.resolve(),
      );
      const adapter = createAdapter(agentKind, structuredSession);
      const manager = createManager(agentKind, adapter);

      const start = manager.startThread({
        threadId: `thread-${agentKind}`,
        projectLocation: { kind: "windows", path: "C:\\repo" },
        agentKind,
        config: { model: `${agentKind}/model` },
        prompt: "hello",
        initialSize: { cols: 80, rows: 24 },
        presentationMode: "gui",
      });
      await activationStarted.promise;
      expect(structuredSession.activate).toHaveBeenCalledTimes(1);

      await manager.interruptThread({ threadId: `thread-${agentKind}` });
      activation.resolve();
      await start;

      expect(structuredSession.dispose).toHaveBeenCalledTimes(1);
      expect(structuredSession.openThread).not.toHaveBeenCalled();
      expect(manager.sessions.has(`thread-${agentKind}`)).toBe(false);
    },
  );

  it.each(guardedStructuredProviders)(
    "disposes a %s structured GUI session when the manager is disposed during activation",
    async (agentKind) => {
      const activation = deferred<void>();
      const activationStarted = deferred<void>();
      const structuredSession = createStructuredSession(activation.promise, () =>
        activationStarted.resolve(),
      );
      const adapter = createAdapter(agentKind, structuredSession);
      const manager = createManager(agentKind, adapter);

      const start = manager.startThread({
        threadId: `thread-${agentKind}`,
        projectLocation: { kind: "windows", path: "C:\\repo" },
        agentKind,
        config: { model: `${agentKind}/model` },
        prompt: "hello",
        initialSize: { cols: 80, rows: 24 },
        presentationMode: "gui",
      });
      await activationStarted.promise;
      expect(structuredSession.activate).toHaveBeenCalledTimes(1);

      await manager.dispose();
      activation.resolve();
      await start;

      expect(structuredSession.dispose).toHaveBeenCalledTimes(1);
      expect(structuredSession.openThread).not.toHaveBeenCalled();
      expect(manager.sessions.has(`thread-${agentKind}`)).toBe(false);
    },
  );

  it.each(guardedStructuredProviders)(
    "disposes a replacement %s structured GUI session when the thread is closed during restart",
    async (agentKind) => {
      const activation = deferred<void>();
      const activationStarted = deferred<void>();
      const replacementSession = createStructuredSession(activation.promise, () =>
        activationStarted.resolve(),
      );
      const adapter = createAdapter(agentKind, replacementSession);
      const existingSession = createInactiveRuntime(
        agentKind,
        adapter,
        createStructuredSession(Promise.resolve()),
      );
      const manager = createManager(agentKind, adapter);
      manager.sessions.set(existingSession.threadId, existingSession);

      const restart = manager.sendThreadInput({
        threadId: existingSession.threadId,
        prompt: "resume work",
        config: { model: `${agentKind}/model` },
      });
      await activationStarted.promise;
      expect(replacementSession.activate).toHaveBeenCalledTimes(1);

      await manager.closeThread({ threadId: existingSession.threadId });
      activation.resolve();
      await restart;

      expect(replacementSession.dispose).toHaveBeenCalledTimes(1);
      expect(replacementSession.openThread).not.toHaveBeenCalled();
      expect(manager.sessions.has(existingSession.threadId)).toBe(false);
    },
  );
});
