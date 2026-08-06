import { describe, expect, it, vi } from "vitest";
import { ThreadOutputPipeline, resolveThreadStatusSource } from "./threadOutputPipeline";
import type { SessionRuntime } from "./sessionTypes";

function pipeline() {
  return new ThreadOutputPipeline({
    emit: vi.fn<() => void>(),
    isDev: false,
    logWriter: { append: vi.fn<() => void>() } as never,
    resolveLogPath: () => "",
    resolveHintLogPath: () => "",
    readDisableCliHookPlugin: () => false,
    onRecoverInvalidSessionRef: vi.fn<() => void>(),
    onStartQueuedLaunchPrompt: vi.fn<() => void>(),
    onStartSessionRefDiscovery: vi.fn<() => void>(),
  });
}

describe("resolveThreadStatusSource", () => {
  it("returns server when presentation is not terminal", () => {
    expect(
      resolveThreadStatusSource({
        adapter: { capabilities: { presentationMode: "gui" } },
      } as never),
    ).toBe("server");
  });

  it("returns cli_hook when the CLI hook plugin has posted", () => {
    expect(
      resolveThreadStatusSource({
        hasCliHookPluginActivity: true,
        adapter: { capabilities: { presentationMode: "terminal" } },
      } as never),
    ).toBe("cli_hook");
  });

  it("returns terminal_parse for terminal without hook activity", () => {
    expect(
      resolveThreadStatusSource({
        hasCliHookPluginActivity: false,
        adapter: { capabilities: { presentationMode: "terminal" } },
      } as never),
    ).toBe("terminal_parse");
  });

  it("returns cli_hook when PORACODE_HOOK_URL was injected at spawn (before any hook POST)", () => {
    expect(
      resolveThreadStatusSource({
        cliHookEnvInjected: true,
        hasCliHookPluginActivity: false,
        adapter: { capabilities: { presentationMode: "terminal" } },
      } as never),
    ).toBe("cli_hook");
  });

  it("returns terminal_parse when dev toggle disables L1, even with hook env injected", () => {
    expect(
      resolveThreadStatusSource(
        {
          cliHookEnvInjected: true,
          hasCliHookPluginActivity: true,
          adapter: { capabilities: { presentationMode: "terminal" } },
        } as never,
        true,
      ),
    ).toBe("terminal_parse");
  });

  it("returns terminal_parse after a silent hook spawn falls back to terminal status", () => {
    expect(
      resolveThreadStatusSource({
        cliHookEnvInjected: true,
        cliHookTerminalFallbackActive: true,
        hasCliHookPluginActivity: false,
        adapter: { capabilities: { presentationMode: "terminal" } },
      } as never),
    ).toBe("terminal_parse");
  });

  it("returns cli_hook when a real hook arrives after terminal fallback was active", () => {
    expect(
      resolveThreadStatusSource({
        cliHookEnvInjected: true,
        cliHookTerminalFallbackActive: true,
        hasCliHookPluginActivity: true,
        adapter: { capabilities: { presentationMode: "terminal" } },
      } as never),
    ).toBe("cli_hook");
  });
});

