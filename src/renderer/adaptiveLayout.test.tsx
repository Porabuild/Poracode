import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ElectronHostBridge } from "@/shared/clientRuntime";
import {
  initializeAdaptiveLayout,
  resetAdaptiveLayoutForTest,
  useCompactLayout,
} from "./adaptiveLayout";

function installMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      media: query,
      get matches() {
        return matches;
      },
      onchange: null,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => true,
    })),
  );
  return (next: boolean, notify = true) => {
    matches = next;
    if (!notify) return;
    const event = { matches: next } as MediaQueryListEvent;
    for (const listener of listeners) listener(event);
  };
}

afterEach(() => {
  resetAdaptiveLayoutForTest();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "poracodeHost");
  document.documentElement.removeAttribute("data-compact-layout");
  document.documentElement.removeAttribute("data-coarse-input");
});

describe("adaptive layout", () => {
  it("switches between desktop and compact presentation without remounting", () => {
    const setMatches = installMatchMedia(false);
    const { result } = renderHook(() => useCompactLayout());
    expect(result.current).toBe(false);

    act(() => setMatches(true));
    expect(result.current).toBe(true);

    act(() => setMatches(false));
    expect(result.current).toBe(false);
  });

  it("keeps narrow Electron windows on the desktop presentation", () => {
    installMatchMedia(true);
    window.poracodeHost = {} as ElectronHostBridge;

    const { result } = renderHook(() => useCompactLayout());

    expect(result.current).toBe(false);
  });

  it("recovers the shared document and React layout after a missed viewport event", () => {
    const setMatches = installMatchMedia(true);
    initializeAdaptiveLayout();
    const { result } = renderHook(() => useCompactLayout());

    expect(result.current).toBe(true);
    expect(document.documentElement).toHaveAttribute("data-compact-layout");

    setMatches(false, false);
    act(() => {
      window.dispatchEvent(new PageTransitionEvent("pageshow"));
    });

    expect(result.current).toBe(false);
    expect(document.documentElement).not.toHaveAttribute("data-compact-layout");
  });

  it("waits until a backgrounded PWA is visible before sampling its viewport", () => {
    const setMatches = installMatchMedia(true);
    initializeAdaptiveLayout();
    const { result } = renderHook(() => useCompactLayout());
    const visibility = vi.spyOn(document, "visibilityState", "get");

    setMatches(false, false);
    visibility.mockReturnValue("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current).toBe(true);
    expect(document.documentElement).toHaveAttribute("data-compact-layout");

    visibility.mockReturnValue("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current).toBe(false);
    expect(document.documentElement).not.toHaveAttribute("data-compact-layout");

    visibility.mockRestore();
  });
});
