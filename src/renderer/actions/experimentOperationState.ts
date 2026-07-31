import { toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import type { AgentStatus, ExperimentCandidate, Project, Thread } from "@/shared/contracts";
import { isThreadTurnActive } from "@/shared/contracts";
import { i18n } from "@/renderer/i18n/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { useExperimentStore } from "@/renderer/state/experimentStore";
import { useThreadLiveWorkflowStore } from "@/renderer/state/threadLiveWorkflowStore";
import {
  closeExperimentThread,
  removeExperimentCandidateWorktrees,
} from "./experimentWorktreeActions";

const pendingOperations = new Map<string, Promise<void>>();

export function getPendingExperimentOperation(experimentId: string): Promise<void> | undefined {
  return pendingOperations.get(experimentId);
}

export function isEligibleExperimentJudgeAgent(
  agent: Pick<AgentStatus, "kind" | "installed" | "authState" | "capabilities">,
  disabledAgents: readonly string[],
): boolean {
  return (
    agent.installed &&
    agent.authState !== "missing" &&
    !disabledAgents.includes(agent.kind) &&
    agent.capabilities.supportsOneShot === true &&
    agent.capabilities.models.length > 0
  );
}

export function experimentThreads(experimentId: string): Thread[] {
  const experiment = useExperimentStore.getState().experiments[experimentId];
  if (!experiment) return [];
  const ids = new Set(experiment.candidates.map((candidate) => candidate.threadId));
  return useAppStore.getState().threads.filter((thread) => ids.has(thread.id));
}

export function hasActiveExperimentCandidate(experimentId: string): boolean {
  const liveThreadIds = useThreadLiveWorkflowStore.getState().liveThreadIds;
  return experimentThreads(experimentId).some(
    (thread) => isThreadTurnActive(thread.status) || liveThreadIds.has(thread.id),
  );
}

export async function cleanupExperimentCandidates(
  project: Project | undefined,
  candidates: readonly ExperimentCandidate[],
): Promise<boolean[]> {
  const closed = await Promise.all(
    candidates.map((candidate) => closeExperimentThread(candidate.threadId)),
  );
  if (!project) return closed;
  const removable = candidates.filter((_, index) => closed[index]);
  const removed = await removeExperimentCandidateWorktrees(project, removable);
  let removedIndex = 0;
  return closed.map((candidateClosed) => {
    if (!candidateClosed) return false;
    return removed[removedIndex++] ?? false;
  });
}

export async function withExperimentOperation(
  experimentId: string,
  operation: () => Promise<boolean>,
): Promise<boolean> {
  if (pendingOperations.has(experimentId)) {
    toast.warning(i18n._(msg`Another operation for this experiment is still running.`));
    return false;
  }
  let completeOperation!: () => void;
  const completion = new Promise<void>((resolve) => {
    completeOperation = resolve;
  });
  pendingOperations.set(experimentId, completion);
  try {
    return await operation();
  } finally {
    pendingOperations.delete(experimentId);
    completeOperation();
  }
}
