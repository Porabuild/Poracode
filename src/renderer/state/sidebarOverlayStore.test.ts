import type { ElectronHostBridge } from "@/shared/clientRuntime";
import { afterEach, describe, expect, it, vi } from "vitest";

const PERSIST_KEY = "poracode-sidebar-overlay";

describe("sidebarOverlayStore persistence", () => {
  afterEach(() => {
    delete window.poracodeHost;
    localStorage.clear();
    vi.resetModules();
  });

  it("invalidates the ambiguous pre-v2 collapsed value in browser clients", async () => {
    localStorage.setItem(PERSIST_KEY, JSON.stringify({ isCollapsed: true }));

    const { useSidebarOverlayStore } = await import("./sidebarOverlayStore");

    expect(useSidebarOverlayStore.getState()).toMatchObject({
      isCollapsed: false,
      userCollapsed: false,
    });
    expect(JSON.parse(localStorage.getItem(PERSIST_KEY) ?? "null")).toEqual({
      version: 2,
      isCollapsed: false,
    });
  });

  it("preserves the pre-v2 desktop preference in Electron", async () => {
    window.poracodeHost = {} as ElectronHostBridge;
    localStorage.setItem(PERSIST_KEY, JSON.stringify({ isCollapsed: true }));

    const { useSidebarOverlayStore } = await import("./sidebarOverlayStore");

    expect(useSidebarOverlayStore.getState()).toMatchObject({
      isCollapsed: true,
      userCollapsed: true,
    });
    expect(JSON.parse(localStorage.getItem(PERSIST_KEY) ?? "null")).toEqual({
      version: 2,
      isCollapsed: true,
    });
  });

  it("does not persist responsive auto-collapse as the user preference", async () => {
    localStorage.setItem(PERSIST_KEY, JSON.stringify({ version: 2, isCollapsed: false }));
    const { useSidebarOverlayStore } = await import("./sidebarOverlayStore");

    useSidebarOverlayStore.getState().setAutoCollapsed(true);

    expect(useSidebarOverlayStore.getState()).toMatchObject({
      isCollapsed: true,
      userCollapsed: false,
      isAutoCollapsed: true,
    });
    expect(JSON.parse(localStorage.getItem(PERSIST_KEY) ?? "null")).toEqual({
      version: 2,
      isCollapsed: false,
    });

    useSidebarOverlayStore.getState().setAutoCollapsed(false);
    expect(useSidebarOverlayStore.getState()).toMatchObject({
      isCollapsed: false,
      userCollapsed: false,
      isAutoCollapsed: false,
    });
  });
});
