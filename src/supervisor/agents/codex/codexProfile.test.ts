import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import type { WslBridgeClient } from "../../wsl/bridge/client";

const ensureWslDirectory = vi.hoisted(() =>
  vi.fn<(distro: string, path: string) => Promise<void>>(async () => {}),
);

vi.mock("../plugin/installerBase", async (original) => ({
  ...(await original<typeof import("../plugin/installerBase")>()),
  ensureWslDirectory,
}));

// These tests only exercise env plumbing. Skip the real `~/.codex/sessions`
// walk and the `codex --version` probe, both of which flake under parallel
// load (a large session store, an 8s exec timeout) and prove nothing here.
vi.mock("node:os", async (original) => {
  const actual = await original<typeof import("node:os")>();
  const { mkdtempSync: makeTemp } = await import("node:fs");
  const { join } = await import("node:path");
  const home = makeTemp(join(actual.tmpdir(), "codex-profile-test-home-"));
  return { ...actual, homedir: () => home };
});
vi.mock("./plugin/install", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./plugin/install")>();
  return {
    ...actual,
    isCodexSemverSupportedForGoals: () => true,
    probeCodexCliSemver: () => [999, 0, 0] as [number, number, number],
    codexHooksFeatureFlagForSemver: () => "hooks",
  };
});
vi.mock("./sessionFiles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./sessionFiles")>();
  return { ...actual, readCodexSessionIndex: () => [] };
});

import { getCodexPluginPaths } from "./plugin/install";
import { createCodexAdapter, createCodexProfileAdapter } from "./index";
import { codexTerminalAuthMethod } from "./detection";
import { codexAppServerPoolKey } from "./serverPool";
import { buildCodexAppServerCommand } from "./argv";
import { createCodexProfileContext } from "./profileContext";
import {
  clearExecutablePathCache,
  primeWslLaunchEnvironment,
  setWslProcessBridgeClient,
} from "../base";
import {
  readCodexRolloutsForLocation,
  readCodexSessionIndexForLocation,
  resolveCodexSessionWatchPaths,
} from "./session";

const projectLocation: ProjectLocation = { kind: "posix", path: "/repo" };

afterEach(() => {
  setWslProcessBridgeClient(undefined);
  clearExecutablePathCache();
  ensureWslDirectory.mockReset();
});

function workProfile() {
  return createCodexProfileAdapter({
    id: "work",
    driver: "codex",
    displayName: "Work",
    config: { homeDir: "~/.codex-work" },
  });
}

