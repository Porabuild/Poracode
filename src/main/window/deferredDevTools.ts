import type { WebContents } from "electron";

/** Opens DevTools anyway when the renderer has not reported ready by then. */
export const DEFERRED_DEVTOOLS_TIMEOUT_MS = 15_000;

const pendingOpens = new WeakMap<WebContents, () => void>();

/**
 * Open detached DevTools for a dev main window once its renderer has started.
 *
 * DevTools attached during the first load makes the renderer report every
 * parsed module to the inspector and fetch each source map; with about two
 * thousand unbundled Vite modules that roughly doubled the time to the first
 * React render. Opening after the renderer's ready signal keeps that cost off
 * startup. Any sign of a broken boot (a console error, a failed or crashed
 * load, or no ready signal before the timeout) opens it immediately, so a
 * failing startup is still debuggable.
 */
export function openDevToolsAfterStartup(
  webContents: WebContents,
  timeoutMs = DEFERRED_DEVTOOLS_TIMEOUT_MS,
): void {
  const onConsoleMessage = (details: { level: string }) => {
    if (details.level === "error") open();
  };
  const onFailLoad = (
    _event: unknown,
    errorCode: number,
    _description: string,
    _url: string,
    isMainFrame: boolean,
  ) => {
    // -3 is ERR_ABORTED: a reload or navigation replaced the load.
    if (isMainFrame && errorCode !== -3) open();
  };
  const timer = setTimeout(() => open(), timeoutMs);
  function open(): void {
    if (pendingOpens.get(webContents) !== open) return;
    pendingOpens.delete(webContents);
    clearTimeout(timer);
    webContents.off("console-message", onConsoleMessage);
    webContents.off("did-fail-load", onFailLoad);
    webContents.off("render-process-gone", open);
    webContents.off("preload-error", open);
    if (!webContents.isDestroyed()) webContents.openDevTools({ mode: "detach" });
  }
  pendingOpens.set(webContents, open);
  webContents.on("console-message", onConsoleMessage);
  webContents.on("did-fail-load", onFailLoad);
  webContents.on("render-process-gone", open);
  webContents.on("preload-error", open);
  webContents.once("destroyed", () => {
    clearTimeout(timer);
    pendingOpens.delete(webContents);
  });
}

/** The main renderer finished its first load; open any DevTools deferred for it. */
export function notifyRendererStartupReady(webContents: WebContents): void {
  pendingOpens.get(webContents)?.();
}
