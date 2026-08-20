import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface MockTerminal {
  options: Record<string, unknown>;
  open: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  loadAddon: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}

interface MockWebglAddon {
  onContextLoss: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}

const { state } = vi.hoisted(() => ({
  state: {
    terminals: [] as MockTerminal[],
    webglAddons: [] as MockWebglAddon[],
    webglShouldThrow: false,
    lastOpenHostConnected: null as boolean | null,
    terminalsWhenFontsLoaded: -1,
  },
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: class MockTerminal {
    open = vi.fn<(element: Element) => void>((element) => {
      state.lastOpenHostConnected = element.isConnected;
    });
    write = vi.fn<(data: string) => void>();
    loadAddon = vi.fn<(addon: unknown) => void>();
    dispose = vi.fn<() => void>();
    constructor(public options: Record<string, unknown>) {
      state.terminals.push(this as unknown as MockTerminal);
    }
  },
}));

vi.mock("@xterm/addon-webgl", () => ({
  WebglAddon: class MockWebglAddon {
    onContextLoss = vi.fn<() => { dispose: () => void }>(() => ({
      dispose: vi.fn<() => void>(),
    }));
    dispose = vi.fn<() => void>();
    constructor() {
      if (state.webglShouldThrow) {
        throw new Error("WebGL unavailable");
      }
      state.webglAddons.push(this as unknown as MockWebglAddon);
    }
  },
}));

/** Fresh module per test — the warm-up is a module-level one-shot. */
async function loadPrewarm() {
  vi.resetModules();
  return import("./terminalPrewarm");
}

describe("terminalPrewarm", () => {
  beforeEach(() => {
    state.terminals = [];
    state.webglAddons = [];
    state.webglShouldThrow = false;
    state.lastOpenHostConnected = null;
    state.terminalsWhenFontsLoaded = -1;
  });

  afterEach(() => {
    // Drop the font stub (if installed) and any leftover warm-up host.
    Reflect.deleteProperty(document, "fonts");
    document.body.innerHTML = "";
  });

  it("warms a hidden terminal with the WebGL renderer, then tears it down", async () => {
    const { prewarmTerminalSurface, TERMINAL_FONT_FAMILY } = await loadPrewarm();

    await prewarmTerminalSurface();

    expect(state.terminals).toHaveLength(1);
    const terminal = state.terminals[0]!;
    expect(terminal.options.fontFamily).toBe(TERMINAL_FONT_FAMILY);
    expect(terminal.open).toHaveBeenCalledTimes(1);
    // The host is attached while warming (so the renderer actually runs) and
    // removed once the warm-up finishes.
    expect(state.lastOpenHostConnected).toBe(true);
    const host = terminal.open.mock.calls[0]?.[0] as Element;
    expect(host.isConnected).toBe(false);
    expect(terminal.write).toHaveBeenCalledTimes(1);
    expect(state.webglAddons).toHaveLength(1);
    expect(terminal.loadAddon).toHaveBeenCalledWith(state.webglAddons[0]);
    expect(state.webglAddons[0]!.dispose).toHaveBeenCalled();
    expect(terminal.dispose).toHaveBeenCalled();
  });

  it("runs only once across repeated calls", async () => {
    const { prewarmTerminalSurface } = await loadPrewarm();

    await prewarmTerminalSurface();
    await prewarmTerminalSurface();

    expect(state.terminals).toHaveLength(1);
  });

  it("still resolves when the WebGL addon is unavailable", async () => {
    state.webglShouldThrow = true;
    const { prewarmTerminalSurface } = await loadPrewarm();

    await expect(prewarmTerminalSurface()).resolves.toBeUndefined();

    const terminal = state.terminals[0]!;
    expect(terminal.loadAddon).not.toHaveBeenCalled();
    expect(terminal.dispose).toHaveBeenCalled();
  });

  it("loads the bundled terminal font before opening the warm-up surface", async () => {
    const load = vi.fn<() => Promise<never[]>>().mockImplementation(() => {
      state.terminalsWhenFontsLoaded = state.terminals.length;
      return Promise.resolve([]);
    });
    Object.defineProperty(document, "fonts", { value: { load }, configurable: true });

    const { prewarmTerminalSurface } = await loadPrewarm();
    await prewarmTerminalSurface();

    expect(load).toHaveBeenCalledWith('12px "Geist Mono"');
    expect(load).toHaveBeenCalledWith('700 12px "Geist Mono"');
    // Fonts load before any terminal exists.
    expect(state.terminalsWhenFontsLoaded).toBe(0);
  });
});
