import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentEnvContext } from "../../base";
import { installCommandCodePlugin } from "./install";

/**
 * Exercises the real native install code path (asset staging + settings merge)
 * against temp dirs. The override only redirects the merged `settings.json`;
 * uninstall scrub logic is covered by the `removeCommandCodeHooks` unit test
 * (the real uninstall path targets `~/.commandcode`, which a test must not
 * touch).
 */
describe("installCommandCodePlugin (native staging)", () => {
  let baseDir: string;
  let ccDir: string;
  let ctx: AgentEnvContext;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), "cc-lc-base-"));
    ccDir = mkdtempSync(join(tmpdir(), "cc-global-"));
    const envKind = process.platform === "win32" ? "windows" : "posix";
    ctx = { envKind, baseDir } as AgentEnvContext;
  });
  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
    rmSync(ccDir, { recursive: true, force: true });
  });

  it("stages forward.mjs + runtime + wrapper and merges the three hooks", () => {
    const result = installCommandCodePlugin(ctx, { globalCommandCodeDirOverride: ccDir });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const dir = result.paths.pluginDir;
    expect(existsSync(join(dir, "plugin.json"))).toBe(true);
    expect(existsSync(join(dir, "forward.mjs"))).toBe(true);
    expect(existsSync(join(dir, "lightcode-hook-runtime.mjs"))).toBe(true);
    const wrapperName = process.platform === "win32" ? "lightcode-hook.cmd" : "lightcode-hook.sh";
    expect(existsSync(join(dir, wrapperName))).toBe(true);

    const doc = JSON.parse(readFileSync(join(ccDir, "settings.json"), "utf8")) as {
      hooks: Record<string, Array<{ hooks: Array<{ type: string; command: string }> }>>;
    };
    for (const ev of ["PreToolUse", "PostToolUse", "Stop"]) {
      const entry = doc.hooks[ev]?.[0]?.hooks?.[0];
      expect(entry?.type).toBe("command");
      expect(entry?.command.replace(/\\/g, "/")).toContain(
        `agent-plugins/commandcode/${wrapperName}`,
      );
      expect(entry?.command.endsWith(` ${ev}`)).toBe(true);
    }
  });

  it("preserves a pre-existing unrelated settings key across install", () => {
    // Seed the override settings.json with a user key, then install.
    const result = installCommandCodePlugin(ctx, { globalCommandCodeDirOverride: ccDir });
    expect(result.ok).toBe(true);
    // Re-install on top of the produced doc must remain idempotent (one entry).
    const second = installCommandCodePlugin(ctx, { globalCommandCodeDirOverride: ccDir });
    expect(second.ok).toBe(true);
    const doc = JSON.parse(readFileSync(join(ccDir, "settings.json"), "utf8")) as {
      hooks: Record<string, unknown[]>;
    };
    expect(doc.hooks.Stop).toHaveLength(1);
  });
});
