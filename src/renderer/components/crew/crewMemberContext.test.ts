import { describe, expect, it } from "vitest";
import type { AgentCapability } from "@/shared/contracts";
import { contextSizeValueFor, contextSizesFor } from "./CrewMemberRow";

const capabilities = {
  models: [
    { id: "wide", label: "Wide" },
    { id: "narrow", label: "Narrow" },
  ],
  contextSizes: [
    { id: "200k", label: "200k" },
    { id: "1m", label: "1M" },
  ],
  modelContextSizes: { wide: ["200k", "1m"], narrow: ["200k"] },
  defaultContextSize: "200k",
} as unknown as AgentCapability;

describe("crew member context length", () => {
  it("offers a choice only when the model has two or more context lengths", () => {
    expect(contextSizesFor(capabilities, "wide").map((size) => size.id)).toEqual(["200k", "1m"]);
    expect(contextSizesFor(capabilities, "narrow")).toEqual([]);
    expect(contextSizesFor(undefined, "wide")).toEqual([]);
  });

  it("uses the member's length when offered, else the model default", () => {
    expect(contextSizeValueFor(capabilities, "wide", "1m")).toBe("1m");
    expect(contextSizeValueFor(capabilities, "wide", "2m")).toBe("200k");
    expect(contextSizeValueFor(capabilities, "wide", undefined)).toBe("200k");
    expect(contextSizeValueFor(capabilities, "unknown", "1m")).toBeUndefined();
  });
});
