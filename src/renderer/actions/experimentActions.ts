import { toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import type {
  AgentInstanceId,
  Experiment,
  ExperimentCandidate,
  GetExperimentCandidateDiffResult,
  GitWorktreeInfo,
  Project,
  PromptSegment,
  Thread,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import {
  DEFAULT_TERMINAL_SIZE,
  MAX_EXPERIMENT_PROMPT_LENGTH,
  isThreadTurnActive,
} from "@/shared/contracts";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import { friendlyError } from "@/shared/messages";
import { buildWorktreeLocation, sanitizeWorktreeBranchName } from "@/shared/worktree";
import { readBridge } from "@/renderer/bridge";
import { i18n } from "@/renderer/i18n/i18n";
import { makeThreadTitle, useAppStore } from "@/renderer/state/appStore";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useExperimentStore } from "@/renderer/state/experimentStore";
import { refreshGitProject } from "@/renderer/state/gitRefresh";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useThreadLiveWorkflowStore } from "@/renderer/state/threadLiveWorkflowStore";
import {
  closeExperimentThread,
  detachThreadFromWorktree,
  persistExperimentOwnershipState,
  removeExperimentCandidateWorktree,
  resolveCandidateWorktreePath,
  updateCandidateWorktree,
} from "./experimentWorktreeActions";
import { runGitMergeToSource, showGitOperationFailure } from "./gitCommandRunner";
import { performInitialThreadLaunch } from "./threadLaunchActions";
import { primeWorktreeGitState, runWorktreeSetupScript } from "./worktreeLaunchActions";
import { worktreePlacementPayload } from "./worktreePlacement";

export interface ExperimentCandidateSpec {
  agentKind: string;
  agentInstanceId?: AgentInstanceId;
  agentLabel?: string;
  config: ThreadConfig;
  presentationMode: ThreadPresentationMode;
}

export interface LaunchExperimentInput {
  projectId: string;
  prompt: string;
  segments?: PromptSegment[];
  baseBranch: string;
  candidates: ExperimentCandidateSpec[];
}

export interface ExperimentJudgeSelection {
  agentKind: string;
  threadId?: string;
}

const pendingOperations = new Set<string>();

function candidateLabel(spec: ExperimentCandidateSpec): string {
  const provider = spec.agentLabel ?? spec.agentKind;
  return spec.config.model ? `${provider} · ${spec.config.model}` : provider;
}

function experimentThreads(experimentId: string): Thread[] {
  const experiment = useExperimentStore.getState().experiments[experimentId];
  if (!experiment) return [];
  const ids = new Set(experiment.candidates.map((candidate) => candidate.threadId));
  return useAppStore.getState().threads.filter((thread) => ids.has(thread.id));
}

function hasActiveCandidate(experimentId: string): boolean {
  const liveThreadIds = useThreadLiveWorkflowStore.getState().liveThreadIds;
  return experimentThreads(experimentId).some(
    (thread) => isThreadTurnActive(thread.status) || liveThreadIds.has(thread.id),
  );
}

async function withExperimentOperation(
  experimentId: string,
  operation: () => Promise<boolean>,
): Promise<boolean> {
  if (pendingOperations.has(experimentId)) return false;
  pendingOperations.add(experimentId);
  try {
    return await operation();
  } finally {
    pendingOperations.delete(experimentId);
  }
}

