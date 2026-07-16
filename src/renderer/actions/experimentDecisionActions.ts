import { toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import type {
  CaptureExperimentSnapshotResult,
  Experiment,
  ExperimentCandidate,
  Project,
  ProjectLocation,
} from "@/shared/contracts";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import { resolveAiLanguageName } from "@/shared/locale";
import { friendlyError } from "@/shared/messages";
import { buildWorktreeLocation } from "@/shared/worktree";
import { readBridge } from "@/renderer/bridge";
import { i18n } from "@/renderer/i18n/i18n";
import { detectOSLocale } from "@/renderer/i18n/locales";
import { useAppStore } from "@/renderer/state/appStore";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useExperimentStore } from "@/renderer/state/experimentStore";
import { refreshGitProject } from "@/renderer/state/gitRefresh";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  cleanupExperimentCandidates,
  experimentThreads,
  getPendingExperimentOperation,
  hasActiveExperimentCandidate,
  isEligibleExperimentJudgeAgent,
  withExperimentOperation,
} from "./experimentOperationState";
import {
  detachThreadFromWorktree,
  persistExperimentOwnershipState,
  resolveCandidateWorktreePath,
} from "./experimentWorktreeActions";
import { runGitMergeToSource, showGitOperationFailure } from "./gitCommandRunner";

export interface ExperimentJudgeSelection {
  agentKind: string;
  model: string;
  effort?: string;
  fast: boolean;
}

function experimentSnapshotCandidates(experiment: Experiment) {
  return experiment.candidates.map((candidate) => ({
    threadId: candidate.threadId,
    branch: candidate.worktreeBranch,
    ownerToken: candidate.worktreeOwnerToken,
    ...(candidate.worktreePath ? { worktreePath: candidate.worktreePath } : {}),
  }));
}

async function captureExperimentSnapshot(
  project: Project,
  experiment: Experiment,
): Promise<CaptureExperimentSnapshotResult> {
  return readBridge().captureExperimentSnapshot({
    experimentId: experiment.id,
    projectLocation: project.location,
    baseCommit: experiment.baseCommit,
    candidates: experimentSnapshotCandidates(experiment),
  });
}

async function resolveCandidateWorktreeLocation(
  project: Project,
  candidate: ExperimentCandidate,
): Promise<ProjectLocation | undefined> {
  let worktreePath: string | undefined;
  try {
    worktreePath = await resolveCandidateWorktreePath(project, candidate);
  } catch (error) {
    toast.danger(i18n._(msg`Unable to read the candidate changes: ${friendlyError(error)}`));
    return undefined;
  }
  if (!worktreePath) {
    toast.danger(i18n._(msg`The experiment candidate worktree is unavailable.`));
    return undefined;
  }
  return buildWorktreeLocation(project.location, worktreePath);
}

async function commitCandidateChanges(
  worktreeLocation: ProjectLocation,
  candidate: ExperimentCandidate,
  message: string,
): Promise<boolean> {
  const status = await readBridge().getGitStatus({ projectLocation: worktreeLocation });
  if (status.branch !== candidate.worktreeBranch) {
    toast.danger(i18n._(msg`A candidate is no longer on its experiment branch.`));
    return false;
  }
  if (status.staged.length > 0 || status.unstaged.length > 0) {
    await readBridge().gitCommit({
      projectLocation: worktreeLocation,
      message,
      addAll: true,
    });
  }
  return true;
}

export type ExperimentJudgeProgressEvent =
  | { kind: "capturing" }
  | { kind: "captured"; threadId: string; files: number; insertions: number; deletions: number }
  | { kind: "judging" }
  | {
      kind: "winner";
      threadId: string;
      rationale: string;
      assessments: Array<{ threadId: string; rationale: string }>;
    };

