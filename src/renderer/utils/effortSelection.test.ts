import { describe, expect, it } from "vitest";
import type { AgentCapability } from "@/shared/contracts";
import { resolvePreferredEffort } from "./effortSelection";

const capabilities = {
  efforts: ["low", "medium", "high"],
  defaultEffort: "low",
  modelEfforts: {
    tiered: ["max", "low", "extra-high", "medium"],
    disabled: ["off"],
    untiered: [],
  },
  modelDefaultEfforts: { tiered: "low" },
} as unknown as AgentCapability;

describe("resolvePreferredEffort", () => {
  it("prefers the highest model tier over declared defaults and discovery order", () => {
    expect(resolvePreferredEffort(capabilities, "tiered")).toBe("max");
    expect(resolvePreferredEffort(capabilities, "unprobed")).toBe("high");
  });

  it("preserves a saved lower tier and replaces a stale saved tier", () => {
    expect(resolvePreferredEffort(capabilities, "tiered", "low")).toBe("low");
    expect(resolvePreferredEffort(capabilities, "tiered", "unsupported")).toBe("max");
  });

  it("honors models that disable or do not support effort", () => {
    expect(resolvePreferredEffort(capabilities, "disabled")).toBe("off");
    expect(resolvePreferredEffort(capabilities, "untiered", "high")).toBe("");
  });

  it("does not rank automatic defaults or disabled reasoning above explicit tiers", () => {
    const defaults = { ...capabilities, efforts: ["off", "low", "high", "default", "auto"] };
    expect(resolvePreferredEffort(defaults, "unprobed")).toBe("high");
    expect(resolvePreferredEffort(defaults, "unprobed", "off")).toBe("off");
  });

  it("keeps provider-specific top tiers and does not mutate their ladder", () => {
    const extended = { ...capabilities, efforts: ["low", "high", "ultra"] };
    expect(resolvePreferredEffort(extended, "unprobed")).toBe("ultra");
    expect(extended.efforts).toEqual(["low", "high", "ultra"]);
  });

  it.each(["default", "auto"])("keeps the enabled %s default on untiered selectors", (enabled) => {
    const untiered = { ...capabilities, efforts: ["none", enabled], defaultEffort: enabled };
    expect(resolvePreferredEffort(untiered, "unprobed")).toBe(enabled);
    expect(resolvePreferredEffort(untiered, "unprobed", "none")).toBe("none");
  });
});
