import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentKind } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import type { AgentAdapter, StructuredSessionHandle } from "../agents/base";
import type { SessionRuntime } from "./sessionTypes";
import type { ThreadSessionManagerOptions } from "./threadSession/managerOptions";

vi.mock("../agents/base", async (importActual) => {
  const actual = await importActual<typeof import("../agents/base")>();
  return {
    ...actual,
    primeProjectShellEnv: vi.fn<(cwd: string) => Promise<Record<string, string> | undefined>>(() =>
      Promise.resolve(undefined),
    ),
  };
});

import { ThreadSessionManager } from "./threadSessionManager";
import { STRUCTURED_INTERRUPT_STALE_KILL_MS } from "./threadSession/userInterrupt";

vi.mock("node-pty", () => ({
  spawn: vi.fn<() => unknown>(() => ({
    pid: 123,
    kill: vi.fn<() => void>(),
    onData: vi.fn<() => void>(),
    onExit: vi.fn<() => void>(),
    write: vi.fn<() => void>(),
  })),
}));

/**
 * Covers the structured force-stop watchdog (`ThreadSessionManager`): a GUI
 * thread only leaves `working` once the agent acks the cancel, so a stale or
 * disconnected session would otherwise spin on "waiting for agent to stop"
 * forever. The watchdog disposes the dead session and forces `error` after the
 * grace window, and bails if the turn already ended (the cancel was honored).
 */

const AGENT_KIND: AgentKind = "grok";
const THREAD_ID = "thread-stale";

