// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { AgentCapability, AgentStatus } from "@/shared/contracts";
import {
  resolveFastValue,
  resolveProviderDraftConfig,
  resolveThinkingValue,
} from "./threadDraftViewHelpers";

const capabilities = {
  models: [
    { id: "fast-capable", label: "Fast Capable" },
    { id: "plain", label: "Plain" },
  ],
  efforts: ["low", "high"],
  modelEfforts: { "fast-capable": ["low", "high"], plain: ["high"] },
  fastModels: ["fast-capable"],
  thinkingModels: [],
  modes: ["agent"],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "direct",
  presentationMode: "gui",
  settingDefs: [],
} as unknown as AgentCapability;

function agentWith(overrides?: Partial<AgentCapability>): AgentStatus {
  return {
    kind: "test",
    label: "Test",
    installed: true,
    authState: "authenticated",
    capabilities: { ...capabilities, ...overrides },
  } as unknown as AgentStatus;
}

describe("resolveProviderDraftConfig fast mode", () => {
  it("turns Fast on for a supported model when nothing was saved", () => {
    expect(resolveProviderDraftConfig(agentWith(), { model: "fast-capable" }).fast).toBe(true);
  });

  it("keeps Fast off when the saved draft explicitly disabled it", () => {
    expect(
      resolveProviderDraftConfig(agentWith(), { model: "fast-capable", fast: false }).fast,
    ).toBe(false);
  });

  it("leaves Fast off for a model that does not support it", () => {
    expect(resolveProviderDraftConfig(agentWith(), { model: "plain" }).fast).toBeUndefined();
  });

  it("leaves Fast off when the account cannot use it", () => {
    const gated = agentWith({ fastDisabledReason: "Fast requests are disabled for this account." });
    expect(resolveProviderDraftConfig(gated, { model: "fast-capable" }).fast).toBeUndefined();
  });
});

describe("resolveFastValue", () => {
  // AI helpers resolve `fast` through this helper, so its default stays opt-in
  // and background work never spends fast requests on its own.
  it("stays off without an explicit preference", () => {
    expect(resolveFastValue(agentWith(), "fast-capable")).toBe(false);
  });

  it("honours an explicit preference for a supported model", () => {
    expect(resolveFastValue(agentWith(), "fast-capable", true)).toBe(true);
  });

  it("refuses an explicit preference for an unsupported model", () => {
    expect(resolveFastValue(agentWith(), "plain", true)).toBe(false);
  });
});

describe("resolveProviderDraftConfig thinking mode", () => {
  const thinkingAgent = () => agentWith({ thinkingModels: ["plain"] });

  it("turns Thinking on for a supported model when nothing was saved", () => {
    expect(resolveProviderDraftConfig(thinkingAgent(), { model: "plain" }).thinking).toBe(true);
  });

  it("keeps Thinking off when the saved draft explicitly disabled it", () => {
    expect(
      resolveProviderDraftConfig(thinkingAgent(), { model: "plain", thinking: false }).thinking,
    ).toBe(false);
  });

  it("leaves Thinking absent for a model that does not support it", () => {
    expect(
      resolveProviderDraftConfig(thinkingAgent(), { model: "fast-capable" }).thinking,
    ).toBeUndefined();
  });
});

describe("resolveThinkingValue", () => {
  it("stays off without an explicit preference outside composer default resolution", () => {
    expect(resolveThinkingValue(agentWith({ thinkingModels: ["plain"] }), "plain")).toBe(false);
  });
});
