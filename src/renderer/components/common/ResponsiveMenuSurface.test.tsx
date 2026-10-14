import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/renderer/adaptiveLayout", () => ({ useCompactLayout: () => false }));
vi.mock("@/renderer/bridge", () => ({ isRemoteSession: () => true }));
vi.mock("@heroui/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@heroui/react")>()),
  useMediaQuery: () => false,
}));
import { useResponsiveMenu } from "./ResponsiveMenuSurface";

afterEach(() => {
  vi.unstubAllEnvs();
  window.history.replaceState(null, "", "/");
});

describe("responsive remote menus", () => {
  it.each(["extension-build", "sidebar-preview"])(
    "keeps %s menus anchored despite a narrow or coarse pointer media query",
    (surface) => {
      if (surface === "extension-build") {
        vi.stubEnv("VITE_PORACODE_BUILD_TARGET", "extension");
      } else {
        window.history.replaceState(null, "", "/?surface=chat-sidebar");
      }
      expect(renderHook(() => useResponsiveMenu()).result.current).toEqual({
        mobile: false,
        stackSubmenus: true,
      });
    },
  );

  it("keeps drawers available to ordinary remote clients without desktop pointer media", () => {
    expect(renderHook(() => useResponsiveMenu()).result.current).toEqual({
      mobile: true,
      stackSubmenus: false,
    });
  });
});
