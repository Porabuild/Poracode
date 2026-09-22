import { describe, expect, it } from "vitest";
import { mapMuseGoalMetadata } from "./goal";

describe("mapMuseGoalMetadata", () => {
  it("maps active statuses with pause controls", () => {
    for (const raw of ["active", "running", "in_progress", "inProgress"]) {
      expect(mapMuseGoalMetadata(raw)).toEqual({
        status: "active",
        availableActions: ["edit", "pause", "clear"],
      });
    }
  });

  it("maps paused statuses with resume controls", () => {
    for (const raw of ["paused", "parked", "blocked", "waiting"]) {
      expect(mapMuseGoalMetadata(raw)).toEqual({
        status: "paused",
        availableActions: ["edit", "resume", "clear"],
      });
    }
  });

  it("maps budget limited statuses with retry controls", () => {
    for (const raw of ["budget_limited", "budgetlimited", "usagelimited", "usage_limited"]) {
      expect(mapMuseGoalMetadata(raw)).toEqual({
        status: "budget_limited",
        availableActions: ["edit", "resume", "clear"],
      });
    }
  });

  it("maps terminal statuses without controls", () => {
    expect(mapMuseGoalMetadata("completed")).toEqual({ status: "complete", availableActions: [] });
    expect(mapMuseGoalMetadata("complete")).toEqual({ status: "complete", availableActions: [] });
    expect(mapMuseGoalMetadata("success")).toEqual({ status: "complete", availableActions: [] });
    expect(mapMuseGoalMetadata("failed")).toEqual({ status: "failed", availableActions: [] });
    expect(mapMuseGoalMetadata("cancelled")).toEqual({ status: "cancelled", availableActions: [] });
    expect(mapMuseGoalMetadata("canceled")).toEqual({ status: "cancelled", availableActions: [] });
  });

  it("defaults unknown statuses to active with pause controls", () => {
    expect(mapMuseGoalMetadata(undefined)).toEqual({
      status: "active",
      availableActions: ["edit", "pause", "clear"],
    });
    expect(mapMuseGoalMetadata("something-new")).toEqual({
      status: "active",
      availableActions: ["edit", "pause", "clear"],
    });
  });
});
