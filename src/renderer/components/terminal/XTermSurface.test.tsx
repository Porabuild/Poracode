import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { SupervisorEvent } from "@/shared/ipc";

// ── Hoisted state shared between mock factories and test code ────
const { state } = vi.hoisted(() => ({
  state: {
    terminal: null as null | Record<string, ReturnType<typeof vi.fn>>,
    terminalOptions: null as null | Record<string, unknown>,
    eventListeners: [] as Array<(e: SupervisorEvent) => void>,
    isMac: false,
    bridge: {
      readTerminalScrollback: vi.fn<() => Promise<string>>().mockResolvedValue(""),
      writeTerminal: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      resizeTerminal: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      openExternal: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      openExternalNative: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      onSupervisorEvent: vi.fn<(listener: (e: SupervisorEvent) => void) => () => void>(),
    },
  },
}));

// ── xterm mocks ──────────────────────────────────────────────────
vi.mock("@xterm/xterm", () => ({
  Terminal: class MockTerminal {
    open = vi.fn<(element: Element) => void>();
    loadAddon = vi.fn<(addon: unknown) => void>();
    write = vi.fn<(data: string) => void>();
    reset = vi.fn<() => void>();
    dispose = vi.fn<() => void>();
    onData = vi.fn<(handler: (data: string) => void) => { dispose: () => void }>(() => ({
      dispose: vi.fn<() => void>(),
    }));
    onWriteParsed = vi.fn<(handler: () => void) => { dispose: () => void }>(() => ({
      dispose: vi.fn<() => void>(),
    }));
    onBell = vi.fn<(handler: () => void) => { dispose: () => void }>(() => ({
      dispose: vi.fn<() => void>(),
    }));
    onTitleChange = vi.fn<(handler: (title: string) => void) => { dispose: () => void }>(() => ({
      dispose: vi.fn<() => void>(),
    }));
    onScroll = vi.fn<(handler: () => void) => { dispose: () => void }>(() => ({
      dispose: vi.fn<() => void>(),
    }));
    onSelectionChange = vi.fn<(handler: () => void) => { dispose: () => void }>(() => ({
      dispose: vi.fn<() => void>(),
    }));
    hasSelection = vi.fn<() => boolean>(() => false);
    getSelection = vi.fn<() => string>(() => "");
    clearSelection = vi.fn<() => void>();
    registerLinkProvider = vi
      .fn<() => { dispose: () => void }>()
      .mockReturnValue({ dispose: vi.fn<() => void>() });
    attachCustomKeyEventHandler = vi.fn<(handler: (event: KeyboardEvent) => boolean) => void>();
    unicode = { activeVersion: "6" };
    buffer = { active: { baseY: 0, viewportY: 0 }, normal: { length: 0 } };
    cols = 80;
    rows = 24;
    options: Record<string, unknown> = {};
    constructor(options: Record<string, unknown>) {
      this.options = options;
      state.terminal = this as unknown as Record<string, ReturnType<typeof vi.fn>>;
      state.terminalOptions = options;
    }
  },
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class MockFitAddon {
    fit = vi.fn<() => void>();
  },
}));

vi.mock("@xterm/addon-unicode11", () => ({
  Unicode11Addon: class MockUnicode11Addon {},
}));

vi.mock("@xterm/addon-image", () => ({
  ImageAddon: class MockImageAddon {},
}));

vi.mock("@xterm/addon-clipboard", () => ({
  ClipboardAddon: class MockClipboardAddon {},
}));

vi.mock("@xterm/addon-search", () => ({
  SearchAddon: class MockSearchAddon {
    onDidChangeResults() {
      return { dispose() {} };
    }
    findNext() {
      return false;
    }
    findPrevious() {
      return false;
    }
    clearDecorations() {}
  },
}));

vi.mock("@xterm/addon-webgl", () => ({
  WebglAddon: class MockWebglAddon {
    onContextLoss = vi.fn<(handler: () => void) => { dispose: () => void }>(() => ({
      dispose: vi.fn<() => void>(),
    }));
    dispose = vi.fn<() => void>();
  },
}));

