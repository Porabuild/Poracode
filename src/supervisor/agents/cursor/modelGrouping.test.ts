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
    ["gpt-5.6-sol", "other"],
    ["gpt-5.6-luna", "other"],
    ["claude-opus-5", "other"],
    ["opus-5", "other"],
    ["sonnet-5", "other"],
    ["gemini-3.7-flash", "other"],
    ["kimi-k3", "other"],
    ["glm-5.1", "other"],
  ] as const)("%s → %s", (modelId, group) => {
    expect(cursorModelGroup(modelId)).toBe(group);
  });
});

describe("cursorModelGrouping", () => {
  it("keeps unknown Cursor ids in Cursor Models and third-party vendors in Other", () => {
    expect(
      cursorModelGrouping([
        { id: "composer-2.5", label: "Composer 2.5" },
        { id: "grok-4.6", label: "Cursor Grok 4.6" },
        { id: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
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
      },
    });
  });
});
