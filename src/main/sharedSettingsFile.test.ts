import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultSharedSettings } from "@/shared/settings";
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
      conflictResolverPresentationMode: "gui",
      wslCommitGenProvider: "auto",
      wslCommitGenModel: "",
      wslCommitGenEffort: "",
      wslTitleGenProvider: "auto",
      wslTitleGenModel: "",
      wslTitleGenEffort: "",
      wslConflictResolverProvider: "auto",
      wslConflictResolverModel: "",
      wslConflictResolverEffort: "",
      wslConflictResolverPresentationMode: "gui",
      agentSettings: {},
      hiddenModels: {},
      disabledAgents: [],
      providerOrder: [],
      acpRegistryInstalledAgents: {},
      agentInstances: {},
      collapseTerminalComposer: false,
      staleThreadUnloadMinutes: 20,
      autoArchiveDoneAfterDays: 7,
      scrollSpeed: 2,
      agentTerminalFontSize: 12,
      guiChatFontSize: 13,
      terminalPanelFontSize: 12,
      preventSleepWhileWorking: true,
      closeToTray: true,
      threadRemoveAction: "archive",
      newThreadMode: "page",
      homeScopeEnabled: true,
      autoShowTerminalPanel: true,
      gitReviewMode: "panel",
      providerConfigs: {},
      lastPresentationModeByAgent: {},
      editorLspEnabled: false,
      searchUseIgnoreFiles: true,
      searchExclude: {},
      disableCliHookPlugin: false,
      notificationsEnabled: true,
      notificationSound: true,
      notificationFilter: "unfocused",
      notificationStatuses: { done: true, needsAttention: true, error: true },
      notifyL2Cli: true,
      favoriteModels: [],
      recentModels: [],
      agentHookSupport: {},
      browser: {
        allowEval: false,
        allowDataAccess: false,
        linkOpenTarget: "internal",
        linkPresentationMode: "panel",
      },
      audio: {
        showVoiceInputButton: true,
        microphoneDeviceId: "",
        transcriptionLanguage: "en",
        transcriptionModel: "tiny",
        useWebGpu: true,
      },
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
      conflictResolverPresentationMode: "gui",
      wslCommitGenProvider: "auto",
      wslCommitGenModel: "",
      wslCommitGenEffort: "",
      wslTitleGenProvider: "auto",
      wslTitleGenModel: "",
      wslTitleGenEffort: "",
      wslConflictResolverProvider: "auto",
      wslConflictResolverModel: "",
      wslConflictResolverEffort: "",
      wslConflictResolverPresentationMode: "gui",
      agentSettings: {},
      hiddenModels: {},
      disabledAgents: [],
      providerOrder: [],
      acpRegistryInstalledAgents: {},
      agentInstances: {},
      collapseTerminalComposer: false,
      staleThreadUnloadMinutes: 20,
      autoArchiveDoneAfterDays: 7,
      scrollSpeed: 2,
      agentTerminalFontSize: 12,
      guiChatFontSize: 13,
      terminalPanelFontSize: 12,
      preventSleepWhileWorking: true,
      closeToTray: true,
      threadRemoveAction: "archive",
      newThreadMode: "page",
      homeScopeEnabled: true,
      autoShowTerminalPanel: true,
      gitReviewMode: "panel",
      providerConfigs: {},
      lastPresentationModeByAgent: {},
      editorLspEnabled: false,
      searchUseIgnoreFiles: true,
      searchExclude: {},
      disableCliHookPlugin: false,
      notificationsEnabled: true,
      notificationSound: true,
      notificationFilter: "unfocused",
      notificationStatuses: { done: true, needsAttention: true, error: true },
      notifyL2Cli: true,
      favoriteModels: [],
      recentModels: [],
      agentHookSupport: {},
      browser: {
        allowEval: false,
        allowDataAccess: false,
        linkOpenTarget: "internal",
        linkPresentationMode: "panel",
      },
      audio: {
        showVoiceInputButton: true,
        microphoneDeviceId: "",
        transcriptionLanguage: "en",
        transcriptionModel: "tiny",
        useWebGpu: true,
      },
    });
    expect(readFileSync(settingsPath, "utf8")).toContain('"themeMode": "dark"');
  });

  it("returns defaults when the settings file does not exist", () => {
    const settingsPath = join(makeTempDir(), "missing.json");
    expect(readSharedSettingsFile(settingsPath)).toEqual(defaultSharedSettings);
  });

  it("returns defaults when the settings file contains invalid JSON", () => {
    const settingsPath = join(makeTempDir(), "settings.json");
    writeFileSync(settingsPath, "{not: valid: json}", "utf8");
    expect(readSharedSettingsFile(settingsPath)).toEqual(defaultSharedSettings);
  });

  it("returns defaults when the settings file is empty", () => {
    const settingsPath = join(makeTempDir(), "settings.json");
    writeFileSync(settingsPath, "", "utf8");
    expect(readSharedSettingsFile(settingsPath)).toEqual(defaultSharedSettings);
  });

  it("returns defaults when the settings file contains a non-object root", () => {
    const settingsPath = join(makeTempDir(), "settings.json");
    writeFileSync(settingsPath, "[1, 2, 3]", "utf8");
    const settings = readSharedSettingsFile(settingsPath);
    // normalizeSharedSettings should reject arrays / non-records — even if it
    // chooses to coerce rather than throw, the result must still be a valid
    // SharedSettings object containing all required defaults.
    expect(settings.themeMode).toBe(defaultSharedSettings.themeMode);
    expect(settings.providerConfigs).toEqual({});
  });

  it("creates parent directories on write", () => {
    const settingsPath = join(makeTempDir(), "nested/deep/settings.json");
    writeSharedSettingsFile(settingsPath, defaultSharedSettings);
    expect(readSharedSettingsFile(settingsPath)).toEqual(defaultSharedSettings);
  });

  it("writes pretty-printed JSON terminated by a newline", () => {
    const settingsPath = join(makeTempDir(), "settings.json");
    writeSharedSettingsFile(settingsPath, defaultSharedSettings);
    const raw = readFileSync(settingsPath, "utf8");
    expect(raw.endsWith("\n")).toBe(true);
    expect(raw).toContain("\n  "); // two-space indent
  });

  it("preserves valid settings when provider configs contain invalid entries", () => {
    const settingsPath = join(makeTempDir(), "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({
        themeMode: "dark",
        terminalPosition: "right",
        autoShowTerminalPanel: false,
        providerConfigs: {
          codex: {
            model: "",
            effort: "high",
          },
        },
      }),
      "utf8",
    );

    expect(readSharedSettingsFile(settingsPath)).toMatchObject({
      themeMode: "dark",
      terminalPosition: "right",
      autoShowTerminalPanel: false,
      providerConfigs: {},
    });
  });

  it("normalizes older browser settings without dropping existing flags", () => {
    const settingsPath = join(makeTempDir(), "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({
        browser: { allowEval: true, allowDataAccess: true },
      }),
      "utf8",
    );

    expect(readSharedSettingsFile(settingsPath).browser).toEqual({
      allowEval: true,
      allowDataAccess: true,
      linkOpenTarget: "internal",
      linkPresentationMode: "panel",
    });
  });

  it("normalizes older audio settings without dropping existing values", () => {
    const settingsPath = join(makeTempDir(), "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({
        audio: { microphoneDeviceId: "mic-1" },
      }),
      "utf8",
    );

    expect(readSharedSettingsFile(settingsPath).audio).toEqual({
      showVoiceInputButton: true,
      microphoneDeviceId: "mic-1",
      transcriptionLanguage: "en",
      transcriptionModel: "tiny",
      useWebGpu: true,
    });
  });

  it("normalizes removed audio models without dropping existing values", () => {
    const settingsPath = join(makeTempDir(), "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({
        audio: {
          microphoneDeviceId: "mic-1",
          transcriptionLanguage: "es",
          transcriptionModel: "small",
        },
      }),
      "utf8",
    );

    expect(readSharedSettingsFile(settingsPath).audio).toEqual({
      showVoiceInputButton: true,
      microphoneDeviceId: "mic-1",
      transcriptionLanguage: "es",
      transcriptionModel: "tiny",
      useWebGpu: true,
    });
  });
});