export async function launchExperiment(input: LaunchExperimentInput): Promise<string | null> {
  const project = useAppStore.getState().projects.find((item) => item.id === input.projectId);
  if (!project) return null;
  const prompt = input.prompt.trim();
  if (!prompt || input.candidates.length < 2) {
    toast.danger(i18n._(msg`Choose at least two candidates and enter a prompt.`));
    return null;
  }
  if (prompt.length > MAX_EXPERIMENT_PROMPT_LENGTH) {
    toast.danger(i18n._(msg`The experiment prompt is too long.`));
    return null;
  }

  const branches = await readBridge()
    .gitListBranches({
      projectLocation: project.location,
      includeRemote: false,
    })
    .catch((error) => {
      toast.danger(friendlyError(error));
      return null;
    });
  if (!branches) return null;
  const base = branches.branches.find(
    (branch) => branch.name === input.baseBranch && !branch.isRemote,
  );
  if (!base) {
    toast.danger(i18n._(msg`Choose a local base branch for the experiment.`));
    return null;
  }

  const experimentId = crypto.randomUUID();
  const title = makeThreadTitle(prompt) || i18n._(msg`Experiment`);
  const promptSlug = sanitizeWorktreeBranchName(title).slice(0, 24);
  const shortId = experimentId.slice(0, 6);
  const plans = input.candidates.map((spec, index) => {
    const label = candidateLabel(spec);
    const agentSlug = sanitizeWorktreeBranchName(label).slice(0, 16);
    return {
      spec,
      threadId: crypto.randomUUID(),
      worktreeBranch: `poracode/experiment-${promptSlug}-${agentSlug}-${shortId}-${index + 1}`,
      label,
    };
  });
  const plannedThreadIds = plans.map((plan) => plan.threadId);
  const appStore = useAppStore.getState();
  const threads = plans.map((plan) =>
    appStore.createThread({
      threadId: plan.threadId,
      projectId: project.id,
      agentKind: plan.spec.agentKind,
      ...(plan.spec.agentInstanceId ? { agentInstanceId: plan.spec.agentInstanceId } : {}),
      config: plan.spec.config,
      prompt,
      title: plan.label,
      worktreeBranch: plan.worktreeBranch,
      groupId: experimentId,
      groupName: title,
      presentationMode: plan.spec.presentationMode,
      focus: false,
    }),
  );
  const threadById = new Map(threads.map((thread) => [thread.id, thread] as const));
  const now = new Date().toISOString();
  const candidateRecord = (
    plan: (typeof plans)[number],
    worktreePath?: string,
    worktreeState: ExperimentCandidate["worktreeState"] = "pending",
  ): ExperimentCandidate => {
    const thread = threadById.get(plan.threadId)!;
    return {
      threadId: thread.id,
      agentKind: thread.agentKind,
      ...(plan.spec.agentLabel ? { agentLabel: plan.spec.agentLabel } : {}),
      ...(thread.config.model ? { model: thread.config.model } : {}),
      ...(thread.config.effort ? { effort: thread.config.effort } : {}),
      ...(thread.config.fast !== undefined ? { fast: thread.config.fast } : {}),
      ...(worktreePath ? { worktreePath } : {}),
      worktreeBranch: plan.worktreeBranch,
      worktreeOwnerToken: `${experimentId}:${plan.threadId}`,
      worktreeState,
    };
  };
  const experimentBase = {
    id: experimentId,
    projectId: project.id,
    title,
    prompt,
    baseBranch: base.name,
    baseCommit: base.commit,
    status: "running" as const,
    createdAt: now,
    updatedAt: now,
  };
  useExperimentStore.getState().addExperiment({
    ...experimentBase,
    candidates: plans.map((plan) => candidateRecord(plan)),
  });
  try {
    await persistExperimentOwnershipState(plannedThreadIds);
  } catch (error) {
    for (const thread of threads) useAppStore.getState().deleteThread(thread.id);
    useExperimentStore.getState().removeExperiment(experimentId);
    await persistExperimentOwnershipState(plannedThreadIds).catch(() => undefined);
    toast.danger(friendlyError(error));
    return null;
  }
  useAppStore.getState().openExperiment(experimentId, project.id);

  const prepared: Array<(typeof plans)[number] & { worktreePath: string }> = [];
  for (const plan of plans) {
    try {
      const result = await readBridge().gitAddWorktree({
        projectLocation: project.location,
        branch: plan.worktreeBranch,
        createBranch: true,
        startPoint: base.commit,
        sourceBranch: base.name,
        ownerToken: `${experimentId}:${plan.threadId}`,
        ...worktreePlacementPayload(project),
        copyIgnoredPatterns: project.scripts?.worktreeCopyPatterns,
        transferUncommitted: false,
        keepChangesInSource: false,
      });
      useAppStore.getState().setThreadWorktree(plan.threadId, result.path, plan.worktreeBranch);
      updateCandidateWorktree(plan.threadId, "owned", result.path);
      prepared.push({
        ...plan,
        worktreePath: result.path,
      });
      await persistExperimentOwnershipState([plan.threadId]).catch((error) => {
        console.error("[experiment] failed to persist candidate worktree path", error);
      });
    } catch (error) {
      console.error("[experiment] failed to create candidate worktree", error);
      toast.danger(friendlyError(error));
    }
  }

  const preparedIds = new Set<string>(prepared.map((candidate) => candidate.threadId));
  const failedPlans = plans.filter((plan) => !preparedIds.has(plan.threadId));
  const cleanedIds = new Set<string>();
  let failedPlanCleanupComplete = true;
  for (const plan of failedPlans) {
    if (await removeExperimentCandidateWorktree(project, candidateRecord(plan))) {
      detachThreadFromWorktree(plan.threadId);
      cleanedIds.add(plan.threadId);
    } else {
      failedPlanCleanupComplete = false;
    }
  }

  if (prepared.length < 2 || !failedPlanCleanupComplete) {
    let cleanupComplete = failedPlanCleanupComplete;
    for (const candidate of prepared) {
      const record = candidateRecord(candidate, candidate.worktreePath, "owned");
      if (await removeExperimentCandidateWorktree(project, record)) {
        detachThreadFromWorktree(candidate.threadId);
        cleanedIds.add(candidate.threadId);
      } else {
        cleanupComplete = false;
      }
    }
    for (const plan of plans) {
      useAppStore.getState().updateThreadRuntime(plan.threadId, {
        status: "error",
        attention: "error",
        canResumeWithConfig: false,
      });
    }
    if (!cleanupComplete) {
      useExperimentStore.getState().addExperiment({
        ...experimentBase,
        candidates: plans.map((plan) => {
          const candidate = prepared.find((item) => item.threadId === plan.threadId);
          return candidateRecord(
            plan,
            cleanedIds.has(plan.threadId) ? undefined : candidate?.worktreePath,
            cleanedIds.has(plan.threadId) ? "removed" : candidate ? "owned" : "pending",
          );
        }),
        updatedAt: new Date().toISOString(),
      });
      await persistExperimentOwnershipState(plannedThreadIds).catch(() => undefined);
      toast.warning(i18n._(msg`Some experiment worktrees could not be removed.`));
    } else {
      for (const thread of threads) useAppStore.getState().deleteThread(thread.id);
      useExperimentStore.getState().removeExperiment(experimentId);
      const currentView = useAppStore.getState().view;
      if (currentView.kind === "experiment" && currentView.experimentId === experimentId) {
        useAppStore.getState().openHome();
      }
      await persistExperimentOwnershipState(plannedThreadIds).catch(() => undefined);
      toast.danger(
        i18n._(msg`At least two worktrees must be created. Any partial experiment was cleaned up.`),
      );
    }
    void refreshGitProject({ id: project.id, location: project.location }, "manual", "full");
    return cleanupComplete ? null : experimentId;
  }

  for (const thread of threads) {
    if (!preparedIds.has(thread.id)) useAppStore.getState().deleteThread(thread.id);
  }
  const preparedThreads = prepared.map(
    (candidate) =>
      useAppStore.getState().threads.find((thread) => thread.id === candidate.threadId)!,
  );
  useExperimentStore.getState().addExperiment({
    ...experimentBase,
    candidates: prepared.map((candidate) =>
      candidateRecord(candidate, candidate.worktreePath, "owned"),
    ),
    updatedAt: new Date().toISOString(),
  });
  await persistExperimentOwnershipState(plannedThreadIds).catch((error) => {
    console.error("[experiment] failed to persist prepared candidates", error);
  });
  const setupScript = project.scripts?.setupScript;
  await Promise.all(
    preparedThreads.map(async (thread, index) => {
      const candidate = prepared[index]!;
      void primeWorktreeGitState(project, candidate.worktreePath);
      if (setupScript) runWorktreeSetupScript(project, candidate.worktreePath, setupScript);
      await performInitialThreadLaunch({
        thread,
        projectLocation: buildWorktreeLocation(project.location, candidate.worktreePath),
        prompt,
        ...(input.segments ? { segments: input.segments } : {}),
        initialSize: DEFAULT_TERMINAL_SIZE,
      }).catch((error) => {
        console.error("[experiment] failed to start candidate", error);
        useAppStore.getState().updateThreadRuntime(thread.id, {
          status: "error",
          attention: "error",
          canResumeWithConfig: false,
        });
        toast.danger(friendlyError(error));
      });
    }),
  );
  void refreshGitProject({ id: project.id, location: project.location }, "manual", "full");
  return experimentId;
}

