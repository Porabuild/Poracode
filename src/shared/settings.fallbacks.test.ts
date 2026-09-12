import { describe, expect, it } from "vitest";
import { crossagentRoutingOverrideSchema, normalizeSharedSettings } from "./settings";

describe("crossagentRoutingOverrides fallbacks", () => {
  it("parses and preserves a legacy override without fallback fields", () => {
    const normalized = normalizeSharedSettings({
      crossagentRoutingOverrides: [
        { tags: ["review"], agentKind: "claude", modelId: "sonnet", updatedAt: 1 },
      ],
    });
    expect(normalized.crossagentRoutingOverrides[0]).toEqual({
      tags: ["review"],
      agentKind: "claude",
      modelId: "sonnet",
      updatedAt: 1,
    });
  });

  it("parses and preserves fallbacks and retryMode on a new override", () => {
    const normalized = normalizeSharedSettings({
      crossagentRoutingOverrides: [
        {
          tags: ["implementation", "backend"],
          agentKind: "codex",
          modelId: "gpt-5.5",
          fallbacks: [
            { agentKind: "claude", modelId: "sonnet" },
            { agentKind: "kimi", effort: "high" },
          ],
          retryMode: "any-failure",
          updatedAt: 2,
        },
      ],
    });
    expect(normalized.crossagentRoutingOverrides[0]).toMatchObject({
      agentKind: "codex",
      modelId: "gpt-5.5",
      fallbacks: [
        { agentKind: "claude", modelId: "sonnet" },
        { agentKind: "kimi", effort: "high" },
      ],
      retryMode: "any-failure",
    });
  });

  it("keeps the persisted fallback limit at three", () => {
    const parsed = crossagentRoutingOverrideSchema.safeParse({
      tags: ["implementation"],
      agentKind: "codex",
      fallbacks: Array.from({ length: 4 }, (_, index) => ({
        agentKind: `provider-${index}`,
      })),
      updatedAt: 2,
    });

    expect(parsed.success).toBe(false);
  });

  it("migrates retired Qwen model ids in fallback entries", () => {
    const normalized = normalizeSharedSettings({
      crossagentRoutingOverrides: [
        {
          tags: ["backend"],
          agentKind: "qwen",
          modelId: "qwen3.8-max-preview",
          fallbacks: [{ agentKind: "qwen", modelId: "qwen3.8-max-preview" }],
          updatedAt: 3,
        },
      ],
    });
    expect(normalized.crossagentRoutingOverrides[0]?.modelId).toBe("qwen3.8-max");
    expect(normalized.crossagentRoutingOverrides[0]?.fallbacks?.[0]?.modelId).toBe("qwen3.8-max");
  });

  it("migrates a nested Antigravity fallback when it is the only legacy remnant", () => {
    const normalized = normalizeSharedSettings({
      crossagentRoutingOverrides: [
        {
          tags: ["review"],
          agentKind: "codex",
          fallbacks: [
            {
              agentKind: "acp-generic:antigravity-acp",
              modelId: "gemini-3.5-flash-low",
            },
          ],
          updatedAt: 4,
        },
      ],
    });
    expect(normalized.crossagentRoutingOverrides[0]?.fallbacks).toEqual([
      {
        agentKind: "antigravity",
        modelId: "gemini-3.5-flash",
        effort: "Medium",
      },
    ]);
  });
});
