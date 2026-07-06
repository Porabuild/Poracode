import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentKind, ThreadConfig } from "@/shared/contracts";
import type { AgentAdapter, StructuredSessionHandle } from "../agents/base";
import type { SessionRuntime } from "./sessionTypes";
import type { ThreadSessionManagerOptions } from "./threadSession/managerOptions";

const harness = vi.hoisted(() => {
  const spawn = vi.fn<
    (
      command: string,
      args: string[],
      options: { env: Record<string, string>; cwd?: string },
    ) => {
      pid: number;
      kill: () => void;
      onData: () => void;
      onExit: () => void;
      write: () => void;
      resize: () => void;
    }
  >();
  spawn.mockImplementation(() => ({
    pid: process.pid,
    kill: vi.fn<() => void>(),
    onData: vi.fn<() => void>(),
    onExit: vi.fn<() => void>(),
    write: vi.fn<() => void>(),
    resize: vi.fn<() => void>(),
  }));
  return { spawn };
});

vi.mock("node-pty", () => ({ spawn: harness.spawn }));

// Never let PtyLifecycle.kill escalate to a real process-tree kill on the
// mocked PTY's pid.
vi.mock("@/shared/processTree", () => ({
  terminateProcessTree: vi.fn<(pid: number) => void>(),
  terminateChildProcessTree: vi.fn<() => void>(),
}));

vi.mock("../agents/base", async (importActual) => {
  const actual = await importActual<typeof import("../agents/base")>();
  return {
    ...actual,
    primeProjectShellEnv: vi.fn<(cwd: string) => Promise<Record<string, string> | undefined>>(() =>
      Promise.resolve(undefined),
    ),
  };
});

import { primeProjectShellEnv } from "../agents/base";
import { ThreadSessionManager } from "./threadSessionManager";

const primeMock = vi.mocked(primeProjectShellEnv);

const AGENT_KIND: AgentKind = "term-test";
const THREAD_ID = "thread-term";
const PROJECT_LOCATION = { kind: "posix", path: "/repo" } as const;
const CONFIG: ThreadConfig = { model: "term-test/model" };

const managersToDispose: ThreadSessionManager[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  for (const manager of managersToDispose.splice(0)) {
    await manager.dispose();
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  harness.spawn.mockClear();
  primeMock.mockReset();
  primeMock.mockImplementation(() => Promise.resolve(undefined));
});

function createManager(
  adapter: AgentAdapter,
  extraOptions: Partial<ThreadSessionManagerOptions> = {},
): ThreadSessionManager {
  const tempDir = mkdtempSync(join(tmpdir(), "lightcode-restart-term-"));
  tempDirs.push(tempDir);
  const manager = new ThreadSessionManager({
    emit: vi.fn<() => void>(),
    isDev: false,
    logsDir: join(tempDir, "logs"),
    settingsPath: join(tempDir, "settings.json"),
    readDisableCliHookPlugin: () => false,
    adapters: new Map([[AGENT_KIND, adapter]]),
    windowsShell: { shell: "powershell.exe", kind: "powershell", args: ["-NoLogo"] },
    ...extraOptions,
  });
  managersToDispose.push(manager);
  return manager;
}

function createStructuredSession(
  overrides: Partial<StructuredSessionHandle> = {},
): StructuredSessionHandle {
  return {
    launchOptions: {},
    activate: vi.fn<NonNullable<StructuredSessionHandle["activate"]>>(async () => undefined),
    openThread: vi.fn<NonNullable<StructuredSessionHandle["openThread"]>>(
      async () => "ses_existing",
    ),
    setListener: vi.fn<StructuredSessionHandle["setListener"]>(),
    dispose: vi.fn<StructuredSessionHandle["dispose"]>(async () => undefined),
    ...overrides,
  };
}

