import type { Experiment, ExperimentCandidate } from "@/shared/contracts";
import { normalizeWorktreePathForComparison } from "@/shared/worktree";
import { readBridge } from "@/renderer/bridge";
import { captureRendererException } from "@/renderer/diagnostics/sentry";
import { useAppStore } from "@/renderer/state/appStore";
import { useExperimentStore } from "@/renderer/state/experimentStore";

interface ResolvedCandidateWorktree {
  readonly branch: string;
  readonly path: string | undefined;
  readonly preserveCandidatePath: boolean;
  readonly state: ExperimentCandidate["worktreeState"];
}

export function recoverExperimentCandidateWorktrees(): Promise<void> | null {
  const appState = useAppStore.getState();
  const experiments = Object.values(useExperimentStore.getState().experiments);
  if (experiments.length === 0) return null;
  return recoverCandidateWorktrees(appState, experiments);
}

async function recoverCandidateWorktrees(
  appState: ReturnType<typeof useAppStore.getState>,
  experiments: readonly Experiment[],
): Promise<void> {
  const resolvedByThreadId = new Map<string, ResolvedCandidateWorktree>();
  const threadById = new Map(appState.threads.map((thread) => [thread.id, thread] as const));

  await Promise.all(
    appState.projects.map(async (project) => {
      const projectExperiments = experiments.filter(
        (experiment) => experiment.projectId === project.id,
      );
      if (projectExperiments.length === 0) return;
      try {
        const { worktrees } = await readBridge().gitListWorktrees({
          projectLocation: project.location,
        });
        await Promise.all(
          projectExperiments.flatMap((experiment) =>
            experiment.candidates.map(async (candidate) => {
              const state = candidate.worktreeState;
              if (state === "removed") {
                resolvedByThreadId.set(candidate.threadId, {
                  branch: candidate.worktreeBranch,
                  path: undefined,
                  preserveCandidatePath: false,
                  state,
                });
                return;
              }
              const caseInsensitive = project.location.kind === "windows";
              const recordedPaths = new Set(
                [threadById.get(candidate.threadId)?.worktreePath, candidate.worktreePath]
                  .filter((path): path is string => path !== undefined)
                  .map((path) => normalizeWorktreePathForComparison(path, caseInsensitive)),
              );
              const registeredAtRecordedPath = worktrees.some((worktree) =>
                recordedPaths.has(
                  normalizeWorktreePathForComparison(worktree.path, caseInsensitive),
                ),
              );
              const branchWorktree = worktrees.find(
                (worktree) => worktree.branch === candidate.worktreeBranch,
              );
              let recoveredState = state;
              let recoveredPath = branchWorktree?.path;
              if (branchWorktree) {
                try {
                  const metadata = await readBridge().gitGetWorktreeOwner({
                    projectLocation: project.location,
                    branch: candidate.worktreeBranch,
                  });
                  if (metadata.ownerToken === candidate.worktreeOwnerToken) {
                    recoveredState = "owned";
                  } else {
                    recoveredPath = undefined;
                  }
                } catch (error) {
                  captureRendererException(error, { featureArea: "hydration" });
                  recoveredPath = undefined;
                }
              }
              resolvedByThreadId.set(candidate.threadId, {
                branch: candidate.worktreeBranch,
                path: recoveredPath,
                preserveCandidatePath: registeredAtRecordedPath,
                state: recoveredState,
              });
            }),
          ),
        );
      } catch (error) {
        captureRendererException(error, { featureArea: "hydration" });
      }
    }),
  );

  if (resolvedByThreadId.size === 0) return;
  useAppStore.setState((state) => ({
    threads: state.threads.map((thread) => {
      const resolved = resolvedByThreadId.get(thread.id);
      if (!resolved) return thread;
      if (resolved.path) {
        if (thread.worktreePath === resolved.path && thread.worktreeBranch === resolved.branch) {
          return thread;
        }
        return {
          ...thread,
          worktreePath: resolved.path,
          worktreeBranch: resolved.branch,
          updatedAt: new Date().toISOString(),
        };
      }
      if (thread.worktreePath === undefined) return thread;
      const { worktreePath: _worktreePath, ...withoutWorktreePath } = thread;
      return {
        ...withoutWorktreePath,
        worktreeBranch: resolved.branch,
        updatedAt: new Date().toISOString(),
      };
    }),
  }));
  useExperimentStore.setState((state) => ({
    experiments: Object.fromEntries(
      Object.entries(state.experiments).map(([experimentId, experiment]) => [
        experimentId,
        {
          ...experiment,
          candidates: experiment.candidates.map((candidate) => {
            const resolved = resolvedByThreadId.get(candidate.threadId);
            if (!resolved) return candidate;
            const { worktreePath: _worktreePath, ...candidateWithoutPath } = candidate;
            if (resolved.path) {
              return {
                ...candidateWithoutPath,
                worktreePath: resolved.path,
                worktreeState: resolved.state,
              };
            }
            return resolved.preserveCandidatePath
              ? { ...candidate, worktreeState: resolved.state }
              : { ...candidateWithoutPath, worktreeState: resolved.state };
          }),
        },
      ]),
    ),
  }));
}
