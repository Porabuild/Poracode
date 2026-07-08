import { afterEach, describe, expect, it, vi } from "vitest";
import type { RemoteWebSocketClientMessage } from "@/shared/remote";
import {
  pauseBrowserWatch,
  resetBrowserMirror,
  resumeBrowserWatch,
  setBrowserSocketSender,
  startBrowserWatch,
  useBrowserMirrorStore,
} from "./browserMirror";

function makeSender() {
  const messages: RemoteWebSocketClientMessage[] = [];
  const fn = vi.fn<(message: RemoteWebSocketClientMessage) => boolean>((message) => {
    messages.push(message);
    return true;
  });
  return { fn, messages };
}

describe("browserMirror watch lifecycle", () => {
  afterEach(() => {
    resetBrowserMirror();
    setBrowserSocketSender(null);
  });

  it("does not resume a paused watch when the socket reconnects", () => {
    const a = makeSender();
    setBrowserSocketSender(a.fn);
    startBrowserWatch();
    expect(a.messages).toEqual([{ type: "browser-watch" }]);

    // Background the view: pause frames but keep the watching intent.
    pauseBrowserWatch();
    expect(a.messages).toContainEqual({ type: "browser-unwatch" });
    expect(useBrowserMirrorStore.getState().paused).toBe(true);

    // Socket drops and reconnects while still paused → a fresh sender lands.
    const b = makeSender();
    setBrowserSocketSender(b.fn);
    // It must NOT resume streaming to the hidden view.
    expect(b.fn).not.toHaveBeenCalled();

    // Foregrounding resumes streaming on the current sender.
    resumeBrowserWatch();
    expect(b.messages).toEqual([{ type: "browser-watch" }]);
  });

  it("resubscribes an active (non-paused) watch on reconnect", () => {
    const a = makeSender();
    setBrowserSocketSender(a.fn);
    startBrowserWatch();

    const b = makeSender();
    setBrowserSocketSender(b.fn);
    expect(b.messages).toEqual([{ type: "browser-watch" }]);
  });
});
