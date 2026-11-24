import { describe, expect, it } from "vitest";
import { cursorModelGroup, cursorModelGrouping } from "./modelGrouping";

describe("cursorModelGroup", () => {
  it.each([
    ["auto", "cursor"],
    ["default", "cursor"],
    ["auto-smart", "cursor"],
    ["auto-smart[optimize_for=intelligence]", "cursor"],
    ["composer-2.5", "cursor"],
    ["composer-2.5-fast", "cursor"],
    ["composer-2.5[effort=high,fast=true]", "cursor"],
    ["grok-4.6", "cursor"],
    ["grok-4.5", "cursor"],
    ["grok-4.6-fast", "cursor"],
    ["grok-4.6[effort=high,fast=true]", "cursor"],
    ["composer-3", "cursor"],
    ["grok-4.7", "cursor"],
    ["composer-2", "cursor"],
    ["gpt-5.6-sol", "other"],
    ["gpt-5.6-luna", "other"],
    ["claude-opus-5", "other"],
    ["opus-5", "other"],
    ["sonnet-5", "other"],
    ["gemini-3.7-flash", "other"],
    ["kimi-k3", "other"],
    ["glm-5.1", "other"],
    ["muse-wonder", "other"],
    ["muse-wonder-max", "other"],
    ["muse-spark-1.3", "other"],
    ["muse-spark-1.3-fast", "other"],
    ["muse-wonder[effort=high,fast=true]", "other"],
    ["Muse-Spark-1.3", "other"],
    ["deepseek-v41-flash-1017", "other"],
    ["deepseek-v4-flash-high", "other"],
    ["new-vendor-model", "other"],
  ] as const)("%s → %s", (modelId, group) => {
    expect(cursorModelGroup(modelId)).toBe(group);
  });
});

describe("cursorModelGrouping", () => {
  it("groups Cursor pool families under Cursor Models and every other id under Other models", () => {
    expect(
      cursorModelGrouping([
        { id: "composer-2.5", label: "Composer 2.5" },
        { id: "grok-4.6", label: "Cursor Grok 4.6" },
        { id: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
        { id: "muse-wonder", label: "Muse Wonder" },
        { id: "muse-spark-1.3", label: "Muse Spark 1.3" },
        { id: "deepseek-v41-flash-1017", label: "DeepSeek V4.1 Flash 1017" },
        { id: "new-vendor-model", label: "New Vendor Model" },
      ]),
    ).toEqual({
      subProviders: [
        { id: "cursor", label: "Cursor Models" },
        { id: "other", label: "Other models" },
      ],
      modelSubProvider: {
        "composer-2.5": "cursor",
        "grok-4.6": "cursor",
        "gpt-5.6-luna": "other",
        "muse-wonder": "other",
        "muse-spark-1.3": "other",
        "deepseek-v41-flash-1017": "other",
        "new-vendor-model": "other",
      },
    });
  });
});
