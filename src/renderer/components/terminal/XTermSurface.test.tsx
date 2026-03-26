import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupervisorEvent } from "../../../shared/ipc";

// ── Hoisted state shared between mock factories and test code ────
const { state } = vi.hoisted(() => ({
  state: {
    terminal: null as null | Record<string, ReturnType<typeof vi.fn>>,
    eventListeners: [] as Array<(e: SupervisorEvent) => void>,
    bridge: {
      writeTerminal: vi.fn().mockResolvedValue(undefined),
      resizeTerminal: vi.fn().mockResolvedValue(undefined),
      onSupervisorEvent: vi.fn(),
    },
  },
}));

// ── xterm mocks ──────────────────────────────────────────────────
vi.mock("@xterm/xterm", () => ({
  Terminal: class MockTerminal {
    open = vi.fn();
    loadAddon = vi.fn();
    write = vi.fn();
    reset = vi.fn();
    dispose = vi.fn();
    onData = vi.fn(() => ({ dispose: vi.fn() }));
    cols = 80;
    rows = 24;
    constructor() {
      state.terminal = this as unknown as Record<string, ReturnType<typeof vi.fn>>;
    }
  },
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class MockFitAddon {
    fit = vi.fn();
  },
}));

// ── bridge mock ──────────────────────────────────────────────────
state.bridge.onSupervisorEvent.mockImplementation(
  (listener: (e: SupervisorEvent) => void) => {
    state.eventListeners.push(listener);
    return () => {
      state.eventListeners = state.eventListeners.filter((l) => l !== listener);
    };
  },
);

vi.mock("../../bridge", () => ({ readBridge: () => state.bridge }));
vi.mock("../ui/provider", () => ({ useResolvedAppearance: () => "dark" }));

import { XTermSurface } from "./XTermSurface";

function emitEvent(event: SupervisorEvent) {
  for (const listener of [...state.eventListeners]) {
    listener(event);
  }
}

/** Return the most recently constructed mock Terminal instance. */
function terminal() {
  if (!state.terminal) throw new Error("No terminal instance created yet");
  return state.terminal;
}

describe("XTermSurface", () => {
  beforeEach(() => {
    state.terminal = null;
    state.eventListeners = [];
    vi.clearAllMocks();
    state.bridge.onSupervisorEvent.mockImplementation(
      (listener: (e: SupervisorEvent) => void) => {
        state.eventListeners.push(listener);
        return () => {
          state.eventListeners = state.eventListeners.filter((l) => l !== listener);
        };
      },
    );
  });

  afterEach(() => {
    state.eventListeners = [];
  });

  // ── Lifecycle ─────────────────────────────────────────────────

  it("creates and opens a terminal when enabled", () => {
    render(<XTermSurface terminalId="test-1" />);
    expect(state.terminal).not.toBeNull();
    expect(terminal().open).toHaveBeenCalled();
  });

  it("subscribes to supervisor events", () => {
    render(<XTermSurface terminalId="test-1" />);
    expect(state.bridge.onSupervisorEvent).toHaveBeenCalled();
    expect(state.eventListeners).toHaveLength(1);
  });

  it("does NOT create a terminal when enabled=false", () => {
    render(<XTermSurface terminalId="test-1" enabled={false} />);
    expect(state.terminal).toBeNull();
  });

  it("disposes terminal and unsubscribes on unmount", () => {
    const { unmount } = render(<XTermSurface terminalId="test-1" />);
    const t = terminal();
    expect(state.eventListeners).toHaveLength(1);

    unmount();
    expect(t.dispose).toHaveBeenCalled();
    expect(state.eventListeners).toHaveLength(0);
  });

  // ── Event handling ────────────────────────────────────────────

  it("writes thread-output data to the terminal", () => {
    render(<XTermSurface terminalId="test-1" />);

    act(() => {
      emitEvent({
        type: "thread-output",
        threadId: "test-1",
        data: "hello world",
        outputLength: 11,
      });
    });

    expect(terminal().write).toHaveBeenCalledWith("hello world");
  });

  it("ignores thread-output for a different terminal", () => {
    render(<XTermSurface terminalId="test-1" />);

    act(() => {
      emitEvent({
        type: "thread-output",
        threadId: "other",
        data: "nope",
        outputLength: 4,
      });
    });

    expect(terminal().write).not.toHaveBeenCalled();
  });

  it("resets terminal and calls onReset on thread-reset", () => {
    const onReset = vi.fn();
    render(<XTermSurface terminalId="test-1" onReset={onReset} />);

    act(() => {
      emitEvent({ type: "thread-reset", threadId: "test-1" });
    });

    expect(terminal().reset).toHaveBeenCalled();
    expect(onReset).toHaveBeenCalled();
  });

  it("calls onExited on thread-exited", () => {
    const onExited = vi.fn();
    render(<XTermSurface terminalId="test-1" onExited={onExited} />);

    act(() => {
      emitEvent({ type: "thread-exited", threadId: "test-1", exitCode: 0 });
    });

    expect(onExited).toHaveBeenCalledWith(0);
  });

  // ── Critical: output after reset ─────────────────────────────

  it("still receives thread-output after a thread-reset", () => {
    render(<XTermSurface terminalId="test-1" />);

    act(() => {
      emitEvent({ type: "thread-reset", threadId: "test-1" });
    });

    act(() => {
      emitEvent({
        type: "thread-output",
        threadId: "test-1",
        data: "after reset",
        outputLength: 11,
      });
    });

    expect(terminal().write).toHaveBeenCalledWith("after reset");
  });

  // ── Disable / re-enable cycle ─────────────────────────────────

  it("disposes terminal when enabled transitions to false", () => {
    const { rerender } = render(<XTermSurface terminalId="test-1" enabled={true} />);
    const t = terminal();

    rerender(<XTermSurface terminalId="test-1" enabled={false} />);
    expect(t.dispose).toHaveBeenCalled();
    expect(state.eventListeners).toHaveLength(0);
  });

  it("loses events while disabled after an enabled→disabled→enabled cycle", () => {
    const { rerender } = render(<XTermSurface terminalId="test-1" enabled={true} />);

    // Disable — terminal disposed, listener removed
    rerender(<XTermSurface terminalId="test-1" enabled={false} />);
    expect(state.eventListeners).toHaveLength(0);

    // Event arrives while disabled — nobody is listening
    act(() => {
      emitEvent({
        type: "thread-output",
        threadId: "test-1",
        data: "lost data",
        outputLength: 9,
      });
    });

    // Re-enable — new terminal created
    rerender(<XTermSurface terminalId="test-1" enabled={true} />);
    expect(terminal().open).toHaveBeenCalled();

    // The "lost data" was never written to any terminal instance
    expect(terminal().write).not.toHaveBeenCalledWith("lost data");
  });
});
