import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { InstalledPlugins } from "@/shared/contracts";
import { writeFileAtomic } from "@/shared/atomicFile";
import { defaultSharedSettings } from "@/shared/settings";
import { SupervisorSharedSettingsCache } from "./supervisorSharedSettings";

function writeInstalledPlugins(settingsPath: string, installedPlugins: InstalledPlugins): void {
  writeFileAtomic(settingsPath, JSON.stringify({ ...defaultSharedSettings, installedPlugins }), {
    encoding: "utf8",
  });
}

describe("SupervisorSharedSettingsCache", () => {
  it("reads plugin state synchronously when the filesystem watcher has not invalidated the cache", () => {
    const directory = mkdtempSync(join(tmpdir(), "poracode-supervisor-settings-"));
    const settingsPath = join(directory, "settings.json");
    const cache = new SupervisorSharedSettingsCache(settingsPath);

    try {
      expect(cache.read().installedPlugins).toEqual({});

      writeInstalledPlugins(settingsPath, {
        "browser-tools": {
          version: "1.0.0",
          enabled: true,
          disabledSkillIds: [],
          disabledAppIds: [],
          disabledMcpServerNames: [],
        },
      });
      expect(cache.readFresh().installedPlugins["browser-tools"]?.enabled).toBe(true);

      writeInstalledPlugins(settingsPath, {
        "browser-tools": {
          version: "1.0.0",
          enabled: false,
          disabledSkillIds: [],
          disabledAppIds: [],
          disabledMcpServerNames: [],
        },
      });
      expect(cache.readFresh().installedPlugins["browser-tools"]?.enabled).toBe(false);

      writeInstalledPlugins(settingsPath, {});
      expect(cache.readFresh().installedPlugins).toEqual({});
    } finally {
      cache.dispose();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
