import { readFileSync } from "node:fs";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nTestWrapper } from "@/renderer/testUtils/i18n";

vi.mock("@/renderer/bridge", () => ({
  isDevApp: () => false,
  isRemoteSession: () => true,
}));
vi.mock("@/renderer/clientRuntime", () => ({
  hasClientCapability: (capability: string) => capability === "manageRemoteEnvironments",
}));
vi.mock("@/renderer/state/agentStatusesStore", () => ({
  useAgentStatusesStore: (selector: (state: unknown) => unknown) =>
    selector({ agentStatuses: {}, wslAgentStatuses: {} }),
}));

import { SIDEBAR_SHORTCUT_IDS } from "@/shared/settings";
import { useSettingsShortcutDestinations } from "./settingsNavigation";

const fixture = JSON.parse(
  readFileSync("protocol/remote/v3/fixtures/client-home-shortcuts.json", "utf8"),
) as { core: string[]; remoteSettings: string[]; expectedIDs: string[] };

describe("remote Settings shortcut catalog shared with native iOS", () => {
  it("matches the complete remote PWA catalog with remote-environment management", () => {
    const { result } = renderHook(useSettingsShortcutDestinations, { wrapper: I18nTestWrapper });
    expect(result.current.map((destination) => destination.id)).toEqual(fixture.remoteSettings);
    expect(SIDEBAR_SHORTCUT_IDS).toEqual(fixture.core);
    expect([
      ...SIDEBAR_SHORTCUT_IDS,
      ...result.current.map((destination) => `settings:${destination.id}`),
    ]).toEqual(fixture.expectedIDs);
  });
});
