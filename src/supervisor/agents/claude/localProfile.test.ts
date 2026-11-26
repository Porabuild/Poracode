import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CreateProfilePayload, ProjectLocation } from "@/shared/contracts";
import { defaultSharedSettings } from "@/shared/settings";
import {
  applyCreateProfile,
  readSharedSettingsFile,
  writeSharedSettingsFile,
} from "@/host/sharedSettingsFile";
import { CLAUDE_LOCAL_AUTH_TOKEN_PLACEHOLDER } from "@/shared/agents/claude/localProfile";
import { UnsupportedOneShotControlError, resolveOneShotSelection } from "../base";
import { createClaudeProfileAdapter } from "./index";

const location: ProjectLocation = { kind: "posix", path: "/repo" };
const AMBIENT_KEYS = [
  "ANTHROPIC_API_KEY",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "ANTHROPIC_CUSTOM_HEADERS",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_MODEL",
] as const;

describe("Claude local profile route", () => {
  let directory: string;
  let previousEnv: Record<string, string | undefined>;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "claude-local-profile-"));
    previousEnv = Object.fromEntries(AMBIENT_KEYS.map((key) => [key, process.env[key]]));
    for (const key of AMBIENT_KEYS) process.env[key] = `ambient-${key.toLowerCase()}`;
  });

  afterEach(async () => {
    for (const key of AMBIENT_KEYS) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
    await rm(directory, { recursive: true, force: true });
  });

  it("persists a typed route with no secret blanks, then shadows ambient credentials on launch", async () => {
    const payload: CreateProfilePayload = {
      driver: "claude",
      id: "work-2",
      displayName: "Work Two",
      // A user-edited profile can carry ordinary overrides; the local route
      // must win over every one of them. Values are synthetic, not secrets.
      environment: {
        ANTHROPIC_BASE_URL: { value: "https://stale.example.test" },
        ANTHROPIC_AUTH_TOKEN: { value: "ambient-token", sensitive: false },
        ANTHROPIC_API_KEY: { value: "ambient-key", sensitive: false },
        CLAUDE_CODE_OAUTH_TOKEN: { value: "ambient-oauth", sensitive: false },
        ANTHROPIC_CUSTOM_HEADERS: { value: "x-ambient: 1", sensitive: false },
        ANTHROPIC_MODEL: { value: "cloud-model", sensitive: false },
      },
      config: {
        configDir: "~/.poracode/claude-profiles/work-2",
        models: [{ id: "inkling-2-mini:latest" }],
        local: {
          endpoint: "http://127.0.0.1:11434",
          model: "inkling-2-mini:latest",
        },
      },
    };
    const settingsPath = join(directory, "settings.json");
    writeSharedSettingsFile(
      settingsPath,
      applyCreateProfile(defaultSharedSettings, payload, "").settings,
    );
    const instance = readSharedSettingsFile(settingsPath).agentInstances["work-2"];
    expect(instance).toBeDefined();
    expect(instance?.environment?.ANTHROPIC_API_KEY?.value).toBe("ambient-key");

    const adapter = createClaudeProfileAdapter(instance!);
    const launch = await adapter.buildLaunchArgv(
      location,
      { model: "claude-opus-4-8", effort: "high", fast: true },
      "hello",
    );
    expect(launch.env).toMatchObject({
      ANTHROPIC_BASE_URL: "http://127.0.0.1:11434",
      ANTHROPIC_AUTH_TOKEN: CLAUDE_LOCAL_AUTH_TOKEN_PLACEHOLDER,
      ANTHROPIC_API_KEY: "",
      ANTHROPIC_API_KEY_HELPER: "",
      CLAUDE_CODE_API_KEY_HELPER: "",
      CLAUDE_CODE_OAUTH_TOKEN: "",
      ANTHROPIC_CUSTOM_HEADERS: "",
      CLAUDE_CODE_USE_BEDROCK: "",
      CLAUDE_CODE_USE_VERTEX: "",
      CLAUDE_CODE_USE_FOUNDRY: "",
      ANTHROPIC_MODEL: "inkling-2-mini:latest",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "inkling-2-mini:latest",
      CLAUDE_CODE_SUBAGENT_MODEL: "inkling-2-mini:latest",
    });
    expect(launch.args).toContain("inkling-2-mini:latest");
    expect(launch.args).not.toContain("claude-opus-4-8");
    expect(launch.args).not.toContain("--effort");
    expect(launch.args).not.toContain("fastMode");

    const oneShot = await adapter.buildOneShotCommand?.(
      "inkling-2-mini:latest",
      undefined,
      "Summarize",
      location,
    );
    expect(oneShot?.env?.ANTHROPIC_API_KEY).toBe("");
    expect(oneShot?.env?.ANTHROPIC_CUSTOM_HEADERS).toBe("");
    expect(oneShot?.args).toContain("inkling-2-mini:latest");
    expect(oneShot?.args).not.toContain("--fallback-model");
    expect(oneShot?.args).not.toContain("claude-haiku-4-5");

    // The base cloud catalog cannot prepend aliases or an inherited effort.
    expect(adapter.capabilities.models).toEqual([
      { id: "inkling-2-mini:latest", label: "inkling-2-mini:latest" },
    ]);
    expect(adapter.capabilities.efforts).toEqual([]);
    expect(adapter.capabilities.modelEfforts).toEqual({});
    expect(adapter.capabilities.defaultEffort).toBeUndefined();
    expect(adapter.defaultOneShotModel).toBe("inkling-2-mini:latest");
  });

  it("accepts the real utility selection's inactive carriers and rejects active effort/Fast", async () => {
    const adapter = createClaudeProfileAdapter({
      id: "util",
      driver: "claude",
      displayName: "Util",
      config: {
        configDir: "~/.poracode/claude-profiles/util",
        models: [{ id: "inkling-2-mini:latest" }],
        local: { endpoint: "http://127.0.0.1:11434", model: "inkling-2-mini:latest" },
      },
    });
    const selection = resolveOneShotSelection(
      adapter,
      { model: "inkling-2-mini:latest", effort: "", fast: false },
      () => new Error("no model"),
    );
    const command = await adapter.buildOneShotCommand?.(
      selection.model,
      selection.effort,
      "Title",
      location,
      selection.fast,
      { selection },
    );
    expect(command?.args).toContain("inkling-2-mini:latest");
    expect(command?.args).not.toContain("");
    expect(command?.args).not.toContain("--effort");
    expect(command?.args).not.toContain("--settings");
    expect(command?.args).not.toContain("--fallback-model");

    const textOnly = await adapter.buildTextOnlyOneShotCommand?.(
      selection.model,
      selection.effort,
      "Title",
      location,
      selection.fast,
      { selection },
    );
    expect(textOnly?.args).toContain("inkling-2-mini:latest");

    const extraction = await adapter.buildContextExtractionCommand?.(
      { providerSessionId: "session-1", discoveredAt: "test" },
      location,
      selection.model,
      { selection },
    );
    expect(extraction?.args).toContain("inkling-2-mini:latest");
    expect(extraction?.args).not.toContain("--effort");
    expect(extraction?.args).not.toContain("--settings");

    await expect(
      adapter.buildOneShotCommand?.(selection.model, "high", "Title", location, false, {
        selection: { ...selection, effort: "high", fast: false },
      }),
    ).rejects.toBeInstanceOf(UnsupportedOneShotControlError);
    await expect(
      adapter.buildOneShotCommand?.(selection.model, "", "Title", location, true, {
        selection: { ...selection, effort: "", fast: true },
      }),
    ).rejects.toBeInstanceOf(UnsupportedOneShotControlError);
  });

  it("keeps the exact context alias and pins Claude's context bookkeeping", async () => {
    const alias = "poracode-ctx-65536-0123456789ab-0123456789abcdef";
    const adapter = createClaudeProfileAdapter({
      id: "ctx",
      driver: "claude",
      displayName: "Context",
      config: {
        configDir: "~/.poracode/claude-profiles/ctx",
        models: [{ id: alias }],
        local: {
          endpoint: "http://127.0.0.1:11434",
          model: alias,
          baseModel: "inkling-2-mini:latest",
          contextLength: 65536,
        },
      },
    });
    const launch = await adapter.buildLaunchArgv(location, { model: "claude-opus-4-8" }, "hello");
    expect(launch.env).toMatchObject({
      ANTHROPIC_MODEL: alias,
      CLAUDE_CODE_MAX_CONTEXT_TOKENS: "65536",
    });
    expect(launch.env).not.toHaveProperty("CLAUDE_CODE_AUTO_COMPACT_WINDOW");
    expect(launch.args).toContain(alias);
    expect(launch.args).not.toContain("claude-opus-4-8");

    const wide = createClaudeProfileAdapter({
      id: "wide",
      driver: "claude",
      displayName: "Wide",
      config: {
        configDir: "~/.poracode/claude-profiles/wide",
        models: [{ id: alias }],
        local: {
          endpoint: "http://127.0.0.1:11434",
          model: alias,
          baseModel: "inkling-2-mini:latest",
          contextLength: 131072,
        },
      },
    });
    const wideLaunch = await wide.buildLaunchArgv(location, { model: "claude-opus-4-8" }, "hello");
    expect(wideLaunch.env).toMatchObject({
      CLAUDE_CODE_MAX_CONTEXT_TOKENS: "131072",
      CLAUDE_CODE_AUTO_COMPACT_WINDOW: "131072",
    });
  });

  it("accepts a custom exact context count while an old preset keeps its existing env", async () => {
    for (const context of [65536, 88000]) {
      const alias = `poracode-ctx-${context}-0123456789ab-0123456789abcdef`;
      const adapter = createClaudeProfileAdapter({
        id: `ctx-${context}`,
        driver: "claude",
        displayName: "Context",
        config: {
          configDir: `~/.poracode/claude-profiles/ctx-${context}`,
          models: [{ id: alias }],
          local: {
            endpoint: "http://127.0.0.1:11434",
            model: alias,
            baseModel: "inkling-2-mini:latest",
            contextLength: context,
          },
        },
      });
      const launch = await adapter.buildLaunchArgv(location, { model: "claude-opus-4-8" }, "hello");
      expect(launch.env).toMatchObject({
        ANTHROPIC_MODEL: alias,
        CLAUDE_CODE_MAX_CONTEXT_TOKENS: String(context),
      });
      expect(launch.env).not.toHaveProperty("CLAUDE_CODE_AUTO_COMPACT_WINDOW");
      expect(launch.args).toContain(alias);
    }
  });

  it("namespaces the managed config dir by the authoritative host data root", async () => {
    const previous = process.env.PORACODE_DATA_DIR;
    try {
      const instance = {
        id: "work",
        driver: "claude" as const,
        displayName: "Work",
        config: {
          configDir: "~/.poracode/claude-profiles/work",
          models: [{ id: "model" }],
          local: { endpoint: "http://127.0.0.1:11434", model: "model" },
        },
      };
      process.env.PORACODE_DATA_DIR = "/hosts/desktop/.poracode";
      const desktop = await createClaudeProfileAdapter(instance).buildLaunchArgv(
        location,
        { model: "model" },
        "hello",
      );
      process.env.PORACODE_DATA_DIR = "/hosts/isolated/.poracode";
      const isolated = await createClaudeProfileAdapter(instance).buildLaunchArgv(
        location,
        { model: "model" },
        "hello",
      );
      expect(desktop.env?.CLAUDE_CONFIG_DIR).not.toBe(isolated.env?.CLAUDE_CONFIG_DIR);
      expect(desktop.env?.CLAUDE_CONFIG_DIR).toContain(".poracode/claude-profiles/");
    } finally {
      if (previous === undefined) delete process.env.PORACODE_DATA_DIR;
      else process.env.PORACODE_DATA_DIR = previous;
    }
  });

  it("derives the config directory from the unique id, not the display name", () => {
    const first = createClaudeProfileAdapter({
      id: "work-2",
      driver: "claude",
      displayName: "Work Two",
      config: {
        configDir: "~/.poracode/claude-profiles/work-2",
        models: [{ id: "model-a" }],
        local: { endpoint: "http://127.0.0.1:11434", model: "model-a" },
      },
    });
    const second = createClaudeProfileAdapter({
      id: "work-two",
      driver: "claude",
      displayName: "Work Two",
      config: {
        configDir: "~/.poracode/claude-profiles/work-two",
        models: [{ id: "model-b" }],
        local: { endpoint: "http://127.0.0.1:11434", model: "model-b" },
      },
    });
    expect(first.kind).not.toBe(second.kind);
    expect(first.capabilities.models.map((model) => model.id)).toEqual(["model-a"]);
    expect(second.capabilities.models.map((model) => model.id)).toEqual(["model-b"]);
  });
});
