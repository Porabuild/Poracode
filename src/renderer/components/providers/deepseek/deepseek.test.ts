// @vitest-environment node
import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import "./index";
import manifest from "./manifest";
import { getComposerControls } from "../providerComposer";
import { getCommitGenDefaults, resolveCommitGenConfig } from "../commitGen";
import { getTitleGenDefaults, resolveTitleGenConfig } from "../titleGen";
import { getConflictResolverDefaults, resolveConflictResolverConfig } from "../conflictResolver";
import { NATIVE_AGENT_REGISTRY_ENTRIES } from "@/renderer/views/SettingsOverlay/parts/agentRegistryNative";
import { resolveProviderDraftConfig } from "../../thread/threadDraftViewHelpers";
import type { AgentStatus } from "@/shared/contracts";
import type { AcpProbeResult } from "@/supervisor/agents/acp";
import {
  buildDeepSeekProbeCapabilities,
  deepSeekDefaultCapabilities,
} from "@/supervisor/agents/deepseek/detection";

vi.mock("@/renderer/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/bridge")>()),
  isWindows: () => false,
  isMac: () => false,
}));

const legacyOfficialFlash = '["deepseek-official","deepseek-v4-flash"]';
const officialFlash = '["deepseek-official","deepseek-flash"]';
const accountFlash = '["deepseek-account","deepseek-flash"]';
const accountPro = '["deepseek-account","deepseek-v4-pro"]';

// Native rc.2 Account-only snapshot: ACP retains its initial official route
// even though only the Account catalog has authenticated model access.
const accountOnlyProbe: AcpProbeResult = {
  models: [
    { id: legacyOfficialFlash, label: "DeepSeek V4 Flash" },
    { id: accountFlash, label: "DeepSeek V4.1 Flash" },
    { id: accountPro, label: "DeepSeek V4 Pro" },
  ],
  subProviders: [
    { id: "deepseek-official", label: "DeepSeek" },
    { id: "deepseek-account", label: "DeepSeek Account" },
  ],
  modelSubProvider: {
    [legacyOfficialFlash]: "deepseek-official",
    [accountFlash]: "deepseek-account",
    [accountPro]: "deepseek-account",
  },
  efforts: ["off", "low", "high", "max"],
  defaultEffort: "high",
  modelEfforts: {
    [legacyOfficialFlash]: ["off", "low", "high", "max"],
    [accountFlash]: ["off", "low", "high", "max"],
    [accountPro]: ["off", "low", "high", "max"],
  },
  modelDefaultEfforts: {
    [legacyOfficialFlash]: "high",
    [accountFlash]: "high",
    [accountPro]: "high",
  },
  supportsResume: true,
};

function detectedStatus(probe: AcpProbeResult): AgentStatus {
  return {
    kind: "deepseek",
    label: "DeepSeek Harness",
    installed: true,
    authState: "authenticated",
    capabilities: { ...deepSeekDefaultCapabilities, ...buildDeepSeekProbeCapabilities(probe) },
  };
}

const utilityResolvers = [
  resolveTitleGenConfig,
  resolveCommitGenConfig,
  resolveConflictResolverConfig,
];

describe("DeepSeek Harness renderer plugin", () => {
  it.each([
    ["native Account-only snapshot", accountOnlyProbe, accountFlash],
    [
      "Account catalog with the current official route retained synthetically",
      {
        ...accountOnlyProbe,
        models: [
          { id: officialFlash, label: "DeepSeek V4.1 Flash" },
          ...accountOnlyProbe.models!.slice(1),
        ],
        modelSubProvider: {
          [officialFlash]: "deepseek-official",
          [accountFlash]: "deepseek-account",
          [accountPro]: "deepseek-account",
        },
      },
      accountFlash,
    ],
    [
      "API-key-only catalog",
      {
        models: [
          { id: legacyOfficialFlash, label: "DeepSeek V4 Flash" },
          { id: officialFlash, label: "DeepSeek V4.1 Flash" },
        ],
        modelSubProvider: {
          [legacyOfficialFlash]: "deepseek-official",
          [officialFlash]: "deepseek-official",
        },
        efforts: ["off", "low", "high"],
        defaultEffort: "high",
      },
      officialFlash,
    ],
    [
      "Account catalog without Flash",
      {
        ...accountOnlyProbe,
        models: accountOnlyProbe.models!.filter((model) => model.id !== accountFlash),
      },
      accountPro,
    ],
  ] satisfies Array<[string, AcpProbeResult, string]>)(
    "uses an authenticated route for fresh drafts and utilities with %s",
    (_name, probe, expectedModel) => {
      const agent = detectedStatus(probe);
      expect(resolveProviderDraftConfig(agent)).toMatchObject({
        model: expectedModel,
        approvalPolicy: "never",
      });
      for (const resolve of utilityResolvers) {
        expect(resolve(agent, "", "")).toMatchObject({ model: expectedModel, effort: "low" });
      }
    },
  );

  it("preserves explicit model and effort selections after default-route normalization", () => {
    const agent = detectedStatus({
      ...accountOnlyProbe,
      models: [...accountOnlyProbe.models!, { id: officialFlash, label: "DeepSeek V4.1 Flash" }],
    });
    for (const model of [accountPro, officialFlash, legacyOfficialFlash]) {
      expect(resolveProviderDraftConfig(agent, { model, effort: "off" })).toMatchObject({
        model,
        effort: "off",
      });
      for (const resolve of utilityResolvers) {
        expect(resolve(agent, model, "off")).toMatchObject({ model, effort: "off" });
      }
    }
  });

  it("registers Chat controls and the native headless utility model", () => {
    expect(manifest.kind).toBe("deepseek");
    expect(getComposerControls(manifest.kind)).toBeDefined();
    for (const defaults of [
      getCommitGenDefaults(manifest.kind),
      getTitleGenDefaults(manifest.kind),
      getConflictResolverDefaults(manifest.kind),
    ]) {
      expect(defaults).toMatchObject({
        model: '["deepseek-account","deepseek-flash"]',
        effort: "low",
      });
    }
  });

  it("installs the same release channel exposed by the supervisor", () => {
    const entry = NATIVE_AGENT_REGISTRY_ENTRIES.find((candidate) => candidate.id === manifest.kind);
    expect(entry?.docsUrl).toBe("https://github.com/deepseek-ai/deepseek-harness");
    const install = entry?.installCommand({
      location: { kind: "posix", path: "/work" },
    } as Parameters<NonNullable<typeof entry>["installCommand"]>[0]);
    expect(install).toContain("npm install -g @deepseek-ai/dsh@next");
    expect(install).not.toContain("@latest");
  });
});