const managersToDispose: ThreadSessionManager[] = [];
const tempDirs: string[] = [];

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(async () => {
  vi.useRealTimers();
  for (const manager of managersToDispose.splice(0)) {
    await manager.dispose();
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createStructuredSession(
  overrides: Partial<StructuredSessionHandle> = {},
): StructuredSessionHandle {
  return {
    launchOptions: {},
    // Best-effort, resolves immediately — mirrors ACP `connection.cancel`, which
    // returns even when the agent is dead and will never emit a status update.
    interruptTurn: vi.fn<NonNullable<StructuredSessionHandle["interruptTurn"]>>(
      async () => undefined,
    ),
    setListener: vi.fn<StructuredSessionHandle["setListener"]>(),
    dispose: vi.fn<StructuredSessionHandle["dispose"]>(async () => undefined),
    ...overrides,
  };
}

function createAdapter(structuredSession: StructuredSessionHandle): AgentAdapter & {
  createStructuredSession: NonNullable<AgentAdapter["createStructuredSession"]>;
} {
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
      liveInputMode: "server",
      presentationMode: "gui",
      presentationModes: ["gui"],
      settingDefs: [],
    },
    detectInstall: vi.fn<AgentAdapter["detectInstall"]>(),
    buildLaunchArgv: vi.fn<AgentAdapter["buildLaunchArgv"]>(() => ({
      binary: AGENT_KIND,
      args: [],
    })),
    buildResumeArgv: vi.fn<AgentAdapter["buildResumeArgv"]>(() => ({
      binary: AGENT_KIND,
      args: [],
    })),
    createInitialSessionRef: vi.fn<AgentAdapter["createInitialSessionRef"]>(() => undefined),
    createStructuredSession: vi.fn<NonNullable<AgentAdapter["createStructuredSession"]>>(
      async () => structuredSession,
    ),
  } as unknown as AgentAdapter & {
    createStructuredSession: NonNullable<AgentAdapter["createStructuredSession"]>;
  };
}

function createManager(
  adapter: AgentAdapter,
  extraOptions: Partial<ThreadSessionManagerOptions> = {},
): {
  manager: ThreadSessionManager;
  events: SupervisorEvent[];
} {
  const tempDir = mkdtempSync(join(tmpdir(), "poracode-stale-interrupt-"));
  tempDirs.push(tempDir);
  const events: SupervisorEvent[] = [];
  const manager = new ThreadSessionManager({
    emit: (event: SupervisorEvent) => {
      events.push(event);
    },
    isDev: false,
    logsDir: join(tempDir, "logs"),
    settingsPath: join(tempDir, "settings.json"),
    readDisableCliHookPlugin: () => false,
    adapters: new Map([[AGENT_KIND, adapter]]),
    windowsShell: { shell: "powershell.exe", kind: "powershell", args: ["-NoLogo"] },
    ...extraOptions,
  });
  managersToDispose.push(manager);
  return { manager, events };
}

function createWorkingSession(
  adapter: AgentAdapter,
  structuredSession: StructuredSessionHandle,
): SessionRuntime {
  return {
    instanceId: "instance-stale",
    threadId: THREAD_ID,
    agentKind: AGENT_KIND,
    adapter,
    projectLocation: { kind: "windows", path: "C:\\repo" },
    config: { model: `${AGENT_KIND}/model` },
    runtimeLaunchConfig: { model: `${AGENT_KIND}/model` },
    terminalSize: { cols: 80, rows: 24 },
    launchPrompt: "",
    sessionRef: { providerSessionId: "ses_existing" },
    status: "working",
    attention: "working",
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

describe("ThreadSessionManager structured stale-interrupt watchdog", () => {
  it("force-stops a stale session after the grace window: disposes it and forces error", async () => {
    const structuredSession = createStructuredSession();
    const adapter = createAdapter(structuredSession);
    const { manager, events } = createManager(adapter);
    const session = createWorkingSession(adapter, structuredSession);
    manager.sessions.set(THREAD_ID, session);

    await manager.interruptThread({ threadId: THREAD_ID });
    expect(structuredSession.interruptTurn).toHaveBeenCalledTimes(1);
    expect(session.structuredTurnInterruptRequested).toBe(true);
    expect(session.structuredInterruptWatchdog).toBeDefined();

    // No status update arrives (stale/disconnected) — almost expire, still stuck.
    vi.advanceTimersByTime(STRUCTURED_INTERRUPT_STALE_KILL_MS - 1);
    expect(session.status).toBe("working");
    expect(structuredSession.dispose).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(structuredSession.dispose).toHaveBeenCalledTimes(1);
    expect(session.structuredSession).toBeUndefined();
    expect(session.status).toBe("error");
    expect(session.structuredTurnInterruptRequested).toBe(false);
    expect(session.structuredInterruptWatchdog).toBeUndefined();
    expect(events).toContainEqual(
      expect.objectContaining({ type: "thread-state", threadId: THREAD_ID, status: "error" }),
    );
  });

  it("does not force-stop once the turn has left `working` (cancel honored)", async () => {
    const structuredSession = createStructuredSession();
    const adapter = createAdapter(structuredSession);
    const { manager } = createManager(adapter);
    const session = createWorkingSession(adapter, structuredSession);
    manager.sessions.set(THREAD_ID, session);

    await manager.interruptThread({ threadId: THREAD_ID });
    // Agent acknowledged the cancel: the turn ended before the watchdog fired.
    session.status = "idle";

    vi.advanceTimersByTime(STRUCTURED_INTERRUPT_STALE_KILL_MS + 1);
    expect(structuredSession.dispose).not.toHaveBeenCalled();
    expect(session.structuredSession).toBe(structuredSession);
    expect(session.status).toBe("idle");
  });

  it("ignores a stale session whose interrupt is no longer pending", async () => {
    const structuredSession = createStructuredSession();
    const adapter = createAdapter(structuredSession);
    const { manager } = createManager(adapter);
    const session = createWorkingSession(adapter, structuredSession);
    manager.sessions.set(THREAD_ID, session);

    await manager.interruptThread({ threadId: THREAD_ID });
    session.structuredTurnInterruptRequested = false;

    vi.advanceTimersByTime(STRUCTURED_INTERRUPT_STALE_KILL_MS + 1);
    expect(structuredSession.dispose).not.toHaveBeenCalled();
    expect(session.status).toBe("working");
  });

  it("restarts a force-stopped GUI session on the next submit", async () => {
    const structuredSession = createStructuredSession();
    const adapter = createAdapter(structuredSession);
    const { manager } = createManager(adapter);
    const session = createWorkingSession(adapter, structuredSession);
    manager.sessions.set(THREAD_ID, session);

    await manager.interruptThread({ threadId: THREAD_ID });
    vi.advanceTimersByTime(STRUCTURED_INTERRUPT_STALE_KILL_MS);

    const startTurn = vi.fn<NonNullable<StructuredSessionHandle["startTurn"]>>(
      async () => undefined,
    );
    const replacementSession = createStructuredSession({ startTurn });
    vi.mocked(adapter.createStructuredSession).mockResolvedValue(replacementSession);

    await manager.sendThreadInput({
      threadId: THREAD_ID,
      prompt: "after force stop",
      config: { model: `${AGENT_KIND}/model` },
    });

    expect(startTurn).toHaveBeenCalledTimes(1);
    expect(startTurn).toHaveBeenCalledWith(
      "after force stop",
      { model: `${AGENT_KIND}/model` },
      undefined,
      expect.objectContaining({ userMessageItemId: expect.any(String) }),
    );
    expect(manager.sessions.get(THREAD_ID)?.structuredSession).toBe(replacementSession);
  });

  it("preserves plugin skill segments when resuming an inactive GUI session", async () => {
    const oldSession = createStructuredSession();
    const startTurn = vi.fn<NonNullable<StructuredSessionHandle["startTurn"]>>(
      async () => undefined,
    );
    const replacementSession = createStructuredSession({ startTurn });
    const adapter = createAdapter(replacementSession);
    const buildSkillTurnInjection = vi.fn<
      NonNullable<ThreadSessionManagerOptions["buildSkillTurnInjection"]>
    >(async () => "Inline browser skill instructions");
    const { manager } = createManager(adapter, { buildSkillTurnInjection });
    const session = createWorkingSession(adapter, oldSession);
    session.status = "inactive";
    session.attention = "none";
    session.structuredSession = undefined;
    manager.sessions.set(THREAD_ID, session);
    const segments = [
      {
        kind: "skill" as const,
        name: "browser-control",
        path: "C:\\plugins\\browser-control\\SKILL.md",
        invocation: "/browser-control",
        provider: "Browser Tools",
        scope: "global" as const,
      },
      { kind: "text" as const, content: " resume work" },
    ];

    await manager.sendThreadInput({
      threadId: THREAD_ID,
      prompt: "/browser-control resume work",
      config: { model: `${AGENT_KIND}/model` },
      segments,
      userMessageItemId: "user-resume",
    });

    expect(buildSkillTurnInjection).toHaveBeenCalledWith({
      agentKind: AGENT_KIND,
      projectLocation: session.projectLocation,
      segments,
    });
    expect(startTurn).toHaveBeenCalledWith(
      "/browser-control resume work",
      { model: `${AGENT_KIND}/model` },
      segments,
      {
        userMessageItemId: "user-resume",
        inlineInstructions: "Inline browser skill instructions",
      },
    );
  });

  it("clears the watchdog when the manager is disposed", async () => {
    const structuredSession = createStructuredSession();
    const adapter = createAdapter(structuredSession);
    const { manager, events } = createManager(adapter);
    const session = createWorkingSession(adapter, structuredSession);
    manager.sessions.set(THREAD_ID, session);

    await manager.interruptThread({ threadId: THREAD_ID });
    expect(session.structuredInterruptWatchdog).toBeDefined();

    await manager.dispose();
    expect(session.structuredInterruptWatchdog).toBeUndefined();

    events.length = 0;
    vi.advanceTimersByTime(STRUCTURED_INTERRUPT_STALE_KILL_MS);
    expect(events).toEqual([]);
  });
});

describe("ThreadSessionManager steer capability", () => {
  function steerableSession(withSteer: boolean): StructuredSessionHandle & {
    startTurn: ReturnType<typeof vi.fn>;
    steerTurn?: ReturnType<typeof vi.fn>;
  } {
    const startTurn = vi.fn<NonNullable<StructuredSessionHandle["startTurn"]>>(
      async () => undefined,
    );
    const steerTurn = vi.fn<NonNullable<StructuredSessionHandle["steerTurn"]>>(
      async () => undefined,
    );
    return createStructuredSession({
      startTurn,
      ...(withSteer ? { steerTurn } : {}),
    }) as StructuredSessionHandle & {
      startTurn: typeof startTurn;
      steerTurn?: typeof steerTurn;
    };
  }

  it("reapplies plugin-managed apps to later turns without persisting them", async () => {
    const structuredSession = steerableSession(true);
    const adapter = createAdapter(structuredSession);
    const { manager } = createManager(adapter);
    const session = createWorkingSession(adapter, structuredSession);
    session.status = "idle";
    session.runtimeLaunchConfig = {
      ...session.config,
      browserMcp: true,
      computerUse: false,
    };
    session.mcpLaunchSnapshot.disabledBuiltInMcpServerIds = ["computer-use"];
    manager.sessions.set(THREAD_ID, session);

    await manager.sendThreadInput({
      threadId: THREAD_ID,
      prompt: "next turn",
      config: { model: `${AGENT_KIND}/updated` },
    });

    expect(structuredSession.startTurn).toHaveBeenCalledWith(
      "next turn",
      {
        model: `${AGENT_KIND}/updated`,
        browserMcp: true,
        computerUse: false,
      },
      undefined,
      expect.objectContaining({ userMessageItemId: expect.any(String) }),
    );
    expect(session.config).toEqual({ model: `${AGENT_KIND}/updated` });
  });

  it("keeps apps from a globally disabled plugin off on later turns", async () => {
    const structuredSession = steerableSession(true);
    const adapter = createAdapter(structuredSession);
    const applyPluginAppsToConfig = vi.fn<
      NonNullable<ThreadSessionManagerOptions["applyPluginAppsToConfig"]>
    >((config) => ({
      config: { ...config, browserMcp: false },
      disabledConfigKeys: ["browserMcp"],
    }));
    const { manager } = createManager(adapter, { applyPluginAppsToConfig });
    await manager.startThread({
      threadId: THREAD_ID,
      agentKind: AGENT_KIND,
      projectLocation: { kind: "windows", path: "C:\\repo" },
      config: { model: `${AGENT_KIND}/model` },
      prompt: "",
      initialSize: { cols: 80, rows: 24 },
      presentationMode: "gui",
    });
    const session = manager.sessions.get(THREAD_ID)!;

    expect(session.runtimeLaunchConfig.browserMcp).toBe(false);

    await manager.sendThreadInput({
      threadId: THREAD_ID,
      prompt: "next turn",
      config: { model: `${AGENT_KIND}/updated`, browserMcp: true },
    });

    expect(structuredSession.startTurn).toHaveBeenCalledWith(
      "next turn",
      { model: `${AGENT_KIND}/updated`, browserMcp: false },
      undefined,
      expect.objectContaining({ userMessageItemId: expect.any(String) }),
    );
    expect(session.config).toEqual({ model: `${AGENT_KIND}/updated`, browserMcp: true });
  });

  it("reapplies plugin-managed apps to non-interrupting steers", async () => {
    const structuredSession = steerableSession(true);
    const adapter = createAdapter(structuredSession);
    const { manager } = createManager(adapter);
    const session = createWorkingSession(adapter, structuredSession);
    session.runtimeLaunchConfig = { ...session.config, chromeMcp: true };
    manager.sessions.set(THREAD_ID, session);

    await manager.sendThreadInput({
      threadId: THREAD_ID,
      prompt: "steer with plugins",
      config: { model: `${AGENT_KIND}/updated` },
    });

    expect(structuredSession.steerTurn).toHaveBeenCalledWith(
      "steer with plugins",
      { model: `${AGENT_KIND}/updated`, chromeMcp: true },
      undefined,
      undefined,
    );
    expect(session.config).toEqual({ model: `${AGENT_KIND}/updated` });
  });

  it("submit-while-working uses steerTurn without interrupting when available", async () => {
    const structuredSession = steerableSession(true);
    const adapter = createAdapter(structuredSession);
    const { manager } = createManager(adapter);
    const session = createWorkingSession(adapter, structuredSession);
    manager.sessions.set(THREAD_ID, session);

    await manager.sendThreadInput({
      threadId: THREAD_ID,
      prompt: "steer me",
      config: { model: `${AGENT_KIND}/model` },
    });

    expect(structuredSession.steerTurn).toHaveBeenCalledTimes(1);
    expect(structuredSession.steerTurn).toHaveBeenCalledWith(
      "steer me",
      { model: `${AGENT_KIND}/model` },
      undefined,
      undefined,
    );
    expect(structuredSession.interruptTurn).not.toHaveBeenCalled();
    expect(structuredSession.startTurn).not.toHaveBeenCalled();
  });

  it("submit-while-working falls back to interrupt-drain when steerTurn is absent", async () => {
    const structuredSession = steerableSession(false);
    const adapter = createAdapter(structuredSession);
    const { manager } = createManager(adapter);
    const session = createWorkingSession(adapter, structuredSession);
    manager.sessions.set(THREAD_ID, session);

    await manager.sendThreadInput({
      threadId: THREAD_ID,
      prompt: "steer me",
      config: { model: `${AGENT_KIND}/model` },
    });

    expect(structuredSession.interruptTurn).toHaveBeenCalledTimes(1);
    expect(structuredSession.startTurn).not.toHaveBeenCalled();
  });

  it("setPendingSteer uses steerTurn without interrupting when available", async () => {
    const structuredSession = steerableSession(true);
    const adapter = createAdapter(structuredSession);
    const { manager } = createManager(adapter);
    const session = createWorkingSession(adapter, structuredSession);
    manager.sessions.set(THREAD_ID, session);

    await manager.setPendingSteer({
      threadId: THREAD_ID,
      prompt: "steer via slot",
      config: { model: `${AGENT_KIND}/model` },
    });

    expect(structuredSession.steerTurn).toHaveBeenCalledTimes(1);
    expect(structuredSession.interruptTurn).not.toHaveBeenCalled();
  });

  it("filters pending steer skills against the immutable runtime App snapshot", async () => {
    const structuredSession = steerableSession(true);
    const adapter = createAdapter(structuredSession);
    const filterPluginSkillSegments = vi.fn<
      NonNullable<ThreadSessionManagerOptions["filterPluginSkillSegments"]>
    >((segments, context) => (context.launchConfig?.browserMcp === true ? segments : []));
    const { manager } = createManager(adapter, { filterPluginSkillSegments });
    const session = createWorkingSession(adapter, structuredSession);
    session.runtimeLaunchConfig = { ...session.config, browserMcp: false };
    manager.sessions.set(THREAD_ID, session);

    await manager.setPendingSteer({
      threadId: THREAD_ID,
      prompt: "/browser-control",
      config: session.config,
      segments: [
        {
          kind: "skill",
          name: "browser-control",
          path: "C:\\plugins\\browser-control\\SKILL.md",
          invocation: "/browser-control",
          provider: "Browser Tools",
          scope: "global",
        },
      ],
    });

    expect(filterPluginSkillSegments).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ launchConfig: expect.objectContaining({ browserMcp: false }) }),
    );
    expect(structuredSession.steerTurn).toHaveBeenCalledWith(
      "",
      { ...session.config, browserMcp: false },
      [],
      undefined,
    );
  });

  it("setPendingSteer falls back to interrupt-drain when steerTurn is absent", async () => {
    const structuredSession = steerableSession(false);
    const adapter = createAdapter(structuredSession);
    const { manager } = createManager(adapter);
    const session = createWorkingSession(adapter, structuredSession);
    manager.sessions.set(THREAD_ID, session);

    await manager.setPendingSteer({
      threadId: THREAD_ID,
      prompt: "steer via slot",
      config: { model: `${AGENT_KIND}/model` },
    });

    expect(structuredSession.interruptTurn).toHaveBeenCalledTimes(1);
  });
});
