import { msg } from "@lingui/core/macro";
import {
  EXPERIMENT_STORE_KEY,
  EXPERIMENT_STORE_VERSION,
  type ExperimentCandidate,
  type GitWorktreeInfo,
  type Project,
} from "@/shared/contracts";
import { normalizeWorktreePathForComparison } from "@/shared/worktree";
import { readBridge } from "@/renderer/bridge";
import { i18n } from "@/renderer/i18n/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { useExperimentStore } from "@/renderer/state/experimentStore";
import { performWorktreeRemoval } from "./worktreeActions";

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

export async function persistExperimentOwnershipState(threadIds: readonly string[]): Promise<void> {
  for (const threadId of threadIds) {
    const thread = useAppStore.getState().threads.find((item) => item.id === threadId);
    if (thread) await readBridge().dbUpsertThread(thread);
    else await readBridge().dbDeleteThread(threadId);
  }
  await readBridge().dbSetState(
    EXPERIMENT_STORE_KEY,
    JSON.stringify({
      state: { experiments: useExperimentStore.getState().experiments },
      version: EXPERIMENT_STORE_VERSION,
    }),
  );
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

async function assertCandidateWorktreeOwner(
  project: Project,
  candidate: ExperimentCandidate,
): Promise<void> {
  if (!(await candidateWorktreeOwnerMatches(project, candidate))) {
    throw new Error(i18n._(msg`The experiment candidate worktree is unavailable.`));
  }
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

async function removeOwnedCandidateBranch(
  project: Project,
  candidate: ExperimentCandidate,
): Promise<boolean> {
  try {
    if (!(await candidateWorktreeOwnerMatches(project, candidate))) return true;
    await readBridge().gitDeleteBranch({
      projectLocation: project.location,
      branch: candidate.worktreeBranch,
      force: true,
      expectedOwnerToken: candidate.worktreeOwnerToken,
    });
    return true;
  } catch (error) {
    console.warn("[experiment] failed to remove candidate branch", error);
    return false;
  }
}

export async function removeExperimentCandidateWorktree(
  project: Project,
  candidate: ExperimentCandidate,
): Promise<boolean> {
  const worktreeState = candidate.worktreeState;
  if (worktreeState === "removed") return true;
  if (worktreeState === "pending") {
    try {
      const { worktrees } = await readBridge().gitListWorktrees({
        projectLocation: project.location,
      });
      const recordedPaths = new Set(
        [candidate.worktreePath]
          .filter((path): path is string => path !== undefined)
          .map((path) =>
            normalizeWorktreePathForComparison(path, project.location.kind === "windows"),
          ),
      );
      const registeredAtRecordedPath = worktrees.find((worktree) =>
        recordedPaths.has(
          normalizeWorktreePathForComparison(worktree.path, project.location.kind === "windows"),
        ),
      );
      if (
        registeredAtRecordedPath &&
        registeredAtRecordedPath.branch !== candidate.worktreeBranch
      ) {
        return false;
      }
      const branchWorktree = worktrees.find(
        (worktree) => worktree.branch === candidate.worktreeBranch,
      );
      if (branchWorktree) {
        if (!(await candidateWorktreeOwnerMatches(project, candidate))) return false;
        return performWorktreeRemoval(
          project,
          branchWorktree.path,
          candidate.worktreeBranch,
          candidate.worktreeOwnerToken,
        );
      }
      return removeOwnedCandidateBranch(project, candidate);
    } catch (error) {
      console.warn("[experiment] failed to inspect pending candidate worktree", error);
      return false;
    }
  }
  let worktreePath: string | undefined;
  try {
    worktreePath = await resolveCandidateWorktreePath(project, candidate);
  } catch (error) {
    console.warn("[experiment] failed to resolve candidate worktree", error);
    return false;
  }
  if (worktreePath) {
    return performWorktreeRemoval(
      project,
      worktreePath,
      candidate.worktreeBranch,
      candidate.worktreeOwnerToken,
    );
  }
  return removeOwnedCandidateBranch(project, candidate);
}
