import { describe, expect, it } from "vitest";
import type { AgentCapability, AgentStatus } from "@/shared/contracts";
import { antigravityRuntimeSlots } from "./antigravityRuntimeInstall";
import { availableRuntimeInstallOptions } from "./nativeAgentRuntimes";

const capabilities: AgentCapability = {
  models: [],
  efforts: [],
  modelEfforts: {},
  modes: ["agent"],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  settingDefs: [],
};

function status(cli: boolean, acp: boolean): AgentStatus {
  return {
    kind: "antigravity",
    label: "Antigravity",
    installed: cli || acp,
    authState: "authenticated",
    capabilities,
    runtimeVariants: {
      cli: {
        presentationMode: "terminal",
        installed: cli,
        authState: "authenticated",
        authUsesProviderLogin: true,
        capabilities,
      },
      acp: {
        presentationMode: "gui",
        installed: acp,
        authState: "authenticated",
        authUsesProviderLogin: true,
        capabilities: { ...capabilities, presentationMode: "gui", liveInputMode: "server" },
      },
    },
  };
}

describe("Antigravity runtime install options", () => {
  it("offers the combined install and a registry-only Chat install when nothing is detected", () => {
    expect(
      availableRuntimeInstallOptions(antigravityRuntimeSlots, undefined).map((o) => o.id),
    ).toEqual(["both", "acp"]);
  });

  it("offers only Chat when the CLI is already installed", () => {
    expect(
      availableRuntimeInstallOptions(antigravityRuntimeSlots, status(true, false)).map((o) => o.id),
    ).toEqual(["acp"]);
  });

  it("offers only the CLI when Chat is already installed", () => {
    expect(
      availableRuntimeInstallOptions(antigravityRuntimeSlots, status(false, true)).map((o) => o.id),
    ).toEqual(["cli"]);
  });
});
