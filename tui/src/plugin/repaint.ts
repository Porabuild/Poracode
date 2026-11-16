import type { Plugin } from "@opencode/plugin/tui";

const CLEAR_SCREEN = new TextEncoder().encode("\x1b[2J");

/**
 * After every resize, writes ED (`\x1b[2J`) through the renderer's own
 * ordered output channel, then forces a full repaint. Verified mechanism in
 * Terminal.app: it keeps a line's cells beyond the shrunken width and draws
 * them into the right margin, which no in-grid repaint can reach — only the
 * clear-screen escape removes them (repro: fill the alt screen at 188 cols,
 * narrow to 88, "XX" remnants at the right edge until `ESC[2J`).
 * `nativeSession` and `forceFullRepaintRequested` are private upstream; the
 * narrow cast keeps the access honest, and the test asserts both exist so an
 * OpenTUI upgrade that renames them fails loudly instead of silently
 * regressing. `NativeSession.write` returns false on backpressure — ignored;
 * the forced repaint still runs.
 */
export function registerRepaint(context: Plugin.Context) {
  const renderer = context.renderer as unknown as
    | {
        on(event: "resize", listener: () => void): void;
        off(event: "resize", listener: () => void): void;
        requestRender(): void;
        forceFullRepaintRequested: boolean;
        nativeSession?: { write(bytes: Uint8Array): boolean };
      }
    | undefined;
  // Test doubles may omit the renderer.
  if (!renderer?.on) return () => {};
  const onResize = () => {
    renderer.nativeSession?.write(CLEAR_SCREEN);
    renderer.forceFullRepaintRequested = true;
    renderer.requestRender();
  };
  renderer.on("resize", onResize);
  return () => renderer.off("resize", onResize);
}
