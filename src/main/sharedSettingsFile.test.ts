import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ensureSharedSettingsFile,
  extractLegacySharedSettings,
  readSharedSettingsFile,
  writeSharedSettingsFile,
} from "./sharedSettingsFile";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "lightcode-settings-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures in tests
    }
  }
});

describe("sharedSettingsFile", () => {
  it("extracts legacy persisted shared settings", () => {
    expect(
      extractLegacySharedSettings(
        JSON.stringify({
          state: {
            themeMode: "dark",
            commitGenProvider: "codex",
            commitGenModel: "gpt-5.4",
            commitGenEffort: "high",
          },
          version: 3,
        }),
      ),
    ).toEqual({
      themeMode: "dark",
      terminalPosition: "right",
      commitGenProvider: "codex",
      commitGenModel: "gpt-5.4",
      commitGenEffort: "high",
      titleGenProvider: "auto",
      titleGenModel: "",
      titleGenEffort: "",
    });
  });

  it("writes and reads shared settings as readable JSON", () => {
    const settingsPath = join(makeTempDir(), "settings.json");
    writeSharedSettingsFile(settingsPath, {
      themeMode: "dark",
      terminalPosition: "right",
      commitGenProvider: "auto",
      commitGenModel: "",
      commitGenEffort: "",
      titleGenProvider: "auto",
      titleGenModel: "",
      titleGenEffort: "",
    });

    expect(readSharedSettingsFile(settingsPath)).toEqual({
      themeMode: "dark",
      terminalPosition: "right",
      commitGenProvider: "auto",
      commitGenModel: "",
      commitGenEffort: "",
      titleGenProvider: "auto",
      titleGenModel: "",
      titleGenEffort: "",
    });
    expect(readFileSync(settingsPath, "utf8")).toContain('"themeMode": "dark"');
  });

  it("creates settings.json from legacy persisted state when missing", () => {
    const settingsPath = join(makeTempDir(), "settings.json");
    const settings = ensureSharedSettingsFile(
      settingsPath,
      JSON.stringify({
        state: {
          themeMode: "light",
          commitGenProvider: "gemini",
        },
      }),
    );

    expect(settings).toEqual({
      themeMode: "light",
      terminalPosition: "right",
      commitGenProvider: "gemini",
      commitGenModel: "",
      commitGenEffort: "",
      titleGenProvider: "auto",
      titleGenModel: "",
      titleGenEffort: "",
    });
    expect(readSharedSettingsFile(settingsPath)).toEqual(settings);
  });
});
