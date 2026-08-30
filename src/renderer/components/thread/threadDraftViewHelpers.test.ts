// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { AgentCapability, AgentStatus } from "@/shared/contracts";
import {
  resolveApprovalPolicyValue,
  resolveFastValue,
  resolveProviderDraftConfig,
  resolveSavedProviderDraftConfig,
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

  it("normalizes Cursor profile bracket models before resolving draft controls", () => {
    expect(
      resolveProviderDraftConfig(
        {
          ...agentWith(),
          kind: "cursor:work",
          label: "Cursor Work",
          capabilities: {
            ...capabilities,
            models: [{ id: "gpt-5.1-codex-max", label: "Codex 5.1 Max" }],
            modelEfforts: { "gpt-5.1-codex-max": ["high"] },
            fastModels: ["gpt-5.1-codex-max"],
            thinkingModels: ["gpt-5.1-codex-max"],
          },
        },
        { model: "gpt-5.1-codex-high-thinking-fast" },
      ),
    ).toMatchObject({
      model: "gpt-5.1-codex-max",
      effort: "high",
      fast: true,
      thinking: true,
    });
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

describe("resolveSavedProviderDraftConfig", () => {
  it("fills an omitted context window and model controls from app-wide preferences", () => {
    const resolved = resolveSavedProviderDraftConfig(
      "codex",
      { agentKind: "codex", model: "gpt-5.6-sol", effort: "high" },
      {
        codex: {
          model: "gpt-5.6-sol",
          contextSize: "400k",
          effort: "medium",
          fast: false,
        },
      },
    );

    expect(resolved).toMatchObject({
      model: "gpt-5.6-sol",
      effort: "medium",
      contextSize: "400k",
      fast: false,
    });
  });

  it("uses global model preferences instead of a different project's effort and Fast", () => {
    expect(
      resolveSavedProviderDraftConfig(
        "codex",
        {
          agentKind: "codex",
          model: "gpt-5.6-luna",
          effort: "low",
          fast: false,
        },
        { codex: { model: "gpt-5.6-sol", effort: "high", fast: false } },
        {
          codex: {
            "gpt-5.6-luna": { effort: "max", fast: true },
            "gpt-5.6-sol": { effort: "high", fast: false },
          },
        },
      ),
    ).toMatchObject({ model: "gpt-5.6-luna", effort: "max", fast: true });
  });

  it("keeps an explicit last-draft context size over the provider preset", () => {
    expect(
      resolveSavedProviderDraftConfig(
        "codex",
        { agentKind: "codex", model: "gpt-5.6-sol", contextSize: "1m" },
        { codex: { model: "gpt-5.6-sol", contextSize: "400k" } },
      ),
    ).toMatchObject({ contextSize: "1m" });
  });
});

describe("resolveApprovalPolicyValue", () => {
  const guiPolicies = [
    { id: "default", label: "Default" },
    { id: "auto_edit", label: "Auto Edit" },
    { id: "never", label: "YOLO" },
  ];

  it("keeps a saved policy the surface still advertises", () => {
    const agent = agentWith({ approvalPolicies: guiPolicies, defaultApprovalPolicy: "never" });
    expect(resolveApprovalPolicyValue(agent, "auto_edit")).toBe("auto_edit");
  });

  it("falls back to the declared default when the saved policy belongs to another runtime", () => {
    // Antigravity's `agy` CLI names full bypass `yolo`; its Chat runtime calls
    // the same posture `never`. Carrying `yolo` through left the composer with
    // nothing selected.
    const agent = agentWith({ approvalPolicies: guiPolicies, defaultApprovalPolicy: "never" });
    expect(resolveApprovalPolicyValue(agent, "yolo")).toBe("never");
    expect(resolveApprovalPolicyValue(agent, "")).toBe("never");
    expect(resolveApprovalPolicyValue(agent, undefined)).toBe("never");
  });

  it("falls back to the first policy when the declared default is not advertised either", () => {
    const agent = agentWith({ approvalPolicies: guiPolicies, defaultApprovalPolicy: "yolo" });
    expect(resolveApprovalPolicyValue(agent, "yolo")).toBe("default");
  });

  it("stays empty for a provider that advertises no policies", () => {
    expect(resolveApprovalPolicyValue(agentWith(), "yolo")).toBe("");
  });
});