describe("createCodexProfileAdapter", () => {
  const expectedHome = path.join(homedir(), ".codex-work");

  it("creates a distinct Codex adapter backed by a separate CODEX_HOME", async () => {
    const adapter = workProfile();
    expect(adapter.kind).toBe("codex:work");
    expect(adapter.label).toBe("Codex Work");
    expect(adapter.binary).toBe("codex");

    expect(
      (await adapter.buildLaunchArgv(projectLocation, { model: "gpt-5.5" }, "hello")).env
        ?.CODEX_HOME,
    ).toBe(expectedHome);
    expect(
      (
        await adapter.buildResumeArgv?.(projectLocation, { model: "gpt-5.5" }, "hello", {
          providerSessionId: "thread-1",
          discoveredAt: "test",
        })
      )?.env?.CODEX_HOME,
    ).toBe(expectedHome);
    expect(
      (await adapter.buildOneShotCommand?.("gpt-5.5", undefined, "Summarize", projectLocation))?.env
        ?.CODEX_HOME,
    ).toBe(expectedHome);
  });

  it("logs out of the profile's CODEX_HOME, not the global one", async () => {
    const adapter = workProfile();
    const command = await adapter.buildAcpLogoutCommand?.({ envKind: "posix" });
    expect(command?.env?.CODEX_HOME).toBe(expectedHome);
    // On Windows the shared launch builder wraps the call in an encoded
    // PowerShell command, so decode before looking for the subcommand.
    const args = command?.args ?? [];
    const rendered = args.includes("-EncodedCommand")
      ? Buffer.from(args.at(-1) ?? "", "base64").toString("utf16le")
      : [command?.command ?? "", ...args].join(" ");
    expect(rendered).toMatch(/logout/);
  });

  it("leaves the base Codex adapter without a CODEX_HOME override", async () => {
    const adapter = createCodexAdapter();
    expect(adapter.kind).toBe("codex");
    // `buildResumeArgv` shapes the same argv as launch without the pre-spawn
    // snapshot of the real `~/.codex/sessions` tree.
    expect(
      (
        await adapter.buildResumeArgv?.(projectLocation, { model: "gpt-5.5" }, "hello", {
          providerSessionId: "thread-1",
          discoveredAt: "test",
        })
      )?.env?.CODEX_HOME,
    ).toBeUndefined();
    expect(
      (await adapter.buildOneShotCommand?.("gpt-5.5", undefined, "Summarize", projectLocation))?.env
        ?.CODEX_HOME,
    ).toBeUndefined();
  });

  it("stages the hook plugin under a per-profile CODEX_HOME overlay", async () => {
    const adapter = workProfile();
    const baseDir = mkdtempSync(path.join(tmpdir(), "codex-profile-overlay-"));
    const ctx = { envKind: "posix" as const, baseDir };
    const extras = await adapter.pluginLaunchExtras?.(ctx);
    expect(extras?.env?.CODEX_HOME).toBe(
      (await getCodexPluginPaths(ctx, { profileId: "work", sourceHomeDir: expectedHome }))
        .codexHomeDir,
    );
  });

  it("creates a missing profile home so Codex can start before the first login", async () => {
    const parent = mkdtempSync(path.join(tmpdir(), "poracode-codex-profile-new-"));
    const homeDir = path.join(parent, "fresh-home");
    const adapter = createCodexProfileAdapter({
      id: "fresh",
      driver: "codex",
      displayName: "Fresh",
      config: { homeDir },
    });
    expect(existsSync(homeDir)).toBe(false);
    const env = (
      await adapter.buildResumeArgv?.(projectLocation, { model: "gpt-5.5" }, "hello", {
        providerSessionId: "thread-1",
        discoveredAt: "test",
      })
    )?.env;
    expect(env?.CODEX_HOME).toBe(homeDir);
    expect(existsSync(homeDir)).toBe(true);
  });

  it("links the profile home into its overlay on every launch, not only at install", async () => {
    // A fresh profile has no auth.json until the user signs in later, so the
    // overlay must pick up state files that appear after the plugin install.
    const baseDir = mkdtempSync(path.join(tmpdir(), "poracode-codex-profile-base-"));
    const homeDir = mkdtempSync(path.join(tmpdir(), "poracode-codex-profile-home-"));
    mkdirSync(path.join(homeDir, "sessions"), { recursive: true });
    writeFileSync(path.join(homeDir, "auth.json"), "{}");
    const adapter = createCodexProfileAdapter({
      id: "late",
      driver: "codex",
      displayName: "Late",
      config: { homeDir },
    });

    const extras = await adapter.pluginLaunchExtras?.({ envKind: "posix", baseDir });
    const overlay = (
      await getCodexPluginPaths(
        { envKind: "posix", baseDir },
        { profileId: "late", sourceHomeDir: homeDir },
      )
    ).codexHomeDir;
    expect(extras?.env?.CODEX_HOME).toBe(overlay);
    expect(existsSync(path.join(overlay, "auth.json"))).toBe(true);
    expect(existsSync(path.join(overlay, "sessions"))).toBe(true);
  });

  it("does not offer hook plugins for WSL profiles", async () => {
    const adapter = workProfile();
    await expect(
      adapter.isPluginSupported?.({ envKind: "wsl", wslDistro: "Ubuntu" }),
    ).resolves.toBe(false);
  });
});

