import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getOpenCodePluginPaths,
  installOpenCodePlugin,
  isOpenCodePluginInstalled,
  uninstallOpenCodePlugin,
} from "./install";

const tempDirs: string[] = [];
let originalConfigDir: string | undefined;

function makeBaseDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "lightcode-opencode-plugin-"));
  tempDirs.push(dir);
  return dir;
}

beforeEach(() => {
  originalConfigDir = process.env.OPENCODE_CONFIG_DIR;
});

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  if (originalConfigDir === undefined) {
    delete process.env.OPENCODE_CONFIG_DIR;
  } else {
    process.env.OPENCODE_CONFIG_DIR = originalConfigDir;
  }
});

describe("getOpenCodePluginPaths", () => {
  it("places lightcode-managed staging under the supplied base dir", () => {
    const baseDir = makeBaseDir();
    process.env.OPENCODE_CONFIG_DIR = makeBaseDir();
    const paths = getOpenCodePluginPaths({ envKind: "posix", baseDir });
    expect(paths.pluginDir).toBe(join(baseDir, "agent-plugins", "opencode"));
    expect(paths.opencodePluginFile).toBe(
      join(process.env.OPENCODE_CONFIG_DIR, "plugins", "lightcode-status.js"),
    );
  });

  it("uses ~/.config/opencode/plugins when OPENCODE_CONFIG_DIR is unset", () => {
    const baseDir = makeBaseDir();
    delete process.env.OPENCODE_CONFIG_DIR;
    const paths = getOpenCodePluginPaths({ envKind: "posix", baseDir });
    expect(paths.opencodePluginFile.endsWith(join("plugins", "lightcode-status.js"))).toBe(true);
  });
});

