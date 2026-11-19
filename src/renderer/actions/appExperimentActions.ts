import type { AppExperimentRequest, AppExperimentResult } from "@/shared/contracts/appExperiment";
import { refreshAppExperimentSnapshot } from "@/renderer/state/managedRootCatalog/rootExperimentAuthority";
import { launchExperiment } from "./experimentActions";
import {
  crownExperiment,
  createExperimentCandidatePr,
  discardExperiment,
  mergeExperimentWinner,
  retryExperimentCleanup,
} from "./experimentDecisionActions";

export async function runAppExperiment(
  { input, experimentId }: AppExperimentRequest,
  begin: () => Promise<void>,
): Promise<AppExperimentResult> {
  const state = await refreshAppExperimentSnapshot();
  const exists = Object.hasOwn(state.experiments, experimentId);
  if (input.action === "launch") {
    if (exists) throw new Error("This experiment has already been created.");
    await begin();
    const id = await launchExperiment({
      experimentId,
      projectId: input.projectId,
      prompt: input.prompt,
      baseBranch: input.baseBranch,
      ...(input.segments === undefined ? {} : { segments: input.segments }),
      candidates: input.candidates.map(({ agentInstanceId, agentLabel, ...spec }) => ({
        ...spec,
        ...(agentInstanceId === undefined ? {} : { agentInstanceId }),
        ...(agentLabel === undefined ? {} : { agentLabel }),
      })),
    });
    return { experimentId, ok: id === experimentId };
  }
  if (!exists || input.experimentId !== experimentId || input.revision !== state.revision) {
    throw new Error("Experiment revision changed. Read the experiment again.");
  }
  await begin();
  // The admission round trip lets interactive changes race the initial read.
  // Project the authoritative state again before a workflow chooses its targets.
  if ((await refreshAppExperimentSnapshot()).revision !== input.revision) {
    throw new Error("Experiment revision changed during admission. Read the experiment again.");
  }
  let ok: boolean;
  switch (input.action) {
    case "judge":
      ok = await crownExperiment(experimentId, input.selection);
      break;
    case "merge_winner":
      ok = await mergeExperimentWinner(experimentId);
      break;
    case "create_pr":
      ok = await createExperimentCandidatePr(experimentId, input.threadId);
      break;
    case "retry_cleanup":
      ok = await retryExperimentCleanup(experimentId);
      break;
    case "discard":
      ok = await discardExperiment(experimentId);
      break;
  }
  return { experimentId, ok };
}
