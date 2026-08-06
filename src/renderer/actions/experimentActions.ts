import { toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import type {
  AgentInstanceId,
  AgentStatus,
  CreateExperimentWorktreesResult,
  ExperimentCandidate,
  ProjectLocation,
  PromptSegment,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { DEFAULT_TERMINAL_SIZE, MAX_EXPERIMENT_PROMPT_LENGTH } from "@/shared/contracts";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import { friendlyError } from "@/shared/messages";
import { buildWorktreeLocation, sanitizeWorktreeBranchName } from "@/shared/worktree";
import { captureProductEvent } from "@/renderer/analytics/productAnalytics";
import { readBridge } from "@/renderer/bridge";
import { formatModelConfigLabel } from "@/renderer/components/providers/modelDisplay";
import { i18n } from "@/renderer/i18n/i18n";
import { makeThreadTitle, useAppStore } from "@/renderer/state/appStore";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useExperimentStore } from "@/renderer/state/experimentStore";
import { refreshGitProject } from "@/renderer/state/gitRefresh";
import { requestGeneratedTitle } from "@/renderer/utils/titleGen";
import {
  detachThreadFromWorktree,
  persistExperimentOwnershipState,
  removeExperimentCandidateWorktree,
} from "./experimentWorktreeActions";
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

function candidateLabel(spec: ExperimentCandidateSpec, agent: AgentStatus | undefined): string {
  const provider = spec.agentLabel ?? spec.agentKind;
  const detail = formatModelConfigLabel(agent, spec.config);
  return detail ? `${detail} · ${provider}` : provider;
}

function applyExperimentTitle(experimentId: string, title: string, fallbackTitle: string): void {
  const experiment = useExperimentStore.getState().experiments[experimentId];
  if (!experiment || experiment.title !== fallbackTitle) return;
  useExperimentStore.getState().renameExperiment(experimentId, title);
  const trimmed = title.trim();
  if (!trimmed || trimmed === fallbackTitle) return;
  const candidateIds = new Set(experiment.candidates.map((candidate) => candidate.threadId));
  useAppStore.setState((state) => ({
    threads: state.threads.map((thread) =>
      candidateIds.has(thread.id) ? { ...thread, groupName: trimmed } : thread,
    ),
  }));
}

function generateExperimentTitleAsync(
  experimentId: string,
  projectLocation: ProjectLocation,
  agentStatuses: readonly AgentStatus[],
  prompt: string,
  fallbackTitle: string,
): void {
  const request = requestGeneratedTitle(projectLocation, agentStatuses, prompt);
  if (!request) return;
  void request
    .then((title) => applyExperimentTitle(experimentId, title, fallbackTitle))
    .catch((error) => {
      console.warn("[experiment title-gen] failed, keeping fallback title:", error);
    });
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

  const { agentStatuses, wslAgentStatuses } = useAgentStatusesStore.getState();
  const projectAgentStatuses = getProjectAgentStatuses(
    project.location,
    agentStatuses,
    wslAgentStatuses,
  );
  const agentForKind = (agentKind: string) =>
    projectAgentStatuses.find((agent) => agent.kind === agentKind);

  const experimentId = crypto.randomUUID();
  const title = makeThreadTitle(prompt) || i18n._(msg`Experiment`);
  const promptSlug = sanitizeWorktreeBranchName(title).slice(0, 24);
  const shortId = experimentId.slice(0, 6);
  const plans = input.candidates.map((spec, index) => {
    const label = candidateLabel(spec, agentForKind(spec.agentKind));
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
    ...(input.segments?.length ? { segments: input.segments } : {}),
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
  generateExperimentTitleAsync(experimentId, project.location, projectAgentStatuses, prompt, title);

  const batch = await readBridge()
    .createExperimentWorktrees({
      projectLocation: project.location,
      sourceBranch: base.name,
      baseCommit: base.commit,
      candidates: plans.map((plan) => ({
        threadId: plan.threadId,
        branch: plan.worktreeBranch,
        ownerToken: `${experimentId}:${plan.threadId}`,
      })),
      ...worktreePlacementPayload(project),
      copyIgnoredPatterns: project.scripts?.worktreeCopyPatterns,
    })
    .catch(
      (error): CreateExperimentWorktreesResult => ({
        candidates: plans.map((plan) => ({
          threadId: plan.threadId,
          branch: plan.worktreeBranch,
          error: friendlyError(error),
        })),
      }),
    );
  const preparedResults = plans.map((plan, index) => {
    const result = batch.candidates[index];
    if (result?.path) {
      return {
        ...plan,
        worktreePath: result.path,
      };
    }
    console.error("[experiment] failed to create candidate worktree", result?.error);
    toast.danger(result?.error ?? i18n._(msg`Unable to create the candidate worktree.`));
    return null;
  });
  const prepared = preparedResults.filter(
    (candidate): candidate is (typeof plans)[number] & { worktreePath: string } =>
      candidate !== null,
  );
  const preparedWorktreeByThreadId = new Map<string, { path: string; branch: string }>(
    prepared.map(
      (candidate) =>
        [
          candidate.threadId,
          { path: candidate.worktreePath, branch: candidate.worktreeBranch },
        ] as const,
    ),
  );
  useAppStore.setState((state) => ({
    threads: state.threads.map((thread) => {
      const worktree = preparedWorktreeByThreadId.get(thread.id);
      return worktree
        ? { ...thread, worktreePath: worktree.path, worktreeBranch: worktree.branch }
        : thread;
    }),
  }));
  useExperimentStore.setState((state) => {
    const experiment = state.experiments[experimentId];
    if (!experiment) return state;
    return {
      experiments: {
        ...state.experiments,
        [experimentId]: {
          ...experiment,
          candidates: experiment.candidates.map((candidate) => {
            const worktree = preparedWorktreeByThreadId.get(candidate.threadId);
            return worktree
              ? { ...candidate, worktreePath: worktree.path, worktreeState: "owned" as const }
              : candidate;
          }),
          updatedAt: new Date().toISOString(),
        },
      },
    };
  });

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
      const currentExperiment = useExperimentStore.getState().experiments[experimentId];
      useExperimentStore.getState().addExperiment({
        ...(currentExperiment ?? experimentBase),
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
  const currentExperiment = useExperimentStore.getState().experiments[experimentId];
  useExperimentStore.getState().addExperiment({
    ...(currentExperiment ?? experimentBase),
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
      if (setupScript) {
        void runWorktreeSetupScript(project, candidate.worktreePath, setupScript, {
          openTerminalPanel: false,
        });
      }
    }),
  );
  const startedCandidateCount = preparedThreads.filter(
    (thread) =>
      useAppStore.getState().threads.find((item) => item.id === thread.id)?.status !== "error",
  ).length;
  captureProductEvent("experiment.started", {
    candidate_count: preparedThreads.length,
    outcome: startedCandidateCount === preparedThreads.length ? "started" : "partial",
  });
  void refreshGitProject({ id: project.id, location: project.location }, "manual", "full");
  return experimentId;
}

export {
  cancelExperimentJudge,
  createExperimentCandidatePr,
  crownExperiment,
  discardExperiment,
  mergeExperimentWinner,
  retryExperimentCleanup,
  setManualExperimentCrown,
  type ExperimentJudgeProgressEvent,
  type ExperimentJudgeSelection,
} from "./experimentDecisionActions";
export { isEligibleExperimentJudgeAgent } from "./experimentOperationState";