export async function crownExperiment(
  experimentId: string,
  selection?: ExperimentJudgeSelection,
  onProgress?: (event: ExperimentJudgeProgressEvent) => void,
): Promise<boolean> {
  return withExperimentOperation(experimentId, async () => {
    const experiment = useExperimentStore.getState().experiments[experimentId];
    if (!experiment) return false;
    const project = useAppStore
      .getState()
      .projects.find((item) => item.id === experiment.projectId);
    if (!project) return false;
    if (hasActiveExperimentCandidate(experimentId)) {
      toast.warning(i18n._(msg`Wait for every candidate to finish before comparing them.`));
      return false;
    }

    const agentState = useAgentStatusesStore.getState();
    const disabledAgents = useSharedSettings.getState().disabledAgents;
    const judgeAgents = getProjectAgentStatuses(
      project.location,
      agentState.agentStatuses,
      agentState.wslAgentStatuses,
    );
    const eligibleJudgeAgents = judgeAgents.filter((agent) =>
      isEligibleExperimentJudgeAgent(agent, disabledAgents),
    );
    const judgeAgent = selection
      ? eligibleJudgeAgents.find((agent) => agent.kind === selection.agentKind)
      : (eligibleJudgeAgents.find((agent) =>
          experiment.candidates.some((candidate) => candidate.agentKind === agent.kind),
        ) ?? eligibleJudgeAgents[0]);
    const judgeThread = judgeAgent
      ? experimentThreads(experimentId).find((thread) => thread.agentKind === judgeAgent.kind)
      : undefined;
    if (!judgeAgent) {
      toast.warning(i18n._(msg`None of these agents can run the AI comparison.`));
      return false;
    }
    const judgeModel = selection?.model ?? judgeThread?.config.model;
    const judgeEffort = selection?.effort ?? judgeThread?.config.effort;
    const judgeFast = selection?.fast ?? judgeThread?.config.fast;
    onProgress?.({ kind: "capturing" });
    const unsubscribeProgress = readBridge().onSupervisorEvent((event) => {
      if (event.type !== "experiment-judge-progress" || event.experimentId !== experimentId) {
        return;
      }
      onProgress?.(event.progress);
    });
    try {
      const result = await readBridge().judgeExperimentSnapshot({
        experimentId,
        projectLocation: project.location,
        baseCommit: experiment.baseCommit,
        agentKind: judgeAgent.kind,
        ...(judgeModel ? { model: judgeModel } : {}),
        ...(judgeEffort ? { effort: judgeEffort } : {}),
        ...(judgeFast !== undefined ? { fast: judgeFast } : {}),
        prompt: experiment.prompt,
        candidates: experimentSnapshotCandidates(experiment),
      });
      const judgeLabel = judgeModel ? `${judgeAgent.label} · ${judgeModel}` : judgeAgent.label;
      useExperimentStore.getState().setExperimentCrown(experimentId, {
        threadId: result.winnerThreadId,
        rationale: result.rationale,
        assessments: result.assessments,
        source: "ai",
        modelLabel: judgeLabel,
        snapshotHash: result.hash,
        createdAt: new Date().toISOString(),
      });
      onProgress?.({
        kind: "winner",
        threadId: result.winnerThreadId,
        rationale: result.rationale,
        assessments: result.assessments,
      });
      return true;
    } catch (error) {
      if (isJudgeAbortError(error)) return false;
      toast.danger(i18n._(msg`Unable to compare candidates: ${friendlyError(error)}`));
      return false;
    } finally {
      unsubscribeProgress();
    }
  });
}

function isJudgeAbortError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\baborted?\b/i.test(message);
}

