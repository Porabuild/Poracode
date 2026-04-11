import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readSharedSettingsFile, writeSharedSettingsFile } from "./sharedSettingsFile";

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
      conflictResolverProvider: "auto",
      conflictResolverModel: "",
      conflictResolverEffort: "",
      wslCommitGenProvider: "auto",
      wslCommitGenModel: "",
      wslCommitGenEffort: "",
      wslTitleGenProvider: "auto",
      wslTitleGenModel: "",
      wslTitleGenEffort: "",
      wslConflictResolverProvider: "auto",
      wslConflictResolverModel: "",
      wslConflictResolverEffort: "",
      agentSettings: {},
      hiddenModels: {},
      collapseTerminalComposer: false,
      staleThreadUnloadMinutes: 20,
      scrollSpeed: 2,
      preventSleepWhileWorking: true,
      threadRemoveAction: "archive",
      newThreadMode: "page",
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
      conflictResolverProvider: "auto",
      conflictResolverModel: "",
      conflictResolverEffort: "",
      wslCommitGenProvider: "auto",
      wslCommitGenModel: "",
      wslCommitGenEffort: "",
      wslTitleGenProvider: "auto",
      wslTitleGenModel: "",
      wslTitleGenEffort: "",
      wslConflictResolverProvider: "auto",
      wslConflictResolverModel: "",
      wslConflictResolverEffort: "",
      agentSettings: {},
      hiddenModels: {},
      collapseTerminalComposer: false,
      staleThreadUnloadMinutes: 20,
      scrollSpeed: 2,
      preventSleepWhileWorking: true,
      threadRemoveAction: "archive",
      newThreadMode: "page",
    });
    expect(readFileSync(settingsPath, "utf8")).toContain('"themeMode": "dark"');
  });
});
