import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyTerminalFont,
  ensureCanvasFontWhitespaceSupport,
  listInstalledFontFamilies,
  loadTerminalFonts,
  quoteFontFamily,
  resetCanvasFontWhitespaceCheckForTests,
  resolveTerminalFontFamily,
  supportsInstalledFonts,
  TERMINAL_FONT_FAMILY,
} from "./terminalFonts";
import type { Terminal } from "@xterm/xterm";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetCanvasFontWhitespaceCheckForTests();
  Reflect.deleteProperty(window, "queryLocalFonts");
  Reflect.deleteProperty(document, "fonts");
});

describe("terminal fonts", () => {
  it("quotes a single CSS family and always retains the readable fallback", () => {
    expect(resolveTerminalFontFamily("")).toBe(TERMINAL_FONT_FAMILY);
    expect(resolveTerminalFontFamily("Missing font")).toBe(
      `"Missing font", ${TERMINAL_FONT_FAMILY}`,
    );
    expect(quoteFontFamily('A"\\, B\n')).toBe('"A\\22 \\5c , B\\a "');
    const element = document.createElement("span");
    element.style.fontFamily = resolveTerminalFontFamily('A", serif, "B');
    expect(element.style.fontFamily).toContain("Geist Mono");
  });

  it("sorts and deduplicates installed families, preserving names with spaces and punctuation", async () => {
    Object.defineProperty(window, "queryLocalFonts", {
      configurable: true,
      value: vi.fn<() => Promise<Array<{ family: string }>>>(async () => [
        { family: "Zulu Mono" },
        { family: "Alpha" },
        { family: "Alpha" },
        { family: 'A"font' },
        { family: "" },
        { family: "bad\nname" },
        { family: "x".repeat(257) },
      ]),
    });
    expect(supportsInstalledFonts()).toBe(true);
    expect(await listInstalledFontFamilies()).toEqual(['A"font', "Alpha", "Zulu Mono"]);
  });

  it("handles unsupported and denied enumeration", async () => {
    expect(supportsInstalledFonts()).toBe(false);
    expect(await listInstalledFontFamilies()).toEqual([]);
    Object.defineProperty(window, "queryLocalFonts", {
      configurable: true,
      value: () => Promise.reject(new Error("denied")),
    });
    await expect(listInstalledFontFamilies()).rejects.toThrow("denied");
  });

  it("loads selected and fallback normal/bold fonts and tolerates synchronous and async load failures", async () => {
    const load = vi.fn<(font: string) => Promise<FontFace[]>>().mockResolvedValue([]);
    Object.defineProperty(document, "fonts", { configurable: true, value: { load } });
    await loadTerminalFonts("My Mono", 14);
    expect(load.mock.calls.map(([font]) => font)).toEqual([
      '14px "My Mono"',
      '700 14px "My Mono"',
      '14px "Geist Mono"',
      '700 14px "Geist Mono"',
    ]);
    load.mockImplementation(() => {
      throw new Error("unsupported");
    });
    await expect(loadTerminalFonts("Missing", 12)).resolves.toBeUndefined();
    load.mockRejectedValue(new Error("unavailable"));
    await expect(loadTerminalFonts("", 12)).resolves.toBeUndefined();
  });

  it("remeasures an unchanged family using public setters without touching the PTY", () => {
    const writes: string[] = [];
    const options = {
      get fontFamily() {
        return TERMINAL_FONT_FAMILY;
      },
      set fontFamily(value: string) {
        writes.push(value);
      },
    };
    applyTerminalFont({ options } as Terminal, "");
    expect(writes).toEqual(["monospace", TERMINAL_FONT_FAMILY]);
  });

  it("leaves canvas font setters untouched when leading whitespace is already accepted", () => {
    class HealthyCanvasContext {
      #font = "10px sans-serif";
      get font(): string {
        return this.#font;
      }
      set font(value: string) {
        this.#font = value.trim();
      }
    }
    const originalSet = Object.getOwnPropertyDescriptor(
      HealthyCanvasContext.prototype,
      "font",
    )?.set;
    vi.stubGlobal("CanvasRenderingContext2D", HealthyCanvasContext);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => new HealthyCanvasContext() as unknown as CanvasRenderingContext2D,
    );

    ensureCanvasFontWhitespaceSupport();

    expect(Object.getOwnPropertyDescriptor(HealthyCanvasContext.prototype, "font")?.set).toBe(
      originalSet,
    );
  });

  it("trims leading whitespace on canvas font setters when the runtime rejects it", () => {
    const createStrictContextClass = () =>
      class StrictCanvasContext {
        #font = "10px sans-serif";
        get font(): string {
          return this.#font;
        }
        set font(value: string) {
          if (/^\s/.test(value)) return;
          this.#font = value;
        }
      };
    const StrictCanvasContext = createStrictContextClass();
    const StrictOffscreenContext = createStrictContextClass();
    vi.stubGlobal("CanvasRenderingContext2D", StrictCanvasContext);
    vi.stubGlobal("OffscreenCanvasRenderingContext2D", StrictOffscreenContext);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => new StrictCanvasContext() as unknown as CanvasRenderingContext2D,
    );

    ensureCanvasFontWhitespaceSupport();
    const wrappedSet = Object.getOwnPropertyDescriptor(StrictCanvasContext.prototype, "font")?.set;
    ensureCanvasFontWhitespaceSupport();
    expect(Object.getOwnPropertyDescriptor(StrictCanvasContext.prototype, "font")?.set).toBe(
      wrappedSet,
    );

    const ctx = new StrictCanvasContext();
    ctx.font = " normal 24px 'Geist Mono', monospace";
    expect(ctx.font).toBe("normal 24px 'Geist Mono', monospace");
    ctx.font = "italic bold 24px 'Geist Mono', monospace";
    expect(ctx.font).toBe("italic bold 24px 'Geist Mono', monospace");

    const offscreen = new StrictOffscreenContext();
    offscreen.font = " bold 24px monospace";
    expect(offscreen.font).toBe("bold 24px monospace");
  });
});
