import { describe, expect, it } from "vitest";
import type { AgentCapability, AgentStatus } from "@/shared/contracts";
import { collectFirstClassAcpAutoInstalls } from "./firstClassAcpAutoInstall";

const capabilities: AgentCapability = {
  models: [],
  efforts: [],
  modelEfforts: {},
  modes: [],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  settingDefs: [],
};

function status(input: {
  installedRuntimes: Partial<Record<"cli" | "acp", boolean>>;
  envKind?: AgentStatus["envKind"];
  envDistro?: string;
  kind?: string;
}): AgentStatus {
  return {
    kind: input.kind ?? "antigravity",
    label: "Antigravity",
    installed: Object.values(input.installedRuntimes).some(Boolean),
    authState: "authenticated",
    capabilities,
    envKind: input.envKind ?? "windows",
    ...(input.envDistro ? { envDistro: input.envDistro } : {}),
    runtimeVariants: {
      cli: {
        presentationMode: "terminal",
        installed: input.installedRuntimes.cli ?? false,
        authState: "authenticated",
        authUsesProviderLogin: true,
        capabilities,
      },
      acp: {
        presentationMode: "gui",
        installed: input.installedRuntimes.acp ?? false,
        authState: "authenticated",
        authUsesProviderLogin: true,
        capabilities,
      },
    },
  };
}

const firstClassRegistryIds = new Map([["antigravity", "antigravity-acp"]]);

describe("collectFirstClassAcpAutoInstalls", () => {
  it("queues the chat runtime when only the CLI is detected", () => {
    expect(
      collectFirstClassAcpAutoInstalls({
        statuses: [status({ installedRuntimes: { cli: true } })],
        firstClassRegistryIds,
      }),
    ).toEqual([
      { agentId: "antigravity-acp", agentKind: "antigravity", target: { kind: "native" } },
    ]);
  });

  it("targets the distro that detected the CLI", () => {
    expect(
      collectFirstClassAcpAutoInstalls({
        statuses: [
          status({ installedRuntimes: { cli: true }, envKind: "wsl", envDistro: "Ubuntu" }),
        ],
        firstClassRegistryIds,
      }),
    ).toEqual([
      {
        agentId: "antigravity-acp",
        agentKind: "antigravity",
        target: { kind: "wsl", distro: "Ubuntu" },
      },
    ]);
  });

  it("skips environments where the chat runtime is already installed", () => {
    expect(
      collectFirstClassAcpAutoInstalls({
        statuses: [status({ installedRuntimes: { cli: true, acp: true } })],
        firstClassRegistryIds,
      }),
    ).toEqual([]);
  });

  it("does not install chat for a provider whose CLI is absent", () => {
    expect(
      collectFirstClassAcpAutoInstalls({
        statuses: [status({ installedRuntimes: {} })],
        firstClassRegistryIds,
      }),
    ).toEqual([]);
  });

  it("ignores providers that do not adopt a registry runtime", () => {
    expect(
      collectFirstClassAcpAutoInstalls({
        statuses: [status({ installedRuntimes: { cli: true }, kind: "codex" })],
        firstClassRegistryIds,
      }),
    ).toEqual([]);
  });

  it("deduplicates the same agent and environment reported twice", () => {
    expect(
      collectFirstClassAcpAutoInstalls({
        statuses: [
          status({ installedRuntimes: { cli: true } }),
          status({ installedRuntimes: { cli: true } }),
        ],
        firstClassRegistryIds,
      }),
    ).toHaveLength(1);
  });
});
