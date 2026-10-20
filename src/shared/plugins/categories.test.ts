import { describe, expect, it } from "vitest";
import {
  canonicalPluginCategory,
  PLUGIN_CATEGORY_OTHER,
  PLUGIN_CATEGORY_ORDER,
  pluginCategorySortOrder,
} from "./categories";

describe("plugin category normalization", () => {
  it.each([
    ["development", "developer-tools"],
    ["Developer Tools", "developer-tools"],
    ["developer-tools", "developer-tools"],
    ["DevTools", "developer-tools"],
    ["Productivity", "productivity"],
    ["automation", "automation"],
    ["Communication", "communication"],
    ["database", "data-analytics"],
    ["Data & Analytics", "data-analytics"],
    ["monitoring", "monitoring"],
    ["Security", "security"],
    ["design", "design"],
    ["Creativity", "design"],
    ["deployment", "deployment"],
    ["Education & Research", "learning-research"],
    ["math", "learning-research"],
    ["finance", "finance"],
    ["Testing", "testing"],
    ["location", "location"],
    ["Migration", "migration"],
    ["Business & Operations", "business-operations"],
  ])("maps %s to %s", (raw, expected) => {
    expect(canonicalPluginCategory(raw)).toBe(expected);
  });

  it("leaves empty and unknown values for the caller to decide", () => {
    expect(canonicalPluginCategory(undefined)).toBeUndefined();
    expect(canonicalPluginCategory("   ")).toBeUndefined();
    expect(canonicalPluginCategory("customer success")).toBeUndefined();
    expect(canonicalPluginCategory("Other")).toBeUndefined();
  });

  it("keeps every canonical id ordered and puts other last", () => {
    expect(new Set(PLUGIN_CATEGORY_ORDER).size).toBe(PLUGIN_CATEGORY_ORDER.length);
    expect(pluginCategorySortOrder(PLUGIN_CATEGORY_ORDER[0]!)).toBe(0);
    expect(pluginCategorySortOrder(PLUGIN_CATEGORY_ORDER.at(-1)!)).toBe(
      PLUGIN_CATEGORY_ORDER.length - 1,
    );
    expect(pluginCategorySortOrder(PLUGIN_CATEGORY_OTHER)).toBeGreaterThan(
      pluginCategorySortOrder(PLUGIN_CATEGORY_ORDER.at(-1)!),
    );
  });
});
