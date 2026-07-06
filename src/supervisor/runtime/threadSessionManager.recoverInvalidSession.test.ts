import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentKind, ThreadConfig } from "@/shared/contracts";
import type { AgentAdapter, StructuredSessionHandle } from "../agents/base";
import type { ThreadSessionManagerOptions } from "./threadSession/managerOptions";

const harness = vi.hoisted(() => {
  const events: string[] = [];
  const kill = vi.fn<() => void>(() => {
    events.push("kill");
  });
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
  >(() => {
    events.push("spawn");
    return {
      pid: process.pid,
      kill,
      onData: vi.fn<() => void>(),
      onExit: vi.fn<() => void>(),
      write: vi.fn<() => void>(),
      resize: vi.fn<() => void>(),
    };
  });
  const terminateProcessTree = vi.fn<(pid: number) => void>(() => {
    events.push("kill");
  });
  return { events, spawn, terminateProcessTree };
});

vi.mock("node-pty", () => ({ spawn: harness.spawn }));

// PtyLifecycle.kill goes through terminateProcessTree on win32 and pty.kill()
// elsewhere — both are captured as a "kill" event, and neither may touch a
// real process.
vi.mock("@/shared/processTree", () => ({
  terminateProcessTree: harness.terminateProcessTree,
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

const AGENT_KIND: AgentKind = "recover-test";
const THREAD_ID = "thread-recover";
const PROJECT_LOCATION = { kind: "posix", path: "/repo" } as const;
const CONFIG: ThreadConfig = { model: "recover-test/model" };
const INVALID_REF_BANNER = "\r\nNo conversation found with session ID ses_existing\r\n";

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
  harness.terminateProcessTree.mockClear();
  harness.events.length = 0;
  primeMock.mockReset();
  primeMock.mockImplementation(() => Promise.resolve(undefined));
});

function createManager(
  adapter: AgentAdapter,
  extraOptions: Partial<ThreadSessionManagerOptions> = {},
): ThreadSessionManager {
  const tempDir = mkdtempSync(join(tmpdir(), "lightcode-recover-"));
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

function createAdapter(structuredSession?: StructuredSessionHandle): AgentAdapter {
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
      liveInputMode: structuredSession ? "server" : "terminal",
      presentationMode: "terminal",
      presentationModes: ["terminal"],
      settingDefs: [],
    },
    detectInstall: vi.fn<AgentAdapter["detectInstall"]>(),
    // Detection needs at least one terminal-observer capability wired; the
    // pipeline's invalid-ref check itself keys off detectInvalidSessionRef.
    detectTerminalStatus: vi.fn<NonNullable<AgentAdapter["detectTerminalStatus"]>>(() => null),
    detectInvalidSessionRef: (text: string) => text.includes("No conversation found"),
    buildLaunchArgv: vi.fn<AgentAdapter["buildLaunchArgv"]>(() => ({
      binary: AGENT_KIND,
      args: ["--fresh"],
    })),
    buildResumeArgv: vi.fn<AgentAdapter["buildResumeArgv"]>(() => ({
      binary: AGENT_KIND,
      args: ["resume", "ses_existing"],
    })),
    createInitialSessionRef: vi.fn<AgentAdapter["createInitialSessionRef"]>(() => undefined),
    ...(structuredSession
      ? {
          createStructuredSession: vi.fn<NonNullable<AgentAdapter["createStructuredSession"]>>(
            async () => structuredSession,
          ),
        }
      : {}),
  };
}

async function startResumedThread(manager: ThreadSessionManager): Promise<void> {
  await manager.startThread({
    threadId: THREAD_ID,
    projectLocation: PROJECT_LOCATION,
    agentKind: AGENT_KIND,
    config: CONFIG,
    prompt: "",
    initialSize: { cols: 100, rows: 30 },
    sessionRef: { providerSessionId: "ses_existing", discoveredAt: "2026-01-01T00:00:00.000Z" },
  });
}

