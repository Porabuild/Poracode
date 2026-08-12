import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ElectronHostBridge } from "@/shared/clientRuntime";
import { useCompactLayout } from "./adaptiveLayout";

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
  return (next: boolean) => {
    matches = next;
    const event = { matches: next } as MediaQueryListEvent;
    for (const listener of listeners) listener(event);
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "poracodeHost");
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
});
