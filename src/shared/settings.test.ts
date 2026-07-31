import { describe, expect, it } from "vitest";
import { defaultSharedSettings, normalizeSharedSettings } from "./settings";

describe("shared settings defaults", () => {
  it("enables notifications and displays them for visible threads by default", () => {
    expect(defaultSharedSettings.notificationsEnabled).toBe(true);
    expect(defaultSharedSettings.remotePushEnabled).toBe(true);
    expect(defaultSharedSettings.notificationFilter).toBe("all");
  });

  it("defaults to squash merging and preserves a valid selected merge method", () => {
    expect(defaultSharedSettings.prMergeMethod).toBe("squash");
    expect(normalizeSharedSettings({ prMergeMethod: "merge" }).prMergeMethod).toBe("merge");
    expect(normalizeSharedSettings({ prMergeMethod: "invalid" }).prMergeMethod).toBe("squash");
  });

  it("migrates legacy pull request automation defaults", () => {
    expect(normalizeSharedSettings({ prWatchDefault: true }).prAutomationDefault).toBe("fix");
    expect(
      normalizeSharedSettings({ prWatchDefault: true, prAutoMergeDefault: true })
        .prAutomationDefault,
    ).toBe("merge");
    expect(
      normalizeSharedSettings({
        prAutomationDefault: "off",
        prWatchDefault: true,
        prAutoMergeDefault: true,
      }).prAutomationDefault,
    ).toBe("off");
  });
});
