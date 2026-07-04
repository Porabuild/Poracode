import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveLightcodeBaseDir, resolveLightcodePaths } from "./lightcodePaths";

describe("lightcodePaths", () => {
  it("derives the default base dir under the user home", () => {
    expect(resolveLightcodeBaseDir("stable")).toBe(join(homedir(), ".poracode"));
  });

  it("returns the nightly base dir when the channel is nightly", () => {
    expect(resolveLightcodeBaseDir("nightly")).toBe(join(homedir(), ".poracode-nightly"));
  });

  it("derives all persisted paths from the provided base dir", () => {
    const baseDir = join("tmp", "lightcode");
    expect(resolveLightcodePaths(baseDir)).toEqual({
      baseDir,
      dbPath: join(baseDir, "state.sqlite"),
      settingsPath: join(baseDir, "settings.json"),
      keybindingsPath: join(baseDir, "keybindings.json"),
      worktreesDir: join(baseDir, "worktrees"),
      attachmentsDir: join(baseDir, "attachments"),
      logsDir: join(baseDir, "logs"),
      terminalLogsDir: join(baseDir, "logs", "terminal"),
      cacheDir: join(baseDir, "cache"),
      statusCachePath: join(baseDir, "cache", "agent-status-cache.json"),
      agentPluginsDir: join(baseDir, "agent-plugins"),
      acpIconsDir: join(baseDir, "cache", "acp-icons"),
    });
  });
});
