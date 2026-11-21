import { expect, it } from "vitest";
import { parseWorkflowInfo } from "./workflowDisplay";

it("keeps canonical workflow metadata and leaves ordinary tool calls unclassified", () => {
  const payload = {
    name: "workflow.tool",
    status: "success" as const,
    workflow: {
      summary: "Review this workspace",
      runId: "run-1",
      transcriptDir: "/session/subagents/workflows/run-1",
    },
  };
  const before = structuredClone(payload);
  expect(parseWorkflowInfo(payload)).toMatchObject({
    description: "Review this workspace",
    runId: "run-1",
    manifestPath: "/session/workflows/run-1.json",
  });
  expect(payload).toEqual(before);
  expect(
    parseWorkflowInfo({
      name: "ordinary.tool",
      status: "success",
      args: { description: "Not a workflow" },
    }),
  ).toEqual({ phases: [], plannedAgents: [], liveAgents: [] });
});
