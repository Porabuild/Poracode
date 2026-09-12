import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "@heroui/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ThemeMode } from "@/shared/contracts";

const settingsState: {
  themeMode: ThemeMode;
  themePreset: string;
  sidebarTranslucency: boolean;
  sidebarGlassTint: { light: number | null; dark: number | null };
} = {
  themeMode: "system",
  themePreset: "default",
  sidebarTranslucency: false,
  sidebarGlassTint: { light: null, dark: null },
};

const runtime = vi.hoisted(() => ({ browser: false, remote: false }));

vi.mock("../../state/sharedSettingsStore", () => ({
  useSharedSettings: (selector: (s: typeof settingsState) => unknown) => selector(settingsState),
}));

vi.mock("@/renderer/bridge", () => ({
  isMac: () => false,
  isRemoteSession: () => runtime.remote,
  isWindows: () => false,
  readBridge: () => ({
    setWindowChrome: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  }),
}));

vi.mock("@/renderer/clientRuntime", () => ({
  isBrowserClientRuntime: () => runtime.browser,
}));

import { AppProvider } from "./provider";

function setMatchMedia(prefersDark: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes("dark") ? prefersDark : !prefersDark,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

beforeEach(() => {
  settingsState.themeMode = "system";
  settingsState.themePreset = "default";
  settingsState.sidebarTranslucency = false;
  runtime.browser = false;
  runtime.remote = false;
  document.documentElement.classList.remove("light", "dark");
  delete document.documentElement.dataset.sidebarGlass;
  delete document.documentElement.dataset.nativeMaterial;
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.themePreset;
  setMatchMedia(true);
});

afterEach(() => {
  toast.clear();
  // Restore the testSetup default matchMedia stub so other tests behave.
  setMatchMedia(true);
});

describe("AppProvider", () => {
  it("renders children", () => {
    render(
      <AppProvider>
        <div>provider works</div>
      </AppProvider>,
    );
    expect(screen.getByText("provider works")).toBeInTheDocument();
  });

  it("uses faux sidebar glass by default in the browser", async () => {
    runtime.browser = true;
    runtime.remote = true;

    render(
      <AppProvider contentReady>
        <span />
      </AppProvider>,
    );

    await waitFor(() => {
      expect(document.documentElement.dataset.sidebarGlass).toBe("on");
      expect(document.documentElement.dataset.nativeMaterial).toBe("off");
    });
  });

  it("uses a bounded responsive toast width", async () => {
    render(
      <AppProvider>
        <span />
      </AppProvider>,
    );

    act(() => {
      toast("Width test");
    });

    await waitFor(() => {
      const region = document.querySelector('[data-slot="toast-region"]');
      expect(region).toHaveClass("lc-toast-region");
      expect(region).toHaveStyle({
        "--toast-width": "min(32rem, calc(100vw - 2rem))",
      });
    });
  });

  it("marks long toast descriptions as a bounded scrolling region", async () => {
    render(
      <AppProvider>
        <span />
      </AppProvider>,
    );

    act(() => {
      toast("Bounded toast", {
        description: Array.from({ length: 100 }, (_, index) => `Description line ${index}`).join(
          "\n",
        ),
        timeout: 0,
      });
    });

    await waitFor(() => {
      expect(document.querySelector('[data-slot="toast-description"]')).toHaveClass(
        "lc-toast__description",
      );
      expect(document.querySelector('[data-slot="toast"]')).toHaveClass("lc-toast");
    });
  });

  it.each([
    ["down", { clientX: 100, clientY: 170 }],
    ["left", { clientX: 30, clientY: 100 }],
    ["right", { clientX: 170, clientY: 100 }],
  ])("dismisses a toast with a touch swipe %s", async (_direction, end) => {
    render(
      <AppProvider>
        <span />
      </AppProvider>,
    );
    act(() => {
      toast("Swipe test", { timeout: 0 });
    });

    const toastElement = await screen
      .findByText("Swipe test")
      .then((title) => title.closest('[data-slot="toast"]'));
    expect(toastElement).not.toBeNull();
    Object.defineProperty(toastElement, "setPointerCapture", {
      value: vi.fn<(pointerId: number) => void>(),
    });

    fireEvent.pointerDown(toastElement!, {
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(toastElement!, { pointerId: 1, pointerType: "touch", ...end });
    fireEvent.pointerUp(toastElement!, { pointerId: 1, pointerType: "touch", ...end });

    await waitFor(() => {
      expect(screen.queryByText("Swipe test")).not.toBeInTheDocument();
    });
  });

  it("keeps a toast for upward, short, and mouse drags", async () => {
    render(
      <AppProvider>
        <span />
      </AppProvider>,
    );
    act(() => {
      toast("Keep test", { timeout: 0 });
    });

    const toastElement = await screen
      .findByText("Keep test")
      .then((title) => title.closest('[data-slot="toast"]'));
    expect(toastElement).not.toBeNull();
    Object.defineProperty(toastElement, "setPointerCapture", {
      value: vi.fn<(pointerId: number) => void>(),
    });

    fireEvent.pointerDown(toastElement!, {
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(toastElement!, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 100,
      clientY: 20,
    });
    fireEvent.pointerUp(toastElement!, { pointerId: 1, pointerType: "touch" });

    fireEvent.pointerDown(toastElement!, {
      pointerId: 2,
      pointerType: "touch",
      isPrimary: true,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(toastElement!, {
      pointerId: 2,
      pointerType: "touch",
      clientX: 140,
      clientY: 140,
    });
    fireEvent.pointerUp(toastElement!, { pointerId: 2, pointerType: "touch" });

    fireEvent.pointerDown(toastElement!, {
      pointerId: 3,
      pointerType: "mouse",
      isPrimary: true,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(toastElement!, {
      pointerId: 3,
      pointerType: "mouse",
      clientX: 200,
      clientY: 200,
    });
    fireEvent.pointerUp(toastElement!, { pointerId: 3, pointerType: "mouse" });

    expect(screen.getByText("Keep test")).toBeInTheDocument();
  });

  it("applies dark class + data-theme when themeMode is explicit 'dark'", () => {
    settingsState.themeMode = "dark";
    render(
      <AppProvider>
        <span />
      </AppProvider>,
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.themePreset).toBe("default");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
  });

  it("applies light class + data-theme when themeMode is explicit 'light'", () => {
    settingsState.themeMode = "light";
    render(
      <AppProvider>
        <span />
      </AppProvider>,
    );
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("follows the system preference when themeMode is 'system' (dark)", () => {
    settingsState.themeMode = "system";
    setMatchMedia(true);
    render(
      <AppProvider>
        <span />
      </AppProvider>,
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("follows the system preference when themeMode is 'system' (light)", () => {
    settingsState.themeMode = "system";
    setMatchMedia(false);
    render(
      <AppProvider>
        <span />
      </AppProvider>,
    );
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
