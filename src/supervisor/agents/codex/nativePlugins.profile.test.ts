import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pluginsByHome: new Map<string | undefined, string[]>(),
  seenHomes: [] as Array<string | undefined>,
}));

vi.mock("../base", async (original) => {
  const actual = await original<typeof import("../base")>();
  return {
    ...actual,
    readCommandOutputAsync: async (
      _command: string,
      _args: string[],
      options?: { env?: Record<string, string> },
    ) => {
      const home = options?.env?.CODEX_HOME;
      mocks.seenHomes.push(home);
      const enabled = mocks.pluginsByHome.get(home) ?? [];
      return {
        ok: true,
        stdout: JSON.stringify({
          installed: enabled.map((name) => ({
            name,
            installed: true,
            enabled: true,
            source: { path: `/plugins/${name}` },
          })),
        }),
        stderr: "",
      };
    },
  };
});

import { createCodexAdapter, createCodexProfileAdapter } from "./index";
import { getCodexPluginPaths } from "./plugin/install";

function names(plugins: readonly { name: string }[]): string[] {
  return plugins.map((plugin) => plugin.name);
}

describe("Codex native-plugin discovery for profiles", () => {
  let baseDir: string;
  let profileHome: string;

  beforeEach(() => {
    mocks.pluginsByHome.clear();
    mocks.seenHomes.length = 0;
    baseDir = mkdtempSync(path.join(tmpdir(), "codex-plugin-discovery-"));
    profileHome = path.join(baseDir, "work-home");
  });

  const profileAdapter = () =>
    createCodexProfileAdapter({
      id: "work",
      driver: "codex",
      displayName: "Work",
      config: { homeDir: profileHome },
    });

  it("does not report a base-only native plugin for a profile", async () => {
    const baseOverlay = (await getCodexPluginPaths({ envKind: "posix", baseDir })).codexHomeDir;
    mkdirSync(baseOverlay, { recursive: true });
    mocks.pluginsByHome.set(baseOverlay, ["github"]);

    const ctx = { envKind: "posix" as const, baseDir };
    // The base account still sees its plugin, so it keeps skipping the fallback…
    expect(names(await createCodexAdapter().listNativePlugins!(ctx))).toEqual(["github"]);
    // …but the profile must not, or the Poracode MCP/skill fallback is dropped.
    expect(names(await profileAdapter().listNativePlugins!(ctx))).toEqual([]);
    expect(mocks.seenHomes.at(-1)).toBe(profileHome);
  });

  it("reports a profile-only native plugin from the profile's own home", async () => {
    mocks.pluginsByHome.set(profileHome, ["linear"]);
    const ctx = { envKind: "posix" as const, baseDir };

    expect(names(await profileAdapter().listNativePlugins!(ctx))).toEqual(["linear"]);
    expect(names(await createCodexAdapter().listNativePlugins!(ctx))).toEqual([]);
  });

  it("inspects the profile's hook overlay once one is staged, as launches do", async () => {
    const overlay = (
      await getCodexPluginPaths(
        { envKind: "posix", baseDir },
        { profileId: "work", sourceHomeDir: profileHome },
      )
    ).codexHomeDir;
    mkdirSync(overlay, { recursive: true });
    mocks.pluginsByHome.set(overlay, ["linear"]);

    const plugins = await profileAdapter().listNativePlugins!({ envKind: "posix", baseDir });
    expect(names(plugins)).toEqual(["linear"]);
    expect(mocks.seenHomes.at(-1)).toBe(overlay);
  });
});
