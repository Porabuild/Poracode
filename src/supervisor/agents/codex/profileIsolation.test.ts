import { existsSync, mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";

const mocks = vi.hoisted(() => ({
  read: vi.fn<typeof import("../base").readSessionFileText>(),
  find: vi.fn<typeof import("../base").findSessionFiles>(),
}));
vi.mock("../base", async (original) => ({
  ...(await original<typeof import("../base")>()),
  resolveWslHomeDirectoryAsync: async () => "/home/user",
  getCachedWslHomeDirectory: () => "/home/user",
  readSessionFileText: mocks.read,
  findSessionFiles: mocks.find,
}));

import { getCodexPluginPaths, uninstallCodexPlugin, seedNativeCodexHome } from "./plugin/install";
import {
  readCodexSessionIndexForLocationAsync,
  readCodexRolloutsForLocationAsync,
  resolveCodexSessionWatchPaths,
} from "./session";

const location: ProjectLocation = {
  kind: "wsl",
  distro: "Ubuntu",
  linuxPath: "/repo",
  uncPath: "\\\\wsl.localhost\\Ubuntu\\repo",
};

describe("profile isolation", () => {
  it("changes the hook overlay when an existing profile selects a different home", () => {
    const baseDir = mkdtempSync(join(tmpdir(), "codex-overlay-isolation-"));
    const ctx = { envKind: "posix" as const, baseDir };
    const first = getCodexPluginPaths(ctx, {
      profileId: "work",
      sourceHomeDir: join(baseDir, "first"),
    });
    const second = getCodexPluginPaths(ctx, {
      profileId: "work",
      sourceHomeDir: join(baseDir, "second"),
    });
    expect(first.codexHomeDir).not.toBe(second.codexHomeDir);
  });

  it("uninstalls only the selected profile hooks", () => {
    const baseDir = mkdtempSync(join(tmpdir(), "codex-uninstall-isolation-"));
    const ctx = { envKind: "posix" as const, baseDir };
    const overlay = { profileId: "work", sourceHomeDir: join(baseDir, "account") };
    const paths = getCodexPluginPaths(ctx, overlay);
    const base = getCodexPluginPaths(ctx);
    mkdirSync(paths.codexHomeDir, { recursive: true });
    mkdirSync(base.codexHomeDir, { recursive: true });
    writeFileSync(paths.codexHooksPath, "{}");
    writeFileSync(base.codexHooksPath, "{}");
    uninstallCodexPlugin(ctx, overlay);
    expect(existsSync(paths.codexHooksPath)).toBe(false);
    expect(existsSync(base.codexHooksPath)).toBe(true);
  });

  it("removes the whole staged plugin dir when the base account uninstalls without profiles", () => {
    const baseDir = mkdtempSync(join(tmpdir(), "codex-base-uninstall-"));
    const ctx = { envKind: "posix" as const, baseDir };
    const base = getCodexPluginPaths(ctx);
    mkdirSync(base.codexHomeDir, { recursive: true });
    writeFileSync(join(base.pluginDir, "plugin.json"), "{}");
    writeFileSync(base.codexHooksPath, "{}");
    uninstallCodexPlugin(ctx);
    expect(existsSync(base.pluginDir)).toBe(false);
  });

  it("removes the base account's home but keeps assets profiles still run from", () => {
    const baseDir = mkdtempSync(join(tmpdir(), "codex-base-uninstall-profiles-"));
    const ctx = { envKind: "posix" as const, baseDir };
    const account = join(baseDir, "account");
    mkdirSync(account);
    writeFileSync(join(account, "auth.json"), "{}");
    const base = getCodexPluginPaths(ctx);
    const profile = getCodexPluginPaths(ctx, { profileId: "work", sourceHomeDir: account });
    mkdirSync(base.codexHomeDir, { recursive: true });
    mkdirSync(profile.codexHomeDir, { recursive: true });
    writeFileSync(join(base.pluginDir, "plugin.json"), "{}");
    writeFileSync(base.codexHooksPath, "{}");
    writeFileSync(profile.codexHooksPath, "{}");
    symlinkSync(join(account, "auth.json"), join(base.codexHomeDir, "auth.json"));

    uninstallCodexPlugin(ctx);
    expect(existsSync(base.codexHomeDir)).toBe(false);
    expect(existsSync(profile.codexHooksPath)).toBe(true);
    expect(existsSync(join(base.pluginDir, "plugin.json"))).toBe(true);
    // Links are removed without following them into the account.
    expect(existsSync(join(account, "auth.json"))).toBe(true);
  });

  it("does not restore signed-out credentials from a profile overlay copy", () => {
    const root = mkdtempSync(join(tmpdir(), "codex-logout-isolation-"));
    const home = join(root, "account");
    const overlay = join(root, "overlay");
    mkdirSync(home);
    mkdirSync(overlay);
    writeFileSync(join(overlay, "auth.json"), "stale credential");
    seedNativeCodexHome(overlay, home, { profileOverlay: true });
    expect(existsSync(join(home, "auth.json"))).toBe(false);
    expect(existsSync(join(overlay, "auth.json"))).toBe(false);
  });

  it("reads and watches only the selected WSL home", async () => {
    mocks.read.mockResolvedValue("");
    mocks.find.mockResolvedValue([]);
    const homes = ["/home/user/profiles/work"];
    await readCodexSessionIndexForLocationAsync(location, homes);
    expect(mocks.read.mock.calls.map((call) => call[1])).toEqual([
      `${homes[0]}/session_index.jsonl`,
    ]);
    await readCodexRolloutsForLocationAsync(location, homes);
    expect(mocks.find.mock.calls.map((call) => call[1].root)).toEqual([`${homes[0]}/sessions`]);
    expect(resolveCodexSessionWatchPaths(location, homes)).toEqual([`${homes[0]}/sessions`]);
  });
});
