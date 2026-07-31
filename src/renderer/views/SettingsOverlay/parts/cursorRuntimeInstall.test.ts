import { describe, expect, it } from "vitest";
import type { AgentStatus, Project } from "@/shared/contracts";
import {
  canUpdateCursorSdk,
  cursorRuntimeInstallCommand,
  cursorRuntimeInstallState,
  cursorRuntimeSlots,
  cursorSdkUpdateCommand,
} from "./cursorRuntimeInstall";
import { availableRuntimeInstallOptions } from "./nativeAgentRuntimes";

function offeredRuntimes(agentStatus: AgentStatus | undefined): string[] {
  return availableRuntimeInstallOptions(cursorRuntimeSlots, agentStatus).map((option) => option.id);
}

function status(
  acp: boolean,
  sdk: boolean,
  sdkOptions?: { version?: string; installationSource?: string },
): AgentStatus {
  const capabilities = {
    models: [],
    efforts: [],
    modelEfforts: {},
    modes: ["agent" as const],
    approvalPolicies: [],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: false,
    liveInputMode: "server" as const,
    presentationMode: "gui" as const,
    settingDefs: [],
  };
  return {
    kind: "cursor",
    label: "Cursor",
    installed: acp || sdk,
    authState: "authenticated",
    capabilities,
    runtimeVariants: {
      acp: {
        presentationMode: "gui",
        installed: acp,
        authState: "authenticated",
        authUsesProviderLogin: true,
        capabilities,
      },
      sdk: {
        presentationMode: "gui",
        installed: sdk,
        ...(sdkOptions?.version ? { version: sdkOptions.version } : {}),
        ...(sdkOptions?.installationSource
          ? { installationSource: sdkOptions.installationSource }
          : {}),
        authState: "authenticated",
        authUsesProviderLogin: false,
        capabilities,
      },
    },
  };
}

const posixProject: Project = {
  id: "project",
  name: "Project",
  location: { kind: "posix", path: "/repo" },
  createdAt: "2026-07-27T00:00:00.000Z",
};

describe("Cursor runtime installation", () => {
  it("offers ACP, SDK, or both when neither runtime is installed", () => {
    expect(offeredRuntimes(undefined)).toEqual(["acp", "sdk", "both"]);
  });

  it("offers only the missing runtime when one is already installed", () => {
    expect(offeredRuntimes(status(true, false))).toEqual(["sdk"]);
    expect(offeredRuntimes(status(false, true))).toEqual(["acp"]);
    expect(offeredRuntimes(status(true, true))).toEqual([]);
  });

  it("treats a legacy installed Cursor status as an ACP install", () => {
    const legacy = { ...status(true, false), runtimeVariants: undefined };
    expect(cursorRuntimeInstallState(legacy)).toMatchObject({
      acpInstalled: true,
      sdkInstalled: false,
    });
  });

  it("installs the public SDK in the global package root discovered by the worker", () => {
    expect(cursorRuntimeInstallCommand("sdk", posixProject)).toContain(
      "npm install -g '@cursor/sdk@^1.0.24'",
    );
    const both = cursorRuntimeInstallCommand("both", posixProject);
    expect(both).toContain("https://cursor.com/install");
    expect(both).toContain("@cursor/sdk@^1.0.24");
  });

  it("reports independent ACP and SDK versions", () => {
    const installed = {
      ...status(true, true, { version: "1.0.31", installationSource: "global-npm" }),
      version: "2026.07.23",
      runtimeVariants: {
        ...status(true, true).runtimeVariants,
        acp: {
          ...status(true, true).runtimeVariants?.acp,
          version: "2026.07.23",
        },
        sdk: {
          ...status(true, true).runtimeVariants?.sdk,
          version: "1.0.31",
          installationSource: "global-npm",
        },
      },
    } as AgentStatus;

    expect(cursorRuntimeInstallState(installed)).toMatchObject({
      acpVersion: "2026.07.23",
      sdkVersion: "1.0.31",
      sdkInstallationSource: "global-npm",
    });
  });

  it("updates managed npm and pnpm SDK installs within the supported 1.x range", () => {
    const npmStatus = status(true, true, { installationSource: "global-npm" });
    const pnpmStatus = status(true, true, { installationSource: "global-pnpm" });
    const projectStatus = status(true, true, { installationSource: "project" });

    expect(canUpdateCursorSdk(npmStatus)).toBe(true);
    expect(cursorSdkUpdateCommand(npmStatus, posixProject)).toContain(
      "npm install -g '@cursor/sdk@^1.0.24'",
    );
    expect(canUpdateCursorSdk(pnpmStatus)).toBe(true);
    expect(cursorSdkUpdateCommand(pnpmStatus, posixProject)).toContain(
      "pnpm add -g '@cursor/sdk@^1.0.24'",
    );
    expect(canUpdateCursorSdk(projectStatus)).toBe(false);
    expect(cursorSdkUpdateCommand(projectStatus, posixProject)).toBeUndefined();
  });
});
