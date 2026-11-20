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

  it("preserves newest-first catalog order within a tier instead of sorting alphabetically", () => {
    const ordered: MemoryModelCandidate[] = [
      { agentKind: "claude", model: "claude-fable-5-2", label: "Fable 5.2", rank: 20 },
      { agentKind: "claude", model: "claude-fable-5-1", label: "Fable 5.1", rank: 20 },
      { agentKind: "claude", model: "claude-haiku-4-5-20251001", label: "Haiku 4.5", rank: 20 },
      { agentKind: "claude", model: "haiku", label: "Haiku", rank: 20 },
    ];
    expect(pickMemoryModel(ordered, "dream")?.model).toBe("claude-fable-5-2");
    expect(pickMemoryModel(ordered, "capture")?.model).toBe("claude-haiku-4-5-20251001");
  });
});
