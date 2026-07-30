import { describe, expect, it, vi } from "vitest";
import type { BrowserWindow, RenderProcessGoneDetails } from "electron";
import {
  classifyRendererProcessGone,
  type RendererProcessGoneIntent,
} from "@/main/diagnostics/processGone";
import {
  installRendererReloadGuard,
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
    },
  } as unknown as BrowserWindow;
  return { handlers, onceHandlers, reload, window };
}

const killed = { reason: "killed", exitCode: 9 } satisfies RenderProcessGoneDetails;

describe("renderer termination intent wiring", () => {
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
