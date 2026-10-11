import { mkdtempSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSharedSettingsFileReader } from "./sharedSettingsFile";
import { defaultSharedSettings } from "@/shared/settings";

describe("settings projection reader", () => {
  let directory: string;
  let path: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "poracode-settings-reader-"));
    path = join(directory, "settings.json");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(directory, { recursive: true, force: true });
  });

  it("avoids re-parsing unchanged files and isolates returned nested values", () => {
    writeFileSync(
      path,
      JSON.stringify({ notificationStatuses: { done: true, needsAttention: true, error: true } }),
    );
    const read = createSharedSettingsFileReader(path);
    const parse = vi.spyOn(JSON, "parse");
    const first = read();
    const parseCount = parse.mock.calls.length;
    first.notificationStatuses.done = false;
    expect(read().notificationStatuses.done).toBe(true);
    expect(parse.mock.calls.length).toBe(parseCount);
  });

  it("observes same-size external edits even when mtime is restored", () => {
    writeFileSync(path, JSON.stringify({ themePreset: "aaaa" }));
    const read = createSharedSettingsFileReader(path);
    expect(read().themePreset).toBe("aaaa");
    const previous = statSync(path);
    writeFileSync(path, JSON.stringify({ themePreset: "bbbb" }));
    utimesSync(path, previous.atime, previous.mtime);
    expect(read().themePreset).toBe("bbbb");
  });

  it("observes atomic replacements, missing files and repaired invalid JSON", () => {
    const read = createSharedSettingsFileReader(path);
    read();
    writeFileSync(path, JSON.stringify({ themeMode: "dark" }));
    expect(read().themeMode).toBe("dark");
    const replacement = join(directory, "replacement.json");
    writeFileSync(replacement, JSON.stringify({ themeMode: "light" }));
    renameSync(replacement, path);
    expect(read().themeMode).toBe("light");
    writeFileSync(path, "invalid JSON");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    read();
    writeFileSync(path, JSON.stringify({ themeMode: "dark" }));
    expect(read().themeMode).toBe("dark");
    rmSync(path);
    expect(read()).toEqual(defaultSharedSettings);
  });
});
