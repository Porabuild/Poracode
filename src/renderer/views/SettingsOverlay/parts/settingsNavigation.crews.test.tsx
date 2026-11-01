import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nTestWrapper } from "@/renderer/testUtils/i18n";

vi.mock("@/renderer/bridge", () => ({
  isDevApp: () => false,
  isRemoteSession: () => true,
  hasClientCapability: () => false,
}));

import { isSettingsSectionVisible, useSettingsNavigation } from "./settingsNavigation";
import { SETTINGS_SEARCH_INDEX } from "./settingsSearchIndex";

describe("Crews settings navigation", () => {
  it("keeps Crews visible in the Agents group for remote clients", () => {
    const { result } = renderHook(() => useSettingsNavigation(), { wrapper: I18nTestWrapper });
    const agents = result.current.sectionGroups.find((group) => group.id === "agents");
    expect(agents?.sections.some((section) => section.id === "crews")).toBe(true);
    expect(result.current.isSectionVisible("crews")).toBe(true);
  });

  it("hides the same sections from settings search that the remote sidebar hides", () => {
    // The command palette filters with this check, so a PWA search never opens
    // a page that has no sidebar entry.
    expect(isSettingsSectionVisible("threads", true)).toBe(false);
    expect(isSettingsSectionVisible("search", true)).toBe(false);
    expect(isSettingsSectionVisible("threads", false)).toBe(true);
    const remoteHits = SETTINGS_SEARCH_INDEX.filter((entry) =>
      isSettingsSectionVisible(entry.section, true),
    );
    expect(remoteHits.some((entry) => entry.anchor === "threads.followUpBehavior")).toBe(false);
    expect(remoteHits.some((entry) => entry.section === "crews")).toBe(true);
  });
});
