import { msg } from "@lingui/core/macro";
import { type ExperimentCandidate, type GitWorktreeInfo, type Project } from "@/shared/contracts";
import { normalizeWorktreePathForComparison } from "@/shared/worktree";
import { readBridge } from "@/renderer/bridge";
import { i18n } from "@/renderer/i18n/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { useExperimentStore } from "@/renderer/state/experimentStore";
import { prepareWorktreeRemoval } from "./worktreeActions";

export function detachThreadFromWorktree(threadId: string): void {
  useAppStore.setState((state) => ({
    threads: state.threads.map((thread) => {
      if (thread.id !== threadId) return thread;
      const { worktreePath: _path, worktreeBranch: _branch, ...rest } = thread;
      return {
        ...rest,
        status: "inactive",
        attention: "none",
        done: true,
        doneAt: new Date().toISOString(),
      };
    }),
  }));
  updateCandidateWorktree(threadId, "removed");
}

export function updateCandidateWorktree(
  threadId: string,
  worktreeState: ExperimentCandidate["worktreeState"],
  worktreePath?: string,
): void {
  useExperimentStore.setState((state) => {
    const experiment = Object.values(state.experiments).find((item) =>
      item.candidates.some((candidate) => candidate.threadId === threadId),
    );
    if (!experiment) return state;
    return {
      experiments: {
        ...state.experiments,
        [experiment.id]: {
          ...experiment,
          candidates: experiment.candidates.map((candidate) => {
            if (candidate.threadId !== threadId) return candidate;
            const { worktreePath: _worktreePath, ...candidateWithoutPath } = candidate;
            return {
              ...candidateWithoutPath,
              ...(worktreePath ? { worktreePath } : {}),
              worktreeState,
            };
          }),
          updatedAt: new Date().toISOString(),
        },
      },
    };
  });
}

export async function closeExperimentThread(threadId: string): Promise<boolean> {
  try {
    await readBridge().closeThread({ threadId });
    return true;
  } catch (error) {
    console.error("[experiment] failed to stop candidate", error);
    return false;
  }
}

export async function resolveCandidateWorktreePath(
  project: Project,
  candidate: ExperimentCandidate,
  knownWorktrees?: readonly GitWorktreeInfo[],
): Promise<string | undefined> {
  const worktrees =
    knownWorktrees ??
    (await readBridge().gitListWorktrees({ projectLocation: project.location })).worktrees;
  const threadPath = useAppStore
    .getState()
    .threads.find((thread) => thread.id === candidate.threadId)?.worktreePath;
  const recordedPaths = new Set(
    [threadPath, candidate.worktreePath]
      .filter((path): path is string => path !== undefined)
      .map((path) => normalizeWorktreePathForComparison(path, project.location.kind === "windows")),
  );
  const registeredAtRecordedPath = worktrees.filter((worktree) =>
    recordedPaths.has(
      normalizeWorktreePathForComparison(worktree.path, project.location.kind === "windows"),
    ),
  );
  const recordedCandidateWorktree = registeredAtRecordedPath.find(
    (worktree) => worktree.branch === candidate.worktreeBranch,
  );
  if (recordedCandidateWorktree) {
    await assertCandidateWorktreeOwner(project, candidate);
    return recordedCandidateWorktree.path;
  }
  if (registeredAtRecordedPath.length > 0) {
    throw new Error(i18n._(msg`A candidate is no longer on its experiment branch.`));
  }
  const worktree = worktrees.find((item) => item.branch === candidate.worktreeBranch);
  if (worktree) await assertCandidateWorktreeOwner(project, candidate);
  return worktree?.path;
}

async function candidateWorktreeOwnerMatches(
  project: Project,
  candidate: ExperimentCandidate,
): Promise<boolean> {
  const { ownerToken } = await readBridge().gitGetWorktreeOwner({
    projectLocation: project.location,
    branch: candidate.worktreeBranch,
  });
  return ownerToken === candidate.worktreeOwnerToken;
}

async function assertCandidateWorktreeOwner(
  project: Project,
  candidate: ExperimentCandidate,
): Promise<void> {
  if (!(await candidateWorktreeOwnerMatches(project, candidate))) {
    throw new Error(i18n._(msg`The experiment candidate worktree is unavailable.`));
  }
}

export interface RemoveExperimentCandidateWorktreesOptions {
  /**
   * Refuse to ask the host without a verified registered-worktree list. The
   * launch rollback needs preparation (cleanup script, dismissed panels)
   * before a directory disappears; a host-delegated removal cannot guarantee it.
   */
  readonly requireVerifiedList?: boolean;
  /** Convert host/transport failures into per-candidate false results. */
  readonly tolerateFailure?: boolean;
}

export async function removeExperimentCandidateWorktrees(
  project: Project,
  candidates: readonly ExperimentCandidate[],
  options: RemoveExperimentCandidateWorktreesOptions = {},
): Promise<boolean[]> {
  const removed = candidates.map((candidate) => candidate.worktreeState === "removed");
  const active = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => candidate.worktreeState !== "removed");
  if (active.length === 0) return removed;

  const knownWorktrees = await readBridge()
    .gitListWorktrees({ projectLocation: project.location })
    .then(({ worktrees }) => worktrees)
    .catch((error) => {
      console.warn("[experiment] failed to verify candidate worktrees before cleanup", error);
      return undefined;
    });
  if (!knownWorktrees && options.requireVerifiedList) return removed;
  const preparedResults = await Promise.all(
    active.map(async ({ candidate, index }) => {
      if (!knownWorktrees) return { candidate, index, path: undefined };
      try {
        return {
          candidate,
          index,
          path: await resolveCandidateWorktreePath(project, candidate, knownWorktrees),
        };
      } catch (error) {
        console.warn("[experiment] refused to prepare an unverified candidate worktree", error);
        return null;
      }
    }),
  );
  const prepared = preparedResults.filter(
    (item): item is NonNullable<(typeof preparedResults)[number]> => item !== null,
  );
  if (prepared.length === 0) return removed;
  try {
    await Promise.all(
      prepared.map(({ path }) =>
        path ? prepareWorktreeRemoval(project, path) : Promise.resolve(),
      ),
    );
  } catch (error) {
    console.warn("[experiment] failed to prepare candidate worktrees for removal", error);
    if (!options.tolerateFailure) throw error;
    return removed;
  }
  const result = await readBridge()
    .removeExperimentWorktrees({
      projectLocation: project.location,
      candidates: prepared.map(({ candidate, path }) => ({
        threadId: candidate.threadId,
        branch: candidate.worktreeBranch,
        ownerToken: candidate.worktreeOwnerToken,
        ...(path ? { worktreePath: path } : {}),
      })),
    })
    .catch((error: unknown) => {
      console.warn("[experiment] failed to remove candidate worktrees", error);
      if (!options.tolerateFailure) throw error;
      return null;
    });
  if (!result) return removed;
  result.candidates.forEach((candidate, resultIndex) => {
    const originalIndex = prepared[resultIndex]!.index;
    removed[originalIndex] = !candidate.error;
    if (candidate.error) {
      console.warn("[experiment] failed to remove candidate worktree", candidate.error);
    }
  });
  return removed;
}
