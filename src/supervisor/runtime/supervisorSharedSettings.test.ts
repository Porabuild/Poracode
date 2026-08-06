import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeFileAtomic } from "@/shared/atomicFile";
import { defaultSharedSettings } from "@/shared/settings";
import { SupervisorSharedSettingsCache } from "./supervisorSharedSettings";

const tempDirs: string[] = [];
const caches: SupervisorSharedSettingsCache[] = [];

afterEach(() => {
  for (const cache of caches.splice(0)) cache.dispose();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function writeTheme(settingsPath: string, themeMode: "dark" | "light"): void {
  writeFileAtomic(
    settingsPath,
    `${JSON.stringify({ ...defaultSharedSettings, themeMode }, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
}

describe("SupervisorSharedSettingsCache", () => {
  it("re-arms its watcher after repeated atomic file replacements", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-supervisor-settings-"));
    tempDirs.push(dir);
    const settingsPath = join(dir, "settings.json");
    writeTheme(settingsPath, "dark");
    const cache = new SupervisorSharedSettingsCache(settingsPath);
    caches.push(cache);

    expect(cache.read().themeMode).toBe("dark");
    await new Promise((resolve) => setTimeout(resolve, 20));

    writeTheme(settingsPath, "light");
    await vi.waitFor(() => expect(cache.read().themeMode).toBe("light"), { timeout: 2_000 });
    await new Promise((resolve) => setTimeout(resolve, 20));

    writeTheme(settingsPath, "dark");
    await vi.waitFor(() => expect(cache.read().themeMode).toBe("dark"), { timeout: 2_000 });
  });
});