describe("installOpenCodePlugin", () => {
  it("stages assets and drops the plugin + manifest into OpenCode's plugins dir", () => {
    const baseDir = makeBaseDir();
    const opencodeDir = makeBaseDir();
    process.env.OPENCODE_CONFIG_DIR = opencodeDir;

    const result = installOpenCodePlugin({ envKind: "posix", baseDir });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Poracode-side staging
    expect(existsSync(join(result.paths.pluginDir, "plugin.json"))).toBe(true);
    expect(existsSync(join(result.paths.pluginDir, "lightcode-status.mjs"))).toBe(true);

    // OpenCode-side drops: .js plugin file (auto-discovered) + sibling manifest
    const droppedPlugin = join(opencodeDir, "plugins", "lightcode-status.js");
    const droppedManifest = join(opencodeDir, "plugins", "lightcode-status.plugin.json");
    expect(existsSync(droppedPlugin)).toBe(true);
    expect(existsSync(droppedManifest)).toBe(true);

    // Drop matches staged source byte-for-byte.
    expect(
      readFileSync(join(result.paths.pluginDir, "lightcode-status.mjs")).equals(
        readFileSync(droppedPlugin),
      ),
    ).toBe(true);
    expect(
      readFileSync(join(result.paths.pluginDir, "plugin.json")).equals(
        readFileSync(droppedManifest),
      ),
    ).toBe(true);

    expect(isOpenCodePluginInstalled({ envKind: "posix", baseDir })).toMatchObject({
      installed: true,
      version: "1.7.1",
    });
  });

  it("scrubs a stale `file://` plugin entry that older builds left in opencode.json", () => {
    const baseDir = makeBaseDir();
    const opencodeDir = makeBaseDir();
    process.env.OPENCODE_CONFIG_DIR = opencodeDir;
    const configPath = join(opencodeDir, "opencode.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        theme: "dark",
        plugin: [
          "@warp-dot-dev/opencode-warp",
          `file:///prior/baseDir/agent-plugins/opencode/lightcode-status.mjs`,
        ],
      }),
      "utf8",
    );

    const result = installOpenCodePlugin({ envKind: "posix", baseDir });
    expect(result.ok).toBe(true);

    const config = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    expect(config.theme).toBe("dark");
    // Poracode entry removed; user's other plugin entry is preserved.
    expect(config.plugin).toEqual(["@warp-dot-dev/opencode-warp"]);
  });

  it("removes the `plugin` key entirely when ours was the only entry", () => {
    const baseDir = makeBaseDir();
    const opencodeDir = makeBaseDir();
    process.env.OPENCODE_CONFIG_DIR = opencodeDir;
    const configPath = join(opencodeDir, "opencode.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        plugin: [`file:///prior/baseDir/agent-plugins/opencode/lightcode-status.mjs`],
      }),
      "utf8",
    );

    const result = installOpenCodePlugin({ envKind: "posix", baseDir });
    expect(result.ok).toBe(true);

    const config = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    expect(config.plugin).toBeUndefined();
  });

  it("is idempotent — restaging produces the same end state", () => {
    const baseDir = makeBaseDir();
    process.env.OPENCODE_CONFIG_DIR = makeBaseDir();

    const first = installOpenCodePlugin({ envKind: "posix", baseDir });
    expect(first.ok).toBe(true);

    const second = installOpenCodePlugin({ envKind: "posix", baseDir });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(isOpenCodePluginInstalled({ envKind: "posix", baseDir })).toMatchObject({
      installed: true,
    });
  });

  it("removes a legacy lightcode-status.mjs left behind by an older install", () => {
    const baseDir = makeBaseDir();
    const opencodeDir = makeBaseDir();
    process.env.OPENCODE_CONFIG_DIR = opencodeDir;

    const legacyPath = join(opencodeDir, "plugins", "lightcode-status.mjs");
    mkdirSync(dirname(legacyPath), { recursive: true });
    writeFileSync(legacyPath, "// stale legacy plugin\n");

    const result = installOpenCodePlugin({ envKind: "posix", baseDir });
    expect(result.ok).toBe(true);

    expect(existsSync(legacyPath)).toBe(false);
  });

  it("treats a hand-edited drop as not-installed", () => {
    const baseDir = makeBaseDir();
    const opencodeDir = makeBaseDir();
    process.env.OPENCODE_CONFIG_DIR = opencodeDir;

    const result = installOpenCodePlugin({ envKind: "posix", baseDir });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    writeFileSync(result.paths.opencodePluginFile, "// hand edit\n");

    expect(isOpenCodePluginInstalled({ envKind: "posix", baseDir })).toEqual({ installed: false });
  });

  it("treats a missing dropped manifest as not-installed", () => {
    const baseDir = makeBaseDir();
    const opencodeDir = makeBaseDir();
    process.env.OPENCODE_CONFIG_DIR = opencodeDir;

    const result = installOpenCodePlugin({ envKind: "posix", baseDir });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    unlinkSync(join(opencodeDir, "plugins", "lightcode-status.plugin.json"));

    expect(isOpenCodePluginInstalled({ envKind: "posix", baseDir })).toEqual({ installed: false });
  });
});

describe("uninstallOpenCodePlugin", () => {
  it("removes dropped files, staging dir, and the opencode.json entry", () => {
    const baseDir = makeBaseDir();
    const opencodeDir = makeBaseDir();
    process.env.OPENCODE_CONFIG_DIR = opencodeDir;

    const result = installOpenCodePlugin({ envKind: "posix", baseDir });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Add an unrelated plugin alongside ours into opencode.json so we can
    // verify uninstall preserves it.
    const configPath = join(opencodeDir, "opencode.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        plugin: [
          "@user/other-plugin",
          `file://${result.paths.pluginDir.replace(/\\/g, "/")}/lightcode-status.mjs`,
        ],
      }),
      "utf8",
    );

    uninstallOpenCodePlugin({ envKind: "posix", baseDir });

    expect(existsSync(result.paths.opencodePluginFile)).toBe(false);
    expect(existsSync(join(opencodeDir, "plugins", "lightcode-status.plugin.json"))).toBe(false);
    expect(existsSync(result.paths.pluginDir)).toBe(false);

    const config = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    expect(config.plugin).toEqual(["@user/other-plugin"]);
  });
});
