import { describe, expect, it } from "vitest";
import { pickMemoryModel, type MemoryModelCandidate } from "./memoryModelChoice";

const models: MemoryModelCandidate[] = [
  { agentKind: "alpha", model: "alpha-haiku", label: "Haiku", rank: 20 },
  { agentKind: "alpha", model: "alpha-opus", label: "Opus", rank: 20 },
  { agentKind: "beta", model: "beta-flash", label: "Flash", rank: 10 },
  { agentKind: "beta", model: "beta-pro", label: "Pro", rank: 10 },
];

describe("pickMemoryModel", () => {
  it("defaults capture to the cheapest model of the highest-rated provider", () => {
    expect(pickMemoryModel(models, "capture")).toMatchObject({
      agentKind: "beta",
      model: "beta-flash",
    });
  });

  it("defaults dream to the strongest model of the highest-rated provider", () => {
    expect(pickMemoryModel(models, "dream")).toMatchObject({
      agentKind: "beta",
      model: "beta-pro",
    });
  });

  it("uses the next provider when the top one lacks that tier", () => {
    const cheapOnly = models.filter((model) => model.model !== "beta-pro");
    expect(pickMemoryModel(cheapOnly, "dream")).toMatchObject({
      agentKind: "alpha",
      model: "alpha-opus",
    });
  });
});
