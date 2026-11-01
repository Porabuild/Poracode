import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nTestWrapper } from "@/renderer/testUtils/i18n";

vi.mock("@/renderer/bridge", () => ({
  isDevApp: () => false,
  isRemoteSession: () => true,
  hasClientCapability: () => false,
}));

import { useSettingsNavigation } from "./settingsNavigation";

describe("Crews settings navigation", () => {
  it("exposes Audio to PWA clients in the personal group", () => {
    const { result } = renderHook(() => useSettingsNavigation(), { wrapper: I18nTestWrapper });
    expect(result.current.isSectionVisible("audio")).toBe(true);
    expect(
      result.current.sectionGroups
        .find((group) => group.id === "personal")
        ?.sections.some((section) => section.id === "audio"),
    ).toBe(true);
  });
  it("keeps Crews visible in the Agents group for remote clients", () => {
    const { result } = renderHook(() => useSettingsNavigation(), { wrapper: I18nTestWrapper });
    const agents = result.current.sectionGroups.find((group) => group.id === "agents");
    expect(agents?.sections.some((section) => section.id === "crews")).toBe(true);
    expect(result.current.isSectionVisible("crews")).toBe(true);
  });
});