vi.mock("./TerminalLinkProvider", () => ({
  TerminalLinkProvider: class MockTerminalLinkProvider {},
}));

// ── bridge mock ──────────────────────────────────────────────────
state.bridge.onSupervisorEvent.mockImplementation((listener: (e: SupervisorEvent) => void) => {
  state.eventListeners.push(listener);
  return () => {
    state.eventListeners = state.eventListeners.filter((l) => l !== listener);
  };
});

vi.mock("../../bridge", () => ({ readBridge: () => state.bridge, isMac: () => state.isMac }));
vi.mock("../ui/provider", () => ({ useResolvedAppearance: () => "dark" }));

import { XTermSurface } from "./XTermSurface";

function emitEvent(event: SupervisorEvent) {
  for (const listener of [...state.eventListeners]) {
    listener(event);
  }
}

/** Flush microtasks plus a rAF window so scrollback hydration / activity callbacks settle. */
async function flushFrame() {
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
    state.terminalOptions = null;
    state.eventListeners = [];
    state.isMac = false;
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

  it("minimizes xterm's internal scrollbar gutter", () => {
    render(<XTermSurface terminalId="test-1" />);
    expect(state.terminalOptions?.scrollbar).toEqual({ width: 0.01 });
  });

  it("subscribes to supervisor events", () => {
    render(<XTermSurface terminalId="test-1" />);
    expect(state.bridge.onSupervisorEvent).toHaveBeenCalled();
    expect(state.eventListeners).toHaveLength(1);
  });

  it("opens login terminal links in the native browser when requested", () => {
    render(<XTermSurface terminalId="test-1" openLinksInNativeBrowser />);

    const linkHandler = state.terminalOptions?.linkHandler as
      | { activate: (event: MouseEvent, uri: string) => void }
      | undefined;
    linkHandler?.activate(new MouseEvent("click"), "https://auth.openai.com/codex/device");

    expect(state.bridge.openExternalNative).toHaveBeenCalledWith(
      "https://auth.openai.com/codex/device",
    );
    expect(state.bridge.openExternal).not.toHaveBeenCalled();
  });

  it("hydrates the terminal from supervisor scrollback on mount", async () => {
    state.bridge.readTerminalScrollback.mockResolvedValueOnce("existing output");

    render(<XTermSurface terminalId="test-1" />);
    await flushFrame();

    expect(state.bridge.readTerminalScrollback).toHaveBeenCalledWith({ threadId: "test-1" });
    expect(terminal().write).toHaveBeenCalledWith("existing output");
  });

  it("nudges the live agent to repaint after restoring scrollback on reopen", async () => {
    // Reopen restores a non-empty transcript. A no-alt-screen repaint-in-place
    // agent (Claude no-flicker) won't redraw from a same-size resize (no
    // SIGWINCH), so the surface must force one genuine winsize delta — rows-1
    // then rows — to make the agent emit a fresh frame over the replay.
    state.bridge.readTerminalScrollback.mockResolvedValueOnce("restored frame");

    render(<XTermSurface terminalId="test-1" />);
    await flushFrame();

    expect(state.bridge.resizeTerminal).toHaveBeenCalledWith({
      threadId: "test-1",
      cols: 80,
      rows: 23,
    });
    expect(state.bridge.resizeTerminal).toHaveBeenCalledWith({
      threadId: "test-1",
      cols: 80,
      rows: 24,
    });
  });

  it("does not nudge on a fresh launch with no scrollback", async () => {
    state.bridge.readTerminalScrollback.mockResolvedValueOnce("");

    render(<XTermSurface terminalId="test-1" />);
    await flushFrame();

    expect(state.bridge.resizeTerminal).not.toHaveBeenCalled();
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

    act(() => {
      emitEvent({
        type: "thread-output",
        threadId: "test-1",
        data: "hello world",
        outputLength: 11,
      });
    });
    await flushFrame();

    expect(terminal().write).toHaveBeenCalledWith("hello world");
  });

  it("ignores thread-output for a different terminal", async () => {
    render(<XTermSurface terminalId="test-1" />);

    act(() => {
      emitEvent({
        type: "thread-output",
        threadId: "other",
        data: "nope",
        outputLength: 4,
      });
    });
    await flushFrame();

    expect(terminal().write).not.toHaveBeenCalled();
  });

  it("resets terminal and calls onReset on thread-reset", async () => {
    const onReset = vi.fn<() => void>();
    render(<XTermSurface terminalId="test-1" onReset={onReset} />);

    act(() => {
      emitEvent({ type: "thread-reset", threadId: "test-1" });
    });

    expect(terminal().reset).toHaveBeenCalled();
    expect(onReset).toHaveBeenCalled();
  });

  it("does not rehydrate stale scrollback after a thread-reset", async () => {
    let resolveScrollback: (value: string) => void = () => {};
    state.bridge.readTerminalScrollback.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        resolveScrollback = resolve;
      }),
    );

    render(<XTermSurface terminalId="test-1" />);

    act(() => {
      emitEvent({ type: "thread-reset", threadId: "test-1" });
    });

    await act(async () => {
      resolveScrollback("old session output");
      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 16);
      });
    });

    expect(state.bridge.readTerminalScrollback).toHaveBeenCalledTimes(1);
    expect(terminal().reset).toHaveBeenCalled();
    expect(terminal().write).not.toHaveBeenCalled();
  });

  it("calls onExited on thread-exited", async () => {
    const onExited = vi.fn<(exitCode: number | null) => void>();
    render(<XTermSurface terminalId="test-1" onExited={onExited} />);

    act(() => {
      emitEvent({ type: "thread-exited", threadId: "test-1", exitCode: 0 });
    });

    expect(onExited).toHaveBeenCalledWith(0);
  });

  // ── Critical: output after reset ─────────────────────────────

  it("still receives thread-output after a thread-reset", async () => {
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
    await flushFrame();

    expect(terminal().write).toHaveBeenCalledWith("after reset");
  });

  // ── Activity / bell / title callbacks ───────────────────────────

  it("calls onActivity when onWriteParsed fires", async () => {
    const onActivity = vi.fn<() => void>();
    render(<XTermSurface terminalId="test-1" onActivity={onActivity} />);

    // Activity and scroll tracking are coalesced into a single rAF-gated handler.
    expect(terminal().onWriteParsed).toHaveBeenCalledTimes(1);
    const handler = terminal().onWriteParsed.mock.calls[0]![0] as unknown as () => void;

    act(() => handler());
    await flushFrame();
    expect(onActivity).toHaveBeenCalledTimes(1);
  });

  it("coalesces rapid onWriteParsed events into one rAF flush", async () => {
    const onActivity = vi.fn<() => void>();
    render(<XTermSurface terminalId="test-1" onActivity={onActivity} />);

    const handler = terminal().onWriteParsed.mock.calls[0]![0] as unknown as () => void;
    act(() => {
      handler();
      handler();
      handler();
    });
    await flushFrame();
    expect(onActivity).toHaveBeenCalledTimes(1);
  });

  it("calls onBell when bell fires", () => {
    const onBell = vi.fn<() => void>();
    render(<XTermSurface terminalId="test-1" onBell={onBell} />);

    expect(terminal().onBell).toHaveBeenCalledTimes(1);
    const handler = terminal().onBell.mock.lastCall![0] as unknown as () => void;

    act(() => handler());
    expect(onBell).toHaveBeenCalledTimes(1);
  });

  it("calls onTitleChange when title changes", () => {
    const onTitleChange = vi.fn<(title: string) => void>();
    render(<XTermSurface terminalId="test-1" onTitleChange={onTitleChange} />);

    expect(terminal().onTitleChange).toHaveBeenCalledTimes(1);
    const handler = terminal().onTitleChange.mock.lastCall![0] as unknown as (
      title: string,
    ) => void;

    act(() => handler("new title"));
    expect(onTitleChange).toHaveBeenCalledWith("new title");
  });
});
