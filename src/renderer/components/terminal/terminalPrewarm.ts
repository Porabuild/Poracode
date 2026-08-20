import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";

/**
 * Font stack for every xterm surface. Owned here (rather than in XTermSurface)
 * so the prewarm does not drag the React surface module into its chunk.
 */
export const TERMINAL_FONT_FAMILY = "'Geist Mono', 'JetBrains Mono', 'Cascadia Code', monospace";

/** Matches XTermSurface's default `baseFontSize`; the warm-up renders at it. */
const PREWARM_FONT_SIZE = 12;

/** Representative glyphs so the WebGL char atlas builds common shapes early. */
const PREWARM_TEXT = [
  "Poracode terminal prewarm",
  "abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "0123456789 !\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~",
  "┌─┬─┐│ ││└─┴─┘ █▓▒░●○◆▄▀→←↑↓",
].join("\r\n");

let prewarmPromise: Promise<void> | null = null;

/**
 * Warms the terminal rendering stack before the first panel opens.
 *
 * The first `XTermSurface` mount otherwise pays terminal-font loading, WebGL
 * context creation and shader compilation while the panel animates in — a
 * visible hitch. Running one throwaway, hidden terminal during idle time
 * after launch (see `deferredFeatures`) moves that cost to startup, where it
 * is never seen. Best-effort: any failure resolves silently and the real
 * surface simply does the work itself, as before.
 */
export function prewarmTerminalSurface(): Promise<void> {
  prewarmPromise ??= runPrewarm().catch(() => undefined);
  return prewarmPromise;
}

async function runPrewarm(): Promise<void> {
  if (typeof document === "undefined") return;

  await loadTerminalFonts();

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  // Offscreen but still painted: `display: none` / `visibility: hidden` skip
  // rasterization, which is exactly what the WebGL warm-up needs to run.
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;width:320px;height:160px;opacity:0;pointer-events:none;z-index:-1;";
  document.body.appendChild(host);

  let terminal: Terminal | null = null;
  let webglAddon: WebglAddon | null = null;
  try {
    terminal = new Terminal({
      fontFamily: TERMINAL_FONT_FAMILY,
      fontSize: PREWARM_FONT_SIZE,
      letterSpacing: 0,
      lineHeight: 1,
      scrollback: 16,
    });
    terminal.open(host);
    try {
      webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => webglAddon?.dispose());
      terminal.loadAddon(webglAddon);
    } catch {
      webglAddon?.dispose();
      webglAddon = null;
    }
    terminal.write(PREWARM_TEXT);
    await nextFrame();
    await nextFrame();
  } finally {
    webglAddon?.dispose();
    terminal?.dispose();
    host.remove();
  }
}

function loadTerminalFonts(): Promise<unknown> {
  const fonts = typeof document !== "undefined" ? document.fonts : undefined;
  if (typeof fonts?.load !== "function") return Promise.resolve();
  return Promise.all([
    fonts.load(`${PREWARM_FONT_SIZE}px "Geist Mono"`),
    fonts.load(`700 ${PREWARM_FONT_SIZE}px "Geist Mono"`),
  ]).catch(() => undefined);
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