describe("ThreadSessionManager invalid session ref recovery", () => {
  it("disposes, kills, and respawns without the stale session ref", async () => {
    const structuredSession = createStructuredSession({
      dispose: vi.fn<StructuredSessionHandle["dispose"]>(async () => {
        harness.events.push("dispose");
      }),
    });
    const adapter = createAdapter(structuredSession);
    const manager = createManager(adapter);
    await startResumedThread(manager);

    const session = manager.sessions.get(THREAD_ID)!;
    expect(session.status).toBe("launching");
    expect(session.structuredSession).toBe(structuredSession);
    harness.events.length = 0;
    harness.spawn.mockClear();

    manager.handlePtyDataForTests(session, INVALID_REF_BANNER);

    await vi.waitFor(() => {
      expect(harness.spawn).toHaveBeenCalledTimes(1);
    });

    expect(session.invalidSessionRecoveryStarted).toBe(true);
    expect(harness.events).toEqual(["dispose", "kill", "spawn"]);
    expect(adapter.buildLaunchArgv).toHaveBeenCalledTimes(1);
    const launchCall = vi.mocked(adapter.buildLaunchArgv).mock.calls[0]!;
    expect(launchCall[0]).toEqual(PROJECT_LOCATION);
    expect(launchCall[1]).toEqual(CONFIG);
    expect(launchCall[2]).toBe("");
    expect(launchCall[3]).toBeUndefined();
    expect(adapter.buildResumeArgv).toHaveBeenCalledTimes(1); // initial start only

    const recovered = manager.sessions.get(THREAD_ID)!;
    expect(recovered.instanceId).not.toBe(session.instanceId);
    expect(recovered.sessionRef).toBeUndefined();
    expect(recovered.canResumeWithConfig).toBe(false);
    expect(recovered.status).toBe("launching");
  });

  it("runs recovery only once per session even if the banner repeats", async () => {
    const adapter = createAdapter(createStructuredSession());
    const manager = createManager(adapter);
    await startResumedThread(manager);
    const session = manager.sessions.get(THREAD_ID)!;
    harness.spawn.mockClear();

    manager.handlePtyDataForTests(session, INVALID_REF_BANNER);
    manager.handlePtyDataForTests(session, INVALID_REF_BANNER);

    await vi.waitFor(() => {
      expect(harness.spawn).toHaveBeenCalledTimes(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(harness.spawn).toHaveBeenCalledTimes(1);
  });

  it("aborts immediately when the recovering session was already replaced (guard 1)", async () => {
    const structuredSession = createStructuredSession();
    const adapter = createAdapter(structuredSession);
    const manager = createManager(adapter);
    await startResumedThread(manager);
    const session = manager.sessions.get(THREAD_ID)!;
    harness.spawn.mockClear();
    manager.sessions.delete(THREAD_ID);

    manager.handlePtyDataForTests(session, INVALID_REF_BANNER);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(session.invalidSessionRecoveryStarted).toBe(true);
    expect(session.ignoreExit).toBeUndefined();
    expect(structuredSession.dispose).not.toHaveBeenCalled();
    expect(harness.spawn).not.toHaveBeenCalled();
  });

  it("aborts after teardown when the thread was replaced during dispose (guard 2)", async () => {
    let manager!: ThreadSessionManager;
    const structuredSession = createStructuredSession({
      dispose: vi.fn<StructuredSessionHandle["dispose"]>(async () => {
        manager.sessions.delete(THREAD_ID);
      }),
    });
    const adapter = createAdapter(structuredSession);
    manager = createManager(adapter);
    await startResumedThread(manager);
    const session = manager.sessions.get(THREAD_ID)!;
    harness.spawn.mockClear();

    manager.handlePtyDataForTests(session, INVALID_REF_BANNER);
    await vi.waitFor(() => {
      expect(structuredSession.dispose).toHaveBeenCalledTimes(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(adapter.buildLaunchArgv).not.toHaveBeenCalled();
    expect(harness.spawn).not.toHaveBeenCalled();
  });

  it("aborts before building the argv when the thread was replaced during hook-extra resolution (guard 3)", async () => {
    const adapter = createAdapter(createStructuredSession());
    let manager!: ThreadSessionManager;
    let interceptHookResolution = false;
    manager = createManager(adapter, {
      resolvePluginEnvForSpawn: async () => {
        if (interceptHookResolution) {
          manager.sessions.delete(THREAD_ID);
        }
        return { env: {}, extraArgs: [] };
      },
    });
    await startResumedThread(manager);
    const session = manager.sessions.get(THREAD_ID)!;
    harness.spawn.mockClear();
    interceptHookResolution = true;

    manager.handlePtyDataForTests(session, INVALID_REF_BANNER);
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(adapter.buildLaunchArgv).not.toHaveBeenCalled();
    expect(harness.spawn).not.toHaveBeenCalled();
  });

  it("aborts before spawning when the thread was replaced during the pre-spawn prime (guard 4)", async () => {
    const adapter = createAdapter(createStructuredSession());
    const manager = createManager(adapter);
    await startResumedThread(manager);
    const session = manager.sessions.get(THREAD_ID)!;
    harness.spawn.mockClear();
    primeMock.mockImplementation(async () => {
      manager.sessions.delete(THREAD_ID);
      return undefined;
    });

    manager.handlePtyDataForTests(session, INVALID_REF_BANNER);
    await vi.waitFor(() => {
      expect(adapter.buildLaunchArgv).toHaveBeenCalledTimes(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(harness.spawn).not.toHaveBeenCalled();
  });
});