function createTerminalAdapter(
  input: {
    liveInputMode?: "terminal" | "server";
    structuredSession?: StructuredSessionHandle;
  } = {},
): AgentAdapter {
  return {
    kind: AGENT_KIND,
    label: AGENT_KIND,
    binary: AGENT_KIND,
    capabilities: {
      models: [],
      efforts: [],
      modelEfforts: {},
      modes: [],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: input.liveInputMode ?? "terminal",
      presentationMode: "terminal",
      presentationModes: ["terminal"],
      settingDefs: [],
    },
    detectInstall: vi.fn<AgentAdapter["detectInstall"]>(),
    buildLaunchArgv: vi.fn<AgentAdapter["buildLaunchArgv"]>(() => ({
      binary: AGENT_KIND,
      args: ["--fresh"],
    })),
    buildResumeArgv: vi.fn<AgentAdapter["buildResumeArgv"]>((_location, _config, prompt) => ({
      binary: AGENT_KIND,
      args: ["resume", "ses_existing", ...(prompt.length > 0 ? [prompt] : [])],
    })),
    createInitialSessionRef: vi.fn<AgentAdapter["createInitialSessionRef"]>(() => undefined),
    ...(input.structuredSession
      ? {
          createStructuredSession: vi.fn<NonNullable<AgentAdapter["createStructuredSession"]>>(
            async () => input.structuredSession!,
          ),
        }
      : {}),
  };
}

function seedInactiveSession(
  manager: ThreadSessionManager,
  adapter: AgentAdapter,
  overrides: Partial<SessionRuntime> = {},
): SessionRuntime {
  const session = {
    instanceId: "instance-old",
    threadId: THREAD_ID,
    agentKind: AGENT_KIND,
    adapter,
    projectLocation: PROJECT_LOCATION,
    config: CONFIG,
    terminalSize: { cols: 100, rows: 30 },
    launchPrompt: "",
    sessionRef: { providerSessionId: "ses_existing" },
    status: "inactive",
    attention: "none",
    canResumeWithConfig: true,
    outputLength: 0,
    prevChunk: "",
    lastStrippedPtyChunk: "",
    ptyOscCarry: "",
    presentationMode: "terminal",
    ...overrides,
  } as SessionRuntime;
  manager.sessions.set(THREAD_ID, session);
  return session;
}

async function restart(manager: ThreadSessionManager, prompt = "resume work"): Promise<void> {
  await manager.sendThreadInput({ threadId: THREAD_ID, prompt, config: CONFIG });
}

