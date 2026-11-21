export interface WorkflowPhase {
  title: string;
  detail?: string;
}

export interface WorkflowPlannedAgent {
  label: string;
  phaseTitle?: string;
  model?: string;
}

/** Display-only workflow metadata. A run reference needs independent
 * validation and authorization before host reads or live registration. */
export interface WorkflowPresentation {
  description?: string;
  phases: WorkflowPhase[];
  plannedAgents: WorkflowPlannedAgent[];
  liveAgents: WorkflowPlannedAgent[];
  runId?: string;
  transcriptDir?: string;
  manifestPath?: string;
}