async function candidateDiff(
  project: Project,
  candidate: ExperimentCandidate,
  baseCommit: string,
  worktrees?: readonly GitWorktreeInfo[],
) {
  if (candidate.worktreeState !== "owned") {
    throw new Error(i18n._(msg`The experiment candidate worktree is unavailable.`));
  }
  const worktreePath = await resolveCandidateWorktreePath(project, candidate, worktrees);
  if (!worktreePath) {
    throw new Error(i18n._(msg`The experiment candidate worktree is unavailable.`));
  }
  const projectLocation = buildWorktreeLocation(project.location, worktreePath);
  const status = await readBridge().getGitStatus({ projectLocation });
  if (status.branch !== candidate.worktreeBranch) {
    throw new Error(i18n._(msg`A candidate is no longer on its experiment branch.`));
  }
  return readBridge().getExperimentCandidateDiff({
    projectLocation,
    baseRef: baseCommit,
  });
}

async function hashText(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function candidateSnapshotText(
  candidates: readonly ExperimentCandidate[],
  snapshots: readonly GetExperimentCandidateDiffResult[],
): string {
  return candidates
    .map((candidate, index) => `${candidate.threadId}\0${snapshots[index]?.diff ?? ""}`)
    .join("\0");
}

async function captureExperimentSnapshot(
  project: Project,
  experiment: Experiment,
): Promise<{
  hash: string;
  candidates: GetExperimentCandidateDiffResult[];
}> {
  const { worktrees } = await readBridge().gitListWorktrees({
    projectLocation: project.location,
  });
  const candidates = await Promise.all(
    experiment.candidates.map((candidate) =>
      candidateDiff(project, candidate, experiment.baseCommit, worktrees),
    ),
  );
  return {
    hash: await hashText(candidateSnapshotText(experiment.candidates, candidates)),
    candidates,
  };
}

export async function crownExperiment(
  experimentId: string,
  selection?: ExperimentJudgeSelection,
): Promise<boolean> {
  return withExperimentOperation(experimentId, async () => {
    const experiment = useExperimentStore.getState().experiments[experimentId];
    if (!experiment) return false;
    const project = useAppStore
      .getState()
      .projects.find((item) => item.id === experiment.projectId);
    if (!project) return false;
    if (hasActiveCandidate(experimentId)) {
      toast.warning(i18n._(msg`Wait for every candidate to finish before comparing them.`));
      return false;
    }

    let capturedSnapshot: Awaited<ReturnType<typeof captureExperimentSnapshot>>;
    try {
      capturedSnapshot = await captureExperimentSnapshot(project, experiment);
    } catch (error) {
      toast.danger(i18n._(msg`Unable to read the candidate changes: ${friendlyError(error)}`));
      return false;
    }
    const snapshots = capturedSnapshot.candidates;
    if (snapshots.every((snapshot) => !snapshot.diff.trim())) {
      toast.warning(i18n._(msg`The candidates have not made any changes yet.`));
      return false;
    }

    const agentState = useAgentStatusesStore.getState();
    const disabledAgents = useSharedSettings.getState().disabledAgents;
    const judgeAgents = getProjectAgentStatuses(
      project.location,
      agentState.agentStatuses,
      agentState.wslAgentStatuses,
    );
    const eligibleJudgeAgents = judgeAgents.filter(
      (agent) =>
        agent.installed &&
        agent.authState !== "missing" &&
        !disabledAgents.includes(agent.kind) &&
        agent.capabilities.supportsTextOnlyOneShot === true,
    );
    const judgeAgent = selection
      ? eligibleJudgeAgents.find((agent) => agent.kind === selection.agentKind)
      : (eligibleJudgeAgents.find((agent) =>
          experiment.candidates.some((candidate) => candidate.agentKind === agent.kind),
        ) ?? eligibleJudgeAgents[0]);
    const judgeThread = judgeAgent
      ? selection?.threadId
        ? experimentThreads(experimentId).find(
            (thread) => thread.id === selection.threadId && thread.agentKind === judgeAgent.kind,
          )
        : experimentThreads(experimentId).find((thread) => thread.agentKind === judgeAgent.kind)
      : undefined;
    if (selection?.threadId && !judgeThread) {
      toast.warning(i18n._(msg`None of these agents can run the AI comparison.`));
      return false;
    }
    if (!judgeAgent) {
      toast.warning(i18n._(msg`None of these agents can run the AI comparison.`));
      return false;
    }
    try {
      const result = await readBridge().judgeExperiment({
        projectLocation: project.location,
        agentKind: judgeAgent.kind,
        ...(judgeThread?.config.model ? { model: judgeThread.config.model } : {}),
        ...(judgeThread?.config.effort ? { effort: judgeThread.config.effort } : {}),
        ...(judgeThread?.config.fast !== undefined ? { fast: judgeThread.config.fast } : {}),
        prompt: experiment.prompt,
        candidates: experiment.candidates.map((candidate, index) => ({
          threadId: candidate.threadId,
          diff: snapshots[index]?.diff ?? "",
        })),
      });
      const judgeLabel = judgeThread?.config.model
        ? `${judgeAgent.label} · ${judgeThread.config.model}`
        : judgeAgent.label;
      useExperimentStore.getState().setExperimentCrown(experimentId, {
        threadId: result.winnerThreadId,
        rationale: result.rationale,
        source: "ai",
        modelLabel: judgeLabel,
        snapshotHash: capturedSnapshot.hash,
        createdAt: new Date().toISOString(),
      });
      return true;
    } catch (error) {
      toast.danger(i18n._(msg`Unable to compare candidates: ${friendlyError(error)}`));
      return false;
    }
  });
}

export function setManualExperimentCrown(experimentId: string, threadId: string): void {
  const experiment = useExperimentStore.getState().experiments[experimentId];
  if (!experiment?.candidates.some((candidate) => candidate.threadId === threadId)) return;
  useExperimentStore.getState().setExperimentCrown(experimentId, {
    threadId,
    source: "user",
    createdAt: new Date().toISOString(),
  });
}

export async function mergeExperimentWinner(experimentId: string): Promise<boolean> {
  return withExperimentOperation(experimentId, async () => {
    const experiment = useExperimentStore.getState().experiments[experimentId];
    if (!experiment?.crown) return false;
    const project = useAppStore
      .getState()
      .projects.find((item) => item.id === experiment.projectId);
    const winner = experiment.candidates.find(
      (candidate) => candidate.threadId === experiment.crown?.threadId,
    );
    if (!project || !winner) return false;
    if (hasActiveCandidate(experimentId)) {
      toast.warning(i18n._(msg`Wait for every candidate to finish before merging a winner.`));
      return false;
    }

    let winnerWorktreePath: string | undefined;
    try {
      winnerWorktreePath = await resolveCandidateWorktreePath(project, winner);
    } catch (error) {
      toast.danger(i18n._(msg`Unable to read the candidate changes: ${friendlyError(error)}`));
      return false;
    }
    if (!winnerWorktreePath) {
      toast.danger(i18n._(msg`The experiment candidate worktree is unavailable.`));
      return false;
    }
    const worktreeLocation = buildWorktreeLocation(project.location, winnerWorktreePath);
    if (experiment.crown.source === "ai" && experiment.crown.snapshotHash) {
      let snapshotHash: string;
      try {
        snapshotHash = (await captureExperimentSnapshot(project, experiment)).hash;
      } catch (error) {
        toast.danger(i18n._(msg`Unable to read the candidate changes: ${friendlyError(error)}`));
        return false;
      }
      if (snapshotHash !== experiment.crown.snapshotHash) {
        toast.warning(i18n._(msg`The candidates changed after judging. Compare them again.`));
        return false;
      }
    }

    try {
      let expectedWorktreeCommit: string;
      const status = await readBridge().getGitStatus({ projectLocation: worktreeLocation });
      if (status.branch !== winner.worktreeBranch) {
        toast.danger(i18n._(msg`A candidate is no longer on its experiment branch.`));
        return false;
      }
      if (status.staged.length > 0 || status.unstaged.length > 0) {
        await readBridge().gitCommit({
          projectLocation: worktreeLocation,
          message: "chore: apply experiment winner",
          addAll: true,
        });
      }
      if (experiment.crown.source === "ai" && experiment.crown.snapshotHash) {
        const snapshot = await captureExperimentSnapshot(project, experiment);
        if (snapshot.hash !== experiment.crown.snapshotHash) {
          toast.warning(i18n._(msg`The candidates changed after judging. Compare them again.`));
          return false;
        }
        const winnerIndex = experiment.candidates.findIndex(
          (candidate) => candidate.threadId === winner.threadId,
        );
        expectedWorktreeCommit = snapshot.candidates[winnerIndex]!.headCommit;
      } else {
        expectedWorktreeCommit = (await candidateDiff(project, winner, experiment.baseCommit))
          .headCommit;
      }
      const { sourceBranch } = await readBridge().gitGetWorktreeSourceBranch({
        projectLocation: project.location,
        branch: winner.worktreeBranch,
      });
      if (!sourceBranch || sourceBranch !== experiment.baseBranch) {
        toast.danger(i18n._(msg`Unable to determine the experiment's source branch.`));
        return false;
      }
      const mergeStatus = await readBridge().getGitStatus({ projectLocation: worktreeLocation });
      if (mergeStatus.branch !== winner.worktreeBranch) {
        toast.danger(i18n._(msg`A candidate is no longer on its experiment branch.`));
        return false;
      }
      const result = await runGitMergeToSource({
        projectLocation: project.location,
        worktreeLocation,
        worktreeBranch: winner.worktreeBranch,
        sourceBranch,
        expectedWorktreeCommit,
      });
      if (!result.merged) {
        showGitOperationFailure(result);
        return false;
      }

      let cleanupComplete = true;
      for (const candidate of experiment.candidates) {
        if (!(await closeExperimentThread(candidate.threadId))) {
          cleanupComplete = false;
          continue;
        }
        const removed = await removeExperimentCandidateWorktree(project, candidate);
        if (!removed) {
          cleanupComplete = false;
          continue;
        }
        detachThreadFromWorktree(candidate.threadId);
      }
      useExperimentStore.getState().decideExperiment(experimentId, winner.threadId);
      toast.success(i18n._(msg`Merged the experiment winner into ${sourceBranch}.`));
      if (!cleanupComplete) {
        toast.warning(i18n._(msg`Some experiment worktrees could not be removed.`));
      }
      void refreshGitProject({ id: project.id, location: project.location }, "manual", "full");
      return true;
    } catch (error) {
      toast.danger(i18n._(msg`Unable to merge the experiment winner: ${friendlyError(error)}`));
      return false;
    }
  });
}

export async function retryExperimentCleanup(experimentId: string): Promise<boolean> {
  return withExperimentOperation(experimentId, async () => {
    const experiment = useExperimentStore.getState().experiments[experimentId];
    if (experiment?.status !== "decided" || !experiment.winnerThreadId) return false;
    const project = useAppStore
      .getState()
      .projects.find((item) => item.id === experiment.projectId);
    if (!project) return false;
    const pending = experiment.candidates.filter(
      (candidate) => candidate.worktreeState !== "removed",
    );
    if (pending.length === 0) return true;
    if (hasActiveCandidate(experimentId)) {
      toast.warning(i18n._(msg`Wait for every candidate to finish before cleaning up.`));
      return false;
    }

    let cleanupComplete = true;
    for (const candidate of pending) {
      if (!(await closeExperimentThread(candidate.threadId))) {
        cleanupComplete = false;
        continue;
      }
      const removed = await removeExperimentCandidateWorktree(project, candidate);
      if (removed) detachThreadFromWorktree(candidate.threadId);
      else cleanupComplete = false;
    }
    if (!cleanupComplete) {
      toast.warning(i18n._(msg`Some experiment worktrees could not be removed.`));
    }
    void refreshGitProject({ id: project.id, location: project.location }, "manual", "full");
    return cleanupComplete;
  });
}

export async function discardExperiment(experimentId: string): Promise<boolean> {
  return withExperimentOperation(experimentId, async () => {
    const experiment = useExperimentStore.getState().experiments[experimentId];
    if (!experiment) return false;
    if (hasActiveCandidate(experimentId)) {
      toast.warning(
        i18n._(msg`Wait for every candidate to finish before discarding the experiment.`),
      );
      return false;
    }
    const appStore = useAppStore.getState();
    const project = appStore.projects.find((item) => item.id === experiment.projectId);
    let cleanupComplete = true;
    for (const candidate of experiment.candidates) {
      if (!(await closeExperimentThread(candidate.threadId))) cleanupComplete = false;
    }
    if (!cleanupComplete) {
      toast.warning(i18n._(msg`Some experiment worktrees could not be removed.`));
      return false;
    }
    if (project) {
      for (const candidate of experiment.candidates) {
        if (!(await removeExperimentCandidateWorktree(project, candidate))) {
          cleanupComplete = false;
        }
      }
    }
    if (!cleanupComplete) {
      toast.warning(i18n._(msg`Some experiment worktrees could not be removed.`));
      return false;
    }
    if (appStore.view.kind === "experiment" && appStore.view.experimentId === experimentId) {
      appStore.openHome();
    }
    for (const candidate of experiment.candidates) {
      useAppStore.getState().deleteThread(candidate.threadId);
    }
    useExperimentStore.getState().removeExperiment(experimentId);
    if (project) {
      void refreshGitProject({ id: project.id, location: project.location }, "manual", "full");
    }
    return true;
  });
}