describe("codexTerminalAuthMethod", () => {
  it("carries the profile env so the login overlay targets the profile home", () => {
    expect(codexTerminalAuthMethod({ CODEX_HOME: "/home/demo/.codex-work" })).toMatchObject({
      type: "terminal",
      args: ["login"],
      env: { CODEX_HOME: "/home/demo/.codex-work" },
    });
    expect(codexTerminalAuthMethod(undefined)).not.toHaveProperty("env");
  });
});

describe("Codex app-server env plumbing", () => {
  it("forwards a CODEX_HOME override into the app-server spawn env", async () => {
    const command = await buildCodexAppServerCommand(projectLocation, {
      env: { CODEX_HOME: "/home/demo/.codex-work" },
    });
    expect(command.env?.CODEX_HOME).toBe("/home/demo/.codex-work");
  });

  it("emits env overrides through /usr/bin/env for WSL app-servers", async () => {
    const wsl: ProjectLocation = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/home/demo/repo",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\repo",
    };
    const command = await buildCodexAppServerCommand(wsl, {
      env: { CODEX_HOME: "/home/demo/.codex-work" },
    });
    expect(command.args).toContain("CODEX_HOME=/home/demo/.codex-work");
  });

  it("keys the shared app-server pool by env so profiles never share a server", async () => {
    const base = await codexAppServerPoolKey(projectLocation, []);
    const work = await codexAppServerPoolKey(projectLocation, [], undefined, undefined, {
      CODEX_HOME: "/home/demo/.codex-work",
    });
    const personal = await codexAppServerPoolKey(projectLocation, [], undefined, undefined, {
      CODEX_HOME: "/home/demo/.codex-personal",
    });
    expect(work).not.toBe(base);
    expect(work).not.toBe(personal);
    expect(
      await codexAppServerPoolKey(projectLocation, [], undefined, undefined, {
        CODEX_HOME: "/home/demo/.codex-work",
      }),
    ).toBe(work);
  });
});

describe("Codex WSL profile preparation", () => {
  it("awaits authoritative home resolution and worker mkdir before admitting profile env", async () => {
    const location: ProjectLocation = {
      kind: "wsl",
      distro: "ProfilePreparation",
      linuxPath: "/repo",
      uncPath: "\\\\wsl.localhost\\ProfilePreparation\\repo",
    };
    const homeProbe = Promise.withResolvers<{
      ok: true;
      stdout: string;
      stderr: string;
      exitCode: number;
    }>();
    const directoryStarted = Promise.withResolvers<void>();
    const directoryPrepared = Promise.withResolvers<void>();
    const processExec = vi.fn<WslBridgeClient["processExec"]>(async () => homeProbe.promise);
    setWslProcessBridgeClient({ processExec } as unknown as WslBridgeClient);
    ensureWslDirectory.mockImplementationOnce(async () => {
      directoryStarted.resolve();
      await directoryPrepared.promise;
    });
    const context = createCodexProfileContext({ profileId: "work", homeDir: "~/.codex-work" });
    let settled = false;
    const pending = context.profileEnv(location);
    void pending.then(() => {
      settled = true;
    });
    expect(processExec).toHaveBeenCalledOnce();
    expect(ensureWslDirectory).not.toHaveBeenCalled();
    expect(settled).toBe(false);

    homeProbe.resolve({
      ok: true,
      stdout: "__PORACODE_WSL_ENV__\n/bin/zsh\n/home/profile-user\n",
      stderr: "",
      exitCode: 0,
    });
    await directoryStarted.promise;
    expect(ensureWslDirectory).toHaveBeenCalledExactlyOnceWith(
      location.distro,
      "/home/profile-user/.codex-work",
    );
    expect(settled).toBe(false);
    directoryPrepared.resolve();
    await expect(pending).resolves.toEqual({
      CODEX_HOME: "/home/profile-user/.codex-work",
      OPENAI_API_KEY: "",
      CODEX_API_KEY: "",
      CODEX_ACCESS_TOKEN: "",
    });
  });

  it("refuses an unresolved WSL profile home without creating a guessed directory", async () => {
    const location: ProjectLocation = {
      kind: "wsl",
      distro: "ProfileMissingHome",
      linuxPath: "/repo",
      uncPath: "\\\\wsl.localhost\\ProfileMissingHome\\repo",
    };
    primeWslLaunchEnvironment(location.distro, { shellPath: "/bin/zsh", home: undefined });
    const context = createCodexProfileContext({ profileId: "work", homeDir: "~/.codex-work" });
    await expect(context.profileEnv(location)).rejects.toThrow(
      "Unable to resolve the Codex profile home",
    );
    expect(ensureWslDirectory).not.toHaveBeenCalled();
  });
});

