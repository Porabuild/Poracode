import type { WorkflowAgent, WorkflowPhase, WorkflowRun } from "./contracts/workflowTranscript";
import type { RuntimeWorkflowView } from "./contracts/runtimeItemPresentation";

export function workflowPhasesFromInfo(info: Pick<RuntimeWorkflowView, "phases">): WorkflowPhase[] {
  return info.phases.map((phase) => ({
    title: phase.title,
    agents: [],
    ...(phase.detail ? { detail: phase.detail } : {}),
  }));
}

/** Canonical manifest observations win; the script plan fills only absent
 * phase/identity hints. Shared fixture cases pin native widget projections. */
export function applyWorkflowPlan(
  run: WorkflowRun,
  workflow: Pick<RuntimeWorkflowView, "phases" | "plannedAgents" | "liveAgents">,
): WorkflowRun {
  const plan = workflow.plannedAgents.length > 0 ? workflow.plannedAgents : workflow.liveAgents;
  if (run.phases.length > 0 || plan.length === 0) return run;
  const phases = workflowPhasesFromInfo(workflow);
  const phaseByTitle = new Map(phases.map((phase) => [phase.title, phase]));
  const unphasedAgents: WorkflowAgent[] = [];
  for (const [index, agent] of run.unphasedAgents.entries()) {
    const planned = plan[index];
    if (!planned) {
      unphasedAgents.push(agent);
      continue;
    }
    const merged: WorkflowAgent = {
      ...agent,
      label: agent.label === agent.agentId ? planned.label : agent.label,
      ...(planned.phaseTitle && !agent.phaseTitle ? { phaseTitle: planned.phaseTitle } : {}),
      ...(planned.model && !agent.model ? { model: planned.model } : {}),
    };
    if (merged.phaseTitle) {
      const target = phaseByTitle.get(merged.phaseTitle);
      if (target) {
        target.agents.push(merged);
        continue;
      }
    }
    unphasedAgents.push(merged);
  }
  return { ...run, phases, unphasedAgents };
}
