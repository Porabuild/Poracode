import { app, BrowserWindow, webContents, type WebContents } from "electron";
import { keepWindowsHiddenForQuit } from "./showAndFocusWindow";

/**
 * Overrule renderer `beforeunload` vetoes for the rest of this quit. A veto can
 * only raise a confirm dialog for an exit that is already committed: the
 * backend its handler wants to flush to has retired by the time windows close,
 * so the flush cannot succeed, and cancelling would leave the app running
 * without that backend — hidden, with nothing left to quit from.
 */
function releaseUnloadVeto(source: WebContents): void {
  source.on("will-prevent-unload", (event) => event.preventDefault());
}

/**
 * Take the UI off screen the moment a quit starts, and keep it there. The
 * shutdown joins that follow retire agents and close the database, which can
 * take seconds when a child is slow; a window that stays in front of the user
 * until they finish reads as a frozen app, and so does one that reappears.
 */
export function concealAppUiForQuit(): void {
  // First, so nothing reacts to its own hiding by showing a window again.
  keepWindowsHiddenForQuit();
  if (process.platform === "darwin") {
    // One call takes every window away and hands focus back to the app the
    // user came from, which is what leaving an app looks like. Hiding windows
    // one by one would leave this app active behind an empty menu bar.
    app.hide();
  } else {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && window.isVisible()) window.hide();
    }
  }
  // A window still loading joins the quit with its veto overruled as well.
  app.on("web-contents-created", (_event, source) => releaseUnloadVeto(source));
  for (const source of webContents.getAllWebContents()) releaseUnloadVeto(source);
}