describe("ThreadSessionManager terminal restart", () => {
  it("respawns an inactive terminal thread through buildResumeArgv with the prompt as launch arg", async () => {
    const adapter = createTerminalAdapter();
    const manager = createManager(adapter);
    const old = seedInactiveSession(manager, adapter);

    await restart(manager);

    expect(adapter.buildResumeArgv).toHaveBeenCalledTimes(1);
    expect(adapter.buildResumeArgv).toHaveBeenCalledWith(
      PROJECT_LOCATION,
      CONFIG,
      "resume work",
      { providerSessionId: "ses_existing" },
      expect.objectContaining({ agentSettings: expect.any(Object) }),
    );
    expect(adapter.buildLaunchArgv).not.toHaveBeenCalled();
    expect(harness.spawn).toHaveBeenCalledTimes(1);

    const restarted = manager.sessions.get(THREAD_ID);
    expect(restarted).toBeDefined();
    expect(restarted!.instanceId).not.toBe(old.instanceId);
    expect(restarted!.status).toBe("launching");
    expect(restarted!.launchPrompt).toBe("resume work");
    expect(restarted!.sessionRef).toEqual({ providerSessionId: "ses_existing" });
    expect(restarted!.presentationMode).toBe("terminal");
    expect(restarted!.structuredSession).toBeUndefined();
  });

  it("merges CLI hook extras into the resume argv and injects the hook env into the PTY", async () => {
    const adapter = createTerminalAdapter();
    const manager = createManager(adapter, {
      resolvePluginEnvForSpawn: async () => ({
        env: { LIGHTCODE_HOOK_URL: "http://127.0.0.1:9/hook", LIGHTCODE_HOOK_SECRET: "s3cret" },
        extraArgs: ["--hook-flag"],
      }),
    });
    seedInactiveSession(manager, adapter);

    await restart(manager);

    expect(harness.spawn).toHaveBeenCalledTimes(1);
    const [, spawnArgs, spawnOptions] = harness.spawn.mock.calls[0]!;
    // Posix launch specs may wrap the argv in a login-shell `-c` script, so
    // assert on the flattened command line instead of positional args.
    const commandLine = spawnArgs.join(" ");
    expect(commandLine).toContain("resume");
    expect(commandLine).toContain("--hook-flag");
    expect(spawnOptions.env.LIGHTCODE_HOOK_URL).toBe("http://127.0.0.1:9/hook");
    expect(spawnOptions.env.LIGHTCODE_HOOK_SECRET).toBe("s3cret");
    expect(manager.sessions.get(THREAD_ID)?.cliHookEnvInjected).toBe(true);
  });

  it("keeps the replacement structured session on a server-controlled terminal restart", async () => {
    const structuredSession = createStructuredSession();
    const adapter = createTerminalAdapter({ liveInputMode: "server", structuredSession });
    const manager = createManager(adapter);
    seedInactiveSession(manager, adapter);

    await restart(manager);

    expect(structuredSession.activate).toHaveBeenCalledTimes(1);
    expect(structuredSession.openThread).toHaveBeenCalledWith(CONFIG, {
      providerSessionId: "ses_existing",
    });
    expect(structuredSession.setListener).toHaveBeenCalledTimes(1);
    expect(structuredSession.dispose).not.toHaveBeenCalled();
    // Server-controlled flow owns the prompt: the PTY resume argv must not
    // carry it as a launch arg.
    expect(adapter.buildResumeArgv).toHaveBeenCalledWith(
      PROJECT_LOCATION,
      CONFIG,
      "",
      { providerSessionId: "ses_existing" },
      expect.anything(),
    );
    const restarted = manager.sessions.get(THREAD_ID);
    expect(restarted?.structuredSession).toBe(structuredSession);
    expect(harness.spawn).toHaveBeenCalledTimes(1);
  });

  it("disposes a non-kept structured session on a terminal-input restart", async () => {
    const structuredSession = createStructuredSession();
    const adapter = createTerminalAdapter({ liveInputMode: "terminal", structuredSession });
    const manager = createManager(adapter);
    seedInactiveSession(manager, adapter);

    await restart(manager);

    // liveInputMode "terminal" + terminal presentation → the replacement
    // structured session is discarded before the PTY spawns.
    expect(structuredSession.dispose).toHaveBeenCalledTimes(1);
    expect(harness.spawn).toHaveBeenCalledTimes(1);
    expect(manager.sessions.get(THREAD_ID)?.structuredSession).toBeUndefined();
  });
});

