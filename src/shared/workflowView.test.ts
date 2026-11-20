import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { applyWorkflowPlan, workflowPhasesFromInfo } from "./workflowView";
import { workflowRunSchema } from "./contracts/workflowTranscript";
import { runtimeWorkflowViewSchema } from "./contracts/runtimeItemPresentation";

const fixture = JSON.parse(
  readFileSync(
    new URL("../../protocol/remote/v3/fixtures/client-workflow-viewer.json", import.meta.url),
    "utf8",
  ),
) as {
  version: number;
  cases: Array<{ id: string; plan: unknown; run: unknown; expected: unknown }>;
};

it("pins workflow phase and agent presentation to shared native fixtures", () => {
  expect(fixture.version).toBe(1);
  for (const entry of fixture.cases) {
    const plan = runtimeWorkflowViewSchema.parse(entry.plan);
    const run = entry.run ? workflowRunSchema.parse(entry.run) : null;
    const before = structuredClone({ plan, run });
    const view = run ? applyWorkflowPlan(run, plan) : null;
    const phases = view?.phases ?? workflowPhasesFromInfo(plan);
    const unphased = view?.unphasedAgents ?? [];
    const agents = phases.flatMap((phase) => phase.agents).concat(unphased);
    expect({
      phases: phases.map((phase) => ({
        title: phase.title,
        labels: phase.agents.map((agent) => agent.label),
        models: phase.agents.map((agent) => agent.model ?? null),
      })),
      unphased: unphased.map((agent) => agent.label),
      completed: agents.filter((agent) =>
        ["done", "failed", "cancelled"].includes(agent.state ?? ""),
      ).length,
    }).toEqual(entry.expected);
    expect({ plan, run }).toEqual(before);
  }
});
