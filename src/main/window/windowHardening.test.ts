import { describe, expect, it, vi } from "vitest";
import type { BrowserWindow, RenderProcessGoneDetails, WebContents } from "electron";
import {
  classifyRendererProcessGone,
  type RendererProcessGoneIntent,
} from "@/main/diagnostics/processGone";
import {
  installRendererReloadGuard,
  installAppNavigationGuards,
  buildRendererAdditionalArguments,
  noteRendererWindowClose,
  requestTrackedRendererReload,
} from "./windowHardening";

type Handler = (...args: unknown[]) => void;

function createWindowHarness() {
  const handlers = new Map<string, Handler>();
  const onceHandlers = new Map<string, Handler>();
  const reload = vi.fn<() => void>();
  const window = {
    isDestroyed: vi.fn<() => boolean>(() => false),
    webContents: {
      on: vi.fn<(event: string, handler: Handler) => void>((event, handler) => {
        handlers.set(event, handler);
      }),
      once: vi.fn<(event: string, handler: Handler) => void>((event, handler) => {
        onceHandlers.set(event, handler);
      }),
      removeListener: vi.fn<(event: string, handler: Handler) => void>((event, handler) => {
        if (onceHandlers.get(event) === handler) onceHandlers.delete(event);
      }),
      reload,
      setWindowOpenHandler: vi.fn<() => void>(),
    },
  } as unknown as BrowserWindow;
  return { handlers, onceHandlers, reload, window };
}

const killed = { reason: "killed", exitCode: 9 } satisfies RenderProcessGoneDetails;

describe("inline visual frame navigation", () => {
  it("blocks subframe file, host, and network navigations while allowing srcdoc", () => {
    const { window, handlers } = createWindowHarness();
    installAppNavigationGuards(window, { isDev: true, devServerUrl: "http://localhost:3100" });
    for (const url of [
      "https://evil.test/",
      "http://localhost:3100/",
      "file:///private",
      "javascript:parent.poracode()",
      "data:text/html,hello",
    ]) {
      const preventDefault = vi.fn<() => void>();
      handlers.get("will-frame-navigate")!({ url, isMainFrame: false, preventDefault });
      expect(preventDefault).toHaveBeenCalledOnce();
    }
    for (const url of ["about:srcdoc", "about:blank"]) {
      const preventDefault = vi.fn<() => void>();
      handlers.get("will-frame-navigate")!({ url, isMainFrame: false, preventDefault });
      expect(preventDefault).not.toHaveBeenCalled();
    }
    const preventDefault = vi.fn<() => void>();
    handlers.get("will-frame-navigate")!({
      url: "http://localhost:3100/",
      isMainFrame: true,
      preventDefault,
    });
    expect(preventDefault).not.toHaveBeenCalled();
  });
});

