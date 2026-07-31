import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { installQoderPlugin, isQoderPluginInstalled } from "./install";

describe("installQoderPlugin", () => {
  const baseDir = mkdtempSync(join(tmpdir(), "qoder-plugin-test-"));

  afterAll(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it("stages assets and renders qoder hook settings", () => {
    const result = installQoderPlugin({ envKind: "posix", baseDir });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(existsSync(join(result.paths.pluginDir, "plugin.json"))).toBe(true);
    expect(existsSync(join(result.paths.pluginDir, "forward.mjs"))).toBe(true);
    expect(existsSync(join(result.paths.pluginDir, "poracode-hook-runtime.mjs"))).toBe(true);

    const settings = JSON.parse(readFileSync(result.paths.settingsPath, "utf8")) as {
      hooks: Record<string, Array<{ hooks: Array<{ type: string; command: string }> }>>;
    };
    expect(Object.keys(settings.hooks)).toEqual(
      expect.arrayContaining([
        "SessionStart",
        "UserPromptSubmit",
        "PermissionRequest",
        "PostToolUse",
        "PostToolUseFailure",
        "Notification",
        "Stop",
        "StopFailure",
      ]),
    );
    const submit = settings.hooks["UserPromptSubmit"]?.[0]?.hooks[0];
    expect(submit?.type).toBe("command");
    expect(submit?.command.endsWith("UserPromptSubmit")).toBe(true);

    expect(isQoderPluginInstalled({ envKind: "posix", baseDir })).toEqual({
      installed: true,
      version: result.version,
    });
  });
});
