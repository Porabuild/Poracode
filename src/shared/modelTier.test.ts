import { describe, expect, it } from "vitest";
import { classifyModelTier, pickCheaperHelperModel } from "./modelTier";

describe("classifyModelTier", () => {
  it.each([
    ["claude-haiku-4", "Haiku 4", "fast-cheap"],
    ["gpt-5-mini", "GPT-5 Mini", "fast-cheap"],
    ["gemini-flash", "Gemini Flash", "fast-cheap"],
    ["gpt-5-nano", "GPT-5 Nano", "fast-cheap"],
    ["codex-lite", "Codex Lite", "fast-cheap"],
    ["some-small-model", "Small Model", "fast-cheap"],
    ["codex-spark-5.3", "Spark 5.3", "fast-cheap"],
    ["model-fast", "Fast Mode", "fast-cheap"],
    ["claude-opus-4", "Opus 4.8", "max-capability"],
    ["fable-5", "Fable 5", "max-capability"],
    ["gemini-pro", "Gemini Pro", "max-capability"],
    ["gpt-5-max", "GPT-5 Max", "max-capability"],
    ["model-ultra", "Ultra", "max-capability"],
    ["big-model", "Big Model", "max-capability"],
    ["claude-sonnet-4.5", "Sonnet 4.5", "balanced"],
    ["gpt-5.5", "GPT-5.5", "balanced"],
    ["gemini-2.5", "Gemini 2.5", "balanced"],
  ])("classifies %s / %s as %s", (id, label, expected) => {
    expect(classifyModelTier(id, label)).toBe(expected);
  });

  it("matches keywords case-insensitively", () => {
    expect(classifyModelTier("HAIKU-4", "MODEL")).toBe("fast-cheap");
    expect(classifyModelTier("model", "OPUS 4.8")).toBe("max-capability");
  });
});

describe("pickCheaperHelperModel", () => {
  const lead = { agentKind: "alpha", model: "alpha-opus" };

  it("searches the cheapest tier first", () => {
    const fast = { agentKind: "beta", model: "beta-core", label: "Beta Mini" };
    expect(
      pickCheaperHelperModel(
        [
          { agentKind: "beta", model: "beta-opus" },
          { agentKind: "beta", model: "beta-sonnet" },
          fast,
        ],
        lead,
      ),
    ).toBe(fast);
    expect(
      pickCheaperHelperModel(
        [
          { agentKind: "beta", model: "beta-opus" },
          { agentKind: "beta", model: "beta-sonnet" },
        ],
        lead,
      ),
    ).toEqual({ agentKind: "beta", model: "beta-sonnet" });
  });

  it("prefers the lead's provider within a tier and keeps candidate order otherwise", () => {
    expect(
      pickCheaperHelperModel(
        [
          { agentKind: "beta", model: "beta-haiku" },
          { agentKind: "gamma", model: "gamma-haiku" },
          { agentKind: "alpha", model: "alpha-haiku" },
        ],
        lead,
      ),
    ).toEqual({ agentKind: "alpha", model: "alpha-haiku" });
    expect(
      pickCheaperHelperModel(
        [
          { agentKind: "beta", model: "beta-haiku" },
          { agentKind: "gamma", model: "gamma-haiku" },
          { agentKind: "alpha", model: "alpha-sonnet" },
        ],
        lead,
      ),
    ).toEqual({ agentKind: "beta", model: "beta-haiku" });
  });

  it("never picks the lead's exact model while another candidate exists", () => {
    const fastLead = { agentKind: "alpha", model: "alpha-haiku" };
    expect(
      pickCheaperHelperModel(
        [
          { agentKind: "alpha", model: "alpha-haiku" },
          { agentKind: "alpha", model: "alpha-opus" },
        ],
        fastLead,
      ),
    ).toEqual({ agentKind: "alpha", model: "alpha-opus" });
    // The same model id under another provider is a different model.
    expect(
      pickCheaperHelperModel(
        [
          { agentKind: "alpha", model: "alpha-haiku" },
          { agentKind: "beta", model: "alpha-haiku" },
        ],
        fastLead,
      ),
    ).toEqual({ agentKind: "beta", model: "alpha-haiku" });
  });

  it("falls back to the lead's model when it is the only candidate", () => {
    const only = { agentKind: "alpha", model: "alpha-opus" };
    expect(pickCheaperHelperModel([only], lead)).toBe(only);
  });

  it("returns undefined without candidates", () => {
    expect(pickCheaperHelperModel([], lead)).toBeUndefined();
  });
});
