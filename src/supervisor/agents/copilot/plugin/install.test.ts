import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { copilotIntentFor } from "./intentMap";
import {
  COPILOT_HOOK_EVENTS,
  GLOBAL_HOOK_DIR_NAME,
  GLOBAL_HOOK_FILENAME,
  getCopilotPluginPaths,
  installCopilotPlugin,
  isCopilotPluginInstalled,
  renderCopilotHookConfig,
} from "./install";

describe("copilotIntentFor", () => {
  const expected: Record<(typeof COPILOT_HOOK_EVENTS)[number], string> = {
    sessionStart: "session.started",
    userPromptSubmitted: "session.turn_started",
    preToolUse: "session.turn_started",
    postToolUse: "session.turn_started",
    errorOccurred: "session.turn_errored",
    sessionEnd: "session.turn_finished",
  };

  it("maps every Copilot CLI hook event to a universal intent", () => {
    for (const event of COPILOT_HOOK_EVENTS) {
      expect(copilotIntentFor(event)).toBe(expected[event]);
    }
  });

  it("returns undefined for unknown events", () => {
    expect(copilotIntentFor("agentStop")).toBeUndefined();
    expect(copilotIntentFor("unknown")).toBeUndefined();
    expect(copilotIntentFor("")).toBeUndefined();
  });
});

describe("renderCopilotHookConfig", () => {
  it("emits Copilot CLI v1 schema with all 6 events", () => {
    const config = renderCopilotHookConfig({ bashCommand: "'/wrapper.sh'" });
    expect(config.version).toBe(1);
    expect(Object.keys(config.hooks).sort()).toEqual([...COPILOT_HOOK_EVENTS].sort());
  });

  it("appends event name to bashCommand for each event", () => {
    const config = renderCopilotHookConfig({ bashCommand: "'/wrapper.sh'" });
    expect(config.hooks.sessionStart?.[0]?.bash).toBe("'/wrapper.sh' sessionStart");
    expect(config.hooks.preToolUse?.[0]?.bash).toBe("'/wrapper.sh' preToolUse");
    expect(config.hooks.errorOccurred?.[0]?.bash).toBe("'/wrapper.sh' errorOccurred");
  });

  it("populates both bash and powershell when both supplied", () => {
    const config = renderCopilotHookConfig({
      bashCommand: "'/wrapper.sh'",
      powershellCommand: "& 'C:\\wrapper.ps1'",
    });
    expect(config.hooks.sessionStart?.[0]?.bash).toBe("'/wrapper.sh' sessionStart");
    expect(config.hooks.sessionStart?.[0]?.powershell).toBe("& 'C:\\wrapper.ps1' sessionStart");
  });

  it("omits unset fields", () => {
    const config = renderCopilotHookConfig({ powershellCommand: "& 'C:\\wrapper.ps1'" });
    expect(config.hooks.sessionStart?.[0]?.bash).toBeUndefined();
    expect(config.hooks.sessionStart?.[0]?.powershell).toBe("& 'C:\\wrapper.ps1' sessionStart");
  });

  it("sets a fixed timeout per hook entry", () => {
    const config = renderCopilotHookConfig({ bashCommand: "'/wrapper.sh'" });
    for (const event of COPILOT_HOOK_EVENTS) {
      expect(config.hooks[event]?.[0]?.timeoutSec).toBe(5);
    }
  });
});

