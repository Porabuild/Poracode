import { toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import type {
  AgentInstanceId,
  AgentStatus,
  CreateExperimentWorktreesResult,
  ExperimentCandidate,
  ExperimentCandidateRowUpdate,
  ExperimentCandidateThreadCreation,
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
import {
  commitManagedExperimentChange,
  commitManagedExperimentCreate,
  commitManagedExperimentRemoval,
  isManagedExperimentOutcomeUncertain,
  requireManagedExperimentAuthority,
} from "@/renderer/state/managedRootCatalog/rootExperimentAuthority";
import { requestGeneratedTitle } from "@/renderer/utils/titleGen";
import {
  detachThreadFromWorktree,
  removeExperimentCandidateWorktree,
} from "./experimentWorktreeActions";
import { performInitialThreadLaunch } from "./threadLaunchActions";
import { isRemoteCommandOutcomeUncertainError } from "./threadCommandOutcomeActions";
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

/**
 * Persist a generated title through the host authority. The rebase planner is
 * semantic: it applies the generated title ONLY while the authoritative record
 * still carries the prompt fallback, so a user's newer title is never
 * overwritten by a late generation result.
 */
function applyExperimentTitle(experimentId: string, title: string, fallbackTitle: string): void {
  const trimmed = title.trim();
  if (!trimmed || trimmed === fallbackTitle) return;
  const experiment = useExperimentStore.getState().experiments[experimentId];
  if (!experiment) return;
  const candidateIds = experiment.candidates.map((candidate) => candidate.threadId);
  void commitManagedExperimentChange(experimentId, (record) =>
    record.title === fallbackTitle
      ? {
          record: { ...record, title: trimmed, updatedAt: new Date().toISOString() },
          rows: record.candidates.map((candidate) => ({
            threadId: candidate.threadId,
            groupName: trimmed,
          })),
        }
      : null,
  )
    .then((confirmed) => {
      if (!confirmed) return;
      useAppStore.setState((state) => ({
        threads: state.threads.map((thread) =>
          candidateIds.includes(thread.id) ? { ...thread, groupName: trimmed } : thread,
        ),
      }));
    })
    .catch((error) => {
      console.warn("[experiment title-gen] failed to save the generated title:", error);
    });
}

/** Confirm a sidebar rename and candidate group names before projecting it. */
export async function renameExperimentWithAuthority(
  experimentId: string,
  title: string,
): Promise<void> {
  const experiment = useExperimentStore.getState().experiments[experimentId];
  const trimmed = title.trim();
  if (!experiment || !trimmed || trimmed === experiment.title) return;
  try {
    const confirmed = await commitManagedExperimentChange(experimentId, (record) => ({
      record: { ...record, title: trimmed, updatedAt: new Date().toISOString() },
      rows: record.candidates.map((candidate) => ({
        threadId: candidate.threadId,
        groupName: trimmed,
      })),
    }));
    if (confirmed) {
      const candidateIds = new Set(confirmed.candidates.map((candidate) => candidate.threadId));
      useAppStore.setState((state) => ({
        threads: state.threads.map((thread) =>
          thread.groupId === confirmed.id && candidateIds.has(thread.id)
            ? { ...thread, groupName: confirmed.title }
            : thread,
        ),
      }));
    }
  } catch (error) {
    toast.danger(friendlyError(error));
  }
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
  // Experiments create git worktrees through the local bridge. A mirrored
  // project's location only resolves on its host, so refusing up front keeps
  // the failure honest instead of letting every candidate fail individually.
  if (project.remoteServerId) {
    toast.danger(
      i18n._(
        msg`Experiments run on the machine hosting the project. Open the project on its host to run an experiment.`,
      ),
    );
    return null;
  }
  const prompt = input.prompt.trim();
  if (!prompt || input.candidates.length < 2) {
    toast.danger(i18n._(msg`Choose at least two candidates and enter a prompt.`));
    return null;
  }
  if (prompt.length > MAX_EXPERIMENT_PROMPT_LENGTH) {
    toast.danger(i18n._(msg`The experiment prompt is too long.`));
    return null;
  }
  // The durable record lives in the co-located host's experiment authority.
  // Refuse before creating any local row, worktree, or provider launch when
  // that authority is absent; there is no whole-map fallback.
  try {
    await requireManagedExperimentAuthority();
  } catch (error) {
    toast.danger(friendlyError(error));
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
      // Experiment candidate durability is the host experiment `create`
      // command below: this row must not be marked as a managed-root
      // create+launch (the host `start` command would launch it and replace
      // its metadata). See managedRootCatalog/rootCreateIntent.ts.
      suppressHostCreateIntent: true,
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
  const createdRecord = {
    ...experimentBase,
    candidates: plans.map((plan) => candidateRecord(plan)),
  };
  useExperimentStore.getState().addExperiment(createdRecord);
  const threadSpecs: ExperimentCandidateThreadCreation[] = plans.map((plan) => {
    const thread = threadById.get(plan.threadId)!;
    return {
      threadId: thread.id,
      projectId: project.id,
      title: plan.label,
      agentKind: thread.agentKind,
      ...(thread.agentInstanceId ? { agentInstanceId: thread.agentInstanceId } : {}),
      config: thread.config,
      ...(thread.presentationMode ? { presentationMode: thread.presentationMode } : {}),
      worktreeBranch: plan.worktreeBranch,
    };
  });
  try {
    // ONE atomic host transaction inserts the record and every candidate row
    // BEFORE any worktree is prepared or any provider is launched. Only a
    // definitive failure (proven zero effect) rolls the local rows back; an
    // uncertain outcome may still have committed, so the local record is kept
    // and no worktree or provider effect is started.
    await commitManagedExperimentCreate(createdRecord, threadSpecs);
  } catch (error) {
    if (!isManagedExperimentOutcomeUncertain(error)) {
      for (const thread of threads) useAppStore.getState().deleteThread(thread.id);
      useExperimentStore.getState().removeExperiment(experimentId);
    }
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
    .catch((error): CreateExperimentWorktreesResult => ({
      candidates: plans.map((plan) => ({
        threadId: plan.threadId,
        branch: plan.worktreeBranch,
        error: friendlyError(error),
      })),
    }));
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

  const cleanupRows = (): ExperimentCandidateRowUpdate[] =>
    plans.flatMap((plan): ExperimentCandidateRowUpdate[] => {
      if (cleanedIds.has(plan.threadId)) {
        return [{ threadId: plan.threadId, worktree: null, fail: true }];
      }
      const candidate = prepared.find((item) => item.threadId === plan.threadId);
      return candidate
        ? [
            {
              threadId: candidate.threadId,
              worktree: { path: candidate.worktreePath, branch: candidate.worktreeBranch },
            },
          ]
        : [];
    });

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
      const cleanedAt = new Date().toISOString();
      await commitManagedExperimentChange(experimentId, (record) => ({
        // Keep the authoritative candidate ownership; only the intended
        // worktree/failure states and narrow row effects change.
        record: {
          ...record,
          candidates: plans.map((plan) => {
            const candidate = prepared.find((item) => item.threadId === plan.threadId);
            return candidateRecord(
              plan,
              cleanedIds.has(plan.threadId) ? undefined : candidate?.worktreePath,
              cleanedIds.has(plan.threadId) ? "removed" : candidate ? "owned" : "pending",
            );
          }),
          updatedAt: cleanedAt,
        },
        rows: cleanupRows(),
      })).catch((error) => {
        console.error("[experiment] failed to persist partial cleanup", error);
      });
      toast.warning(i18n._(msg`Some experiment worktrees could not be removed.`));
    } else {
      try {
        // Confirmed host removal deletes the record and every candidate row
        // (the never-launched candidates need no live-runtime retirement).
        await commitManagedExperimentRemoval(experimentId, "delete");
      } catch (error) {
        toast.danger(friendlyError(error));
        void refreshGitProject({ id: project.id, location: project.location }, "manual", "full");
        return experimentId;
      }
      for (const thread of threads) useAppStore.getState().deleteThread(thread.id);
      useExperimentStore.getState().removeExperiment(experimentId);
      const currentView = useAppStore.getState().view;
      if (currentView.kind === "experiment" && currentView.experimentId === experimentId) {
        useAppStore.getState().openHome();
      }
      toast.danger(
        i18n._(msg`At least two worktrees must be created. Any partial experiment was cleaned up.`),
      );
    }
    void refreshGitProject({ id: project.id, location: project.location }, "manual", "full");
    return cleanupComplete ? null : experimentId;
  }

  const preparedThreads = prepared.map((candidate) =>
    useAppStore.getState().threads.find((thread) => thread.id === candidate.threadId)!,
  );
  for (const plan of failedPlans) {
    // The host row for a failed candidate is preserved (never deleted) and
    // marked failed/detached through the confirmed update below; locally the
    // candidate is shown as errored instead of disappearing.
    useAppStore.getState().updateThreadRuntime(plan.threadId, {
      status: "error",
      attention: "error",
      canResumeWithConfig: false,
    });
  }
  const finalCandidates = plans.map((plan) => {
    const candidate = prepared.find((item) => item.threadId === plan.threadId);
    return candidate
      ? candidateRecord(candidate, candidate.worktreePath, "owned")
      : candidateRecord(plan, undefined, "removed");
  });
  try {
    await commitManagedExperimentChange(experimentId, (record) => ({
      record: {
        ...record,
        candidates: finalCandidates,
        updatedAt: new Date().toISOString(),
      },
      rows: cleanupRows(),
    }));
  } catch (error) {
    console.error("[experiment] failed to persist prepared candidates", error);
    toast.danger(friendlyError(error));
    // The host may already have committed this update. Keep the experiment
    // and its worktrees available for recovery, but never launch against an
    // unconfirmed candidate row or start another external effect.
    return experimentId;
  }
  const setupScript = project.scripts?.setupScript;
  await Promise.all(
    preparedThreads.map(async (thread, index) => {
      const candidate = prepared[index]!;
      void primeWorktreeGitState(project, candidate.worktreePath);
      try {
        await performInitialThreadLaunch({
          thread,
          projectLocation: buildWorktreeLocation(project.location, candidate.worktreePath),
          prompt,
          ...(input.segments ? { segments: input.segments } : {}),
          initialSize: DEFAULT_TERMINAL_SIZE,
        });
      } catch (error) {
        // A typed-uncertain start may have committed on the host: the launch
        // action already explained it once and ran the bounded authoritative
        // reconcile. Keep that reconciled state — never paint a definite
        // failure, never fire a second toast, and never continue the setup
        // script for this uncertain launch.
        if (isRemoteCommandOutcomeUncertainError(error)) return;
        console.error("[experiment] failed to start candidate", error);
        useAppStore.getState().updateThreadRuntime(thread.id, {
          status: "error",
          attention: "error",
          canResumeWithConfig: false,
        });
        toast.danger(friendlyError(error));
      }
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