describe("Codex session discovery with a profile home", () => {
  it("scans only the profile's homes instead of ~/.codex", () => {
    const homes = [path.join(homedir(), ".codex-work-does-not-exist")];
    const watch = resolveCodexSessionWatchPaths(projectLocation, homes);
    // Nothing exists yet, so nothing is watched — but ~/.codex must not leak in.
    expect(watch.every((p) => p.startsWith(homes[0]!))).toBe(true);
    expect(readCodexRolloutsForLocation(projectLocation, homes)).toEqual([]);
    expect(readCodexSessionIndexForLocation(projectLocation, homes)).toEqual([]);
  });
});

describe("Codex profile account isolation", () => {
  const blanked = { OPENAI_API_KEY: "", CODEX_API_KEY: "", CODEX_ACCESS_TOKEN: "" };
  const sessionRef = { providerSessionId: "thread-1", discoveredAt: "test" };

  it("blanks inherited host credentials on every profile launch lane", async () => {
    const adapter = workProfile();
    expect(
      (await adapter.buildLaunchArgv(projectLocation, { model: "gpt-5.5" }, "hi")).env,
    ).toMatchObject(blanked);
    expect(
      (await adapter.buildResumeArgv?.(projectLocation, { model: "gpt-5.5" }, "hi", sessionRef))
        ?.env,
    ).toMatchObject(blanked);
    expect(
      (await adapter.buildOneShotCommand?.("gpt-5.5", undefined, "Summarize", projectLocation))
        ?.env,
    ).toMatchObject(blanked);
    expect((await adapter.buildAcpLogoutCommand?.({ envKind: "posix" }))?.env).toMatchObject(
      blanked,
    );
  });

  it("leaves host credentials alone for the base account", async () => {
    const env = (
      await createCodexAdapter().buildResumeArgv?.(
        projectLocation,
        { model: "gpt-5.5" },
        "hi",
        sessionRef,
      )
    )?.env;
    expect(env ?? {}).not.toHaveProperty("OPENAI_API_KEY");
  });

  it("lists and installs a profile's global skills in its own CODEX_HOME", () => {
    const profileRoot = workProfile().skillSupport?.roots.find((root) => root.id === "codex");
    expect(profileRoot?.globalBasePath).toBe("~/.codex-work");
    const baseRoot = createCodexAdapter().skillSupport?.roots.find((root) => root.id === "codex");
    expect(baseRoot).not.toHaveProperty("globalBasePath");
  });

  it("resolves distinct login homes for profiles whose names slugify alike", async () => {
    // "Review Work 1" and "Review Work-1" allocate ids review-work-1 and
    // review-work-1-2; the default home is keyed by that id.
    const loginHome = async (id: string) => {
      const adapter = createCodexProfileAdapter({
        id,
        driver: "codex",
        displayName: id,
        config: { homeDir: `~/.poracode/codex-profiles/${id}` },
      });
      return (await adapter.buildAcpLogoutCommand?.({ envKind: "posix" }))?.env?.CODEX_HOME;
    };
    expect(await loginHome("review-work-1")).toBe(
      path.join(homedir(), ".poracode", "codex-profiles", "review-work-1"),
    );
    expect(await loginHome("review-work-1-2")).toBe(
      path.join(homedir(), ".poracode", "codex-profiles", "review-work-1-2"),
    );
  });
});
