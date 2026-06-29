import { toast } from "@heroui/react";
import type {
  AgentInstanceId,
  ExperimentCandidate,
  Project,
  PromptSegment,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { buildWorktreeLocation, sanitizeWorktreeBranchName } from "@/shared/worktree";
import { readBridge } from "@/renderer/bridge";
import { makeThreadTitle, useAppStore } from "@/renderer/state/appStore";
import { getProjectActiveWorktreePaths, refreshGitProject } from "@/renderer/state/gitRefresh";
import { useGitStore } from "@/renderer/state/gitStore";
import { performWorktreeRemoval } from "@/renderer/actions/worktreeActions";
import { runGitMergeToSource, showGitOperationFailure } from "@/renderer/actions/gitCommandRunner";

/** A single agent/model the same prompt should be fanned out to. */
export interface ExperimentCandidateSpec {
  agentKind: string;
  agentInstanceId?: AgentInstanceId;
  /** Display label (provider name) captured for the board + branch names. */
  agentLabel?: string;
  config: ThreadConfig;
  presentationMode?: ThreadPresentationMode;
}

export interface LaunchExperimentInput {
  project: Project;
  prompt: string;
  segments?: PromptSegment[];
  /** Branch every candidate forks from and the winner merges back into. */
  baseBranch?: string;
  candidates: ExperimentCandidateSpec[];
}

const DEFAULT_LAUNCH_SIZE = { cols: 120, rows: 40 } as const;

function candidateLabel(spec: ExperimentCandidateSpec): string {
  const provider = spec.agentLabel ?? spec.agentKind;
  return spec.config.model ? `${provider} · ${spec.config.model}` : provider;
}

/**
 * Fan one prompt out across several agent/model candidates. Each candidate runs
 * in its own fresh worktree (branched from `baseBranch`) so their diffs can be
 * compared side-by-side on the experiment board and the winner merged back.
 *
 * Returns the new experiment id, or `null` if no candidate could be launched.
 */
export async function launchExperiment(input: LaunchExperimentInput): Promise<string | null> {
  const { project, prompt, segments, baseBranch, candidates } = input;
  if (candidates.length < 2) {
    toast.danger("Choose at least two candidates for an experiment.");
    return null;
  }

  const experimentId = crypto.randomUUID();
  const title = makeThreadTitle(prompt) || "Experiment";
  const promptSlug = sanitizeWorktreeBranchName(title).slice(0, 24) || "experiment";
  const shortId = experimentId.slice(0, 6);

  interface PreparedCandidate {
    spec: ExperimentCandidateSpec;
    worktreePath: string;
    worktreeBranch: string;
    label: string;
  }

  // Create worktrees sequentially: concurrent `git worktree add` in the same
  // repo races on index.lock. Failures skip just that candidate.
  const prepared: PreparedCandidate[] = [];
  const usedBranches = new Set<string>();
  for (let i = 0; i < candidates.length; i++) {
    const spec = candidates[i]!;
    const agentSlug = sanitizeWorktreeBranchName(candidateLabel(spec)).slice(0, 16);
    let branch = `exp/${promptSlug}-${agentSlug}-${shortId}`;
    if (usedBranches.has(branch)) branch = `${branch}-${i + 1}`;
    usedBranches.add(branch);
    try {
      const result = await readBridge().gitAddWorktree({
        projectLocation: project.location,
        branch,
        createBranch: true,
        ...(baseBranch ? { startPoint: baseBranch } : {}),
        ...(project.scripts?.worktreeCopyPatterns
          ? { copyIgnoredPatterns: project.scripts.worktreeCopyPatterns }
          : {}),
        transferUncommitted: false,
        keepChangesInSource: false,
      });
      prepared.push({
        spec,
        worktreePath: result.path,
        worktreeBranch: branch,
        label: candidateLabel(spec),
      });
    } catch (err) {
      console.error("[experiment] failed to create worktree for candidate", err);
      toast.danger(`${candidateLabel(spec)}: ${friendlyError(err)}`);
    }
  }

  if (prepared.length < 2) {
    toast.danger(
      prepared.length === 0
        ? "Couldn't create any worktrees for the experiment."
        : "Only one experiment worktree was created; cleaned it up instead of launching.",
    );
    await Promise.all(
      prepared.map((candidate) =>
        performWorktreeRemoval(project, candidate.worktreePath, candidate.worktreeBranch).catch(
          (err) => console.warn("[experiment] failed to clean up partial launch", err),
        ),
      ),
    );
    void refreshGitProject({ id: project.id, location: project.location }, "manual", "full");
    return null;
  }

  const store = useAppStore.getState();
  const threads = store.createThreadsBatch(
    prepared.map((p) => ({
      projectId: project.id,
      agentKind: p.spec.agentKind,
      ...(p.spec.agentInstanceId ? { agentInstanceId: p.spec.agentInstanceId } : {}),
      config: p.spec.config,
      prompt,
      title: p.label,
      worktreePath: p.worktreePath,
      worktreeBranch: p.worktreeBranch,
      groupId: experimentId,
      groupName: title,
      ...(p.spec.presentationMode ? { presentationMode: p.spec.presentationMode } : {}),
    })),
  );

  const candidateRecords: ExperimentCandidate[] = threads.map((thread, idx) => {
    const p = prepared[idx]!;
    return {
      threadId: thread.id,
      agentKind: p.spec.agentKind,
      ...(p.spec.agentLabel ? { agentLabel: p.spec.agentLabel } : {}),
      ...(p.spec.config.model ? { model: p.spec.config.model } : {}),
      worktreePath: p.worktreePath,
      worktreeBranch: p.worktreeBranch,
    };
  });

  store.createExperimentRecord({
    id: experimentId,
    projectId: project.id,
    title,
    prompt,
    ...(baseBranch ? { baseBranch } : {}),
    candidates: candidateRecords,
  });

  // Launch each candidate directly: the experiment board does not mount the
  // full ThreadView, so we can't rely on its queued-launch effect. The agents
  // run in the supervisor regardless; opening a candidate later just reattaches.
  for (let idx = 0; idx < threads.length; idx++) {
    const thread = threads[idx]!;
    const p = prepared[idx]!;
    const projectLocation = buildWorktreeLocation(project.location, p.worktreePath);
    void readBridge()
      .startThread({
        threadId: thread.id,
        projectLocation,
        agentKind: thread.agentKind,
        ...(thread.agentInstanceId ? { agentInstanceId: thread.agentInstanceId } : {}),
        config: thread.config,
        prompt,
        ...(segments ? { segments } : {}),
        initialSize: DEFAULT_LAUNCH_SIZE,
        ...(thread.presentationMode ? { presentationMode: thread.presentationMode } : {}),
      })
      .catch((err) => {
        console.error("[experiment] failed to start candidate thread", err);
        useAppStore.getState().updateThreadRuntime(thread.id, {
          status: "error",
          attention: "error",
          canResumeWithConfig: false,
        });
      });
  }

  // Prime git state for the new worktrees so the board shows diff stats without
  // waiting for the next background refresh.
  const worktreePaths = [
    ...new Set([
      ...getProjectActiveWorktreePaths(project.id),
      ...prepared.map((p) => p.worktreePath),
    ]),
  ].sort();
  void readBridge()
    .gitWatchWorktrees({ projectId: project.id, worktreePaths })
    .catch(() => undefined);
  void refreshGitProject({ id: project.id, location: project.location }, "manual", "full");

  store.openExperiment(experimentId);
  return experimentId;
}

/**
 * Merge the chosen candidate's branch into the experiment's base branch, then
 * archive the losers (close their threads + remove their worktrees/branches).
 */
export async function mergeExperimentWinner(
  experimentId: string,
  winnerThreadId: string,
): Promise<void> {
  const state = useAppStore.getState();
  const experiment = state.experiments[experimentId];
  if (!experiment) return;
  const project = state.projects.find((p) => p.id === experiment.projectId);
  if (!project) return;
  const winner = experiment.candidates.find((c) => c.threadId === winnerThreadId);
  if (!winner) return;

  let sourceBranch = experiment.baseBranch;
  if (!sourceBranch) {
    try {
      const res = await readBridge().gitGetWorktreeSourceBranch({
        projectLocation: project.location,
        branch: winner.worktreeBranch,
      });
      sourceBranch = res.sourceBranch ?? undefined;
    } catch {
      // fall through to the missing-branch guard below
    }
  }
  if (!sourceBranch) {
    toast.danger("Couldn't determine which branch to merge into.");
    return;
  }

  const worktreeLocation = buildWorktreeLocation(project.location, winner.worktreePath);
  let result;
  try {
    result = await runGitMergeToSource({
      projectLocation: project.location,
      worktreeLocation,
      worktreeBranch: winner.worktreeBranch,
      sourceBranch,
    });
  } catch (err) {
    toast.danger(friendlyError(err));
    return;
  }

  if (!result.merged) {
    showGitOperationFailure(result);
    return;
  }

  toast.success(
    result.fastForward
      ? `Merged ${winner.worktreeBranch} into ${sourceBranch}`
      : `Merged ${winner.worktreeBranch} into ${sourceBranch} (merge commit)`,
  );

  state.setExperimentWinner(experimentId, winnerThreadId);

  // Archive the losers: close their agents, drop their worktrees/branches, and
  // hide the threads from the active list (history is still recoverable).
  const losers = experiment.candidates.filter((c) => c.threadId !== winnerThreadId);
  await Promise.all(
    losers.map(async (loser) => {
      await readBridge()
        .closeThread({ threadId: loser.threadId })
        .catch(() => undefined);
      useAppStore.getState().archiveThread(loser.threadId);
      await performWorktreeRemoval(project, loser.worktreePath, loser.worktreeBranch).catch((err) =>
        console.warn("[experiment] failed to remove loser worktree", err),
      );
    }),
  );

  void refreshGitProject({ id: project.id, location: project.location }, "manual", "full");
}

/**
 * Abandon an experiment without picking a winner: close every candidate, remove
 * all worktrees/branches, and drop the experiment record.
 */
export async function discardExperiment(experimentId: string): Promise<void> {
  const state = useAppStore.getState();
  const experiment = state.experiments[experimentId];
  if (!experiment) return;
  const project = state.projects.find((p) => p.id === experiment.projectId);

  if (state.view.kind === "experiment" && state.view.experimentId === experimentId) {
    state.closeExperiment();
  }

  for (const candidate of experiment.candidates) {
    await readBridge()
      .closeThread({ threadId: candidate.threadId })
      .catch(() => undefined);
    useAppStore.getState().archiveThread(candidate.threadId);
    if (project) {
      await performWorktreeRemoval(project, candidate.worktreePath, candidate.worktreeBranch).catch(
        (err) => console.warn("[experiment] failed to remove worktree", err),
      );
    }
  }

  useAppStore.getState().removeExperiment(experimentId);
  if (project) {
    void refreshGitProject({ id: project.id, location: project.location }, "manual", "full");
  }
}

/** Resolve a default base branch for a project from its current git status. */
export function resolveProjectBaseBranch(projectId: string): string | undefined {
  return useGitStore.getState().statuses[projectId]?.branch || undefined;
}

// Low-signal files the judge shouldn't waste budget on (lockfiles, minified
// bundles, sourcemaps). Mirrors the filtering cmux applies before judging.
const NOISE_PATH =
  /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|[^/]*\.lock|[^/]*\.min\.(js|css)|[^/]*\.map)$/i;

