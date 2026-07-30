import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockExecFileSync = vi.hoisted(() =>
  vi.fn<(command: string, args?: string[], options?: Record<string, unknown>) => string | Buffer>(),
);

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    execFileSync: mockExecFileSync,
  };
});

import {
  codexHooksFeatureFlagForSemver,
  getCodexPluginPaths,
  isCodexSemverSupportedForGoals,
  isCodexSemverSupportedForHooks,
  mergeCodexHooksDocument,
  parseCodexVersionLine,
  probeCodexCliSemver,
  removeManagedCodexHooksDocument,
  resolveCodexHooksPath,
  uninstallCodexPlugin,
} from "./install";

const originalPlatform = process.platform;
const originalCodexHome = process.env.CODEX_HOME;

beforeEach(() => {
  mockExecFileSync.mockReset();
});

afterEach(() => {
  Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  if (originalCodexHome === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = originalCodexHome;
});

describe("getCodexPluginPaths", () => {
  it("stages hook runtime assets outside CODEX_HOME", () => {
    const baseDir = mkdtempSync(join(tmpdir(), "poracode-codex-paths-"));
    const paths = getCodexPluginPaths({ envKind: "posix", baseDir });

    expect(paths.pluginDir).toBe(join(baseDir, "agent-plugins", "codex"));
    expect(paths.forwardPath).toBe(join(baseDir, "agent-plugins", "codex", "forward.mjs"));
    expect(paths.nativeWrapperPath).toBe(
      join(
        baseDir,
        "agent-plugins",
        "codex",
        process.platform === "win32" ? "poracode-hook.cmd" : "poracode-hook.sh",
      ),
    );
  });

  it("uses inherited CODEX_HOME for base native hooks and profile home when selected", async () => {
    const inheritedHome = mkdtempSync(join(tmpdir(), "poracode-codex-inherited-"));
    const profileHome = mkdtempSync(join(tmpdir(), "poracode-codex-profile-"));
    process.env.CODEX_HOME = inheritedHome;

    await expect(resolveCodexHooksPath({ envKind: "posix" })).resolves.toBe(
      join(inheritedHome, "hooks.json"),
    );
    await expect(resolveCodexHooksPath({ envKind: "posix" }, profileHome)).resolves.toBe(
      join(profileHome, "hooks.json"),
    );
  });
});

describe("probeCodexCliSemver", () => {
  it("does not use shell:true for Windows version probes", () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    mockExecFileSync.mockReturnValue("codex-cli 0.130.0");

    expect(probeCodexCliSemver()).toEqual([0, 130, 0]);

    const options = mockExecFileSync.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(options).toMatchObject({
      encoding: "utf8",
      timeout: 8000,
      windowsHide: true,
    });
    expect(options).not.toHaveProperty("shell");
  });
});

describe("parseCodexVersionLine + isCodexSemverSupportedForHooks", () => {
  it("parses codex-cli semver lines", () => {
    expect(parseCodexVersionLine("codex-cli 0.122.0")).toEqual([0, 122, 0]);
    expect(parseCodexVersionLine("codex-cli 0.121.99")).toEqual([0, 121, 99]);
    expect(parseCodexVersionLine("  codex-cli 1.0.0  ")).toEqual([1, 0, 0]);
  });

  it("returns null for unexpected output", () => {
    expect(parseCodexVersionLine("codex 0.122.0")).toBeNull();
    expect(parseCodexVersionLine("")).toBeNull();
  });

  it("gates hooks support at 0.122.0", () => {
    expect(isCodexSemverSupportedForHooks([0, 121, 0])).toBe(false);
    expect(isCodexSemverSupportedForHooks([0, 121, 99])).toBe(false);
    expect(isCodexSemverSupportedForHooks([0, 122, 0])).toBe(true);
    expect(isCodexSemverSupportedForHooks([0, 123, 0])).toBe(true);
    expect(isCodexSemverSupportedForHooks(null)).toBe(false);
  });

  it("uses the renamed hooks feature flag from 0.130.0 onward", () => {
    expect(codexHooksFeatureFlagForSemver([0, 129, 99])).toBe("codex_hooks");
    expect(codexHooksFeatureFlagForSemver([0, 130, 0])).toBe("hooks");
    expect(codexHooksFeatureFlagForSemver([0, 131, 0])).toBe("hooks");
    expect(codexHooksFeatureFlagForSemver([1, 0, 0])).toBe("hooks");
    expect(codexHooksFeatureFlagForSemver(null)).toBe("codex_hooks");
  });

  it("gates the goals feature flag at 0.130.0", () => {
    expect(isCodexSemverSupportedForGoals([0, 129, 99])).toBe(false);
    expect(isCodexSemverSupportedForGoals([0, 130, 0])).toBe(true);
    expect(isCodexSemverSupportedForGoals([1, 0, 0])).toBe(true);
    expect(isCodexSemverSupportedForGoals(null)).toBe(false);
  });
});

