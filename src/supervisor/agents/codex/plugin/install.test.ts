import { mkdtempSync } from "node:fs";
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
} from "./install";
import { buildNativeHookCommandHead } from "../../plugin/installerBase";

const forwardPath = "C:\\Users\\demo\\.poracode\\agent-plugins\\codex\\forward.mjs";
const forwardPathUnix = "/home/demo/.poracode/agent-plugins/codex/forward.mjs";

/**
 * Test helpers build a `commandHead` matching one of the two shapes
 * `mergeCodexHooksDocument` accepts: WSL (`<node-path> <forward-mjs-path>`)
 * or native (`<wrapper-path>`). The merger doesn't care which shape it
 * gets — it just appends ` <event>`.
 */
function wslCommandHead(fp: string): string {
  return `${JSON.stringify("/home/demo/.nvm/versions/node/v22.11.0/bin/node")} ${JSON.stringify(fp)}`;
}

function nativeCommandHead(wrapperPath: string): string {
  return buildNativeHookCommandHead(wrapperPath);
}

function commandFor(head: string, event: string): string {
  return `${head} ${event}`;
}

const originalPlatform = process.platform;

beforeEach(() => {
  mockExecFileSync.mockReset();
});

afterEach(() => {
  Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
});

describe("getCodexPluginPaths", () => {
  it("places Codex hooks under Poracode's private CODEX_HOME", () => {
    const baseDir = mkdtempSync(join(tmpdir(), "lightcode-codex-paths-"));
    const paths = getCodexPluginPaths({ envKind: "posix", baseDir });

    expect(paths.pluginDir).toBe(join(baseDir, "agent-plugins", "codex"));
    expect(paths.codexHomeDir).toBe(join(baseDir, "agent-plugins", "codex", "home"));
    expect(paths.codexHooksPath).toBe(
      join(baseDir, "agent-plugins", "codex", "home", "hooks.json"),
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

describe("mergeCodexHooksDocument", () => {
  it("creates only Poracode entries when hooks.json was absent (WSL shape)", () => {
    const head = wslCommandHead(forwardPath);
    const doc = mergeCodexHooksDocument(null, head);
    expect(Object.keys(doc.hooks)).toEqual([
      "SessionStart",
      "UserPromptSubmit",
      "PreToolUse",
      "PostToolUse",
      "PermissionRequest",
      "Stop",
    ]);
    const stop = doc.hooks.Stop as unknown[];
    expect(stop).toHaveLength(1);
    const stopHook = (stop[0] as { hooks: { command: string }[] }).hooks[0];
    expect(stopHook?.command).toBe(commandFor(head, "Stop"));
  });

  it("preserves user matcher groups and appends Poracode", () => {
    const head = wslCommandHead(forwardPath);
    const userGroup = {
      matcher: "*",
      hooks: [{ type: "command", command: "node user-script.js" }],
    };
    const existing = {
      hooks: {
        Stop: [userGroup],
        SessionStart: [],
      },
    };
    const doc = mergeCodexHooksDocument(existing, head);
    const stop = doc.hooks.Stop as unknown[];
    expect(stop).toHaveLength(2);
    expect(stop[0]).toEqual(userGroup);
    const lc = (stop[1] as { hooks: { command: string }[] }).hooks[0];
    expect(lc?.command).toBe(commandFor(head, "Stop"));
  });

  it("prunes stale Poracode groups by forward.mjs path fingerprint and replaces", () => {
    const head = wslCommandHead(forwardPath);
    const stale = {
      hooks: [
        {
          type: "command",
          command: `node "C:\\old\\.poracode\\agent-plugins\\codex\\forward.mjs" Stop`,
        },
      ],
    };
    const existing = { hooks: { Stop: [stale] } };
    const doc = mergeCodexHooksDocument(existing, head);
    const stop = doc.hooks.Stop as unknown[];
    expect(stop).toHaveLength(1);
    const h = (stop[0] as { hooks: { command: string }[] }).hooks[0];
    expect(h?.command).toBe(commandFor(head, "Stop"));
  });

  it("prunes stale Poracode groups by native wrapper fingerprint", () => {
    const head = nativeCommandHead(
      "C:\\Users\\demo\\.poracode\\agent-plugins\\codex\\lightcode-hook.cmd",
    );
    const stale = {
      hooks: [
        {
          type: "command",
          command: `"C:\\old\\.poracode\\agent-plugins\\codex\\lightcode-hook.cmd" Stop`,
        },
      ],
    };
    const existing = { hooks: { Stop: [stale] } };
    const doc = mergeCodexHooksDocument(existing, head);
    const stop = doc.hooks.Stop as unknown[];
    expect(stop).toHaveLength(1);
    const h = (stop[0] as { hooks: { command: string }[] }).hooks[0];
    expect(h?.command).toBe(commandFor(head, "Stop"));
  });

  it("is idempotent when re-run with the same command head", () => {
    const head = wslCommandHead(forwardPathUnix);
    const first = mergeCodexHooksDocument(null, head);
    const second = mergeCodexHooksDocument(first, head);
    expect(second).toEqual(first);
  });

  it("is idempotent when re-run with the same Windows forward path", () => {
    const first = mergeCodexHooksDocument(null, forwardPath);
    const second = mergeCodexHooksDocument(first, forwardPath);
    expect(second).toEqual(first);
  });

  it("uses matcher only for SessionStart, PreToolUse, PostToolUse", () => {
    const doc = mergeCodexHooksDocument(null, forwardPath);
    expect((doc.hooks.SessionStart as { matcher?: string }[])[0]).toMatchObject({
      matcher: "*",
    });
    expect((doc.hooks.UserPromptSubmit as { matcher?: string }[])[0]?.matcher).toBeUndefined();
    expect((doc.hooks.PermissionRequest as { matcher?: string }[])[0]?.matcher).toBeUndefined();
    expect((doc.hooks.Stop as { matcher?: string }[])[0]?.matcher).toBeUndefined();
  });
});