describe("installCopilotPlugin (native, global hook write)", () => {
  function makeNativeCtx() {
    const baseDir = mkdtempSync(join(tmpdir(), "poracode-copilot-stage-"));
    const copilotDir = mkdtempSync(join(tmpdir(), "poracode-copilot-home-"));
    const envKind = process.platform === "win32" ? ("windows" as const) : ("posix" as const);
    return { baseDir, copilotDir, ctx: { envKind, baseDir } };
  }

  it("writes ${COPILOT_HOME}/hooks/poracode-status.json at install time", () => {
    const { copilotDir, ctx } = makeNativeCtx();
    const result = installCopilotPlugin(ctx, { globalCopilotDirOverride: copilotDir });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expected = join(copilotDir, GLOBAL_HOOK_DIR_NAME, GLOBAL_HOOK_FILENAME);
    expect(result.paths.globalHookFilePath).toBe(expected);
    expect(existsSync(expected)).toBe(true);
    const written = JSON.parse(readFileSync(expected, "utf8")) as {
      version: number;
      hooks: Record<string, Array<{ type: string; bash?: string; powershell?: string }>>;
    };
    expect(written.version).toBe(1);
    expect(Object.keys(written.hooks).sort()).toEqual([...COPILOT_HOOK_EVENTS].sort());
    const powershellCommand = written.hooks.sessionStart?.[0]?.powershell;
    expect(
      process.platform === "win32"
        ? /poracode-hook\.ps1' sessionStart$/.test(powershellCommand ?? "")
        : powershellCommand,
    ).toBe(process.platform === "win32" ? true : undefined);
  });

  it("removes the legacy Lightcode global hook after install", () => {
    const { copilotDir, ctx } = makeNativeCtx();
    const legacyPath = join(copilotDir, GLOBAL_HOOK_DIR_NAME, "lightcode-status.json");
    mkdirSync(join(copilotDir, GLOBAL_HOOK_DIR_NAME), { recursive: true });
    writeFileSync(legacyPath, "{}\n");

    expect(installCopilotPlugin(ctx, { globalCopilotDirOverride: copilotDir }).ok).toBe(true);
    expect(existsSync(legacyPath)).toBe(false);
  });

  it("is idempotent — re-install with identical inputs does not bump mtime", async () => {
    const { copilotDir, ctx } = makeNativeCtx();
    const first = installCopilotPlugin(ctx, { globalCopilotDirOverride: copilotDir });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const firstMtime = statSync(first.paths.globalHookFilePath).mtimeMs;

    await new Promise((r) => setTimeout(r, 20));

    const second = installCopilotPlugin(ctx, { globalCopilotDirOverride: copilotDir });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(statSync(second.paths.globalHookFilePath).mtimeMs).toBe(firstMtime);
  });

  it("does not touch any project-level paths", () => {
    const { copilotDir, ctx } = makeNativeCtx();
    const projectDir = mkdtempSync(join(tmpdir(), "poracode-copilot-proj-"));
    mkdirSync(join(projectDir, ".github"), { recursive: true });

    const result = installCopilotPlugin(ctx, { globalCopilotDirOverride: copilotDir });
    expect(result.ok).toBe(true);

    expect(existsSync(join(projectDir, ".github", "hooks"))).toBe(false);
  });
});

describe("getCopilotPluginPaths", () => {
  it("returns staging dir under provided baseDir for native ctx", () => {
    const baseDir = mkdtempSync(join(tmpdir(), "poracode-copilot-paths-"));
    const paths = getCopilotPluginPaths({ envKind: "posix", baseDir });
    expect(paths.pluginDir).toBe(join(baseDir, "agent-plugins", "copilot"));
  });
});

describe("isCopilotPluginInstalled", () => {
  function stage(parts: {
    manifest?: boolean;
    forward?: boolean;
    runtime?: boolean;
    wrapper?: boolean;
    hookFile?: boolean;
  }) {
    const baseDir = mkdtempSync(join(tmpdir(), "poracode-copilot-verify-"));
    const pluginDir = join(baseDir, "agent-plugins", "copilot");
    mkdirSync(pluginDir, { recursive: true });
    if (parts.manifest) {
      writeFileSync(join(pluginDir, "plugin.json"), '{"name":"x","version":"9.9.9"}');
    }
    if (parts.forward) {
      writeFileSync(join(pluginDir, "forward.mjs"), "// noop");
    }
    if (parts.runtime) {
      writeFileSync(join(pluginDir, "poracode-hook-runtime.mjs"), "// noop runtime");
    }
    if (parts.wrapper) {
      const wrapperName = process.platform === "win32" ? "poracode-hook.cmd" : "poracode-hook.sh";
      writeFileSync(join(pluginDir, wrapperName), "#!/bin/sh\nexit 0\n");
    }
    if (parts.hookFile) {
      // The native verify path reads from the real `~/.copilot/hooks/...`. This
      // test only exercises the staging-asset checks; hookFile verification is
      // covered by the install round-trip above.
    }
    return { baseDir, ctx: { envKind: "posix" as const, baseDir } };
  }

  it("returns installed:false when staging assets are missing", () => {
    expect(
      isCopilotPluginInstalled(stage({ forward: true, runtime: true, wrapper: true }).ctx),
    ).toEqual({ installed: false });
    expect(
      isCopilotPluginInstalled(stage({ manifest: true, runtime: true, wrapper: true }).ctx),
    ).toEqual({ installed: false });
    expect(
      isCopilotPluginInstalled(stage({ manifest: true, forward: true, wrapper: true }).ctx),
    ).toEqual({ installed: false });
    expect(
      isCopilotPluginInstalled(stage({ manifest: true, forward: true, runtime: true }).ctx),
    ).toEqual({ installed: false });
  });
});
