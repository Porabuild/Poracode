// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type {
  AgentAdapter,
  StructuredSessionHandle,
  StructuredSessionListener,
} from "../../agents/base";
import type { SessionRuntime } from "../sessionTypes";
import {
  SessionRuntimeLifecycle,
  type SessionRuntimeLifecycleContext,
} from "./sessionRuntimeLifecycle";

function createHarness(
  options: {
    withPty?: boolean;
    withStructuredSession?: boolean;
    session?: Partial<SessionRuntime>;
  } = {},
) {
  let structuredListener: StructuredSessionListener | undefined;
  let onPtyData: ((data: string) => void) | undefined;
  let onPtyExit: ((event: { exitCode: number }) => void) | undefined;

  const setListener = vi.fn<StructuredSessionHandle["setListener"]>((listener) => {
    structuredListener = listener;
  });
  const dispose = vi.fn<StructuredSessionHandle["dispose"]>(async () => undefined);
  const structuredSession = {
    launchOptions: {},
    setListener,
    dispose,
  } as StructuredSessionHandle;
  const pty = {
    onData: vi.fn<(listener: (data: string) => void) => void>((listener) => {
      onPtyData = listener;
    }),
    onExit: vi.fn<(listener: (event: { exitCode: number }) => void) => void>((listener) => {
      onPtyExit = listener;
    }),
  };
  const adapter = {
    kind: "test-agent",
    label: "Test Agent",
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
      settingDefs: [],
    },
    discoverSessionRef: vi.fn<NonNullable<AgentAdapter["discoverSessionRef"]>>(
      async () => undefined,
    ),
  } as unknown as AgentAdapter;
  const session = {
    instanceId: "instance-1",
    threadId: "thread-1",
    agentKind: adapter.kind,
    adapter,
    projectLocation: { kind: "posix", path: "/repo" },
    config: { model: "model-1" },
    terminalSize: { cols: 100, rows: 30 },
    launchPrompt: "",
    status: "working",
    attention: "working",
    canResumeWithConfig: false,
    outputLength: 0,
    prevChunk: "",
    lastStrippedPtyChunk: "",
    ptyOscCarry: "",
    presentationMode: "gui",
    ...(options.withPty === false ? {} : { pty }),
    ...(options.withStructuredSession === false ? {} : { structuredSession }),
    ...options.session,
  } as unknown as SessionRuntime;

  const sessions = new Map<string, SessionRuntime>();
  const sessionsBySessionId = new Map<string, SessionRuntime>();
  const track = vi.fn<SessionRuntimeLifecycleContext["ptyLifecycle"]["track"]>();
  const resolveExit = vi.fn<SessionRuntimeLifecycleContext["ptyLifecycle"]["resolveExit"]>();
  const kill = vi.fn<SessionRuntimeLifecycleContext["ptyLifecycle"]["kill"]>();
  const emitState = vi.fn<SessionRuntimeLifecycleContext["outputPipeline"]["emitState"]>();
  const updateState = vi.fn<SessionRuntimeLifecycleContext["outputPipeline"]["updateState"]>();
  const handlePtyData = vi.fn<SessionRuntimeLifecycleContext["outputPipeline"]["handlePtyData"]>();
  const clearSessionTimers =
    vi.fn<SessionRuntimeLifecycleContext["outputPipeline"]["clearSessionTimers"]>();
  const flush = vi.fn<SessionRuntimeLifecycleContext["runtimeEventRouter"]["flush"]>();
  const append = vi.fn<SessionRuntimeLifecycleContext["runtimeEventRouter"]["append"]>();
  const maybeDrainPendingSteer =
    vi.fn<SessionRuntimeLifecycleContext["steerCoordinator"]["maybeDrainPendingSteer"]>();
  const clearStructuredInterruptWatchdog =
    vi.fn<
      SessionRuntimeLifecycleContext["structuredInterruptWatchdog"]["clearStructuredInterruptWatchdog"]
    >();
  const touchStructuredInterruptWatchdog =
    vi.fn<
      SessionRuntimeLifecycleContext["structuredInterruptWatchdog"]["touchStructuredInterruptWatchdog"]
    >();
  const emit = vi.fn<SessionRuntimeLifecycleContext["emit"]>();
  const failStructuredSession = vi.fn<SessionRuntimeLifecycleContext["failStructuredSession"]>();
  const indexSessionRef = vi.fn<SessionRuntimeLifecycleContext["indexSessionRef"]>();
  const pollSessionRefDiscovery =
    vi.fn<SessionRuntimeLifecycleContext["pollSessionRefDiscovery"]>();

  const lifecycle = new SessionRuntimeLifecycle({
    sessions,
    sessionsBySessionId,
    isCurrentSession: (candidate) =>
      sessions.get(candidate.threadId)?.instanceId === candidate.instanceId,
    ptyLifecycle: { track, resolveExit, kill },
    outputPipeline: { emitState, updateState, handlePtyData, clearSessionTimers },
    runtimeEventRouter: { flush, append },
    steerCoordinator: { maybeDrainPendingSteer },
    structuredInterruptWatchdog: {
      clearStructuredInterruptWatchdog,
      touchStructuredInterruptWatchdog,
    },
    emit,
    failStructuredSession,
    indexSessionRef,
    pollSessionRefDiscovery,
  });

  return {
    lifecycle,
    session,
    sessions,
    sessionsBySessionId,
    structuredSession,
    get structuredListener() {
      return structuredListener;
    },
    emitPtyData(data: string) {
      onPtyData?.(data);
    },
    emitPtyExit(exitCode: number) {
      onPtyExit?.({ exitCode });
    },
    mocks: {
      setListener,
      dispose,
      track,
      resolveExit,
      kill,
      emitState,
      updateState,
      handlePtyData,
      clearSessionTimers,
      flush,
      append,
      maybeDrainPendingSteer,
      clearStructuredInterruptWatchdog,
      touchStructuredInterruptWatchdog,
      emit,
      failStructuredSession,
      indexSessionRef,
      pollSessionRefDiscovery,
    },
  };
}

