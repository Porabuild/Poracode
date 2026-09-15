// Focused regression for the shared quick-composer device lifecycle used by
// managed and standalone attach: pending submit flush (no loss while main is
// loading/closed, no duplicates), graceful dismiss with main reveal,
// toggle create/show/dismiss, file-picker focus, and quit teardown. Effects
// are observed through the injected host, never through Electron.
import type { BrowserWindow } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuickComposerSubmission } from "@/shared/ipc";
import { QuickComposerLifecycle, type QuickComposerLifecycleHost } from "./quickComposerLifecycle";

interface FakeWindow {
  destroyed: boolean;
  visible: boolean;
  asBrowserWindow(): BrowserWindow;
}

function fakeWindow(): FakeWindow {
  const state = { destroyed: false, visible: false };
  return {
    get destroyed() {
      return state.destroyed;
    },
    set destroyed(value: boolean) {
      state.destroyed = value;
    },
    get visible() {
      return state.visible;
    },
    set visible(value: boolean) {
      state.visible = value;
    },
    asBrowserWindow() {
      return {
        isDestroyed: () => state.destroyed,
        isVisible: () => state.visible,
      } as unknown as BrowserWindow;
    },
  };
}

function submission(): QuickComposerSubmission {
  return {
    projectId: "project-1",
    input: { agentKind: "codex", config: { model: "gpt-5" }, prompt: "hi" },
  } as unknown as QuickComposerSubmission;
}

interface Harness {
  lifecycle: QuickComposerLifecycle;
  host: QuickComposerLifecycleHost & {
    delivered: { window: BrowserWindow; submission: QuickComposerSubmission }[];
    shown: BrowserWindow[];
    revealed: BrowserWindow[];
    dismissRequested: BrowserWindow[];
    hidden: BrowserWindow[];
    createdOverlays: BrowserWindow[];
  };
  main: FakeWindow;
  overlay: FakeWindow;
  mainMissing: { current: boolean };
}

function harness(): Harness {
  const main = fakeWindow();
  const overlay = fakeWindow();
  const mainMissing = { current: false };
  const createdOverlays: BrowserWindow[] = [];
  const host = {
    delivered: [] as { window: BrowserWindow; submission: QuickComposerSubmission }[],
    shown: [] as BrowserWindow[],
    revealed: [] as BrowserWindow[],
    dismissRequested: [] as BrowserWindow[],
    hidden: [] as BrowserWindow[],
    createdOverlays,
    getMainWindow: () => (mainMissing.current ? null : main.asBrowserWindow()),
    getOverlay: () => overlay.asBrowserWindow(),
    setOverlay: (window: BrowserWindow | null) => {
      if (window) createdOverlays.push(window);
    },
    createOverlay: () => overlay.asBrowserWindow(),
    ensureMainWindow: () => {
      mainMissing.current = false;
      return main.asBrowserWindow();
    },
    showOverlay: (window: BrowserWindow) => {
      host.shown.push(window);
    },
    revealMainWindow: (window: BrowserWindow) => {
      host.revealed.push(window);
    },
    deliverSubmission: (window: BrowserWindow, next: QuickComposerSubmission) => {
      host.delivered.push({ window, submission: next });
    },
    requestOverlayDismiss: (window: BrowserWindow) => {
      host.dismissRequested.push(window);
    },
    hideOverlay: (window: BrowserWindow) => {
      host.hidden.push(window);
    },
    pickFiles: async () => ["picked.ts"],
  };
  return { lifecycle: new QuickComposerLifecycle(host), host, main, overlay, mainMissing };
}

describe("quick composer lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("queues a submit while main is missing and delivers once on ready", () => {
    const { lifecycle, host, overlay, mainMissing } = harness();
    mainMissing.current = true;
    lifecycle.handleSubmit(overlay.asBrowserWindow(), submission());
    expect(host.delivered).toEqual([]);
    expect(lifecycle.pendingCount()).toBe(1);
    lifecycle.handleMainReady();
    expect(host.delivered).toHaveLength(1);
    expect(host.delivered[0]?.submission).toMatchObject({ projectId: "project-1" });
    expect(lifecycle.pendingCount()).toBe(0);
  });

  it("holds a submit until the ready ping and never duplicates it", () => {
    const { lifecycle, host, overlay } = harness();
    lifecycle.handleSubmit(overlay.asBrowserWindow(), submission());
    expect(host.delivered).toEqual([]);
    lifecycle.handleMainReady();
    expect(host.delivered).toHaveLength(1);
    lifecycle.handleMainReady();
    expect(host.delivered).toHaveLength(1);
  });

  it("dismisses gracefully after submit and reveals the recreated main", async () => {
    const { lifecycle, host, overlay } = harness();
    lifecycle.handleSubmit(overlay.asBrowserWindow(), submission());
    lifecycle.handleMainReady();
    // Graceful round-trip first: the overlay is asked to dismiss itself.
    expect(host.dismissRequested).toEqual([]);
    expect(host.hidden).toEqual([]);
    await vi.advanceTimersByTimeAsync(800);
    expect(host.dismissRequested).toEqual([]);
    expect(host.hidden).toHaveLength(1);
    expect(host.revealed).toHaveLength(1);
  });

  it("requests a graceful dismiss on toggle of a visible overlay", async () => {
    const { lifecycle, host, overlay } = harness();
    overlay.visible = true;
    lifecycle.toggle();
    expect(host.dismissRequested).toHaveLength(1);
    expect(host.hidden).toEqual([]);
    await vi.advanceTimersByTimeAsync(240);
    expect(host.hidden).toHaveLength(1);
    // No submit happened, so main is not revealed.
    expect(host.revealed).toEqual([]);
  });

  it("shows a hidden overlay on toggle and creates one when absent", () => {
    const { lifecycle, host, overlay } = harness();
    overlay.visible = false;
    lifecycle.toggle();
    expect(host.shown).toHaveLength(1);
    overlay.destroyed = true;
    lifecycle.toggle();
    expect(host.createdOverlays).toHaveLength(1);
  });

  it("suppresses blur-dismiss while the picker is open and refocuses after", async () => {
    const { lifecycle, host, overlay } = harness();
    let openDuringPick = false;
    host.pickFiles = async () => {
      openDuringPick = lifecycle.isDialogOpen();
      return ["picked.ts"];
    };
    overlay.visible = true;
    await expect(lifecycle.handlePickFiles(overlay.asBrowserWindow())).resolves.toEqual([
      "picked.ts",
    ]);
    expect(openDuringPick).toBe(true);
    expect(lifecycle.isDialogOpen()).toBe(false);
    expect(host.shown).toHaveLength(1);
  });

  it("does not reshow a hidden overlay after picking", async () => {
    const { lifecycle, host, overlay } = harness();
    overlay.visible = false;
    await expect(lifecycle.handlePickFiles(overlay.asBrowserWindow())).resolves.toEqual([
      "picked.ts",
    ]);
    expect(host.shown).toEqual([]);
  });

  it("drops pending work on dispose without delivering", () => {
    const { lifecycle, host, overlay, mainMissing } = harness();
    mainMissing.current = true;
    lifecycle.handleSubmit(overlay.asBrowserWindow(), submission());
    lifecycle.dispose();
    lifecycle.handleMainReady();
    expect(host.delivered).toEqual([]);
    expect(lifecycle.pendingCount()).toBe(0);
  });
});