describe("ThreadOutputPipeline / CLI hook disables L2", () => {
  it("getLatestTerminalStatusHint returns null without calling detectTerminalStatus when hook is active", () => {
    const p = pipeline();
    const detectTerminalStatus = vi.fn<
      () => { status: "working"; attention: "working"; corroborated: true }
    >(() => ({
      status: "working",
      attention: "working",
      corroborated: true,
    }));
    const session = {
      hasCliHookPluginActivity: true,
      prevChunk: "x",
      adapter: {
        capabilities: { presentationMode: "terminal" },
        detectTerminalStatus,
      },
    } as unknown as SessionRuntime;
    expect(p.getLatestTerminalStatusHint(session)).toBeNull();
    expect(detectTerminalStatus).not.toHaveBeenCalled();
  });

  it("handlePtyData skips detectTerminalStatus when hook is active", () => {
    const p = pipeline();
    const detectTerminalStatus = vi.fn<
      () => { status: "working"; attention: "working"; corroborated: true }
    >(() => ({
      status: "working",
      attention: "working",
      corroborated: true,
    }));
    const session = {
      threadId: "t1",
      status: "idle",
      attention: "none",
      config: {},
      hasCliHookPluginActivity: true,
      prevChunk: "",
      outputLength: 0,
      adapter: {
        capabilities: { presentationMode: "terminal" },
        detectTerminalStatus,
        isReadyForInitialPrompt: () => false,
      },
      pty: { write: vi.fn<(data: string) => void>() },
    } as unknown as SessionRuntime;
    p.handlePtyData(session, "tty");
    expect(detectTerminalStatus).not.toHaveBeenCalled();
  });

  it("allows hook-active terminal fallback when the adapter opts into an attention hint", () => {
    const p = pipeline();
    const detectTerminalStatus = vi.fn<
      () => { status: "needs_reply"; attention: "needs_reply"; corroborated: true }
    >(() => ({
      status: "needs_reply",
      attention: "needs_reply",
      corroborated: true,
    }));
    const session = {
      threadId: "t1",
      status: "working",
      attention: "working",
      config: {},
      cliHookEnvInjected: true,
      hasCliHookPluginActivity: true,
      prevChunk: "",
      outputLength: 0,
      adapter: {
        capabilities: { presentationMode: "terminal" },
        detectTerminalStatus,
        shouldApplyTerminalStatusWhileHookActive: (hint: { status: string }) =>
          hint.status === "needs_reply" || hint.status === "needs_approval",
        isReadyForInitialPrompt: () => false,
      },
      pty: { write: vi.fn<(data: string) => void>() },
    } as unknown as SessionRuntime;

    p.handlePtyData(session, "Enter to select");

    expect(detectTerminalStatus).toHaveBeenCalled();
    expect(session.status).toBe("needs_reply");
    expect(session.attention).toBe("needs_reply");
  });

  it("does not apply hook-active terminal fallback for disallowed hints", () => {
    const p = pipeline();
    const detectTerminalStatus = vi.fn<
      () => { status: "idle"; attention: "none"; corroborated: true }
    >(() => ({
      status: "idle",
      attention: "none",
      corroborated: true,
    }));
    const session = {
      threadId: "t1",
      status: "working",
      attention: "working",
      config: {},
      cliHookEnvInjected: true,
      hasCliHookPluginActivity: true,
      prevChunk: "",
      outputLength: 0,
      adapter: {
        capabilities: { presentationMode: "terminal" },
        detectTerminalStatus,
        shouldApplyTerminalStatusWhileHookActive: (hint: { status: string }) =>
          hint.status === "needs_reply" || hint.status === "needs_approval",
        isReadyForInitialPrompt: () => false,
      },
      pty: { write: vi.fn<(data: string) => void>() },
    } as unknown as SessionRuntime;

    p.handlePtyData(session, "◇ Ready");

    expect(detectTerminalStatus).toHaveBeenCalled();
    expect(session.status).toBe("working");
    expect(session.attention).toBe("working");
  });

  it("suppresses OSC-derived status transitions when hook is active and adapter opts in", () => {
    const emit = vi.fn<() => void>();
    const p = new ThreadOutputPipeline({
      emit,
      isDev: false,
      logWriter: { append: vi.fn<() => void>() } as never,
      resolveLogPath: () => "",
      resolveHintLogPath: () => "",
      readDisableCliHookPlugin: () => false,
      onRecoverInvalidSessionRef: vi.fn<() => void>(),
      onStartQueuedLaunchPrompt: vi.fn<() => void>(),
      onStartSessionRefDiscovery: vi.fn<() => void>(),
    });
    const handleOscNotification = vi.fn<
      () => { status: "idle"; attention: "none"; corroborated: true }
    >(() => ({ status: "idle", attention: "none", corroborated: true }));
    const session = {
      threadId: "t1",
      status: "working",
      attention: "working",
      config: {},
      hasCliHookPluginActivity: true,
      prevChunk: "",
      outputLength: 0,
      outputTranscript: { append: vi.fn<() => void>() },
      ptyOscCarry: undefined,
      adapter: {
        capabilities: { presentationMode: "terminal" },
        handleOscNotification,
        oscHintsDeferToHookPlugin: true,
        isReadyForInitialPrompt: () => false,
      },
      pty: { write: vi.fn<(data: string) => void>() },
    } as unknown as SessionRuntime;
    p.handlePtyData(session, "\x1b]9;agent-turn-complete\x07");
    expect(handleOscNotification).toHaveBeenCalled();
    expect(session.status).toBe("working");
    const emittedStates = (emit.mock.calls as unknown as Array<[{ type: string }]>)
      .map((c) => c[0])
      .filter((e) => e.type === "thread-state");
    expect(emittedStates).toHaveLength(0);
  });

  it("suppresses OSC-derived status transitions when hook is active even without adapter opt-in", () => {
    const emit = vi.fn<() => void>();
    const p = new ThreadOutputPipeline({
      emit,
      isDev: false,
      logWriter: { append: vi.fn<() => void>() } as never,
      resolveLogPath: () => "",
      resolveHintLogPath: () => "",
      readDisableCliHookPlugin: () => false,
      onRecoverInvalidSessionRef: vi.fn<() => void>(),
      onStartQueuedLaunchPrompt: vi.fn<() => void>(),
      onStartSessionRefDiscovery: vi.fn<() => void>(),
    });
    const handleOscNotification = vi.fn<
      () => { status: "idle"; attention: "none"; corroborated: true }
    >(() => ({ status: "idle", attention: "none", corroborated: true }));
    const session = {
      threadId: "t1",
      status: "working",
      attention: "working",
      config: {},
      hasCliHookPluginActivity: true,
      prevChunk: "",
      outputLength: 0,
      outputTranscript: { append: vi.fn<() => void>() },
      ptyOscCarry: undefined,
      adapter: {
        capabilities: { presentationMode: "terminal" },
        handleOscNotification,
        isReadyForInitialPrompt: () => false,
      },
      pty: { write: vi.fn<(data: string) => void>() },
    } as unknown as SessionRuntime;
    p.handlePtyData(session, "\x1b]9;agent-turn-complete\x07");
    expect(handleOscNotification).toHaveBeenCalled();
    expect(session.status).toBe("working");
    const emittedStates = (emit.mock.calls as unknown as Array<[{ type: string }]>)
      .map((c) => c[0])
      .filter((e) => e.type === "thread-state");
    expect(emittedStates).toHaveLength(0);
  });

  it("applies OSC-derived status before the first hook POST but keeps the source as cli_hook", () => {
    const emit = vi.fn<() => void>();
    const p = new ThreadOutputPipeline({
      emit,
      isDev: false,
      logWriter: { append: vi.fn<() => void>() } as never,
      resolveLogPath: () => "",
      resolveHintLogPath: () => "",
      readDisableCliHookPlugin: () => false,
      onRecoverInvalidSessionRef: vi.fn<() => void>(),
      onStartQueuedLaunchPrompt: vi.fn<() => void>(),
      onStartSessionRefDiscovery: vi.fn<() => void>(),
    });
    const handleOscNotification = vi.fn<
      () => { status: "idle"; attention: "none"; corroborated: true }
    >(() => ({ status: "idle", attention: "none", corroborated: true }));
    const session = {
      threadId: "t1",
      status: "working",
      attention: "working",
      config: {},
      cliHookEnvInjected: true,
      prevChunk: "",
      outputLength: 0,
      outputTranscript: { append: vi.fn<() => void>() },
      ptyOscCarry: "",
      adapter: {
        capabilities: { presentationMode: "terminal" },
        handleOscNotification,
        handleOscTitle: () => null,
        isReadyForInitialPrompt: () => false,
      },
      pty: { write: vi.fn<(data: string) => void>() },
    } as unknown as SessionRuntime;

    p.handlePtyData(session, "\x1b]9;agent-turn-complete\x07");

    expect(handleOscNotification).toHaveBeenCalled();
    expect(session.status).toBe("idle");
    const emittedStates = (emit.mock.calls as unknown as Array<[{ type: string }]>)
      .map((c) => c[0])
      .filter((e) => e.type === "thread-state");
    expect(emittedStates.at(-1)).toMatchObject({
      type: "thread-state",
      status: "idle",
      attention: "none",
      threadStatusSource: "cli_hook",
    });
  });

  it("ignores launch-time working titles for empty resumes so the restored thread can settle idle", () => {
    const p = pipeline();
    const session = {
      threadId: "t1",
      status: "launching",
      attention: "none",
      config: {},
      launchPrompt: "",
      prevChunk: "",
      outputLength: 0,
      ptyOscCarry: "",
      adapter: {
        capabilities: { presentationMode: "terminal" },
        handleOscTitle: () => ({
          status: "working" as const,
          attention: "working" as const,
          corroborated: true,
        }),
      },
      pty: { write: vi.fn<(data: string) => void>() },
    } as unknown as SessionRuntime;

    p.handlePtyData(session, "\x1b]0;⠋ Working (2s • esc to interrupt)\x07OpenAI Codex");

    expect(session.status).toBe("idle");
    expect(session.attention).toBe("none");
  });

  it("still allows launch-time working titles when the launch already has queued work", () => {
    const p = pipeline();
    const session = {
      threadId: "t1",
      status: "launching",
      attention: "none",
      config: {},
      launchPrompt: "",
      pendingLaunchPrompt: "Fix the bug",
      prevChunk: "",
      outputLength: 0,
      ptyOscCarry: "",
      adapter: {
        capabilities: { presentationMode: "terminal" },
        handleOscTitle: () => ({
          status: "working" as const,
          attention: "working" as const,
          corroborated: true,
        }),
      },
      pty: { write: vi.fn<(data: string) => void>() },
    } as unknown as SessionRuntime;

    p.handlePtyData(session, "\x1b]0;⠋ Working (2s • esc to interrupt)\x07OpenAI Codex");

    expect(session.status).toBe("working");
    expect(session.attention).toBe("working");
  });

  it("uses Codex spinner titles as L2 fallback when hook env is present but hooks stay silent", async () => {
    vi.useFakeTimers();
    try {
      const emit = vi.fn<() => void>();
      const p = new ThreadOutputPipeline({
        emit,
        isDev: false,
        logWriter: { append: vi.fn<() => void>() } as never,
        resolveLogPath: () => "",
        resolveHintLogPath: () => "",
        readDisableCliHookPlugin: () => false,
        onRecoverInvalidSessionRef: vi.fn<() => void>(),
        onStartQueuedLaunchPrompt: vi.fn<() => void>(),
        onStartSessionRefDiscovery: vi.fn<() => void>(),
      });
      const session = {
        threadId: "t1",
        status: "idle",
        attention: "none",
        config: {},
        cliHookEnvInjected: true,
        launchPrompt: "",
        prevChunk: "",
        outputLength: 0,
        ptyOscCarry: "",
        adapter: {
          capabilities: { presentationMode: "terminal" },
          handleOscTitle: () => ({
            status: "working" as const,
            attention: "working" as const,
            corroborated: true,
          }),
        },
        pty: { write: vi.fn<(data: string) => void>() },
      } as unknown as SessionRuntime;

      p.handlePtyData(session, "\x1b]0;⠴ poracode\x07");

      expect(session.status).toBe("working");
      expect(session.attention).toBe("working");
      expect(resolveThreadStatusSource(session)).toBe("cli_hook");

      await vi.advanceTimersByTimeAsync(600);

      expect(session.cliHookTerminalFallbackActive).toBe(true);
      expect(session.status).toBe("working");
      expect(session.attention).toBe("working");
      expect(resolveThreadStatusSource(session)).toBe("terminal_parse");
      const emittedStates = (emit.mock.calls as unknown as Array<[{ type: string }]>)
        .map((c) => c[0])
        .filter((e) => e.type === "thread-state");
      expect(emittedStates.at(-1)).toMatchObject({
        type: "thread-state",
        status: "working",
        attention: "working",
        threadStatusSource: "terminal_parse",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps hooks authoritative when a hook arrives before the title fallback grace expires", async () => {
    vi.useFakeTimers();
    try {
      const emit = vi.fn<() => void>();
      const p = new ThreadOutputPipeline({
        emit,
        isDev: false,
        logWriter: { append: vi.fn<() => void>() } as never,
        resolveLogPath: () => "",
        resolveHintLogPath: () => "",
        readDisableCliHookPlugin: () => false,
        onRecoverInvalidSessionRef: vi.fn<() => void>(),
        onStartQueuedLaunchPrompt: vi.fn<() => void>(),
        onStartSessionRefDiscovery: vi.fn<() => void>(),
      });
      const session = {
        threadId: "t1",
        status: "idle",
        attention: "none",
        config: {},
        cliHookEnvInjected: true,
        launchPrompt: "",
        prevChunk: "",
        outputLength: 0,
        ptyOscCarry: "",
        adapter: {
          capabilities: { presentationMode: "terminal" },
          handleOscTitle: () => ({
            status: "working" as const,
            attention: "working" as const,
            corroborated: true,
          }),
        },
        pty: { write: vi.fn<(data: string) => void>() },
      } as unknown as SessionRuntime;

      p.handlePtyData(session, "\x1b]0;⠴ poracode\x07");
      session.hasCliHookPluginActivity = true;
      p.applyCliHookPluginState(session, { status: "idle", attention: "none" });

      await vi.advanceTimersByTimeAsync(600);

      expect(session.cliHookTerminalFallbackActive).toBe(false);
      expect(session.cliHookTerminalFallbackTimer).toBeUndefined();
      expect(session.status).toBe("idle");
      expect(session.attention).toBe("none");
      expect(resolveThreadStatusSource(session)).toBe("cli_hook");
    } finally {
      vi.useRealTimers();
    }
  });

  it("restores L1 source when a bookkeeping hook arrives after L2 fallback activated", async () => {
    vi.useFakeTimers();
    try {
      const emit = vi.fn<() => void>();
      const p = new ThreadOutputPipeline({
        emit,
        isDev: false,
        logWriter: { append: vi.fn<() => void>() } as never,
        resolveLogPath: () => "",
        resolveHintLogPath: () => "",
        readDisableCliHookPlugin: () => false,
        onRecoverInvalidSessionRef: vi.fn<() => void>(),
        onStartQueuedLaunchPrompt: vi.fn<() => void>(),
        onStartSessionRefDiscovery: vi.fn<() => void>(),
      });
      const session = {
        threadId: "t1",
        status: "idle",
        attention: "none",
        config: {},
        cliHookEnvInjected: true,
        prevChunk: "",
        outputLength: 0,
        ptyOscCarry: "",
        adapter: {
          capabilities: { presentationMode: "terminal" },
          handleOscTitle: () => ({
            status: "working" as const,
            attention: "working" as const,
            corroborated: true,
          }),
        },
        pty: { write: vi.fn<(data: string) => void>() },
      } as unknown as SessionRuntime;

      p.handlePtyData(session, "\x1b]0;⠴ poracode\x07");
      await vi.advanceTimersByTimeAsync(600);
      expect(resolveThreadStatusSource(session)).toBe("terminal_parse");

      session.hasCliHookPluginActivity = true;
      p.noteCliHookPluginActivity(session);

      expect(session.cliHookTerminalFallbackActive).toBe(false);
      expect(resolveThreadStatusSource(session)).toBe("cli_hook");
      const emittedStates = (emit.mock.calls as unknown as Array<[{ type: string }]>)
        .map((c) => c[0])
        .filter((e) => e.type === "thread-state");
      expect(emittedStates.at(-1)).toMatchObject({
        type: "thread-state",
        status: "working",
        attention: "working",
        threadStatusSource: "cli_hook",
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("ThreadOutputPipeline / invalid session-ref detection on launch", () => {
  function recoveryPipeline() {
    const onRecoverInvalidSessionRef = vi.fn<(session: SessionRuntime) => void>();
    const p = new ThreadOutputPipeline({
      emit: vi.fn<() => void>(),
      isDev: false,
      logWriter: { append: vi.fn<() => void>() } as never,
      resolveLogPath: () => "",
      resolveHintLogPath: () => "",
      readDisableCliHookPlugin: () => false,
      onRecoverInvalidSessionRef,
      onStartQueuedLaunchPrompt: vi.fn<() => void>(),
      onStartSessionRefDiscovery: vi.fn<() => void>(),
    });
    return { p, onRecoverInvalidSessionRef };
  }

  function launchingSession(overrides: Record<string, unknown> = {}): SessionRuntime {
    return {
      threadId: "t1",
      status: "launching",
      attention: "none",
      config: {},
      sessionRef: { value: "sess-1", source: "hook", discoveredAt: "2026-01-01T00:00:00.000Z" },
      launchPrompt: "",
      prevChunk: "",
      outputLength: 0,
      ptyOscCarry: "",
      adapter: {
        capabilities: { presentationMode: "terminal" },
        detectInvalidSessionRef: (text: string) => text.includes("No conversation found"),
      },
      pty: { write: vi.fn<(data: string) => void>() },
      ...overrides,
    } as unknown as SessionRuntime;
  }

  it("recovers and skips the launching→idle flip when the resume error lands", () => {
    const { p, onRecoverInvalidSessionRef } = recoveryPipeline();
    const session = launchingSession();

    p.handlePtyData(session, "Error: No conversation found with session ID sess-1\r\n");

    expect(onRecoverInvalidSessionRef).toHaveBeenCalledExactlyOnceWith(session);
    // The recovery path must return before the launching→idle flip — a session
    // flipped idle here would spawn the replacement from the wrong state.
    expect(session.status).toBe("launching");
  });

  it("flips launching→idle without recovery when the output is clean", () => {
    const { p, onRecoverInvalidSessionRef } = recoveryPipeline();
    const session = launchingSession();

    p.handlePtyData(session, "Welcome back!\r\n");

    expect(onRecoverInvalidSessionRef).not.toHaveBeenCalled();
    expect(session.status).toBe("idle");
  });

  it("does not recover when the session has no sessionRef to invalidate", () => {
    const { p, onRecoverInvalidSessionRef } = recoveryPipeline();
    const session = launchingSession({ sessionRef: undefined });

    p.handlePtyData(session, "No conversation found\r\n");

    expect(onRecoverInvalidSessionRef).not.toHaveBeenCalled();
    expect(session.status).toBe("idle");
  });

  it("does not recover when the adapter has no detector", () => {
    const { p, onRecoverInvalidSessionRef } = recoveryPipeline();
    const session = launchingSession({
      adapter: { capabilities: { presentationMode: "terminal" } },
    });

    p.handlePtyData(session, "No conversation found\r\n");

    expect(onRecoverInvalidSessionRef).not.toHaveBeenCalled();
    expect(session.status).toBe("idle");
  });

  it("does not recover once the session has left launching", () => {
    const { p, onRecoverInvalidSessionRef } = recoveryPipeline();
    const session = launchingSession({ status: "idle" });

    p.handlePtyData(session, "No conversation found\r\n");

    expect(onRecoverInvalidSessionRef).not.toHaveBeenCalled();
  });

  it("combines prevChunk with the new data when the error is split across chunks", () => {
    const { p, onRecoverInvalidSessionRef } = recoveryPipeline();
    const session = launchingSession({ prevChunk: "Error: No conversation " });

    p.handlePtyData(session, "found with session ID sess-1");

    expect(onRecoverInvalidSessionRef).toHaveBeenCalledExactlyOnceWith(session);
  });

  it("only inspects output after the last home-cursor sequence (TUI repaint)", () => {
    const { p, onRecoverInvalidSessionRef } = recoveryPipeline();
    const session = launchingSession();

    // The error text precedes a full-screen repaint; the repainted frame is
    // clean, so recovery must not fire on the stale pre-repaint content.
    p.handlePtyData(session, "No conversation found\x1b[H\x1b[2JWelcome back!");

    expect(onRecoverInvalidSessionRef).not.toHaveBeenCalled();
    expect(session.status).toBe("idle");
  });
});

describe("ThreadOutputPipeline / user-interrupt recovery timer", () => {
  function busySession(): SessionRuntime {
    return {
      threadId: "t1",
      status: "working",
      attention: "working",
      config: {},
      hasCliHookPluginActivity: true,
      adapter: { capabilities: { presentationMode: "terminal" } },
      pty: { write: vi.fn<(data: string) => void>() },
    } as unknown as SessionRuntime;
  }

  it("applyCliHookPluginState clears userInterruptRecoveryTimer so a real hook wins the race", () => {
    const p = pipeline();
    const session = busySession();
    const timer = setTimeout(() => {
      throw new Error("timer must be cancelled by applyCliHookPluginState");
    }, 10_000);
    session.userInterruptRecoveryTimer = timer;

    p.applyCliHookPluginState(session, { status: "idle", attention: "none" });

    expect(session.userInterruptRecoveryTimer).toBeUndefined();
    expect(session.status).toBe("idle");
  });

  it("clearSessionTimers clears userInterruptRecoveryTimer", () => {
    const p = pipeline();
    const session = busySession();
    session.userInterruptRecoveryTimer = setTimeout(() => {
      throw new Error("timer must be cancelled by clearSessionTimers");
    }, 10_000);

    p.clearSessionTimers(session);

    expect(session.userInterruptRecoveryTimer).toBeUndefined();
  });
});
