import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentCapability, AgentInstanceConfig, ProjectLocation } from "@/shared/contracts";

// Detection is replaced so each test controls what the probe published.
const detectAgentInstallMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<unknown>>());

vi.mock("../base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../base")>()),
  detectAgentInstall: detectAgentInstallMock,
}));

import { claudeCapabilities } from "./detection";
import { createClaudeProfileAdapter } from "./index";

const CUSTOM_WINDOWS = { contextWindows: '["200k","400k","600k","1m"]' } as const;
// Widest first: the first entry is the default, and an external model keeps
// the full window it ran with before smaller ones became selectable.
const CUSTOM_WINDOW_IDS = ["1m", "600k", "400k", "200k"];

let rootDir: string;

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), "poracode-claude-profile-window-"));
  detectAgentInstallMock.mockReset();
});

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true });
});

const location = (): ProjectLocation => ({ kind: "posix", path: rootDir });

function zAi(
  extra: { environment?: AgentInstanceConfig["environment"] } = {},
): AgentInstanceConfig {
  return {
    id: "z-ai",
    driver: "claude",
    displayName: "Z.AI",
    config: {
      configDir: join(rootDir, "z-ai"),
      models: [{ id: "glm-5.4[1m]", label: "GLM 5.4" }],
    },
    ...extra,
  };
}

/**
 * What the probe publishes before the profile overlay runs: the SDK lists the
 * profile's default-slot model with its windows already resolved, while
 * `glm-5.4[1m]` exists only in the picker and so arrives with no context
 * window of its own.
 */
function probedCapabilities(): AgentCapability {
  return {
    ...claudeCapabilities,
    models: [
      ...claudeCapabilities.models,
      { id: "glm-5.3-flash[1m]", label: "GLM 5.3 Flash" },
      { id: "glm-5.4[1m]", label: "GLM 5.4" },
    ],
    contextSizes: [
      { id: "400k", label: "400k" },
      { id: "1m", label: "1M" },
      { id: "200k", label: "200k" },
    ],
    modelContextSizes: {
      ...claudeCapabilities.modelContextSizes,
      "glm-5.3-flash[1m]": ["1m", "400k"],
    },
  };
}

function publish(capabilities: AgentCapability): void {
  detectAgentInstallMock.mockResolvedValue({
    kind: "claude:z-ai",
    label: "Claude Z.AI",
    installed: true,
    authState: "authenticated",
    capabilities,
  });
}

describe("Claude profile working windows", () => {
  it("gives a picker-only [1m] model selectable working windows before discovery", () => {
    const adapter = createClaudeProfileAdapter(zAi());
    expect(adapter.capabilities.models).toContainEqual({ id: "glm-5.4[1m]", label: "GLM 5.4" });
    // Default windows, with the model's full 1M window as the default choice.
    expect(adapter.capabilities.modelContextSizes?.["glm-5.4[1m]"]).toEqual(["1m", "400k"]);
  });

  it("publishes the configured windows for a picker-only [1m] model the probe never answered for", async () => {
    publish(probedCapabilities());
    const adapter = createClaudeProfileAdapter(zAi());

    const status = await adapter.detectInstall({ envKind: "posix", agentSettings: CUSTOM_WINDOWS });

    // Without a window the thread fell back to Claude's 200k default and forced
    // that on the CLI, whatever the profile asked for.
    expect(status.capabilities.modelContextSizes?.["glm-5.4[1m]"]).toEqual(CUSTOM_WINDOW_IDS);
    expect(status.capabilities.contextSizes).toContainEqual({ id: "600k", label: "600k" });
    // A model discovery did list ends up with the configured windows too.
    expect(status.capabilities.modelContextSizes?.["glm-5.3-flash[1m]"]).toEqual(CUSTOM_WINDOW_IDS);
  });

  it("falls back to the default windows when the profile has no window setting", async () => {
    publish(probedCapabilities());
    const adapter = createClaudeProfileAdapter(zAi());

    const status = await adapter.detectInstall({ envKind: "posix" });

    expect(status.capabilities.modelContextSizes?.["glm-5.4[1m]"]).toEqual(["1m", "400k"]);
  });

  it("leaves an external model without the [1m] id unchanged", async () => {
    publish(probedCapabilities());
    const adapter = createClaudeProfileAdapter({
      id: "minimax",
      driver: "claude",
      displayName: "MiniMax",
      config: { configDir: join(rootDir, "minimax"), models: [{ id: "MiniMax-M3" }] },
    });

    const status = await adapter.detectInstall({ envKind: "posix", agentSettings: CUSTOM_WINDOWS });

    expect(status.capabilities.models).toContainEqual({ id: "MiniMax-M3", label: "MiniMax-M3" });
    expect(status.capabilities.modelContextSizes).not.toHaveProperty("MiniMax-M3");
  });

  it("sends an external [1m] id verbatim with the selected window over the profile env", async () => {
    const adapter = createClaudeProfileAdapter(
      zAi({ environment: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: { value: "1000000" } } }),
    );
    const config = { model: "glm-5.4[1m]", contextSize: "600k" };
    const launch = await adapter.buildLaunchArgv(location(), config, "Continue");
    const resume = await adapter.buildResumeArgv(location(), config, "Continue", {
      providerSessionId: "existing-session",
      discoveredAt: "2026-10-12T00:00:00Z",
    });

    for (const spec of [launch, resume]) {
      // The id is the provider's 1M variant; only the working window changes.
      const modelFlag = spec.args.indexOf("--model");
      expect(modelFlag).toBeGreaterThan(-1);
      expect(spec.args.slice(modelFlag, modelFlag + 2)).toEqual(["--model", "glm-5.4[1m]"]);
      expect(spec.env?.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBe("600000");
      expect(spec.args.at(-1)).toBe("Continue");
    }
    await launch.cleanup?.();
  });
});
