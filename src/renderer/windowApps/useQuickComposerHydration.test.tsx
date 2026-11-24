import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/renderer/state/appStore";
import {
  getManagedRootCatalogStatus,
  setManagedRootCatalogStatus,
} from "@/renderer/state/managedRootCatalog/rootCatalogStore";
import { useQuickComposerHydration } from "./useQuickComposerHydration";

const mocks = vi.hoisted(() => ({ managedRootDesktop: true }));

vi.mock("@/renderer/state/managedRootCatalog/rootCatalogCommands", () => ({
  isManagedRootDesktopRuntime: () => mocks.managedRootDesktop,
}));

let storeHydrated = false;
let startHydration: (() => void) | undefined;
let finishHydration: (() => void) | undefined;

beforeEach(() => {
  mocks.managedRootDesktop = true;
  storeHydrated = false;
  startHydration = undefined;
  finishHydration = undefined;
  setManagedRootCatalogStatus({ status: "starting" });
  vi.spyOn(useAppStore.persist, "hasHydrated").mockImplementation(() => storeHydrated);
  vi.spyOn(useAppStore.persist, "onHydrate").mockImplementation((listener) => {
    startHydration = () => listener(useAppStore.getState());
    return () => undefined;
  });
  vi.spyOn(useAppStore.persist, "onFinishHydration").mockImplementation((listener) => {
    finishHydration = () => listener(useAppStore.getState());
    return () => undefined;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function render() {
  return renderHook(() => useQuickComposerHydration().initialLoading);
}

async function hydrateStore(catalog: "ready" | "failed" = "ready") {
  await act(async () => {
    storeHydrated = true;
    finishHydration?.();
    setManagedRootCatalogStatus(
      catalog === "ready"
        ? { status: "ready" }
        : { status: "failed", message: "offline", retrying: false },
    );
  });
}

describe("useQuickComposerHydration", () => {
  it("waits for the persisted store, then the first catalog page", async () => {
    const { result } = render();
    expect(result.current).toBe(true);

    await act(async () => {
      storeHydrated = true;
      finishHydration?.();
    });
    // Projects arrive only through the catalog; painting now would show
    // "Add a project to start" for a workspace that has projects.
    expect(result.current).toBe(true);

    await act(async () => {
      setManagedRootCatalogStatus({ status: "ready" });
    });
    expect(result.current).toBe(false);
  });

  it("shows the overlay when the catalog read fails", async () => {
    const { result } = render();
    await hydrateStore("failed");
    expect(result.current).toBe(false);
  });

  it("stops waiting for a catalog page that never arrives", async () => {
    vi.useFakeTimers();
    try {
      const { result } = render();
      await act(async () => {
        storeHydrated = true;
        finishHydration?.();
      });
      expect(result.current).toBe(true);
      expect(getManagedRootCatalogStatus().status).toBe("starting");

      await act(async () => {
        vi.advanceTimersByTime(1_500);
      });
      expect(result.current).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not wait for the catalog outside the managed desktop runtime", async () => {
    mocks.managedRootDesktop = false;
    const { result } = render();
    expect(result.current).toBe(true);

    await act(async () => {
      storeHydrated = true;
      finishHydration?.();
    });
    expect(getManagedRootCatalogStatus().status).toBe("starting");
    expect(result.current).toBe(false);
  });

  it("stays ready while the overlay re-reads persisted preferences", async () => {
    const { result } = render();
    await hydrateStore();
    expect(result.current).toBe(false);

    // The overlay rehydrates the store whenever it is shown, and the store
    // reports itself unhydrated until that read finishes. Returning to the
    // loader would unmount the overlay and restart the read on every mount.
    await act(async () => {
      storeHydrated = false;
      startHydration?.();
    });
    expect(result.current).toBe(false);
  });
});
