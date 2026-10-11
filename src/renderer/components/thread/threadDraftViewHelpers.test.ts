// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { AgentCapability, AgentStatus } from "@/shared/contracts";
import {
  launchSelectionFields,
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

const familyCaps = {
  ...capabilities,
  models: [
    ...capabilities.models,
    { id: "fusion-a-b", label: "Fusion A B" },
    { id: "fusion-a-b-fast", label: "Fusion A B Fast" },
  ],
  modelFamilies: [
    {
      model: "fusion-a-b",
      label: "Fusion",
      selectors: [
        {
          id: "lead",
          labelKey: "modelSelection.lead",
          options: [{ id: "a", label: "A" }],
        },
        {
          id: "sidekick",
          labelKey: "modelSelection.sidekick",
          options: [{ id: "b", label: "B" }],
        },
      ],
      bindings: { effort: "model", fast: "model" },
      members: [
        {
          model: "fusion-a-b",
          selections: { lead: "a", sidekick: "b" },
          effort: "low",
          fast: false,
        },
        {
          model: "fusion-a-b-fast",
          selections: { lead: "a", sidekick: "b" },
          effort: "low",
          fast: true,
        },
      ],
    },
  ],
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

  it("lifts context size from a Cursor ACP bracket model id", () => {
    expect(
      resolveProviderDraftConfig(
        {
          ...agentWith(),
          kind: "cursor",
          label: "Cursor",
          capabilities: {
            ...capabilities,
            models: [{ id: "gpt-5.5", label: "GPT-5.5" }],
            modelEfforts: { "gpt-5.5": ["medium", "high"] },
            contextSizes: [
              { id: "272k", label: "272K" },
              { id: "1m", label: "1M" },
            ],
            modelContextSizes: { "gpt-5.5": ["272k", "1m"] },
          },
        },
        { model: "gpt-5.5[context=1m,reasoning=medium]" },
      ),
    ).toMatchObject({
      model: "gpt-5.5",
      effort: "medium",
      contextSize: "1m",
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

  it("keeps a saved family member's own carriers instead of the preference overlay", () => {
    // A Terminal-side draft saved a family member with inert seeds. The same
    // UID carries an app-wide GUI preference (high + Fast) — replaying it onto
    // the encoded axes would turn the valid draft into a rejected state.
    const fromProjectDraft = resolveSavedProviderDraftConfig(
      "codex",
      { agentKind: "codex", model: "fusion-a-b", effort: "", fast: false },
      { codex: { model: "fusion-a-b", contextSize: "400k" } },
      { codex: { "fusion-a-b": { effort: "high", fast: true } } },
      familyCaps,
    );
    expect(fromProjectDraft).toMatchObject({ model: "fusion-a-b", effort: "", fast: false });
    // The provider preset still fills a missing context window.
    expect(fromProjectDraft).toMatchObject({ contextSize: "400k" });

    // Same rule for the provider-config branch: the saved pair plus its
    // independent carriers stays exactly as saved.
    expect(
      resolveSavedProviderDraftConfig(
        "codex",
        undefined,
        { codex: { model: "fusion-a-b", effort: "", fast: false } },
        { codex: { "fusion-a-b": { effort: "high", fast: true } } },
        familyCaps,
      ),
    ).toMatchObject({ model: "fusion-a-b", effort: "", fast: false });

    // Without the surface capabilities the historical preference overlay is
    // unchanged (both branches keep their previous behavior).
    expect(
      resolveSavedProviderDraftConfig(
        "codex",
        { agentKind: "codex", model: "fusion-a-b", effort: "", fast: false },
        {},
        { codex: { "fusion-a-b": { effort: "high", fast: true } } },
      ),
    ).toMatchObject({ model: "fusion-a-b", effort: "high", fast: true });
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

describe("family draft carrier presence", () => {
  const binding = {
    version: 1 as const,
    kind: "family-member" as const,
    owner: { agentKind: "codex", presentationMode: "terminal" as const },
    model: "fusion-a-b",
    inertValues: { effort: "", fast: false },
  };

  it("keeps a saved family member's own empty context instead of the provider preset", () => {
    expect(
      resolveSavedProviderDraftConfig(
        "codex",
        { agentKind: "codex", model: "fusion-a-b", effort: "", fast: false, contextSize: "" },
        { codex: { model: "fusion-a-b", contextSize: "400k" } },
        {},
        familyCaps,
      ),
    ).toMatchObject({ contextSize: "" });
  });

  it("restores a family member's empty context and recorded binding verbatim", () => {
    const resolved = resolveProviderDraftConfig(agentWith(familyCaps), {
      model: "fusion-a-b",
      effort: "",
      fast: false,
      contextSize: "",
      selectionBinding: binding,
    });
    expect(resolved).toMatchObject({ model: "fusion-a-b", effort: "", fast: false });
    expect(resolved.contextSize).toBe("");
    expect(resolved.selectionBinding).toEqual(binding);
  });

  it("launches a family member's exact own carriers and binding", () => {
    expect(
      launchSelectionFields(
        {
          model: "fusion-a-b",
          effort: "",
          contextSize: "",
          fast: false,
          thinking: false,
          selectionBinding: binding,
        },
        familyCaps,
      ),
    ).toStrictEqual({
      model: "fusion-a-b",
      effort: "",
      contextSize: "",
      fast: false,
      thinking: false,
      selectionBinding: binding,
    });
    // Absence stays absence.
    expect(launchSelectionFields({ model: "fusion-a-b", fast: false }, familyCaps)).toStrictEqual({
      model: "fusion-a-b",
      fast: false,
    });
  });

  it("keeps the ordinary projection for models outside a family", () => {
    expect(
      launchSelectionFields(
        {
          model: "plain",
          effort: "",
          contextSize: "",
          fast: false,
          thinking: false,
          selectionBinding: binding,
        },
        familyCaps,
      ),
    ).toStrictEqual({ model: "plain" });
    expect(
      launchSelectionFields({ model: "fast-capable", effort: "high", fast: false }, familyCaps),
    ).toStrictEqual({ model: "fast-capable", effort: "high", fast: false });
  });
});
