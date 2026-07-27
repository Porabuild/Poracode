import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentKind } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import type { AgentAdapter, StructuredSessionHandle } from "../agents/base";
import type { SessionRuntime } from "./sessionTypes";

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
import { STRUCTURED_INTERRUPT_FORCE_STOP_MS } from "./threadSession/userInterrupt";

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
 * thread only leaves `working` once the agent acks the cancel. The watchdog's
 * fixed deadline disposes an agent that ignores Stop, closes the turn locally,
 * and bails if the turn already ended (the cancel was honored).
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
    forceCompleteTurn: vi.fn<NonNullable<StructuredSessionHandle["forceCompleteTurn"]>>(),
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

function createManager(adapter: AgentAdapter): {
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
  it("force-stops an unacknowledged interrupt after the fixed deadline", async () => {
    const structuredSession = createStructuredSession();
    const adapter = createAdapter(structuredSession);
    const { manager, events } = createManager(adapter);
    const session = createWorkingSession(adapter, structuredSession);
    manager.sessions.set(THREAD_ID, session);

    await manager.interruptThread({ threadId: THREAD_ID });
    expect(structuredSession.interruptTurn).toHaveBeenCalledTimes(1);
    expect(session.structuredTurnInterruptRequested).toBe(true);
    expect(session.structuredInterruptWatchdog).toBeDefined();

    vi.advanceTimersByTime(STRUCTURED_INTERRUPT_FORCE_STOP_MS - 1);
    expect(session.status).toBe("working");
    expect(structuredSession.dispose).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(structuredSession.dispose).toHaveBeenCalledTimes(1);
    expect(structuredSession.forceCompleteTurn).toHaveBeenCalledTimes(1);
    expect(session.structuredSession).toBeUndefined();
    expect(session.status).toBe("idle");
    expect(session.ignoreExit).toBe(true);
    expect(session.structuredTurnInterruptRequested).toBe(false);
    expect(session.structuredInterruptWatchdog).toBeUndefined();
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "thread-state",
        threadId: THREAD_ID,
        status: "idle",
        forceCloseActiveTurn: true,
      }),
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

    vi.advanceTimersByTime(STRUCTURED_INTERRUPT_FORCE_STOP_MS + 1);
    expect(structuredSession.dispose).not.toHaveBeenCalled();
    expect(session.structuredSession).toBe(structuredSession);
    expect(session.status).toBe("idle");
  });

  it("treats an exact no-active-turn response as an acknowledged late Stop", async () => {
    const interruptTurn = vi
      .fn<NonNullable<StructuredSessionHandle["interruptTurn"]>>()
      .mockRejectedValue(new Error("no active turn to interrupt"));
    const structuredSession = createStructuredSession({ interruptTurn });
    const adapter = createAdapter(structuredSession);
    const { manager } = createManager(adapter);
    const session = createWorkingSession(adapter, structuredSession);
    manager.sessions.set(THREAD_ID, session);

    await expect(manager.interruptThread({ threadId: THREAD_ID })).resolves.toBeUndefined();

    expect(session.structuredTurnInterruptRequested).toBe(false);
    expect(session.structuredInterruptWatchdog).toBeUndefined();
    vi.advanceTimersByTime(STRUCTURED_INTERRUPT_FORCE_STOP_MS);
    expect(structuredSession.dispose).not.toHaveBeenCalled();
  });

  it("still rejects other and near-miss interrupt failures", async () => {
    const errors = [
      new Error("provider interrupt failed"),
      new Error("no active turn to interrupt because the provider disconnected"),
    ];

    for (const error of errors) {
      const interruptTurn = vi
        .fn<NonNullable<StructuredSessionHandle["interruptTurn"]>>()
        .mockRejectedValue(error);
      const structuredSession = createStructuredSession({ interruptTurn });
      const adapter = createAdapter(structuredSession);
      const { manager } = createManager(adapter);
      const session = createWorkingSession(adapter, structuredSession);
      manager.sessions.set(THREAD_ID, session);

      await expect(manager.interruptThread({ threadId: THREAD_ID })).rejects.toBe(error);
      expect(session.structuredTurnInterruptRequested).toBe(false);
      expect(session.structuredInterruptWatchdog).toBeUndefined();
    }
  });

  it("ignores a stale session whose interrupt is no longer pending", async () => {
    const structuredSession = createStructuredSession();
    const adapter = createAdapter(structuredSession);
    const { manager } = createManager(adapter);
    const session = createWorkingSession(adapter, structuredSession);
    manager.sessions.set(THREAD_ID, session);

    await manager.interruptThread({ threadId: THREAD_ID });
    session.structuredTurnInterruptRequested = false;

    vi.advanceTimersByTime(STRUCTURED_INTERRUPT_FORCE_STOP_MS + 1);
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
    vi.advanceTimersByTime(STRUCTURED_INTERRUPT_FORCE_STOP_MS);

    const startTurn = vi.fn<NonNullable<StructuredSessionHandle["startTurn"]>>(
      async () => undefined,
    );
    const replacementSession = createStructuredSession({ startTurn });
    vi.mocked(adapter.createStructuredSession).mockResolvedValue(replacementSession);

    const segments = [
      { kind: "text" as const, content: "after force stop" },
      { kind: "attachment" as const, path: "/tmp/reference.png", mimeType: "image/png" },
    ];
    await manager.sendThreadInput({
      threadId: THREAD_ID,
      prompt: "after force stop",
      segments,
      config: { model: `${AGENT_KIND}/model` },
      userMessageItemId: "user-after-force-stop",
    });

    expect(startTurn).toHaveBeenCalledTimes(1);
    expect(startTurn).toHaveBeenCalledWith(
      "after force stop\n\n@/tmp/reference.png ",
      { model: `${AGENT_KIND}/model` },
      segments,
      { userMessageItemId: "user-after-force-stop" },
    );
    expect(manager.sessions.get(THREAD_ID)?.structuredSession).toBe(replacementSession);
  });

  it("preserves and immediately resumes a pending steer when force-stop recovery replaces the provider", async () => {
    const structuredSession = createStructuredSession();
    const adapter = createAdapter(structuredSession);
    const { manager, events } = createManager(adapter);
    const session = createWorkingSession(adapter, structuredSession);
    const segments = [
      { kind: "attachment" as const, path: "/tmp/reference.png", mimeType: "image/png" },
      { kind: "text" as const, content: "redirect with this image" },
    ];
    session.pendingSteer = {
      id: "steer-pending",
      stagedAt: 123,
      prompt: "redirect with this image\n\n@/tmp/reference.png",
      config: { model: `${AGENT_KIND}/model` },
      segments,
    };
    manager.sessions.set(THREAD_ID, session);

    const startTurn = vi.fn<NonNullable<StructuredSessionHandle["startTurn"]>>(
      async () => undefined,
    );
    const replacementSession = createStructuredSession({ startTurn });
    vi.mocked(adapter.createStructuredSession).mockResolvedValue(replacementSession);

    await manager.interruptThread({ threadId: THREAD_ID });
    await vi.advanceTimersByTimeAsync(STRUCTURED_INTERRUPT_FORCE_STOP_MS);
    await Promise.resolve();
    await Promise.resolve();

    const optimisticStart = events.find(
      (event) =>
        event.type === "thread-runtime-event" &&
        event.event.type === "item.started" &&
        event.event.itemType === "user_message",
    );
    expect(optimisticStart).toMatchObject({
      event: {
        payload: {
          content: [
            expect.objectContaining({ kind: "image", path: "/tmp/reference.png" }),
            { kind: "text", text: "redirect with this image" },
          ],
        },
      },
    });
    if (
      !optimisticStart ||
      optimisticStart.type !== "thread-runtime-event" ||
      optimisticStart.event.type !== "item.started"
    ) {
      throw new Error("Expected an optimistic steer user message.");
    }

    expect(startTurn).toHaveBeenCalledTimes(1);
    expect(startTurn).toHaveBeenCalledWith(
      "redirect with this image\n\n@/tmp/reference.png",
      { model: `${AGENT_KIND}/model` },
      segments,
      { userMessageItemId: optimisticStart.event.itemId },
    );
    expect(session.pendingSteer).toBeUndefined();
    expect(events).toContainEqual({
      type: "thread-pending-steer",
      threadId: THREAD_ID,
      pending: null,
    });
    expect(manager.sessions.get(THREAD_ID)?.structuredSession).toBe(replacementSession);
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
    vi.advanceTimersByTime(STRUCTURED_INTERRUPT_FORCE_STOP_MS);
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
