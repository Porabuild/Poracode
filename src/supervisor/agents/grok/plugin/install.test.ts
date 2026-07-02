import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { grokIntentFor } from "./intentMap";
import {
  GLOBAL_HOOK_DIR_NAME,
  GLOBAL_HOOK_FILENAME,
  GROK_HOOK_EVENTS,
  getGrokPluginPaths,
  installGrokPlugin,
  isGrokPluginInstalled,
  renderGrokHookConfig,
} from "./install";

describe("grokIntentFor", () => {
  it("maps Grok's registered lifecycle events to Poracode intents", () => {
    expect(grokIntentFor("SessionStart", undefined)).toBe("session.started");
    expect(grokIntentFor("UserPromptSubmit", undefined)).toBe("session.turn_started");
    expect(grokIntentFor("Stop", undefined)).toBe("session.turn_finished");
  });

  it("accepts the snake_case form from the stdin payload's hookEventName", () => {
    expect(grokIntentFor("", { hookEventName: "session_start" })).toBe("session.started");
    expect(grokIntentFor("", { hookEventName: "user_prompt_submit" })).toBe("session.turn_started");
    expect(grokIntentFor("", { hookEventName: "stop" })).toBe("session.turn_finished");
  });

  it("maps Notification → needs_approval only when the payload signals approval", () => {
    expect(grokIntentFor("Notification", { type: "permissionRequest" })).toBe(
      "session.needs_approval",
    );
    expect(grokIntentFor("Notification", { message: "Approval required" })).toBe(
      "session.needs_approval",
    );
    expect(grokIntentFor("Notification", { type: "info", message: "hello" })).toBeUndefined();
  });

  it("returns undefined for unknown events", () => {
    expect(grokIntentFor("PreToolUse", undefined)).toBeUndefined();
    expect(grokIntentFor("Unknown", undefined)).toBeUndefined();
    expect(grokIntentFor("", undefined)).toBeUndefined();
  });
});

describe("renderGrokHookConfig", () => {
  it("emits Grok hook schema with all registered events", () => {
    const config = renderGrokHookConfig({ command: "'/wrapper.sh'" });
    expect(Object.keys(config.hooks).sort()).toEqual([...GROK_HOOK_EVENTS].sort());
  });

  it("appends the event name to the command for each event", () => {
    const config = renderGrokHookConfig({ command: "'/wrapper.sh'" });
    expect(config.hooks.SessionStart?.[0]?.hooks[0]?.command).toBe("'/wrapper.sh' SessionStart");
    expect(config.hooks.UserPromptSubmit?.[0]?.hooks[0]?.command).toBe(
      "'/wrapper.sh' UserPromptSubmit",
    );
    expect(config.hooks.Stop?.[0]?.hooks[0]?.command).toBe("'/wrapper.sh' Stop");
    expect(config.hooks.Notification?.[0]?.hooks[0]?.command).toBe("'/wrapper.sh' Notification");
  });

  it("sets a fixed timeout per hook entry", () => {
    const config = renderGrokHookConfig({ command: "'/wrapper.sh'" });
    for (const event of GROK_HOOK_EVENTS) {
      expect(config.hooks[event]?.[0]?.hooks[0]?.timeout).toBe(5);
    }
  });

  it("uses the Claude-style command shape Grok expects", () => {
    const config = renderGrokHookConfig({ command: "'/wrapper.sh'" });
    const entry = config.hooks.SessionStart?.[0]?.hooks[0];
    expect(entry?.type).toBe("command");
    expect(typeof entry?.command).toBe("string");
  });
});

