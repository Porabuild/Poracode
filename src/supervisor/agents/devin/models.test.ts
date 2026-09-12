import { describe, expect, it } from "vitest";
import {
  devinModelCapabilities,
  parseDevinModelCatalog,
  resolveDevinAcpModel,
  resolveDevinModel,
} from "./models";

const families = parseDevinModelCatalog(
  JSON.stringify({
    families: [
      {
        family_label: "GPT-5.6 Sol",
        slug: "gpt-5.6-sol",
        variants: [
          { model_uid: "gpt-5-6-sol-medium", label: "GPT-5.6 Sol Medium Thinking" },
          { model_uid: "gpt-5-6-sol-none", label: "GPT-5.6 Sol No Thinking" },
          { model_uid: "gpt-5-6-sol-medium-priority", label: "GPT-5.6 Sol Medium Thinking Fast" },
          { model_uid: "gpt-5-6-sol-none-priority", label: "GPT-5.6 Sol No Thinking Fast" },
        ],
      },
      {
        family_label: "Claude Opus 4.5",
        slug: "claude-opus-4.5",
        variants: [
          { model_uid: "MODEL_CLAUDE_4_5_OPUS", label: "Claude Opus 4.5" },
          { model_uid: "MODEL_CLAUDE_4_5_OPUS_THINKING", label: "Claude Opus 4.5 Thinking" },
        ],
      },
      {
        family_label: "GLM-5.2",
        slug: "glm-5.2",
        variants: [
          { model_uid: "glm-5-2", label: "GLM-5.2 High" },
          { model_uid: "glm-5-2-max", label: "GLM-5.2 Max" },
          { model_uid: "glm-5-2-max-1m", label: "GLM-5.2 Max 1M" },
        ],
      },
      {
        family_label: "SWE-1.6 Fast",
        slug: "swe-1.6-fast",
        variants: [{ model_uid: "swe-1-6-fast", label: "SWE-1.6 Fast" }],
      },
    ],
  }),
);

describe("Devin model families", () => {
  it("shows families once and declares independent effort, speed, thinking and context controls", () => {
    const caps = devinModelCapabilities(families);
    expect(caps.models.map((m) => m.label)).toEqual([
      "GPT-5.6 Sol",
      "Claude Opus 4.5",
      "GLM-5.2",
      "SWE-1.6 Fast",
    ]);
    expect(caps.modelEfforts["gpt-5-6-sol-medium"]).toEqual(["none", "medium"]);
    expect(caps.modelDefaultEfforts?.["gpt-5-6-sol-medium"]).toBe("medium");
    expect(caps.fastModels).toEqual(["gpt-5-6-sol-medium"]);
    expect(caps.thinkingModels).toEqual(["MODEL_CLAUDE_4_5_OPUS"]);
    expect(caps.modelContextSizes?.["glm-5-2"]).toEqual(["default", "1m"]);
  });
  it("maps effort and speed to actual priority IDs and reverses both controls", () => {
    expect(
      resolveDevinModel({ model: "gpt-5-6-sol-medium", effort: "none", fast: true }, families),
    ).toBe("gpt-5-6-sol-none-priority");
    expect(
      resolveDevinModel({ model: "gpt-5-6-sol-medium", effort: "medium", fast: false }, families),
    ).toBe("gpt-5-6-sol-medium");
  });
  it("resolves opaque IDs, context, and persisted legacy variants", () => {
    expect(resolveDevinModel({ model: "MODEL_CLAUDE_4_5_OPUS", thinking: true }, families)).toBe(
      "MODEL_CLAUDE_4_5_OPUS_THINKING",
    );
    expect(
      resolveDevinModel({ model: "glm-5-2", effort: "max", contextSize: "1m" }, families),
    ).toBe("glm-5-2-max-1m");
    expect(resolveDevinModel({ model: "gpt-5-6-sol-none-priority" }, families)).toBe(
      "gpt-5-6-sol-none-priority",
    );
  });
  it("never silently runs an unsupported control combination", () => {
    expect(() =>
      resolveDevinModel({ model: "glm-5-2", effort: "high", contextSize: "1m" }, families),
    ).toThrow("Unsupported model configuration");
    expect(() => parseDevinModelCatalog('{"families": [{"variants": []}]}')).toThrow(
      /invalid_type/,
    );
  });
  it("resolves the live ACP config option using provider IDs", () => {
    expect(
      resolveDevinAcpModel(families, { model: "gpt-5-6-sol-medium", fast: true }, [
        {
          id: "model",
          type: "select",
          category: "model",
          currentValue: "gpt-5-6-sol-medium",
          options: [],
        },
      ]),
    ).toEqual({
      configId: "model",
      value: "gpt-5-6-sol-medium-priority",
      currentValue: "gpt-5-6-sol-medium",
    });
  });
});

it("preserves distinct pricing descriptions including free variants in the family catalog", () => {
  const data = parseDevinModelCatalog(
    JSON.stringify({
      families: [
        {
          family_label: "Family",
          slug: "family",
          variants: [
            { model_uid: "family-high", label: "Family High", cost_tier: "Free" },
            {
              model_uid: "family-max",
              label: "Family Max",
              cost_summary: "$1 / 1M Input · $0.1 / 1M Cached input · $2 / 1M Output",
            },
            {
              model_uid: "family-low",
              label: "Family Low",
              cost_summary: "$1 / 1M Input · $0.1 / 1M Cached input · $2 / 1M Output",
            },
          ],
        },
      ],
    }),
  );
  expect(devinModelCapabilities(data).models[0]?.description).toBe(
    "Free\n$1 / 1M Input · $0.1 / 1M Cached input · $2 / 1M Output",
  );
});
