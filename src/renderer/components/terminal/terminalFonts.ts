import type { Terminal } from "@xterm/xterm";
import { sharedSettingsSchema } from "@/shared/settings";

export const TERMINAL_FONT_FAMILY = "'Geist Mono', 'JetBrains Mono', 'Cascadia Code', monospace";

/** A family is one CSS string, even if its name contains quotes or commas. */
export function quoteFontFamily(family: string): string {
  // eslint-disable-next-line no-control-regex -- CSS strings must escape quotes, backslashes and control characters
  return `"${family.replace(/[\\"\u0000-\u001f\u007f]/g, (char) => `\\${char.codePointAt(0)!.toString(16)} `)}"`;
}

export function resolveTerminalFontFamily(family: string): string {
  return family ? `${quoteFontFamily(family)}, ${TERMINAL_FONT_FAMILY}` : TERMINAL_FONT_FAMILY;
}

/** Load normal and bold before xterm measures glyphs; missing fonts fall through the stack. */
export async function loadTerminalFonts(family: string, size: number): Promise<void> {
  const fonts = typeof document !== "undefined" ? document.fonts : undefined;
  if (typeof fonts?.load !== "function") return;
  const names = family ? [family, "Geist Mono"] : ["Geist Mono"];
  await Promise.allSettled(
    names.flatMap((name) => [
      Promise.resolve().then(() => fonts.load(`${size}px ${quoteFontFamily(name)}`)),
      Promise.resolve().then(() => fonts.load(`700 ${size}px ${quoteFontFamily(name)}`)),
    ]),
  );
}

export function applyTerminalFont(terminal: Terminal, family: string): void {
  const stack = resolveTerminalFontFamily(family);
  // xterm ignores an unchanged option. On cached/startup surfaces the font may
  // have loaded since the last measurement; use public setters to remeasure.
  if (terminal.options.fontFamily === stack) terminal.options.fontFamily = "monospace";
  terminal.options.fontFamily = stack;
}

type LocalFontWindow = Window & {
  queryLocalFonts?: () => Promise<Array<{ family: string }>>;
};

export function supportsInstalledFonts(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as LocalFontWindow).queryLocalFonts === "function"
  );
}

export async function listInstalledFontFamilies(): Promise<string[]> {
  const query = (window as LocalFontWindow).queryLocalFonts;
  if (!query) return [];
  const fonts = await query.call(window);
  return [
    ...new Set(
      fonts
        .map((font) => font.family)
        .filter(
          (name) =>
            name.length > 0 &&
            sharedSettingsSchema.shape.terminalFontFamily.safeParse(name).success,
        ),
    ),
  ].sort((a, b) => a.localeCompare(b));
}
