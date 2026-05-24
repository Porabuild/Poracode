import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getCursorPluginPaths, installCursorPlugin, mergeCursorHooksDocument } from "./install";

const tempDirs: string[] = [];

function makeTempDir(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `lightcode-cursor-${label}-`));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("getCursorPluginPaths", () => {
  it("returns the staging dir under Lightcode's plugin tree", () => {
    const baseDir = makeTempDir("paths");
    const paths = getCursorPluginPaths({ envKind: "posix", baseDir });

    expect(paths.pluginDir).toBe(join(baseDir, "agent-plugins", "cursor"));
    expect(paths.globalHooksPath.endsWith("hooks.json")).toBe(true);
  });
});

describe("mergeCursorHooksDocument", () => {
  it("renders entries for all five lifecycle events with version 1", () => {
    const head = '"/home/demo/.lightcode/agent-plugins/cursor/lightcode-hook.sh"';
    const merged = mergeCursorHooksDocument(null, head);

    expect(merged.version).toBe(1);
    expect(Object.keys(merged.hooks).sort()).toEqual(
      ["beforeSubmitPrompt", "postToolUse", "preToolUse", "sessionStart", "stop"].sort(),
    );

    const sessionStart = merged.hooks.sessionStart?.[0] as Record<string, unknown> | undefined;
    expect(sessionStart).toMatchObject({
      type: "command",
      command: `${head} sessionStart`,
      timeout: 5,
    });
    expect(sessionStart?.matcher).toBeUndefined();

    const preToolUse = merged.hooks.preToolUse?.[0] as Record<string, unknown> | undefined;
    expect(preToolUse).toMatchObject({
      type: "command",
      matcher: "*",
      command: `${head} preToolUse`,
      timeout: 5,
    });
    expect((merged.hooks.postToolUse?.[0] as { matcher?: string })?.matcher).toBe("*");
  });

  it("preserves user-defined entries while replacing stale Lightcode entries", () => {
    const userEntry = { type: "command", command: "/usr/local/bin/my-policy.sh" };
    const staleHead = '"/home/demo/.lightcode/agent-plugins/cursor/lightcode-hook.sh"';
    const existing = {
      version: 1,
      hooks: {
        sessionStart: [
          userEntry,
          { type: "command", command: `${staleHead} sessionStart`, timeout: 5 },
        ],
      },
    };

    const newHead = '"/home/demo/.lightcode/agent-plugins/cursor/forward.mjs-NEW"';
    const merged = mergeCursorHooksDocument(existing, newHead);

    const sessionStart = merged.hooks.sessionStart as Array<Record<string, unknown>>;
    expect(sessionStart).toHaveLength(2);
    expect(sessionStart[0]).toEqual(userEntry);
    expect(sessionStart[1]).toMatchObject({ command: `${newHead} sessionStart` });
  });
});

