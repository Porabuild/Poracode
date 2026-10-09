import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HostPort, UsageSnapshot } from "@poracode/agents-usage";
import type { ProjectLocation } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { defaultSharedSettings } from "@/shared/settings";

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
import { createCodexUsageProfileSource } from "./codexUsageProfiles";
import { UsageService } from "../../runtime/usageService";
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
  it("changes the hook overlay when an existing profile selects a different home", async () => {
    const baseDir = mkdtempSync(join(tmpdir(), "codex-overlay-isolation-"));
    const ctx = { envKind: "posix" as const, baseDir };
    const first = await getCodexPluginPaths(ctx, {
      profileId: "work",
      sourceHomeDir: join(baseDir, "first"),
    });
    const second = await getCodexPluginPaths(ctx, {
      profileId: "work",
      sourceHomeDir: join(baseDir, "second"),
    });
    expect(first.codexHomeDir).not.toBe(second.codexHomeDir);
  });

  it("uninstalls only the selected profile hooks", async () => {
    const baseDir = mkdtempSync(join(tmpdir(), "codex-uninstall-isolation-"));
    const ctx = { envKind: "posix" as const, baseDir };
    const overlay = { profileId: "work", sourceHomeDir: join(baseDir, "account") };
    const paths = await getCodexPluginPaths(ctx, overlay);
    const base = await getCodexPluginPaths(ctx);
    mkdirSync(paths.codexHomeDir, { recursive: true });
    mkdirSync(base.codexHomeDir, { recursive: true });
    writeFileSync(paths.codexHooksPath, "{}");
    writeFileSync(base.codexHooksPath, "{}");
    await uninstallCodexPlugin(ctx, overlay);
    expect(existsSync(paths.codexHooksPath)).toBe(false);
    expect(existsSync(base.codexHooksPath)).toBe(true);
  });

  it("removes the whole staged plugin dir when the base account uninstalls without profiles", async () => {
    const baseDir = mkdtempSync(join(tmpdir(), "codex-base-uninstall-"));
    const ctx = { envKind: "posix" as const, baseDir };
    const base = await getCodexPluginPaths(ctx);
    mkdirSync(base.codexHomeDir, { recursive: true });
    writeFileSync(join(base.pluginDir, "plugin.json"), "{}");
    writeFileSync(base.codexHooksPath, "{}");
    await uninstallCodexPlugin(ctx);
    expect(existsSync(base.pluginDir)).toBe(false);
  });

  it("removes the base account's home but keeps assets profiles still run from", async () => {
    const baseDir = mkdtempSync(join(tmpdir(), "codex-base-uninstall-profiles-"));
    const ctx = { envKind: "posix" as const, baseDir };
    const account = join(baseDir, "account");
    mkdirSync(account);
    writeFileSync(join(account, "auth.json"), "{}");
    const base = await getCodexPluginPaths(ctx);
    const profile = await getCodexPluginPaths(ctx, { profileId: "work", sourceHomeDir: account });
    mkdirSync(base.codexHomeDir, { recursive: true });
    mkdirSync(profile.codexHomeDir, { recursive: true });
    writeFileSync(join(base.pluginDir, "plugin.json"), "{}");
    writeFileSync(base.codexHooksPath, "{}");
    writeFileSync(profile.codexHooksPath, "{}");
    symlinkSync(join(account, "auth.json"), join(base.codexHomeDir, "auth.json"));

    await uninstallCodexPlugin(ctx);
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

describe("Codex profile usage cache custody", () => {
  const directories: string[] = [];
  afterEach(() => {
    for (const directory of directories.splice(0))
      rmSync(directory, { recursive: true, force: true });
  });

  it.each([false, true])(
    "invalidates previously cached quota on login replacement and logout (stored identity: %s)",
    async (storedIdentity) => {
      const root = mkdtempSync(join(tmpdir(), "codex-usage-cache-isolation-"));
      directories.push(root);
      const homeDir = join(root, "account");
      mkdirSync(homeDir);
      const authPath = join(homeDir, "auth.json");
      const writeAuth = (token: string) =>
        writeFileSync(authPath, JSON.stringify({ tokens: { access_token: token } }));
      const settings = {
        ...defaultSharedSettings,
        agentInstances: {
          work: { id: "work", driver: "codex", config: { homeDir } },
        },
      };
      const now = 1_700_000_000_000;
      const getOAuthToken = vi.fn<HostPort["credentials"]["getOAuthToken"]>(async () => ({
        accessToken: "host-account-token",
      }));
      const request = vi.fn<HostPort["http"]["request"]>(async () => ({
        status: 200,
        headers: {},
        body: JSON.stringify({
          rate_limit: { primary_window: { used_percent: 7, reset_at: now / 1000 + 600 } },
        }),
      }));
      const host: HostPort = {
        now: () => now,
        credentials: { getOAuthToken, getSecret: async () => undefined },
        http: { request },
      };
      writeAuth("old-account-token");
      const identity =
        await createCodexUsageProfileSource(settings).collectors[0]?.cacheIdentity?.(host);
      expect(identity).toBeDefined();
      const cached: UsageSnapshot = {
        providerId: "codex:work",
        status: "ok",
        fetchedAt: now,
        windows: [{ id: "session-5h", label: "Session", usedPercent: 25 }],
      };
      const cachePath = join(root, "usage.json");
      const settingsPath = join(root, "settings.json");
      writeFileSync(
        cachePath,
        JSON.stringify({
          version: 10,
          snapshots: [cached],
          ...(storedIdentity ? { profileIdentities: { "codex:work": identity } } : {}),
        }),
      );
      writeFileSync(settingsPath, JSON.stringify(settings));
      writeAuth("new-account-token");
      const emit = vi.fn<(event: SupervisorEvent) => void>();
      const service = new UsageService({
        cachePath,
        settingsPath,
        host,
        emit,
        providerIds: ["codex:work"],
        localCollectors: [],
        profileSources: (currentSettings) => [createCodexUsageProfileSource(currentSettings)],
      });
      try {
        expect((await service.getProviderUsage({})).snapshots).toEqual([]);
        const refreshed = await service.refreshProviderUsage({});
        expect(refreshed.snapshots[0]?.windows[0]?.usedPercent).toBe(7);
        expect(request).toHaveBeenCalledOnce();
        expect(request.mock.calls[0]?.[0].headers?.Authorization).toBe("Bearer new-account-token");
        const persisted = readFileSync(cachePath, "utf8");
        expect(persisted).not.toContain("old-account-token");
        expect(persisted).not.toContain("new-account-token");
        expect(persisted).not.toContain(homeDir);

        rmSync(authPath);
        await service.reconcileProfileSources();
        expect(emit).toHaveBeenLastCalledWith({ type: "provider-usage-all", snapshots: [] });
        expect(JSON.parse(readFileSync(cachePath, "utf8")).snapshots).toEqual([]);
        expect(request).toHaveBeenCalledOnce();
        expect(getOAuthToken).not.toHaveBeenCalled();
      } finally {
        service.stop();
      }
    },
  );
});
