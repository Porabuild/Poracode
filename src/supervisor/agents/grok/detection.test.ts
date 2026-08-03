import { describe, expect, it } from "vitest";
import { buildGrokProviderMetadata, mapGrokEffortCapabilities } from "./detection";

// Model `_meta` shapes as returned live by `grok agent stdio` 0.2.118
// (initialize/_meta.modelState and session/new `models.availableModels[]._meta`).
const GROK_45_META = {
  totalContextTokens: 500_000,
  agentType: "grok-build-plan",
  supportsReasoningEffort: true,
  reasoningEffort: "high",
  reasoningEfforts: [
    { id: "high", value: "high", label: "High Effort", default: true },
    { id: "medium", value: "medium", label: "Medium Effort", default: false },
    { id: "low", value: "low", label: "Low Effort", default: false },
  ],
};

const MODEL_WITHOUT_EFFORT_META = {
  totalContextTokens: 200_000,
  agentType: "cursor",
};

describe("mapGrokEffortCapabilities", () => {
  it("derives ascending effort tiers and the advertised default", () => {
    const caps = mapGrokEffortCapabilities({
      "grok-4.5": GROK_45_META,
      "model-without-effort": MODEL_WITHOUT_EFFORT_META,
    });
    expect(caps.efforts).toEqual(["low", "medium", "high"]);
    expect(caps.defaultEffort).toBe("high");
  });

  it("gives models without tiers an explicit empty list so the picker hides effort", () => {
    const caps = mapGrokEffortCapabilities({
      "grok-4.5": GROK_45_META,
      "model-without-effort": MODEL_WITHOUT_EFFORT_META,
    });
    expect(caps.modelEfforts).toEqual({
      "grok-4.5": ["low", "medium", "high"],
      "model-without-effort": [],
    });
  });

  it("keeps unknown tier ids after the known ones in their original order", () => {
    const caps = mapGrokEffortCapabilities({
      m: {
        reasoningEfforts: [
          { id: "turbo", default: false },
          { id: "low", default: true },
          { id: "hyper", default: false },
        ],
      },
    });
    expect(caps.modelEfforts["m"]).toEqual(["low", "turbo", "hyper"]);
    expect(caps.defaultEffort).toBe("low");
  });

  it("returns empty capabilities when metadata is missing or malformed", () => {
    expect(mapGrokEffortCapabilities(undefined)).toEqual({ efforts: [], modelEfforts: {} });
    expect(mapGrokEffortCapabilities({ m: { reasoningEfforts: "nope" as unknown } })).toEqual({
      efforts: [],
      modelEfforts: { m: [] },
    });
  });
});

describe("buildGrokProviderMetadata", () => {
  it("maps the 0.2.x authenticate _meta fields, including team_name → organization", () => {
    expect(
      buildGrokProviderMetadata({
        email: "dev@example.com",
        auth_mode: "Oidc",
        subscription_tier: "X Premium+",
        team_name: "Acme",
        team_id: "t-1",
        is_zdr: false,
      }),
    ).toEqual({
      authenticatedAs: "dev@example.com",
      organization: "Acme",
      plan: "X Premium+",
      authMethod: "OIDC",
    });
  });

  it("omits organization when team_name is null (personal accounts)", () => {
    expect(buildGrokProviderMetadata({ email: "dev@example.com", team_name: null })).toEqual({
      authenticatedAs: "dev@example.com",
    });
  });
});