describe("installCursorPlugin", () => {
  it("stages assets and merges entries into the global Cursor hooks.json", async () => {
    const baseDir = makeTempDir("install");
    const globalCursorDirOverride = makeTempDir("cursor-home");

    const result = installCursorPlugin({ envKind: "posix", baseDir }, { globalCursorDirOverride });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(existsSync(join(result.paths.pluginDir, "plugin.json"))).toBe(true);
    expect(existsSync(join(result.paths.pluginDir, "forward.mjs"))).toBe(true);
    expect(existsSync(join(result.paths.pluginDir, "lightcode-hook-runtime.mjs"))).toBe(true);
    expect(result.paths.globalHooksPath).toBe(join(globalCursorDirOverride, "hooks.json"));
    expect(existsSync(result.paths.globalHooksPath)).toBe(true);

    const installed = await isCursorPluginInstalledForTest(baseDir, globalCursorDirOverride);
    expect(installed).toMatchObject({ installed: true, version: "1.0.4" });

    const doc = JSON.parse(readFileSync(result.paths.globalHooksPath, "utf8")) as {
      version: number;
      hooks: Record<string, Array<{ command: string }>>;
    };
    expect(doc.version).toBe(1);
    expect(doc.hooks.sessionStart?.[0]?.command).toMatch(
      /agent-plugins[\\/]+cursor[\\/]+lightcode-hook\.(?:sh|cmd|ps1)['"]? sessionStart$/,
    );
  });

  // Cursor's hook runner mangles `pwsh.exe`-containing commands into a
  // PowerShell here-string pipeline that bash/sh can't parse. The Cursor
  // adapter must route through the `cmd.exe`-invoked `.cmd` wrapper
  // instead — see installCursorPlugin in plugin/install.ts.
  const isWindows = process.platform === "win32";
  it.skipIf(!isWindows)("writes a pwsh-free `cmd.exe /d /s /c call` command on Windows", () => {
    const baseDir = makeTempDir("install-windows-shape");
    const globalCursorDirOverride = makeTempDir("cursor-home-windows-shape");
    const result = installCursorPlugin({ envKind: "posix", baseDir }, { globalCursorDirOverride });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const doc = JSON.parse(readFileSync(result.paths.globalHooksPath, "utf8")) as {
      hooks: Record<string, Array<{ command: string }>>;
    };
    const command = doc.hooks.sessionStart?.[0]?.command ?? "";
    expect(command).toMatch(/^cmd\.exe \/d \/s \/c call "/);
    expect(command).not.toMatch(/pwsh|powershell/i);
  });

  it.skipIf(isWindows)("writes a bare wrapper path on POSIX", () => {
    const baseDir = makeTempDir("install-posix-shape");
    const globalCursorDirOverride = makeTempDir("cursor-home-posix-shape");
    const result = installCursorPlugin({ envKind: "posix", baseDir }, { globalCursorDirOverride });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const doc = JSON.parse(readFileSync(result.paths.globalHooksPath, "utf8")) as {
      hooks: Record<string, Array<{ command: string }>>;
    };
    expect(doc.hooks.sessionStart?.[0]?.command ?? "").not.toMatch(/^cmd\.exe/);
  });

  it("preserves user-authored entries during a re-install", () => {
    const baseDir = makeTempDir("install-merge");
    const globalCursorDirOverride = makeTempDir("cursor-home-merge");

    // First install seeds our entry.
    const first = installCursorPlugin({ envKind: "posix", baseDir }, { globalCursorDirOverride });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // User adds a non-Lightcode hook between installs.
    const docPath = first.paths.globalHooksPath;
    const docBefore = JSON.parse(readFileSync(docPath, "utf8")) as {
      version: number;
      hooks: Record<string, unknown[]>;
    };
    docBefore.hooks.sessionStart = [
      { type: "command", command: "/usr/local/bin/audit.sh" },
      ...(docBefore.hooks.sessionStart as unknown[]),
    ];
    writeFileSync(docPath, `${JSON.stringify(docBefore, null, 2)}\n`);

    // Re-install must keep the user's audit.sh and replace ours in place.
    const second = installCursorPlugin({ envKind: "posix", baseDir }, { globalCursorDirOverride });
    expect(second.ok).toBe(true);

    const doc = JSON.parse(readFileSync(docPath, "utf8")) as {
      hooks: Record<string, Array<Record<string, unknown>>>;
    };
    const sessionStart = doc.hooks.sessionStart!;
    expect(sessionStart).toHaveLength(2);
    expect(sessionStart[0]).toEqual({ type: "command", command: "/usr/local/bin/audit.sh" });
    expect(sessionStart[1]?.command).toMatch(/lightcode-hook\.(?:sh|cmd|ps1)['"]? sessionStart$/);
  });

  it("regenerates a zero-filled hooks.json", () => {
    const baseDir = makeTempDir("install-zero-filled");
    const globalCursorDirOverride = makeTempDir("cursor-home-zero-filled");
    const hooksPath = join(globalCursorDirOverride, "hooks.json");
    writeFileSync(hooksPath, Buffer.alloc(64));

    const result = installCursorPlugin({ envKind: "posix", baseDir }, { globalCursorDirOverride });

    expect(result.ok).toBe(true);
    const doc = JSON.parse(readFileSync(hooksPath, "utf8")) as {
      hooks: Record<string, Array<Record<string, unknown>>>;
    };
    expect(doc.hooks.sessionStart?.[0]?.command).toMatch(/lightcode-hook\.(?:sh|cmd|ps1)/);
  });
});

// `isCursorPluginInstalled` always inspects the system `~/.cursor/hooks.json`,
// so tests that need to verify against a temp override re-implement the
// equivalent check inline rather than mutating real user state.
async function isCursorPluginInstalledForTest(
  baseDir: string,
  globalCursorDir: string,
): Promise<{ installed: boolean; version?: string }> {
  const pluginDir = join(baseDir, "agent-plugins", "cursor");
  const hooksPath = join(globalCursorDir, "hooks.json");
  if (!existsSync(join(pluginDir, "plugin.json"))) return { installed: false };
  if (!existsSync(join(pluginDir, "forward.mjs"))) return { installed: false };
  if (!existsSync(join(pluginDir, "lightcode-hook-runtime.mjs"))) return { installed: false };
  if (!existsSync(hooksPath)) return { installed: false };
  const doc = JSON.parse(readFileSync(hooksPath, "utf8")) as { hooks?: Record<string, unknown> };
  if (!doc.hooks) return { installed: false };
  const manifest = JSON.parse(readFileSync(join(pluginDir, "plugin.json"), "utf8")) as {
    version: string;
  };
  return { installed: true, version: manifest.version };
}
