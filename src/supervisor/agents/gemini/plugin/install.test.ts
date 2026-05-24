import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getGeminiPluginPaths,
  installGeminiPlugin,
  isGeminiPluginInstalled,
  renderGeminiSettings,
} from "./install";

const tempDirs: string[] = [];

function makeBaseDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "lightcode-gemini-plugin-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("getGeminiPluginPaths", () => {
  it("places Gemini settings under Lightcode's plugin dir", () => {
    const baseDir = makeBaseDir();
    const paths = getGeminiPluginPaths({ envKind: "posix", baseDir });

    expect(paths.pluginDir).toBe(join(baseDir, "agent-plugins", "gemini"));
    expect(paths.settingsPath).toBe(join(baseDir, "agent-plugins", "gemini", "settings.json"));
  });
});

describe("renderGeminiSettings", () => {
  it("renders only the trimmed hook surface with the resolved-node command prefix", () => {
    const commandPrefix =
      "'/home/demo/.nvm/versions/node/v22.11.0/bin/node' '/home/demo/.lightcode/agent-plugins/gemini/forward.mjs'";
    const doc = renderGeminiSettings({ headExpression: commandPrefix });

    expect(doc.hooksConfig).toEqual({ notifications: false });
    expect(Object.keys(doc.hooks)).toEqual([
      "SessionStart",
      "BeforeAgent",
      "AfterAgent",
      "Notification",
    ]);
    expect(doc.hooks.SessionStart?.[0]?.matcher).toBeUndefined();
    expect(doc.hooks.BeforeAgent?.[0]?.matcher).toBeUndefined();
    expect(doc.hooks.AfterAgent?.[0]?.matcher).toBeUndefined();
    expect(doc.hooks.Notification?.[0]?.matcher).toBeUndefined();
    expect(doc.hooks.AfterAgent?.[0]?.hooks[0]).toMatchObject({
      name: "lightcode-status-AfterAgent",
      type: "command",
      command: `${commandPrefix} AfterAgent`,
      timeout: 5000,
    });
  });

  it("does not register dropped redundant turn-open hooks", () => {
    const doc = renderGeminiSettings({ headExpression: "'/usr/bin/node' '/tmp/forward.mjs'" });
    expect(doc.hooks.BeforeModel).toBeUndefined();
    expect(doc.hooks.BeforeTool).toBeUndefined();
    expect(doc.hooks.AfterTool).toBeUndefined();
  });
});

describe("installGeminiPlugin", () => {
  it("stages assets and writes a private Gemini system settings file", () => {
    const baseDir = makeBaseDir();

    const result = installGeminiPlugin({ envKind: "posix", baseDir });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(existsSync(join(result.paths.pluginDir, "plugin.json"))).toBe(true);
    expect(existsSync(join(result.paths.pluginDir, "forward.mjs"))).toBe(true);
    expect(existsSync(result.paths.settingsPath)).toBe(true);
    expect(isGeminiPluginInstalled({ envKind: "posix", baseDir })).toMatchObject({
      installed: true,
      version: "1.2.3",
    });

    const settings = JSON.parse(readFileSync(result.paths.settingsPath, "utf8")) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    };
    const command = settings.hooks.Notification?.[0]?.hooks[0]?.command ?? "";
    expect(command).toMatch(/agent-plugins[\\/]+gemini[\\/]+lightcode-hook\.(?:sh|cmd|ps1)/);
    expect(command).toMatch(
      process.platform === "win32"
        ? /^(?:pwsh(?:\.exe)?|powershell(?:\.exe)?|cmd\.exe \/d \/s \/c call ")/
        : /^(?!cmd\.exe)/,
    );
  });
});
