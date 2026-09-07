import { describe, expect, it } from "vitest";
import { mapMuseGoalMetadata } from "./goal";

describe("mapMuseGoalMetadata", () => {
  it("maps active statuses", () => {
    expect(mapMuseGoalMetadata("active")).toEqual({
      status: "active",
      availableActions: [],
    });
    expect(mapMuseGoalMetadata("running")).toEqual({
      status: "active",
      availableActions: [],
    });
    expect(mapMuseGoalMetadata("in_progress")).toEqual({
      status: "active",
      availableActions: [],
    });
    expect(mapMuseGoalMetadata("inProgress")).toEqual({
      status: "active",
      availableActions: [],
    });
  });

  it("maps paused statuses", () => {
    expect(mapMuseGoalMetadata("paused")).toEqual({
      status: "paused",
      availableActions: [],
    });
    expect(mapMuseGoalMetadata("parked")).toEqual({
      status: "paused",
      availableActions: [],
    });
  });

  it("maps completed statuses", () => {
    expect(mapMuseGoalMetadata("completed")).toEqual({
      status: "complete",
      availableActions: [],
    });
    expect(mapMuseGoalMetadata("complete")).toEqual({
      status: "complete",
      availableActions: [],
    });
    expect(mapMuseGoalMetadata("success")).toEqual({
      status: "complete",
      availableActions: [],
    });
  });

  it("maps failed and cancelled statuses", () => {
    expect(mapMuseGoalMetadata("failed")).toEqual({
      status: "failed",
      availableActions: [],
    });
    expect(mapMuseGoalMetadata("cancelled")).toEqual({
      status: "cancelled",
      availableActions: [],
    });
    expect(mapMuseGoalMetadata("canceled")).toEqual({
      status: "cancelled",
      availableActions: [],
    });
  });

  it("maps budget limited statuses", () => {
    expect(mapMuseGoalMetadata("budget_limited")).toEqual({
      status: "budget_limited",
      availableActions: [],
    });
  });
});