export function cancelExperimentJudge(experimentId: string): void {
  void readBridge()
    .cancelJudgeExperiment({ experimentId })
    .catch(() => undefined);
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
    if (hasActiveExperimentCandidate(experimentId)) {
      toast.warning(i18n._(msg`Wait for every candidate to finish before merging a winner.`));
      return false;
    }

    const worktreeLocation = await resolveCandidateWorktreeLocation(project, winner);
    if (!worktreeLocation) return false;
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
      if (
        !(await commitCandidateChanges(worktreeLocation, winner, "chore: apply experiment winner"))
      ) {
        return false;
      }
      const snapshot = await captureExperimentSnapshot(project, experiment);
      if (
        experiment.crown.source === "ai" &&
        experiment.crown.snapshotHash &&
        snapshot.hash !== experiment.crown.snapshotHash
      ) {
        toast.warning(i18n._(msg`The candidates changed after judging. Compare them again.`));
        return false;
      }
      const winnerSnapshot = snapshot.candidates.find(
        (candidate) => candidate.threadId === winner.threadId,
      );
      if (!winnerSnapshot) {
        throw new Error(i18n._(msg`The experiment candidate worktree is unavailable.`));
      }
      expectedWorktreeCommit = winnerSnapshot.headCommit;
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

      const cleanupResults = await cleanupExperimentCandidates(project, experiment.candidates);
      cleanupResults.forEach((removed, index) => {
        if (removed) detachThreadFromWorktree(experiment.candidates[index]!.threadId);
      });
      const cleanupComplete = cleanupResults.every(Boolean);
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

export async function createExperimentCandidatePr(
  experimentId: string,
  threadId: string,
): Promise<boolean> {
  return withExperimentOperation(experimentId, async () => {
    const experiment = useExperimentStore.getState().experiments[experimentId];
    if (!experiment) return false;
    const project = useAppStore
      .getState()
      .projects.find((item) => item.id === experiment.projectId);
    const candidate = experiment.candidates.find((item) => item.threadId === threadId);
    if (!project || !candidate) return false;
    if (hasActiveExperimentCandidate(experimentId)) {
      toast.warning(i18n._(msg`Wait for every candidate to finish before opening a pull request.`));
      return false;
    }

    const worktreeLocation = await resolveCandidateWorktreeLocation(project, candidate);
    if (!worktreeLocation) return false;

    try {
      if (
        !(await commitCandidateChanges(
          worktreeLocation,
          candidate,
          "chore: apply experiment candidate",
        ))
      ) {
        return false;
      }
      await readBridge().gitPush({
        projectLocation: worktreeLocation,
        branch: candidate.worktreeBranch,
        setUpstream: true,
      });

      let title = experiment.title;
      let body = experiment.prompt;
      const settings = useSharedSettings.getState();
      const language = resolveAiLanguageName("match-app", settings.locale, detectOSLocale());
      try {
        const summary = await readBridge().generatePrSummary({
          projectLocation: project.location,
          agentKind: candidate.agentKind,
          branch: candidate.worktreeBranch,
          baseBranch: experiment.baseBranch,
          ...(candidate.model ? { model: candidate.model } : {}),
          ...(candidate.effort ? { effort: candidate.effort } : {}),
          ...(language ? { language } : {}),
        });
        if (summary.title.trim()) {
          title = summary.title.trim();
          body = summary.description.trim();
        }
      } catch (error) {
        console.warn("[experiment] PR summary generation failed, using fallback", error);
      }

      const pr = await readBridge().ghCreatePr({
        projectLocation: project.location,
        branch: candidate.worktreeBranch,
        baseBranch: experiment.baseBranch,
        title: title || candidate.worktreeBranch,
        body,
        isDraft: false,
      });
      const candidateIds = new Set(experiment.candidates.map((item) => item.threadId));
      const appStore = useAppStore.getState();
      if (appStore.view.kind === "experiment" && appStore.view.experimentId === experimentId) {
        appStore.openHome();
      }
      useAppStore.setState((state) => ({
        threads: state.threads.map((thread) =>
          candidateIds.has(thread.id)
            ? { ...thread, groupId: undefined, groupName: undefined }
            : thread,
        ),
      }));
      useExperimentStore.getState().removeExperiment(experimentId);
      await persistExperimentOwnershipState([...candidateIds]).catch(() => undefined);
      toast.success(i18n._(msg`Opened pull request #${pr.number} for the candidate.`));
      void refreshGitProject({ id: project.id, location: project.location }, "manual", "full");
      return true;
    } catch (error) {
      toast.danger(i18n._(msg`Unable to create the pull request: ${friendlyError(error)}`));
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
    if (hasActiveExperimentCandidate(experimentId)) {
      toast.warning(i18n._(msg`Wait for every candidate to finish before cleaning up.`));
      return false;
    }

    const cleanupResults = await cleanupExperimentCandidates(project, pending);
    cleanupResults.forEach((removed, index) => {
      if (removed) detachThreadFromWorktree(pending[index]!.threadId);
    });
    const cleanupComplete = cleanupResults.every(Boolean);
    if (!cleanupComplete) {
      toast.warning(i18n._(msg`Some experiment worktrees could not be removed.`));
    }
    void refreshGitProject({ id: project.id, location: project.location }, "manual", "full");
    return cleanupComplete;
  });
}

export async function discardExperiment(experimentId: string): Promise<boolean> {
  const experiment = useExperimentStore.getState().experiments[experimentId];
  if (!experiment) return false;

  const pendingOperation = getPendingExperimentOperation(experimentId);
  const appStore = useAppStore.getState();
  const project = appStore.projects.find((item) => item.id === experiment.projectId);
  const candidateIds = experiment.candidates.map((candidate) => candidate.threadId);
  if (appStore.view.kind === "experiment" && appStore.view.experimentId === experimentId) {
    appStore.openHome();
  }
  useExperimentStore.getState().removeExperiment(experimentId);
  for (const threadId of candidateIds) useAppStore.getState().deleteThread(threadId);
  const persistRemoval = persistExperimentOwnershipState(candidateIds).catch(() => undefined);

  if (pendingOperation) await pendingOperation;
  const cleanupResults = await cleanupExperimentCandidates(project, experiment.candidates);
  const cleanupComplete = cleanupResults.every(Boolean);
  await persistRemoval;
  if (!cleanupComplete) {
    toast.warning(i18n._(msg`Some experiment worktrees could not be removed.`));
  }
  if (project) {
    void refreshGitProject({ id: project.id, location: project.location }, "manual", "full");
  }
  return cleanupComplete;
}