describe("installGrokPlugin (native, global hook write)", () => {
  function makeNativeCtx() {
    const baseDir = mkdtempSync(join(tmpdir(), "lightcode-grok-stage-"));
    const grokDir = mkdtempSync(join(tmpdir(), "lightcode-grok-home-"));
    const envKind = process.platform === "win32" ? ("windows" as const) : ("posix" as const);
    return { baseDir, grokDir, ctx: { envKind, baseDir } };
  }

  it("writes ~/.grok/hooks/lightcode-status.json at install time", () => {
    const { grokDir, ctx } = makeNativeCtx();
    const result = installGrokPlugin(ctx, { globalGrokDirOverride: grokDir });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expected = join(grokDir, GLOBAL_HOOK_DIR_NAME, GLOBAL_HOOK_FILENAME);
    expect(result.paths.globalHookFilePath).toBe(expected);
    expect(existsSync(expected)).toBe(true);
    const written = JSON.parse(readFileSync(expected, "utf8")) as {
      hooks: Record<
        string,
        Array<{ hooks: Array<{ type: string; command: string; timeout: number }> }>
      >;
    };
    expect(Object.keys(written.hooks).sort()).toEqual([...GROK_HOOK_EVENTS].sort());
    const stop = written.hooks.Stop?.[0]?.hooks?.[0];
    expect(stop?.type).toBe("command");
    expect(stop?.timeout).toBe(5);
    expect(stop?.command.endsWith(" Stop")).toBe(true);
  });

  it("is idempotent — re-install with identical inputs does not bump mtime", async () => {
    const { grokDir, ctx } = makeNativeCtx();
    const first = installGrokPlugin(ctx, { globalGrokDirOverride: grokDir });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const firstMtime = statSync(first.paths.globalHookFilePath).mtimeMs;

    await new Promise((r) => setTimeout(r, 20));

    const second = installGrokPlugin(ctx, { globalGrokDirOverride: grokDir });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(statSync(second.paths.globalHookFilePath).mtimeMs).toBe(firstMtime);
  });

  it("does not touch any project-level paths", () => {
    const { grokDir, ctx } = makeNativeCtx();
    const projectDir = mkdtempSync(join(tmpdir(), "lightcode-grok-proj-"));
    mkdirSync(join(projectDir, ".grok"), { recursive: true });

    const result = installGrokPlugin(ctx, { globalGrokDirOverride: grokDir });
    expect(result.ok).toBe(true);

    expect(existsSync(join(projectDir, ".grok", "hooks"))).toBe(false);
  });
});

describe("getGrokPluginPaths", () => {
  it("returns staging dir under provided baseDir for native ctx", () => {
    const baseDir = mkdtempSync(join(tmpdir(), "lightcode-grok-paths-"));
    const paths = getGrokPluginPaths({ envKind: "posix", baseDir });
    expect(paths.pluginDir).toBe(join(baseDir, "agent-plugins", "grok"));
  });
});

describe("isGrokPluginInstalled", () => {
  function stage(parts: {
    manifest?: boolean;
    forward?: boolean;
    runtime?: boolean;
    wrapper?: boolean;
  }) {
    const baseDir = mkdtempSync(join(tmpdir(), "lightcode-grok-verify-"));
    const pluginDir = join(baseDir, "agent-plugins", "grok");
    mkdirSync(pluginDir, { recursive: true });
    if (parts.manifest) {
      writeFileSync(join(pluginDir, "plugin.json"), '{"name":"x","version":"9.9.9"}');
    }
    if (parts.forward) {
      writeFileSync(join(pluginDir, "forward.mjs"), "// noop");
    }
    if (parts.runtime) {
      writeFileSync(join(pluginDir, "lightcode-hook-runtime.mjs"), "// noop runtime");
    }
    if (parts.wrapper) {
      const wrapperName = process.platform === "win32" ? "lightcode-hook.cmd" : "lightcode-hook.sh";
      writeFileSync(join(pluginDir, wrapperName), "#!/bin/sh\nexit 0\n");
    }
    return { baseDir, ctx: { envKind: "posix" as const, baseDir } };
  }

  it("returns installed:false when staging assets are missing", () => {
    expect(
      isGrokPluginInstalled(stage({ forward: true, runtime: true, wrapper: true }).ctx),
    ).toEqual({ installed: false });
    expect(
      isGrokPluginInstalled(stage({ manifest: true, runtime: true, wrapper: true }).ctx),
    ).toEqual({ installed: false });
    expect(
      isGrokPluginInstalled(stage({ manifest: true, forward: true, wrapper: true }).ctx),
    ).toEqual({ installed: false });
    expect(
      isGrokPluginInstalled(stage({ manifest: true, forward: true, runtime: true }).ctx),
    ).toEqual({ installed: false });
  });
});
