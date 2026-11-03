import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "@/renderer/state/appStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { TRACKED_COMMAND_IDS } from "@/shared/featureDiscovery";
import { buildCommandRegistry } from "@/renderer/commands/registry";
import { COMPOSER_CONTROL_COMMANDS } from "@/renderer/commands/composerCommands";
import {
  FEATURE_USAGE_STORAGE_KEY,
  recordFeatureSignal,
  useFeatureUsageStore,
} from "./featureUsageStore";
import { installFeatureUsageTracking } from "./featureUsageTracking";

function signals(): string[] {
  return Object.keys(useFeatureUsageStore.getState().signals).toSorted();
}

describe("feature usage tracking", () => {
  let uninstall: () => void;

  beforeEach(() => {
    localStorage.clear();
    useFeatureUsageStore.setState({ signals: {} });
    usePanelStore.setState({
      settingsOpen: false,
      settingsSection: null,
      activeSettingsSection: null,
      mobileUtilityPage: null,
    });
    uninstall = installFeatureUsageTracking();
  });

  afterEach(() => uninstall());

  it("records Settings pages as they are shown, including sidebar navigation", () => {
    usePanelStore.getState().openSettingsSection("crews");
    usePanelStore.getState().clearSettingsSection();
    usePanelStore.getState().setActiveSettingsSection("plugins");
    expect(signals()).toEqual(["settings:crews", "settings:plugins"]);
    expect(JSON.parse(localStorage.getItem(FEATURE_USAGE_STORAGE_KEY) ?? "{}")).toHaveProperty(
      "settings:plugins",
    );
  });

  it("ignores the remembered section while Settings is closed", () => {
    usePanelStore.setState({ activeSettingsSection: "skills" });
    expect(signals()).toEqual([]);
  });

  it("records app views", () => {
    useAppStore.getState().openSchedules();
    expect(signals()).toContain("view:schedules");
  });

  it("records only allowlisted commands, so open-ended ids never crowd out signals", () => {
    recordFeatureSignal("command:script.build.run");
    recordFeatureSignal("command:chat.command.compact");
    recordFeatureSignal("command:browser.toggle");
    expect(signals()).toEqual(["command:browser.toggle"]);
  });

  it("tracks only commands that exist", () => {
    const known = new Set([
      ...buildCommandRegistry().map((command) => command.id),
      ...COMPOSER_CONTROL_COMMANDS.map((command) => command.id),
    ]);
    expect(TRACKED_COMMAND_IDS.filter((id) => !known.has(id))).toEqual([]);
  });
});
