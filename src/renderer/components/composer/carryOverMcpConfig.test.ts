// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { AgentCapability } from "@/shared/contracts";
import { carryOverComposerMcpConfig, composerMcpConfig } from "./carryOverMcpConfig";

function capabilities(overrides: Partial<AgentCapability> = {}): AgentCapability {
  return {
    models: [],
    efforts: [],
    modelEfforts: {},
    modes: [],
    approvalPolicies: [],
    sandboxModes: [],
    liveInputMode: "terminal",
    presentationMode: "gui",
    mcpScope: { terminal: "none", gui: "launch" },
    ...overrides,
  } as unknown as AgentCapability;
}

const allEnabled = {
  browserMcp: true,
  chromeMcp: true,
  crossagentMcp: true,
  computerUse: true,
} as const;

describe("carryOverComposerMcpConfig", () => {
  it("carries every enabled server into a target that supports them", () => {
    expect(
      carryOverComposerMcpConfig(capabilities(), "gui", allEnabled, {
        kind: "windows",
        path: "C:\\repo",
      }),
    ).toEqual(allEnabled);
  });

  it("carries servers into a target whose composer offers no toggle for them", () => {
    // `mcpScope: "none"` only hides the composer toggle. The launch path gates
    // on the thread-config flag, so the servers still start for this provider.
    expect(
      carryOverComposerMcpConfig(
        capabilities({ mcpScope: { terminal: "none", gui: "none" } }),
        "gui",
        allEnabled,
        { kind: "windows", path: "C:\\repo" },
      ),
    ).toEqual(allEnabled);
  });

  it("carries servers into a terminal target too", () => {
    expect(
      carryOverComposerMcpConfig(capabilities(), "terminal", allEnabled, {
        kind: "windows",
        path: "C:\\repo",
      }),
    ).toEqual(allEnabled);
  });

  it("carries Computer Use on a native Linux project", () => {
    expect(
      carryOverComposerMcpConfig(capabilities(), "gui", allEnabled, {
        kind: "posix",
        path: "/home/dev/repo",
      }),
    ).toEqual(allEnabled);
  });

  it("drops Chrome and Computer Use in a WSL project, which cannot reach the host", () => {
    expect(
      carryOverComposerMcpConfig(capabilities(), "gui", allEnabled, {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/dev/repo",
        uncPath: String.raw`\\wsl.localhost\Ubuntu\home\dev\repo`,
      }),
    ).toEqual({ browserMcp: true, crossagentMcp: true });
  });

  it("leaves a provider that owns its MCP config alone", () => {
    expect(
      carryOverComposerMcpConfig(
        capabilities({ mcpConfigSource: "agentSettings" }),
        "gui",
        allEnabled,
      ),
    ).toEqual({});
  });

  it("never turns a server on that the source had off", () => {
    expect(carryOverComposerMcpConfig(capabilities(), "gui", { browserMcp: true })).toEqual({
      browserMcp: true,
    });
  });
});

describe("composerMcpConfig", () => {
  it("keeps explicit off values so saved provider defaults cannot restore them", () => {
    expect(
      composerMcpConfig({
        model: "gpt-5",
        effort: "high",
        browserMcp: true,
        chromeMcp: false,
      }),
    ).toEqual({
      browserMcp: true,
      chromeMcp: false,
      crossagentMcp: false,
      computerUse: false,
    });
  });
});
