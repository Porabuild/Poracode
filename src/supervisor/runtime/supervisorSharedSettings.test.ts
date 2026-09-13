import { mkdtempSync, rmSync, watch } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeFileAtomic } from "@/shared/atomicFile";
import { defaultSharedSettings } from "@/shared/settings";
import { SupervisorSharedSettingsCache } from "./supervisorSharedSettings";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, watch: vi.fn<typeof actual.watch>(actual.watch) };
});

const tempDirs: string[] = [];
const caches: SupervisorSharedSettingsCache[] = [];

afterEach(() => {
  for (const cache of caches.splice(0)) cache.dispose();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.mocked(watch).mockReset();
});

function writeTheme(settingsPath: string, themeMode: "dark" | "light"): void {
  writeFileAtomic(
    settingsPath,
    `${JSON.stringify({ ...defaultSharedSettings, themeMode }, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
}

describe("SupervisorSharedSettingsCache", () => {
  it("observes a settings file created after its initial missing-file read", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-supervisor-settings-"));
    tempDirs.push(dir);
    const settingsPath = join(dir, "settings.json");
    const cache = new SupervisorSharedSettingsCache(settingsPath);
    caches.push(cache);

    expect(cache.read().themeMode).toBe(defaultSharedSettings.themeMode);
    writeTheme(settingsPath, "light");

    // Creation preceded the successful watch registration, so no future event
    // will announce this version. Attaching must refresh the cached defaults.
    expect(cache.read().themeMode).toBe("light");
  });

  it("reads the replacement written while its first watcher attaches", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-supervisor-settings-"));
    tempDirs.push(dir);
    const settingsPath = join(dir, "settings.json");
    writeTheme(settingsPath, "dark");
    const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
    vi.mocked(watch).mockImplementationOnce((...args) => {
      // Model another process's atomic write in the read/registration gap.
      // The real watcher attaches to the new inode and cannot replay its creation.
      writeTheme(settingsPath, "light");
      return actual.watch(...args);
    });
    const cache = new SupervisorSharedSettingsCache(settingsPath);
    caches.push(cache);

    expect(cache.read().themeMode).toBe("light");
  });

  it("refreshes settings when a failed watch registration later succeeds", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-supervisor-settings-"));
    tempDirs.push(dir);
    const settingsPath = join(dir, "settings.json");
    writeTheme(settingsPath, "dark");
    vi.mocked(watch).mockImplementationOnce(() => {
      throw Object.assign(new Error("watch temporarily unavailable"), { code: "EMFILE" });
    });
    const cache = new SupervisorSharedSettingsCache(settingsPath);
    caches.push(cache);

    expect(cache.read().themeMode).toBe("dark");
    writeTheme(settingsPath, "light");

    expect(cache.read().themeMode).toBe("light");
  });

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
