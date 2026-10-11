import { describe, expect, it } from "vitest";
import type { ScheduledTask } from "@/shared/contracts";
import { newScheduleDraft, scheduleDraftInput, taskScheduleDraft } from "./scheduleDraft";

const baseTask: ScheduledTask = {
  id: "d2ac39e9-14ac-4776-9279-37a1e455a5db",
  name: "Daily brief",
  prompt: "Summarize my priorities.",
  agentKind: "claude:home",
  config: { model: "claude-fable-5", effort: "high" },
  recurrence: { kind: "weekly", days: [1, 2, 3, 4, 5], time: "08:00" },
  enabled: true,
  nextRunAt: null,
  lastRunAt: null,
  lastCompletedAt: null,
  lastStatus: "never",
  lastResult: null,
  lastError: null,
  createdAt: "2026-07-10T12:00:00.000Z",
  updatedAt: "2026-07-10T12:00:00.000Z",
};

describe("scheduleDraft projectId", () => {
  it("defaults new drafts to the Home scope (null)", () => {
    expect(newScheduleDraft(undefined).projectId).toBeNull();
    expect(scheduleDraftInput(newScheduleDraft(undefined)).projectId).toBeNull();
  });

  it("round-trips a task's projectId through the draft", () => {
    const projectId = "22222222-2222-4222-8222-222222222222";
    const draft = taskScheduleDraft({ ...baseTask, projectId });
    expect(draft.projectId).toBe(projectId);
    expect(scheduleDraftInput(draft).projectId).toBe(projectId);
  });

  it("treats a task without a projectId as Home", () => {
    const draft = taskScheduleDraft(baseTask);
    expect(draft.projectId).toBeNull();
    expect(scheduleDraftInput(draft).projectId).toBeNull();
  });
});