describe("SessionRuntimeLifecycle", () => {
  it("registers and emits before binding handles, then starts ref discovery", () => {
    const harness = createHarness();
    const order: string[] = [];
    harness.mocks.track.mockImplementation(() => order.push("track"));
    harness.mocks.emitState.mockImplementation((session) => {
      expect(harness.sessions.get(session.threadId)).toBe(session);
      order.push("emit-state");
    });
    harness.mocks.pollSessionRefDiscovery.mockImplementation(() => order.push("discover"));
    harness.mocks.setListener.mockImplementation((listener) => {
      order.push("structured-listener");
      listener.onUpdate({ status: "idle", attention: "none" });
    });

    harness.lifecycle.attach(harness.session);

    expect(order).toEqual(["track", "emit-state", "discover", "structured-listener"]);
    expect(harness.session.sessionRefDiscoveryStarted).toBe(true);
    expect(harness.mocks.updateState).toHaveBeenCalledAfter(harness.mocks.emitState);
  });

  it("indexes an initial native session id and skips discovery", () => {
    const harness = createHarness({
      session: {
        sessionRef: {
          providerSessionId: "provider-session-1",
          discoveredAt: "2026-01-01T00:00:00.000Z",
        },
      },
    });

    harness.lifecycle.attach(harness.session);

    expect(harness.sessionsBySessionId.get("provider-session-1")).toBe(harness.session);
    expect(harness.mocks.pollSessionRefDiscovery).not.toHaveBeenCalled();
  });

  it("applies metadata but suppresses an initial empty idle update", () => {
    const harness = createHarness({
      session: {
        suppressInitialStructuredIdle: true,
        sessionRef: {
          providerSessionId: "old-session",
          discoveredAt: "2026-01-01T00:00:00.000Z",
        },
      },
    });
    harness.lifecycle.attach(harness.session);
    harness.mocks.emitState.mockClear();

    harness.structuredListener?.onUpdate({
      status: "idle",
      attention: "none",
      sessionRef: {
        providerSessionId: "new-session",
        discoveredAt: "2026-01-02T00:00:00.000Z",
      },
      config: { model: "model-2" },
      slashCommands: [{ id: "plan", label: "Plan", description: "Plan" }],
    });

    expect(harness.session.sessionRef).toEqual({
      providerSessionId: "new-session",
      discoveredAt: "2026-01-02T00:00:00.000Z",
    });
    expect(harness.session.canResumeWithConfig).toBe(true);
    expect(harness.session.config).toEqual({ model: "model-2" });
    expect(harness.mocks.indexSessionRef).toHaveBeenCalledWith(harness.session, "old-session");
    expect(harness.mocks.emitState).toHaveBeenCalledExactlyOnceWith(harness.session);
    expect(harness.mocks.flush).not.toHaveBeenCalled();
    expect(harness.mocks.updateState).not.toHaveBeenCalled();
    expect(harness.session.suppressInitialStructuredIdle).toBe(true);
  });

  it("flushes runtime events before state, then clears the watchdog and drains steer", () => {
    const harness = createHarness({
      session: { structuredTurnInterruptRequested: true },
    });
    harness.lifecycle.attach(harness.session);

    harness.structuredListener?.onUpdate({ status: "idle", attention: "none" });

    expect(harness.mocks.flush).toHaveBeenCalledBefore(harness.mocks.updateState);
    expect(harness.mocks.updateState).toHaveBeenCalledWith(
      harness.session,
      "idle",
      "none",
      undefined,
      { forceCloseActiveTurn: true },
    );
    expect(harness.mocks.updateState).toHaveBeenCalledBefore(
      harness.mocks.clearStructuredInterruptWatchdog,
    );
    expect(harness.mocks.clearStructuredInterruptWatchdog).toHaveBeenCalledBefore(
      harness.mocks.maybeDrainPendingSteer,
    );
    expect(harness.session.structuredTurnInterruptRequested).toBe(false);
  });

  it("releases idle suppression before touching the watchdog and appending runtime output", () => {
    const harness = createHarness({
      session: { suppressInitialStructuredIdle: true },
    });
    harness.lifecycle.attach(harness.session);

    harness.structuredListener?.onRuntimeEvent?.({
      type: "content.delta",
      threadId: harness.session.threadId,
      itemId: "assistant-1",
      stream: "assistant_text",
      delta: "done",
    });

    expect(harness.session.suppressInitialStructuredIdle).toBeUndefined();
    expect(harness.mocks.touchStructuredInterruptWatchdog).toHaveBeenCalledBefore(
      harness.mocks.append,
    );
  });

  it("touches the watchdog and emits state for a config-only working update", () => {
    const harness = createHarness();
    harness.lifecycle.attach(harness.session);
    harness.mocks.emitState.mockClear();

    harness.structuredListener?.onUpdate({
      status: "working",
      attention: "working",
      config: { model: "model-2" },
    });

    expect(harness.mocks.touchStructuredInterruptWatchdog).toHaveBeenCalledWith(harness.session);
    expect(harness.mocks.emitState).toHaveBeenCalledExactlyOnceWith(harness.session);
  });

  it("emits state when an idle structured session changes its provider session id", () => {
    const harness = createHarness({
      session: {
        status: "idle",
        attention: "none",
        sessionRef: {
          providerSessionId: "old-session",
          discoveredAt: "2026-01-01T00:00:00.000Z",
        },
      },
    });
    harness.lifecycle.attach(harness.session);
    harness.mocks.emitState.mockClear();
    const emittedSessionIds: Array<string | undefined> = [];
    harness.mocks.emitState.mockImplementation((session) => {
      emittedSessionIds.push(session.sessionRef?.providerSessionId);
    });

    harness.structuredListener?.onUpdate({
      status: "idle",
      attention: "none",
      sessionRef: {
        providerSessionId: "forked-session",
        discoveredAt: "2026-01-02T00:00:00.000Z",
      },
    });

    expect(harness.session.sessionRef?.providerSessionId).toBe("forked-session");
    expect(harness.mocks.indexSessionRef).toHaveBeenCalledWith(harness.session, "old-session");
    expect(harness.mocks.emitState).toHaveBeenCalledExactlyOnceWith(harness.session);
    expect(emittedSessionIds).toEqual(["forked-session"]);
  });

  it("ignores structured events for stale and ignored sessions", () => {
    const harness = createHarness();
    harness.lifecycle.attach(harness.session);
    const replacement = { ...harness.session, instanceId: "instance-2" } as SessionRuntime;
    harness.sessions.set(harness.session.threadId, replacement);

    harness.structuredListener?.onUpdate({ status: "idle", attention: "none" });
    harness.structuredListener?.onRuntimeEvent?.({
      type: "turn.completed",
      threadId: harness.session.threadId,
      turnId: "turn-1",
      state: "completed",
    });
    harness.structuredListener?.onError("stale error");
    harness.structuredListener?.onClose();

    expect(harness.mocks.flush).not.toHaveBeenCalled();
    expect(harness.mocks.append).not.toHaveBeenCalled();
    expect(harness.mocks.failStructuredSession).not.toHaveBeenCalled();
    expect(harness.mocks.kill).not.toHaveBeenCalled();

    harness.sessions.set(harness.session.threadId, harness.session);
    harness.session.ignoreExit = true;
    harness.structuredListener?.onError("ignored error");
    expect(harness.mocks.failStructuredSession).not.toHaveBeenCalled();
  });

  it("handles structured errors and delays PTY teardown after close", () => {
    vi.useFakeTimers();
    try {
      const stopWatcher = vi.fn<() => void>();
      const harness = createHarness({ session: { stopSessionRefWatcher: stopWatcher } });
      harness.lifecycle.attach(harness.session);

      harness.structuredListener?.onError("structured failure");
      expect(harness.mocks.failStructuredSession).toHaveBeenCalledWith(
        harness.session,
        "structured failure",
      );

      harness.structuredListener?.onClose();
      expect(harness.mocks.updateState).toHaveBeenCalledWith(harness.session, "inactive", "none");
      expect(harness.mocks.emit).toHaveBeenCalledWith({
        type: "thread-exited",
        threadId: harness.session.threadId,
        exitCode: null,
      });
      expect(harness.session.ignoreExit).toBe(true);
      expect(stopWatcher).toHaveBeenCalledTimes(1);
      expect(harness.mocks.kill).not.toHaveBeenCalled();

      vi.advanceTimersByTime(150);
      expect(harness.mocks.kill).toHaveBeenCalledExactlyOnceWith(harness.session);
    } finally {
      vi.useRealTimers();
    }
  });

  it("routes PTY data only for the current session", () => {
    const harness = createHarness();
    harness.lifecycle.attach(harness.session);

    harness.emitPtyData("first");
    expect(harness.mocks.handlePtyData).toHaveBeenCalledWith(harness.session, "first");

    harness.sessions.set(harness.session.threadId, {
      ...harness.session,
      instanceId: "instance-2",
    } as SessionRuntime);
    harness.emitPtyData("stale");
    expect(harness.mocks.handlePtyData).toHaveBeenCalledTimes(1);
  });

  it("resolves every PTY exit but tears down state only for the active session", () => {
    const launchCleanup = vi.fn<() => void>();
    const harness = createHarness({
      session: {
        sessionRef: {
          providerSessionId: "provider-session-1",
          discoveredAt: "2026-01-01T00:00:00.000Z",
        },
        hasCliHookPluginActivity: true,
        cliHookEnvInjected: true,
        launchCleanup,
      },
    });
    harness.lifecycle.attach(harness.session);

    harness.emitPtyExit(17);

    expect(harness.mocks.resolveExit).toHaveBeenCalledExactlyOnceWith(harness.session);
    expect(launchCleanup).toHaveBeenCalledTimes(1);
    expect(harness.session.launchCleanup).toBeUndefined();
    expect(harness.mocks.dispose).toHaveBeenCalledTimes(1);
    expect(harness.mocks.clearSessionTimers).toHaveBeenCalledWith(harness.session);
    expect(harness.mocks.updateState).toHaveBeenCalledWith(harness.session, "inactive", "none");
    expect(harness.session.hasCliHookPluginActivity).toBe(false);
    expect(harness.session.cliHookEnvInjected).toBe(false);
    expect(harness.sessionsBySessionId.has("provider-session-1")).toBe(false);
    expect(harness.mocks.emit).toHaveBeenCalledWith({
      type: "thread-exited",
      threadId: harness.session.threadId,
      exitCode: 17,
    });

    const stale = createHarness();
    stale.lifecycle.attach(stale.session);
    stale.sessions.set(stale.session.threadId, {
      ...stale.session,
      instanceId: "instance-2",
    } as SessionRuntime);
    stale.emitPtyExit(1);
    expect(stale.mocks.resolveExit).toHaveBeenCalledTimes(1);
    expect(stale.mocks.updateState).not.toHaveBeenCalled();
    expect(stale.mocks.emit).not.toHaveBeenCalled();

    const ignored = createHarness();
    ignored.lifecycle.attach(ignored.session);
    ignored.session.ignoreExit = true;
    ignored.emitPtyExit(2);
    expect(ignored.mocks.resolveExit).toHaveBeenCalledTimes(1);
    expect(ignored.mocks.updateState).not.toHaveBeenCalled();
    expect(ignored.mocks.emit).not.toHaveBeenCalled();
  });
});
