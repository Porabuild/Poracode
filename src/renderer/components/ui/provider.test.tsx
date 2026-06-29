import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ThemeMode } from "@/shared/contracts";

const settingsState: {
  themeMode: ThemeMode;
  sidebarGlassTint: { light: number | null; dark: number | null };
} = { themeMode: "system", sidebarGlassTint: { light: null, dark: null } };

vi.mock("../../state/sharedSettingsStore", () => ({
  useSharedSettings: (selector: (s: typeof settingsState) => unknown) => selector(settingsState),
}));

vi.mock("@/renderer/bridge", () => ({
  isRemoteSession: () => false,
  readBridge: () => ({
    setWindowChrome: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  }),
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
  document.documentElement.classList.remove("light", "dark");
  delete document.documentElement.dataset.theme;
  setMatchMedia(true);
});

afterEach(() => {
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

  it("applies dark class + data-theme when themeMode is explicit 'dark'", () => {
    settingsState.themeMode = "dark";
    render(
      <AppProvider>
        <span />
      </AppProvider>,
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
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
