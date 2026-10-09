import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyTerminalFont,
  listInstalledFontFamilies,
  loadTerminalFonts,
  quoteFontFamily,
  resolveTerminalFontFamily,
  supportsInstalledFonts,
  TERMINAL_FONT_FAMILY,
} from "./terminalFonts";
import type { Terminal } from "@xterm/xterm";

afterEach(() => {
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
});
