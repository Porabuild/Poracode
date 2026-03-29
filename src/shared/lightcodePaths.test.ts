import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveLightcodeBaseDir, resolveLightcodePaths } from "./lightcodePaths";

describe("lightcodePaths", () => {
  it("derives the default base dir under the user home", () => {
    expect(resolveLightcodeBaseDir()).toBe(join(homedir(), ".lightcode"));
  });

  it("derives all persisted paths from the provided base dir", () => {
    const baseDir = join("tmp", "lightcode");
    expect(resolveLightcodePaths(baseDir)).toEqual({
      baseDir,
      dbPath: join(baseDir, "state.sqlite"),
      settingsPath: join(baseDir, "settings.json"),
      worktreesDir: join(baseDir, "worktrees"),
      attachmentsDir: join(baseDir, "attachments"),
      logsDir: join(baseDir, "logs"),
      terminalLogsDir: join(baseDir, "logs", "terminal"),
      cacheDir: join(baseDir, "cache"),
      statusCachePath: join(baseDir, "cache", "agent-status-cache.json"),
    });
  });
});