/** Concatenate a worktree's staged + unstaged diffs, dropping low-signal files. */
async function collectCandidateDiff(project: Project, worktreePath: string): Promise<string> {
  const projectLocation = buildWorktreeLocation(project.location, worktreePath);
  try {
    const status = await readBridge().getGitStatus({ projectLocation });
    const untrackedPaths = status.unstaged
      .filter((file) => file.status === "?")
      .map((file) => file.path);
    const batch = await readBridge().getGitDiffBatch({ projectLocation, untrackedPaths });
    const parts: string[] = [];
    for (const record of [batch.unstaged, batch.staged]) {
      for (const [path, diff] of Object.entries(record)) {
        if (NOISE_PATH.test(path)) continue;
        if (diff.trim()) parts.push(diff);
      }
    }
    return parts.join("\n");
  } catch (err) {
    console.warn("[experiment] failed to collect candidate diff", err);
    return "";
  }
}

/**
 * Run the LLM judge ("crown"): gather each candidate's diff, ask a model to
 * pick the best, and record the result as an AI crown (overridable by the
 * user). Candidate diffs are sent with anonymized labels so the judge can't be
 * biased by which provider produced which diff. Returns true on success.
 */
export async function crownExperiment(experimentId: string): Promise<boolean> {
  const state = useAppStore.getState();
  const experiment = state.experiments[experimentId];
  if (!experiment) return false;
  const project = state.projects.find((p) => p.id === experiment.projectId);
  if (!project) return false;
  if (experiment.candidates.length < 2) {
    toast.danger("Need at least two candidates to crown a winner.");
    return false;
  }

  const diffs = await Promise.all(
    experiment.candidates.map((c) => collectCandidateDiff(project, c.worktreePath)),
  );
  if (diffs.every((d) => !d.trim())) {
    toast.danger("No changes yet — let the agents finish before crowning.");
    return false;
  }

  // Judge through the first candidate's provider (reuses its auth/config); the
  // label is anonymized but the threadId is preserved for mapping the winner.
  const judgeAgentKind = experiment.candidates[0]!.agentKind;
  const judgeModel = experiment.candidates[0]!.model;
  const judgeLabel = judgeModel
    ? `${experiment.candidates[0]!.agentLabel ?? judgeAgentKind} · ${judgeModel}`
    : (experiment.candidates[0]!.agentLabel ?? judgeAgentKind);

  let result;
  try {
    result = await readBridge().judgeExperiment({
      projectLocation: project.location,
      agentKind: judgeAgentKind,
      ...(judgeModel ? { model: judgeModel } : {}),
      prompt: experiment.prompt,
      candidates: experiment.candidates.map((c, idx) => ({
        threadId: c.threadId,
        label: `Solution ${String.fromCharCode(65 + idx)}`,
        diff: diffs[idx] ?? "",
      })),
    });
  } catch (err) {
    toast.danger(`Crown judge failed: ${friendlyError(err)}`);
    return false;
  }

  useAppStore.getState().setExperimentCrown(experimentId, {
    threadId: result.winnerThreadId,
    rationale: result.rationale,
    source: "ai",
    modelLabel: judgeLabel,
    createdAt: new Date().toISOString(),
  });
  return true;
}

/** Manually crown a candidate (overrides any AI crown). */
export function setManualCrown(experimentId: string, threadId: string): void {
  useAppStore.getState().setExperimentCrown(experimentId, {
    threadId,
    rationale: "Selected by you.",
    source: "user",
    createdAt: new Date().toISOString(),
  });
}