describe("Codex hooks document management", () => {
  const commandHead = '"C:\\Users\\demo\\.poracode\\agent-plugins\\codex\\poracode-hook.cmd"';

  it("preserves user hooks and unrelated top-level fields while adding Poracode", () => {
    const userGroup = { hooks: [{ type: "command", command: "node user-hook.js" }] };
    const existing = { version: 1, hooks: { Stop: [userGroup] } };

    const merged = mergeCodexHooksDocument(existing, commandHead);

    expect(merged.version).toBe(1);
    expect(merged.hooks.Stop?.[0]).toEqual(userGroup);
    expect(merged.hooks.Stop?.[1]).toEqual({
      hooks: [{ type: "command", command: `${commandHead} Stop` }],
    });
    expect(merged.hooks.SessionStart?.[0]).toMatchObject({ matcher: "*" });
  });

  it("replaces stale managed hooks without duplicating them", () => {
    const first = mergeCodexHooksDocument({}, commandHead);
    const second = mergeCodexHooksDocument(first, commandHead);

    expect(second).toEqual(first);
    expect(second.hooks.Stop).toHaveLength(1);
  });

  it("removes only managed hooks and preserves user hooks in the same group", () => {
    const mixedGroup = {
      matcher: "*",
      hooks: [
        { type: "command", command: "node user-hook.js" },
        { type: "command", command: `${commandHead} Stop` },
      ],
    };
    const existing = {
      version: 1,
      hooks: { Stop: [mixedGroup], Custom: [{ hooks: [{ command: "custom" }] }] },
    };

    const removed = removeManagedCodexHooksDocument(existing);

    expect(removed.version).toBe(1);
    expect(removed.hooks.Stop).toEqual([
      { matcher: "*", hooks: [{ type: "command", command: "node user-hook.js" }] },
    ]);
    expect(removed.hooks.Custom).toEqual(existing.hooks.Custom);
  });

  it("uninstalls managed hooks from only the selected profile home", async () => {
    const baseHome = mkdtempSync(join(tmpdir(), "poracode-codex-base-hooks-"));
    const profileHome = mkdtempSync(join(tmpdir(), "poracode-codex-profile-hooks-"));
    process.env.CODEX_HOME = baseHome;
    const baseHooks = mergeCodexHooksDocument({}, commandHead);
    const profileHooks = mergeCodexHooksDocument({}, commandHead);
    writeFileSync(join(baseHome, "hooks.json"), JSON.stringify(baseHooks));
    writeFileSync(join(profileHome, "hooks.json"), JSON.stringify(profileHooks));

    try {
      await uninstallCodexPlugin({ envKind: "posix" }, profileHome);

      expect(JSON.parse(readFileSync(join(baseHome, "hooks.json"), "utf8"))).toEqual(baseHooks);
      expect(
        JSON.parse(readFileSync(join(profileHome, "hooks.json"), "utf8")) as {
          hooks: Record<string, unknown>;
        },
      ).toEqual({ hooks: {} });
    } finally {
      rmSync(baseHome, { force: true, recursive: true });
      rmSync(profileHome, { force: true, recursive: true });
    }
  });
});
