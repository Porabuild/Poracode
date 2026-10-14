import type {
  Experiment,
  ExperimentCandidate,
  ExperimentCandidateRowUpdate,
} from "@/shared/contracts";
import { normalizeWorktreePathForComparison } from "@/shared/worktree";
import { readBridge } from "@/renderer/bridge";
import { captureRendererException } from "@/renderer/diagnostics/sentry";
import { useAppStore } from "@/renderer/state/appStore";
import { useExperimentStore } from "@/renderer/state/experimentStore";
import { commitManagedExperimentChange } from "@/renderer/state/managedRootCatalog/rootExperimentAuthority";

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
  // The repair is durable only through the host authority, and only when it
  // actually changes the authoritative record: the planner re-runs against the
  // host's current record on every conflict rebase, never resurrects a
  // candidate the host already removed, and projects the confirmed record.
  await Promise.all(
    experiments.map(async (experiment) => {
      if (!experiment.candidates.some((candidate) => resolvedByThreadId.has(candidate.threadId))) {
        return;
      }
      try {
        await commitManagedExperimentChange(experiment.id, (record) => {
          const rows: ExperimentCandidateRowUpdate[] = [];
          let changed = false;
          const candidates = record.candidates.map((candidate) => {
            const resolved = resolvedByThreadId.get(candidate.threadId);
            if (!resolved) return candidate;
            if (candidate.worktreeState === "removed" && resolved.state !== "removed") {
              return candidate;
            }
            if (
              candidate.worktreePath === resolved.path &&
              candidate.worktreeState === resolved.state
            ) {
              return candidate;
            }
            changed = true;
            if (!resolved.path && resolved.preserveCandidatePath && candidate.worktreePath) {
              // A worktree is still registered at the recorded path but not on
              // the candidate branch: keep the recorded path and repair only
              // the state (the resolver refuses the branch mismatch later).
              return { ...candidate, worktreeState: resolved.state };
            }
            if (resolved.path) {
              rows.push({
                threadId: candidate.threadId,
                worktree: { path: resolved.path, branch: resolved.branch },
              });
            } else if (candidate.worktreePath) {
              rows.push({ threadId: candidate.threadId, worktree: null });
            }
            const { worktreePath: _worktreePath, ...candidateWithoutPath } = candidate;
            return {
              ...candidateWithoutPath,
              ...(resolved.path ? { worktreePath: resolved.path } : {}),
              worktreeState: resolved.state,
            };
          });
          return changed
            ? { record: { ...record, candidates, updatedAt: new Date().toISOString() }, rows }
            : null;
        });
      } catch (error) {
        captureRendererException(error, { featureArea: "hydration" });
      }
    }),
  );
}
