import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { USER_INTERRUPT_RECOVERY_GRACE_MS, isUserInterruptKeystroke } from "./threadSessionManager";
import { ThreadOutputPipeline } from "./threadOutputPipeline";
import type { SessionRuntime } from "./sessionTypes";

/**
 * Covers the client-side fallback for Claude Code's hook gap around user
 * interrupts (docs: `Stop` is suppressed on user interrupt; no hook fires
 * when the user dismisses a permission dialog or presses Esc during text
 * generation). The fallback lives in `ThreadSessionManager.writeTerminal`
 * and composes two primitives:
 *   1. `isUserInterruptKeystroke` — pure classifier for input bytes.
 *   2. A grace timer on `SessionRuntime.userInterruptRecoveryTimer` that
 *      calls `ThreadOutputPipeline.applyCliHookPluginState({ idle, none })`
 *      if no hook event flips state within the window.
 *
 * These tests pin both primitives; the race between a real hook and the
 * fallback is covered by `ThreadOutputPipeline` clearing the timer inside
 * `applyCliHookPluginState` (see `threadOutputPipeline.test.ts`).
 */

describe("isUserInterruptKeystroke", () => {
  it("treats Ctrl+C (0x03) as interrupt, alone or mixed", () => {
    expect(isUserInterruptKeystroke("\x03")).toBe(true);
    expect(isUserInterruptKeystroke("abc\x03")).toBe(true);
  });

  it("treats a standalone Esc (0x1b) as interrupt", () => {
    expect(isUserInterruptKeystroke("\x1b")).toBe(true);
  });

  it("does NOT treat CSI / SS3 escape sequences as interrupts", () => {
    // Arrow keys and function keys share the ESC prefix — must not arm the
    // fallback when the user is just navigating a TUI dialog.
    expect(isUserInterruptKeystroke("\x1b[A")).toBe(false);
    expect(isUserInterruptKeystroke("\x1b[B")).toBe(false);
    expect(isUserInterruptKeystroke("\x1b[C")).toBe(false);
    expect(isUserInterruptKeystroke("\x1b[D")).toBe(false);
    expect(isUserInterruptKeystroke("\x1bOP")).toBe(false);
  });

  it("does NOT treat plain text as interrupt", () => {
    expect(isUserInterruptKeystroke("")).toBe(false);
    expect(isUserInterruptKeystroke("hello")).toBe(false);
    expect(isUserInterruptKeystroke("\r")).toBe(false);
  });
});

/**
 * End-to-end simulation of the fallback: we don't spin up a full
 * `ThreadSessionManager` (it pulls node-pty + settings I/O); instead we
 * wire a real `ThreadOutputPipeline` with a stubbed emit and reproduce the
 * exact arm/expire shape that `maybeArmUserInterruptRecovery` implements.
 */
describe("user-interrupt recovery fallback / arm-and-expire", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(status: SessionRuntime["status"] = "working") {
    const emit = vi.fn<(event: unknown) => void>();
    const pipeline = new ThreadOutputPipeline({
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
      status,
      attention:
        status === "working" ? "working" : status === "needs_approval" ? "needs_approval" : "none",
      config: {},
      runtimeLaunchConfig: {},
      hasCliHookPluginActivity: true,
      adapter: { capabilities: { presentationMode: "terminal" } },
      pty: { write: vi.fn<(data: string) => void>() },
    } as unknown as SessionRuntime;
    return { emit, pipeline, session };
  }

  // Mirrors the private `maybeArmUserInterruptRecovery` in ThreadSessionManager
  // exactly; this is the logic under test.
  function armFallback(pipeline: ThreadOutputPipeline, session: SessionRuntime): void {
    if (session.userInterruptRecoveryTimer) {
      clearTimeout(session.userInterruptRecoveryTimer);
    }
    session.userInterruptRecoveryTimer = setTimeout(() => {
      session.userInterruptRecoveryTimer = undefined;
      pipeline.applyCliHookPluginState(session, { status: "idle", attention: "none" });
    }, USER_INTERRUPT_RECOVERY_GRACE_MS);
  }

  it("transitions to idle after the grace window expires with no hook event", () => {
    const { emit, pipeline, session } = setup("working");
    armFallback(pipeline, session);

    vi.advanceTimersByTime(USER_INTERRUPT_RECOVERY_GRACE_MS - 1);
    expect(session.status).toBe("working");

    vi.advanceTimersByTime(1);
    expect(session.status).toBe("idle");
    expect(session.attention).toBe("none");
    expect(session.userInterruptRecoveryTimer).toBeUndefined();
    // thread-state must be emitted so the renderer unblocks.
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: "thread-state", status: "idle", attention: "none" }),
    );
  });

  it("does NOT override a hook event that arrived during the grace window", () => {
    const { pipeline, session } = setup("needs_approval");
    armFallback(pipeline, session);

    // A real hook lands before the grace expires → applyCliHookPluginState
    // clears the timer as part of its own flow.
    pipeline.applyCliHookPluginState(session, { status: "working", attention: "working" });
    expect(session.userInterruptRecoveryTimer).toBeUndefined();
    expect(session.status).toBe("working");

    // Advancing past the grace window must NOT flip status back to idle.
    vi.advanceTimersByTime(USER_INTERRUPT_RECOVERY_GRACE_MS + 500);
    expect(session.status).toBe("working");
  });

  it("re-arming replaces the previous timer without stacking", () => {
    const { pipeline, session } = setup("working");
    armFallback(pipeline, session);
    const firstTimer = session.userInterruptRecoveryTimer;

    // Another interrupt keystroke before the first grace expired.
    vi.advanceTimersByTime(100);
    armFallback(pipeline, session);
    expect(session.userInterruptRecoveryTimer).not.toBe(firstTimer);

    // Only the second timer should eventually fire; we must not flip to
    // idle at firstTimer + GRACE but at secondTimer + GRACE.
    vi.advanceTimersByTime(USER_INTERRUPT_RECOVERY_GRACE_MS - 1);
    expect(session.status).toBe("working");
    vi.advanceTimersByTime(1);
    expect(session.status).toBe("idle");
  });
});
