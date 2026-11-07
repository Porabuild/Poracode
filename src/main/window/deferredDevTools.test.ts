import { EventEmitter } from "node:events";
import type { WebContents } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFERRED_DEVTOOLS_TIMEOUT_MS,
  notifyRendererStartupReady,
  openDevToolsAfterStartup,
} from "./deferredDevTools";

function createWebContents() {
  const emitter = new EventEmitter();
  const openDevTools = vi.fn<(options: { mode: string }) => void>();
  let destroyed = false;
  const webContents = Object.assign(emitter, {
    openDevTools,
    isDestroyed: () => destroyed,
    destroy: () => {
      destroyed = true;
      emitter.emit("destroyed");
    },
  });
  return { webContents, contents: webContents as unknown as WebContents, openDevTools };
}

describe("openDevToolsAfterStartup", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("waits for the renderer's ready signal and opens DevTools once", () => {
    const { webContents, contents, openDevTools } = createWebContents();
    openDevToolsAfterStartup(contents);

    webContents.emit("console-message", { level: "warning" });
    expect(openDevTools).not.toHaveBeenCalled();

    notifyRendererStartupReady(contents);
    expect(openDevTools).toHaveBeenCalledExactlyOnceWith({ mode: "detach" });

    notifyRendererStartupReady(contents);
    webContents.emit("console-message", { level: "error" });
    vi.advanceTimersByTime(DEFERRED_DEVTOOLS_TIMEOUT_MS);
    expect(openDevTools).toHaveBeenCalledOnce();
    expect(webContents.listenerCount("console-message")).toBe(0);
  });

  it.each([
    ["a console error", (w: EventEmitter) => w.emit("console-message", { level: "error" })],
    [
      "a failed main-frame load",
      (w: EventEmitter) => w.emit("did-fail-load", {}, -102, "", "", true),
    ],
    ["a gone renderer", (w: EventEmitter) => w.emit("render-process-gone", {}, {})],
    ["a preload error", (w: EventEmitter) => w.emit("preload-error", {}, "", new Error("x"))],
  ])("opens DevTools right away on %s", (_name, trigger) => {
    const { webContents, contents, openDevTools } = createWebContents();
    openDevToolsAfterStartup(contents);

    trigger(webContents);

    expect(openDevTools).toHaveBeenCalledOnce();
  });

  it("ignores aborted and subframe loads", () => {
    const { webContents, contents, openDevTools } = createWebContents();
    openDevToolsAfterStartup(contents);

    webContents.emit("did-fail-load", {}, -3, "", "", true);
    webContents.emit("did-fail-load", {}, -102, "", "", false);

    expect(openDevTools).not.toHaveBeenCalled();
  });

  it("opens DevTools when the renderer never reports ready", () => {
    const { contents, openDevTools } = createWebContents();
    openDevToolsAfterStartup(contents);

    vi.advanceTimersByTime(DEFERRED_DEVTOOLS_TIMEOUT_MS - 1);
    expect(openDevTools).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(openDevTools).toHaveBeenCalledOnce();
  });

  it("does nothing for a window destroyed before startup finished", () => {
    const { webContents, contents, openDevTools } = createWebContents();
    openDevToolsAfterStartup(contents);

    webContents.destroy();
    vi.advanceTimersByTime(DEFERRED_DEVTOOLS_TIMEOUT_MS);
    notifyRendererStartupReady(contents);

    expect(openDevTools).not.toHaveBeenCalled();
  });
});