describe("ThreadSessionManager terminal restart race guards", () => {
  it("stops after the old structured session's dispose when the thread was replaced (guard 1)", async () => {
    const replacement = createStructuredSession();
    const adapter = createTerminalAdapter({ structuredSession: replacement });
    const manager = createManager(adapter);
    const oldStructured = createStructuredSession({
      dispose: vi.fn<StructuredSessionHandle["dispose"]>(async () => {
        manager.sessions.delete(THREAD_ID);
      }),
    });
    seedInactiveSession(manager, adapter, { structuredSession: oldStructured });

    await restart(manager);

    expect(oldStructured.dispose).toHaveBeenCalledTimes(1);
    expect(adapter.createStructuredSession).not.toHaveBeenCalled();
    expect(adapter.buildResumeArgv).not.toHaveBeenCalled();
    expect(harness.spawn).not.toHaveBeenCalled();
  });

  it("stops after the first shell-env prime when the thread was replaced (guard 2)", async () => {
    const adapter = createTerminalAdapter({ structuredSession: createStructuredSession() });
    const manager = createManager(adapter);
    seedInactiveSession(manager, adapter);
    primeMock.mockImplementationOnce(async () => {
      manager.sessions.delete(THREAD_ID);
      return undefined;
    });

    await restart(manager);

    expect(primeMock).toHaveBeenCalledTimes(1);
    expect(adapter.createStructuredSession).not.toHaveBeenCalled();
    expect(harness.spawn).not.toHaveBeenCalled();
  });

  it("disposes the replacement structured session created after the thread was replaced (guard 3)", async () => {
    const replacement = createStructuredSession();
    const adapter = createTerminalAdapter({ structuredSession: replacement });
    const manager = createManager(adapter);
    seedInactiveSession(manager, adapter);
    vi.mocked(adapter.createStructuredSession!).mockImplementationOnce(async () => {
      manager.sessions.delete(THREAD_ID);
      return replacement;
    });

    await restart(manager);

    expect(replacement.dispose).toHaveBeenCalledTimes(1);
    expect(replacement.activate).not.toHaveBeenCalled();
    expect(harness.spawn).not.toHaveBeenCalled();
  });

  it("disposes the replacement when the thread is replaced during activate (guard 4)", async () => {
    const replacement = createStructuredSession();
    const adapter = createTerminalAdapter({ structuredSession: replacement });
    const manager = createManager(adapter);
    seedInactiveSession(manager, adapter);
    vi.mocked(replacement.activate!).mockImplementationOnce(async () => {
      manager.sessions.delete(THREAD_ID);
    });

    await restart(manager);

    expect(replacement.dispose).toHaveBeenCalledTimes(1);
    expect(replacement.openThread).not.toHaveBeenCalled();
    expect(harness.spawn).not.toHaveBeenCalled();
  });

  it("disposes the replacement when the thread is replaced during openThread (guard 5)", async () => {
    const replacement = createStructuredSession();
    const adapter = createTerminalAdapter({ structuredSession: replacement });
    const manager = createManager(adapter);
    seedInactiveSession(manager, adapter);
    vi.mocked(replacement.openThread!).mockImplementationOnce(async () => {
      manager.sessions.delete(THREAD_ID);
      return "ses_existing";
    });

    await restart(manager);

    expect(replacement.dispose).toHaveBeenCalledTimes(1);
    expect(adapter.buildResumeArgv).not.toHaveBeenCalled();
    expect(harness.spawn).not.toHaveBeenCalled();
  });

  it("disposes the replacement when the thread is replaced while resolving hook extras (guard 6)", async () => {
    const replacement = createStructuredSession();
    const adapter = createTerminalAdapter({ structuredSession: replacement });
    let manager!: ThreadSessionManager;
    manager = createManager(adapter, {
      resolvePluginEnvForSpawn: async () => {
        manager.sessions.delete(THREAD_ID);
        return { env: {}, extraArgs: [] };
      },
    });
    seedInactiveSession(manager, adapter);

    await restart(manager);

    expect(replacement.dispose).toHaveBeenCalledTimes(1);
    expect(adapter.buildResumeArgv).not.toHaveBeenCalled();
    expect(harness.spawn).not.toHaveBeenCalled();
  });

  it("disposes the replacement when the thread is replaced during the pre-spawn prime (guard 7)", async () => {
    const replacement = createStructuredSession();
    const adapter = createTerminalAdapter({ structuredSession: replacement });
    const manager = createManager(adapter);
    seedInactiveSession(manager, adapter);
    let primeCalls = 0;
    primeMock.mockImplementation(async () => {
      primeCalls += 1;
      if (primeCalls === 2) {
        manager.sessions.delete(THREAD_ID);
      }
      return undefined;
    });

    await restart(manager);

    expect(primeCalls).toBe(2);
    expect(adapter.buildResumeArgv).toHaveBeenCalledTimes(1);
    expect(replacement.dispose).toHaveBeenCalledTimes(1);
    expect(harness.spawn).not.toHaveBeenCalled();
  });

  it("stops after discarding the non-kept structured session when the thread was replaced (guard 8)", async () => {
    const manager0: { current?: ThreadSessionManager } = {};
    const replacement = createStructuredSession({
      dispose: vi.fn<StructuredSessionHandle["dispose"]>(async () => {
        manager0.current?.sessions.delete(THREAD_ID);
      }),
    });
    const adapter = createTerminalAdapter({
      liveInputMode: "terminal",
      structuredSession: replacement,
    });
    const manager = createManager(adapter);
    manager0.current = manager;
    seedInactiveSession(manager, adapter);

    await restart(manager);

    expect(replacement.dispose).toHaveBeenCalledTimes(1);
    expect(adapter.buildResumeArgv).toHaveBeenCalledTimes(1);
    expect(harness.spawn).not.toHaveBeenCalled();
  });
});