describe("renderer termination intent wiring", () => {
  it("keeps renderer stream credentials out of process arguments", () => {
    const options = {
      appVersion: "1.0.0",
      isDev: false,
      windowKind: "main" as const,
      channel: "stable" as const,
      posthogEnableDev: false,
      posthogEnabled: false,
      posthogHost: "",
      posthogKey: "",
      sentryEnabled: false,
      rendererStream: { version: 2, url: "ws://127.0.0.1:1234/events", token: "secret" },
    };
    const args = buildRendererAdditionalArguments(options);

    expect(args.filter((arg) => arg.startsWith("--lc-backend"))).toEqual([]);
    expect(args.join(" ")).not.toContain("secret");
    expect(args.join(" ")).not.toContain("127.0.0.1:1234");
  });

  it("supplies reload once, then keeps an unproven killed event observable", () => {
    const harness = createWindowHarness();
    const treatments: Array<ReturnType<typeof classifyRendererProcessGone>> = [];
    installRendererReloadGuard(harness.window, {
      loadRenderer: vi.fn<() => void>(),
      onRendererProcessGone(details, intent) {
        treatments.push(classifyRendererProcessGone(details, "darwin", intent));
      },
    });

    expect(requestTrackedRendererReload(harness.window)).toBe(true);
    expect(harness.reload).toHaveBeenCalledOnce();
    harness.handlers.get("render-process-gone")?.({}, killed);
    harness.handlers.get("render-process-gone")?.({}, killed);

    expect(treatments).toEqual([
      null,
      {
        bucket: "unexpected-kill",
        fingerprint: ["poracode-renderer-process-gone", "darwin", "unexpected-kill"],
      },
    ]);
  });

  it("clears reload intent after a successful lifecycle transition", () => {
    const harness = createWindowHarness();
    const onRendererProcessGone =
      vi.fn<
        (details: RenderProcessGoneDetails, intent: RendererProcessGoneIntent | undefined) => void
      >();
    installRendererReloadGuard(harness.window, {
      loadRenderer: vi.fn<() => void>(),
      onRendererProcessGone,
    });

    requestTrackedRendererReload(harness.window);
    harness.onceHandlers.get("did-finish-load")?.();
    harness.handlers.get("render-process-gone")?.({}, killed);

    expect(onRendererProcessGone).toHaveBeenCalledWith(killed, undefined);
  });

  it("does not turn a prevented close-to-tray event into window-close intent", () => {
    const harness = createWindowHarness();
    const onRendererProcessGone =
      vi.fn<
        (details: RenderProcessGoneDetails, intent: RendererProcessGoneIntent | undefined) => void
      >();
    installRendererReloadGuard(harness.window, {
      loadRenderer: vi.fn<() => void>(),
      onRendererProcessGone,
    });

    noteRendererWindowClose(harness.window, { defaultPrevented: true } as Electron.Event);
    harness.handlers.get("render-process-gone")?.({}, killed);
    noteRendererWindowClose(harness.window, { defaultPrevented: false } as Electron.Event);
    harness.handlers.get("render-process-gone")?.({}, killed);

    expect(onRendererProcessGone.mock.calls).toEqual([
      [killed, undefined],
      [killed, "window-close"],
    ]);
  });
});

describe("device preview window admission", () => {
  function guard(allowDevicePreviewWindow = false) {
    const setWindowOpenHandler =
      vi.fn<(handler: Parameters<WebContents["setWindowOpenHandler"]>[0]) => void>();
    const handlers = new Map<string, Handler>();
    const window = {
      webContents: {
        setWindowOpenHandler,
        on: (event: string, handler: Handler) => handlers.set(event, handler),
      },
    } as unknown as BrowserWindow;
    installAppNavigationGuards(window, { isDev: false, allowDevicePreviewWindow });
    return { open: setWindowOpenHandler.mock.calls[0]![0], handlers };
  }
  function request(url: string, frameName = "poracode-device-preview-v1") {
    return {
      url,
      frameName,
      features: "",
      disposition: "new-window",
      referrer: { url: "", policy: "default" },
    } as Parameters<Parameters<WebContents["setWindowOpenHandler"]>[0]>[0];
  }
  it("denies the preview in secondary windows and admits only the exact local v1 target in the main window", () => {
    const url = "about:blank#poracode-device-preview-v1";
    expect(guard().open(request(url))).toEqual({ action: "deny" });
    const { open } = guard(true);
    expect(open(request(url))).toMatchObject({
      action: "allow",
      outlivesOpener: false,
      overrideBrowserWindowOptions: { minWidth: 320, frame: true },
    });
    for (const refused of [
      "about:blank",
      "about:blank#poracode-device-preview-v2",
      "https://example.com",
      `${url}?thread=secret`,
    ])
      expect(open(request(refused))).toEqual({ action: "deny" });
    expect(open(request(url, "other"))).toEqual({ action: "deny" });
  });
  it("blocks child navigation, nested windows and webview attachment", () => {
    const { handlers } = guard(true);
    const childHandlers = new Map<string, Handler>();
    const setWindowOpenHandler =
      vi.fn<(handler: Parameters<WebContents["setWindowOpenHandler"]>[0]) => void>();
    handlers.get("did-create-window")?.(
      {
        webContents: {
          setWindowOpenHandler,
          on: (event: string, handler: Handler) => childHandlers.set(event, handler),
        },
      },
      request("about:blank#poracode-device-preview-v1"),
    );
    expect(setWindowOpenHandler.mock.calls[0]![0](request("https://example.com"))).toEqual({
      action: "deny",
    });
    for (const event of ["will-navigate", "will-redirect", "will-attach-webview"]) {
      const preventDefault = vi.fn<() => void>();
      childHandlers.get(event)?.({ preventDefault }, "https://example.com");
      expect(preventDefault).toHaveBeenCalledOnce();
    }
  });
});
