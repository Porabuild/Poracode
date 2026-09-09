import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { resizeTerminalPayloadSchema } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import type { TerminalFeedListener } from "@/shared/remote/terminalFeed";
import type { RemoteTerminalWatchResultReady } from "@/shared/remote/protocol";
// ── Hoisted state shared between mock factories and test code ────
const { state } = vi.hoisted(() => ({
  state: {
    terminal: null as null | Record<string, ReturnType<typeof vi.fn>>,
    terminalOptions: null as null | Record<string, unknown>,
    fitSize: null as null | { cols: number; rows: number },
    eventListeners: [] as Array<(e: SupervisorEvent) => void>,
    isMac: false,
    interestContinuous: false,
    interestRelease: vi.fn<() => void>(),
    interestReady: Promise.resolve(),
    /** Every terminal.write call, in order. */
    writeLog: [] as Array<{ data: string; hasCallback: boolean }>,
    /** Write callbacks pending their simulated parse completion (FIFO). */
    pendingWriteCallbacks: [] as Array<() => void>,
    /** Parser handlers registered through terminal.parser. */
    parserHandlers: [] as Array<{
      kind: "csi" | "osc" | "dcs";
      id: unknown;
      callback: (...args: never[]) => boolean;
    }>,
    bridge: {
      readTerminalScrollback: vi.fn<() => Promise<string>>().mockResolvedValue(""),
      writeTerminal: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      resizeTerminal: vi.fn<(input: unknown) => Promise<void>>().mockResolvedValue(undefined),
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
    write = vi.fn<(data: string, callback?: () => void) => void>((data, callback) => {
      state.writeLog.push({ data, hasCallback: callback !== undefined });
      if (callback) {
        state.pendingWriteCallbacks.push(callback);
      }
    });
    reset = vi.fn<() => void>();
    dispose = vi.fn<() => void>();
    parser = {
      registerCsiHandler: vi.fn<
        (id: unknown, callback: (...args: never[]) => boolean) => { dispose: () => void }
      >((id, callback) => {
        state.parserHandlers.push({ kind: "csi", id, callback });
        return { dispose: vi.fn<() => void>() };
      }),
      registerOscHandler: vi.fn<
        (id: unknown, callback: (...args: never[]) => boolean) => { dispose: () => void }
      >((id, callback) => {
        state.parserHandlers.push({ kind: "osc", id, callback });
        return { dispose: vi.fn<() => void>() };
      }),
      registerDcsHandler: vi.fn<
        (id: unknown, callback: (...args: never[]) => boolean) => { dispose: () => void }
      >((id, callback) => {
        state.parserHandlers.push({ kind: "dcs", id, callback });
        return { dispose: vi.fn<() => void>() };
      }),
    };
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
    scrollToBottom = vi.fn<() => void>();
    refresh = vi.fn<(start: number, end: number) => void>();
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
    fit = vi.fn<() => void>(() => {
      if (state.terminal && state.fitSize) {
        Object.assign(state.terminal, state.fitSize);
      }
    });
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
vi.mock("@/renderer/state/rendererEventInterests", () => ({
  retainRendererEventInterest: () => ({
    ready: state.interestReady,
    continuous: state.interestContinuous,
    release: state.interestRelease,
  }),
}));

import { useThreadOutputStore } from "@/renderer/state/threadOutputStore";
import { XTermSurface } from "./XTermSurface";

function emitEvent(event: SupervisorEvent) {
  for (const listener of [...state.eventListeners]) {
    listener(event);
  }
}

/**
 * Flush microtasks plus a rAF window so scrollback hydration / activity
 * callbacks settle. Hydration writes drain in FIFO order (barrier → replay →
 * completion); a callback can queue more writes, so drain in rounds after
 * yielding to the microtasks that materialize them (initializeViewport runs
 * on `eventInterest.ready.then`, the bridge read resolves on further
 * microtasks — draining before those run would find an empty queue).
 */
async function flushFrame() {
  await act(async () => {
    // Several microtask hops materialize the chain (interest.ready →
    // initializeViewport → bridge read → gate.begin), so keep yielding and
    // draining for a bounded number of rounds instead of breaking on the
    // first empty queue.
    for (let round = 0; round < 10; round += 1) {
      await Promise.resolve();
      while (state.pendingWriteCallbacks.length > 0) {
        const callback = state.pendingWriteCallbacks.shift();
        callback?.();
        await Promise.resolve();
      }
    }
    await new Promise<void>((resolve) => {
      setTimeout(() => resolve(), 16);
    });
  });
}

/** Run exactly `count` pending write callbacks (one hydration step each). */
async function runWriteCallbacks(count: number) {
  await act(async () => {
    for (let i = 0; i < count; i += 1) {
      await Promise.resolve();
      const callback = state.pendingWriteCallbacks.shift();
      callback?.();
      await Promise.resolve();
    }
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
  scrollToBottom: MockFn;
  refresh: MockFn;
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
    state.fitSize = null;
    state.eventListeners = [];
    state.isMac = false;
    state.interestContinuous = false;
    state.interestReady = Promise.resolve();
    state.writeLog = [];
    state.pendingWriteCallbacks = [];
    state.parserHandlers = [];
    vi.clearAllMocks();
    // clearAllMocks does not discard unconsumed mockResolvedValueOnce entries;
    // restore the default scrollback answer so a Once queued by a previous
    // test cannot leak into this one.
    state.bridge.readTerminalScrollback.mockReset().mockResolvedValue("");
    useThreadOutputStore.setState({ buffers: {} });
    state.bridge.onSupervisorEvent.mockImplementation((listener: (e: SupervisorEvent) => void) => {
      state.eventListeners.push(listener);
      return () => {
        state.eventListeners = state.eventListeners.filter((l) => l !== listener);
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
    // The replay goes through the gate barrier (empty write first), then the
    // transcript with a parse-completion callback.
    expect(terminal().write).toHaveBeenCalledWith("existing output", expect.any(Function));
  });

  it("hydrates from the renderer accumulator when present and skips the bridge replay", async () => {
    state.interestContinuous = true;
    useThreadOutputStore.getState().appendOutput("test-1", "accumulated history\nframe2");

    render(<XTermSurface terminalId="test-1" />);
    await flushFrame();

    expect(terminal().write).toHaveBeenCalledWith(
      "accumulated history\nframe2",
      expect.any(Function),
    );
    // The accumulator is the source of truth; the stale bridge transcript must
    // not be replayed on top of it.
    expect(state.bridge.readTerminalScrollback).not.toHaveBeenCalled();
  });

  it("uses supervisor scrollback after an interest gap instead of stale accumulated output", async () => {
    useThreadOutputStore.getState().appendOutput("test-1", "stale visible frame");
    state.bridge.readTerminalScrollback.mockResolvedValueOnce("authoritative hidden output");

    render(<XTermSurface terminalId="test-1" />);
    await flushFrame();

    expect(state.bridge.readTerminalScrollback).toHaveBeenCalledWith({ threadId: "test-1" });
    expect(terminal().write).toHaveBeenCalledWith(
      "authoritative hidden output",
      expect.any(Function),
    );
    expect(terminal().write).not.toHaveBeenCalledWith("stale visible frame");
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

  it("clamps a fitted terminal to the backing PTY size contract", async () => {
    state.fitSize = { cols: 401, rows: 201 };
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(4_000);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(2_000);
    state.bridge.resizeTerminal.mockImplementation((input) => {
      resizeTerminalPayloadSchema.parse(input);
      return Promise.resolve();
    });

    render(<XTermSurface terminalId="test-1" />);
    await flushFrame();

    expect(state.terminal).toMatchObject({ cols: 401, rows: 201 });
    expect(state.bridge.resizeTerminal).toHaveBeenCalledWith({
      threadId: "test-1",
      cols: 400,
      rows: 200,
    });
  });

  it("does not nudge on a fresh launch with no scrollback", async () => {
    state.bridge.readTerminalScrollback.mockResolvedValueOnce("");

    render(<XTermSurface terminalId="test-1" />);
    await flushFrame();

    expect(state.bridge.resizeTerminal).not.toHaveBeenCalled();
  });

  it("refits and repaints a keep-alive terminal when it becomes visible again", async () => {
    state.bridge.readTerminalScrollback.mockResolvedValueOnce("");
    const { rerender } = render(<XTermSurface terminalId="test-1" visible={false} />);
    await flushFrame();
    state.bridge.resizeTerminal.mockClear();

    rerender(<XTermSurface terminalId="test-1" visible />);
    await flushFrame();
    await flushFrame();

    expect(terminal().scrollToBottom).not.toHaveBeenCalled();
    expect(terminal().refresh).toHaveBeenCalledWith(0, 23);
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
        terminalInstanceId: "gen-test",
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
        terminalInstanceId: "gen-test",
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

  it("rehydrates authoritative scrollback after a live-stream replay gap", async () => {
    state.interestContinuous = true;
    useThreadOutputStore.getState().appendOutput("test-1", "incomplete frame");
    state.bridge.readTerminalScrollback.mockResolvedValueOnce("authoritative full frame");
    render(<XTermSurface terminalId="test-1" />);
    await flushFrame();
    state.bridge.readTerminalScrollback.mockClear();
    terminal().write.mockClear();

    act(() => {
      emitEvent({ type: "thread-scrollback-resync", threadId: "test-1" });
    });
    await flushFrame();

    expect(state.bridge.readTerminalScrollback).toHaveBeenCalledWith({ threadId: "test-1" });
    expect(terminal().write).toHaveBeenCalledWith("authoritative full frame", expect.any(Function));
  });

  it("does not rehydrate stale scrollback after a thread-reset", async () => {
    let resolveScrollback: (value: string) => void = () => {};
    state.bridge.readTerminalScrollback.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        resolveScrollback = resolve;
      }),
    );

    render(<XTermSurface terminalId="test-1" />);

    await act(async () => {
      await Promise.resolve();
    });

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

  it("skips scrollback hydration when a reset arrives before interest acknowledgement", async () => {
    let acknowledgeInterest: () => void = () => {};
    state.interestReady = new Promise<void>((resolve) => {
      acknowledgeInterest = resolve;
    });
    render(<XTermSurface terminalId="test-1" />);

    act(() => {
      emitEvent({ type: "thread-reset", threadId: "test-1" });
      acknowledgeInterest();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(state.bridge.readTerminalScrollback).not.toHaveBeenCalled();
    expect(terminal().reset).toHaveBeenCalled();
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
        terminalInstanceId: "gen-test",
      });
    });
    await flushFrame();

    expect(terminal().write).toHaveBeenCalledWith("after reset");
  });

  // ── Replay query-reply gate ──────────────────────────────────

  it("hydrates through the gate barrier and registers reply suppression", async () => {
    state.bridge.readTerminalScrollback.mockResolvedValueOnce("replayed frame\x1b[0c");

    render(<XTermSurface terminalId="test-1" />);
    await flushFrame();

    // Barrier (empty write) first, then the replay with a completion callback.
    expect(state.writeLog.map((entry) => entry.data)).toEqual(["", "replayed frame\x1b[0c"]);
    expect(state.writeLog.every((entry) => entry.hasCallback)).toBe(true);
    // Reply-capable families registered through the public parser API.
    const registered = state.parserHandlers.map(
      (handler) => `${handler.kind}:${JSON.stringify(handler.id)}`,
    );
    expect(registered).toContain('csi:{"final":"c"}');
    expect(registered).toContain('csi:{"prefix":"?","final":"h"}');
    expect(registered).toContain('dcs:{"intermediates":"$","final":"q"}');
    expect(registered).toContain("osc:52");
  });

  it("drops a replayed device reply at onData but keeps typing flowing mid-hydration", async () => {
    let resolveScrollback: (value: string) => void = () => {};
    state.bridge.readTerminalScrollback.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        resolveScrollback = resolve;
      }),
    );

    render(<XTermSurface terminalId="test-1" />);
    await act(async () => {
      await Promise.resolve();
    });
    resolveScrollback("historical\x1b[0c");
    // Advance one write callback: the barrier fired and the replay is parsing.
    await runWriteCallbacks(1);

    const onData = terminal().onData.mock.calls[0]![0] as unknown as (data: string) => void;
    const csiC = state.parserHandlers.find(
      (handler) => handler.kind === "csi" && (handler.id as { final?: string }).final === "c",
    );
    expect(csiC).toBeDefined();

    // The parser dispatch marks the reply scope and passes through; the
    // built-in's stale DA1 reply is emitted (and dropped) inside that scope.
    act(() => {
      expect(csiC?.callback([] as never)).toBe(false);
      onData("\x1b[?1;2c");
    });
    expect(state.bridge.writeTerminal).not.toHaveBeenCalled();

    // The scope clears on the next microtask — before any user-input
    // macrotask — so ordinary typing in the same hydration window flows.
    await act(async () => {
      await Promise.resolve();
    });
    act(() => onData("ls\n"));
    expect(state.bridge.writeTerminal).toHaveBeenCalledWith({ threadId: "test-1", data: "ls\n" });

    // Once the replay has parsed, live replies are forwarded again.
    await flushFrame();
    act(() => onData("\x1b[?1;2c"));
    expect(state.bridge.writeTerminal).toHaveBeenCalledWith({
      threadId: "test-1",
      data: "\x1b[?1;2c",
    });
  });

  it("buffers live output during hydration and flushes it after the replay parses", async () => {
    let resolveScrollback: (value: string) => void = () => {};
    state.bridge.readTerminalScrollback.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        resolveScrollback = resolve;
      }),
    );

    render(<XTermSurface terminalId="test-1" />);
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      emitEvent({
        type: "thread-output",
        threadId: "test-1",
        data: "live1",
        outputLength: 5,
        terminalInstanceId: "gen-test",
      });
    });
    resolveScrollback("replayed");
    await flushFrame();

    expect(state.writeLog.map((entry) => entry.data)).toEqual(["", "replayed", "live1"]);
  });

  it("wipes a queued replay on thread-reset and keeps live output flowing", async () => {
    const onReset = vi.fn<() => void>();
    let resolveScrollback: (value: string) => void = () => {};
    state.bridge.readTerminalScrollback.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        resolveScrollback = resolve;
      }),
    );

    render(<XTermSurface terminalId="test-1" onReset={onReset} />);
    await act(async () => {
      await Promise.resolve();
    });
    resolveScrollback("stale\x1b[0c");
    await runWriteCallbacks(1);

    act(() => {
      emitEvent({ type: "thread-reset", threadId: "test-1" });
    });
    act(() => {
      emitEvent({
        type: "thread-output",
        threadId: "test-1",
        data: "fresh",
        outputLength: 5,
        terminalInstanceId: "gen-test",
      });
    });
    await flushFrame();

    // Reset count: the barrier's before-reset, the thread-reset itself, and
    // the gate's cancel cleanup after the stale replay chunk finished parsing.
    expect(terminal().reset).toHaveBeenCalledTimes(3);
    expect(state.writeLog.map((entry) => entry.data)).toEqual(["", "stale\x1b[0c", "fresh"]);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("hydrates a caller-supplied snapshot through the gate barrier", async () => {
    render(<XTermSurface terminalId="test-1" initialScrollback={"snapshot\x1b[0c"} />);
    await flushFrame();

    expect(state.bridge.readTerminalScrollback).not.toHaveBeenCalled();
    expect(state.writeLog.map((entry) => entry.data)).toEqual(["", "snapshot\x1b[0c"]);
  });

  it("skips hydration writes for an empty caller-supplied snapshot", async () => {
    render(<XTermSurface terminalId="test-1" initialScrollback="" />);
    await flushFrame();

    expect(state.bridge.readTerminalScrollback).not.toHaveBeenCalled();
    expect(state.writeLog).toEqual([]);
  });

  it("shows watch failures and clears the status when the stream recovers", async () => {
    let listener: TerminalFeedListener | undefined;
    const outputSource = (next: TerminalFeedListener) => {
      listener = next;
      return () => undefined;
    };
    render(<XTermSurface terminalId="test-1" outputSource={outputSource} initialScrollback="" />);
    await flushFrame();
    act(() => listener?.onWatchError?.({ status: "error", code: "unavailable", retryable: true }));
    expect(screen.getByRole("status")).toHaveTextContent("Reconnecting to terminal…");
    act(() => listener?.onWatchError?.({ status: "error", code: "forbidden", retryable: false }));
    expect(screen.getByRole("status")).toHaveTextContent("Terminal access denied.");
    act(() =>
      listener?.onSnapshot?.({
        status: "ready",
        generation: "recovered",
        fromCursor: 0,
        toCursor: 0,
        data: "",
        processState: "running",
        terminalSize: null,
      }),
    );
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("uses an immediate feed snapshot instead of stale caller scrollback", async () => {
    const snapshot: RemoteTerminalWatchResultReady = {
      status: "ready",
      generation: "remote-pty",
      fromCursor: 0,
      toCursor: 7,
      data: "history",
      processState: "running",
      terminalSize: null,
    };
    const outputSource = (listener: TerminalFeedListener) => {
      expect(listener.onSnapshot).toBeTypeOf("function");
      listener.onSnapshot?.(snapshot);
      listener.onOutput("live suffix");
      return () => undefined;
    };
    render(
      <XTermSurface terminalId="test-1" outputSource={outputSource} initialScrollback="stale" />,
    );
    await flushFrame();
    expect(state.writeLog.map((entry) => entry.data)).toEqual(["", "history", "live suffix"]);
    expect(state.bridge.readTerminalScrollback).not.toHaveBeenCalled();
  });

  it("gates a remote snapshot's query replies and flushes subsequent live output after parsing", async () => {
    let listener: TerminalFeedListener | undefined;
    const outputSource = (next: TerminalFeedListener) => {
      listener = next;
      return () => undefined;
    };
    render(<XTermSurface terminalId="test-1" outputSource={outputSource} initialScrollback="" />);
    await flushFrame();
    expect(listener?.onSnapshot).toBeTypeOf("function");
    const data = "history\x1b[6n";
    act(() => {
      listener?.onSnapshot?.({
        status: "ready",
        generation: "remote-pty",
        fromCursor: 0,
        toCursor: data.length,
        data,
        processState: "running",
        terminalSize: null,
      });
      listener?.onOutput("new output");
    });
    await runWriteCallbacks(1);
    const onData = terminal().onData.mock.calls[0]![0] as unknown as (data: string) => void;
    const csiN = state.parserHandlers.find(
      (handler) => handler.kind === "csi" && (handler.id as { final?: string }).final === "n",
    );
    act(() => {
      expect(csiN?.callback([] as never)).toBe(false);
      onData("\x1b[1;1R");
    });
    expect(state.bridge.writeTerminal).not.toHaveBeenCalled();
    await flushFrame();
    expect(state.writeLog.map((entry) => entry.data)).toEqual(["", data, "new output"]);
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
