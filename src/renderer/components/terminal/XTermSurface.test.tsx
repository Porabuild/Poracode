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
      getThreadHistory: vi.fn().mockResolvedValue({ history: "", length: 0 }),
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
    onWriteParsed = vi.fn(() => ({ dispose: vi.fn() }));
    onBell = vi.fn(() => ({ dispose: vi.fn() }));
    onTitleChange = vi.fn(() => ({ dispose: vi.fn() }));
    onSelectionChange = vi.fn(() => ({ dispose: vi.fn() }));
    hasSelection = vi.fn(() => false);
    getSelection = vi.fn(() => "");
    clearSelection = vi.fn();
    attachCustomKeyEventHandler = vi.fn();
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
state.bridge.onSupervisorEvent.mockImplementation((listener: (e: SupervisorEvent) => void) => {
  state.eventListeners.push(listener);
  return () => {
    state.eventListeners = state.eventListeners.filter((l) => l !== listener);
  };
});

vi.mock("../../bridge", () => ({ readBridge: () => state.bridge, isMac: () => false }));
vi.mock("../ui/provider", () => ({ useResolvedAppearance: () => "dark" }));

import { XTermSurface } from "./XTermSurface";

function emitEvent(event: SupervisorEvent) {
  for (const listener of [...state.eventListeners]) {
    listener(event);
  }
}

/** Flush the getThreadHistory promise so the component switches to direct-write mode. */
async function flushHistory() {
  await act(async () => {
    await Promise.resolve();
  });
}

/** Flush the write-batching setTimeout (8 ms coalescing window). */
async function flushWriteTimer() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      setTimeout(() => resolve(), 16);
    });
  });
}

type MockFn = ReturnType<typeof vi.fn>;

interface MockTerminalShape {
  open: MockFn;
  loadAddon: MockFn;
  write: MockFn;
  reset: MockFn;
  dispose: MockFn;
  onData: MockFn;
  onWriteParsed: MockFn;
  onBell: MockFn;
  onTitleChange: MockFn;
  onSelectionChange: MockFn;
  hasSelection: MockFn;
  getSelection: MockFn;
  clearSelection: MockFn;
  attachCustomKeyEventHandler: MockFn;
}

/** Return the most recently constructed mock Terminal instance (asserted non-null). */
function terminal(): MockTerminalShape {
  if (!state.terminal) throw new Error("No terminal instance created yet");
  return state.terminal as unknown as MockTerminalShape;
}

describe("XTermSurface", () => {
  beforeEach(() => {
    state.terminal = null;
    state.eventListeners = [];
    vi.clearAllMocks();
    state.bridge.onSupervisorEvent.mockImplementation((listener: (e: SupervisorEvent) => void) => {
      state.eventListeners.push(listener);
      return () => {
        state.eventListeners = state.eventListeners.filter((l) => l !== listener);
      };
    });
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

  it("disposes terminal and unsubscribes on unmount", () => {
    const { unmount } = render(<XTermSurface terminalId="test-1" />);
    const t = terminal();
    expect(state.eventListeners).toHaveLength(1);

    unmount();
    expect(t.dispose).toHaveBeenCalled();
    expect(state.eventListeners).toHaveLength(0);
  });

  // ── Event handling ────────────────────────────────────────────

  it("writes thread-output data to the terminal", async () => {
    render(<XTermSurface terminalId="test-1" />);
    await flushHistory();

    act(() => {
      emitEvent({
        type: "thread-output",
        threadId: "test-1",
        data: "hello world",
        outputLength: 11,
      });
    });
    await flushWriteTimer();

    expect(terminal().write).toHaveBeenCalledWith("hello world");
  });

  it("ignores thread-output for a different terminal", async () => {
    render(<XTermSurface terminalId="test-1" />);
    await flushHistory();

    act(() => {
      emitEvent({
        type: "thread-output",
        threadId: "other",
        data: "nope",
        outputLength: 4,
      });
    });
    await flushWriteTimer();

    expect(terminal().write).not.toHaveBeenCalled();
  });

  it("resets terminal and calls onReset on thread-reset", async () => {
    const onReset = vi.fn();
    render(<XTermSurface terminalId="test-1" onReset={onReset} />);
    await flushHistory();

    act(() => {
      emitEvent({ type: "thread-reset", threadId: "test-1" });
    });

    expect(terminal().reset).toHaveBeenCalled();
    expect(onReset).toHaveBeenCalled();
  });

  it("calls onExited on thread-exited", async () => {
    const onExited = vi.fn();
    render(<XTermSurface terminalId="test-1" onExited={onExited} />);
    await flushHistory();

    act(() => {
      emitEvent({ type: "thread-exited", threadId: "test-1", exitCode: 0 });
    });

    expect(onExited).toHaveBeenCalledWith(0);
  });

  // ── Critical: output after reset ─────────────────────────────

  it("still receives thread-output after a thread-reset", async () => {
    render(<XTermSurface terminalId="test-1" />);
    await flushHistory();

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
    await flushWriteTimer();

    expect(terminal().write).toHaveBeenCalledWith("after reset");
  });

  // ── Activity / bell / title callbacks ───────────────────────────

  it("calls onActivity when onWriteParsed fires", () => {
    const onActivity = vi.fn();
    render(<XTermSurface terminalId="test-1" onActivity={onActivity} />);

    expect(terminal().onWriteParsed).toHaveBeenCalledTimes(1);
    // Safe: we just asserted onWriteParsed was called exactly once above.
    const handler = terminal().onWriteParsed.mock.lastCall![0] as unknown as () => void;

    act(() => handler());
    expect(onActivity).toHaveBeenCalledTimes(1);
  });

  it("calls onBell when bell fires", () => {
    const onBell = vi.fn();
    render(<XTermSurface terminalId="test-1" onBell={onBell} />);

    expect(terminal().onBell).toHaveBeenCalledTimes(1);
    const handler = terminal().onBell.mock.lastCall![0] as unknown as () => void;

    act(() => handler());
    expect(onBell).toHaveBeenCalledTimes(1);
  });

  it("calls onTitleChange when title changes", () => {
    const onTitleChange = vi.fn();
    render(<XTermSurface terminalId="test-1" onTitleChange={onTitleChange} />);

    expect(terminal().onTitleChange).toHaveBeenCalledTimes(1);
    const handler = terminal().onTitleChange.mock.lastCall![0] as unknown as (
      title: string,
    ) => void;

    act(() => handler("new title"));
    expect(onTitleChange).toHaveBeenCalledWith("new title");
  });
});
