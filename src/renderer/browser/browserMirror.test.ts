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

  it("drops a stale frame when the authoritative state removes its tab", () => {
    useBrowserMirrorStore.getState().setFrame({
      tabId: "tab-1",
      dataUrl: "data:image/jpeg;base64,frame",
      metadata: {} as never,
    });

    useBrowserMirrorStore.getState().setState({ tabs: [], activeTabId: null });

    expect(useBrowserMirrorStore.getState().frame).toBeNull();
  });

  it("does not notify mirror subscribers when the active frame is unchanged", () => {
    useBrowserMirrorStore.getState().setFrame({
      tabId: "tab-1",
      dataUrl: "data:image/jpeg;base64,frame",
      metadata: {} as never,
    });
    const listener = vi.fn<() => void>();
    const unsubscribe = useBrowserMirrorStore.subscribe(listener);

    useBrowserMirrorStore.getState().setState({
      tabs: [
        {
          tabId: "tab-1",
          title: "Tab",
          url: "https://example.com",
          loading: false,
          canGoBack: false,
          canGoForward: false,
        },
      ],
      activeTabId: "tab-1",
    });

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});
