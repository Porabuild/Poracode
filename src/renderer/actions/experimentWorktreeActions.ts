import { msg } from "@lingui/core/macro";
import { type ExperimentCandidate, type GitWorktreeInfo, type Project } from "@/shared/contracts";
import { normalizeWorktreePathForComparison } from "@/shared/worktree";
import { readBridge } from "@/renderer/bridge";
import { i18n } from "@/renderer/i18n/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { useExperimentStore } from "@/renderer/state/experimentStore";
import { performWorktreeRemoval, prepareWorktreeRemoval } from "./worktreeActions";

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
  const threads = useAppStore.getState().threads;
  const targetIds = new Set(threadIds);
  const upsertThreads = threads.flatMap((thread, sortOrder) =>
    targetIds.has(thread.id) ? [{ thread, sortOrder }] : [],
  );
  const persistedIds = new Set(upsertThreads.map(({ thread }) => thread.id));
  await readBridge().dbPersistExperimentState({
    upsertThreads,
    deletedThreadIds: threadIds.filter((threadId) => !persistedIds.has(threadId)),
    experiments: useExperimentStore.getState().experiments,
  });
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
      const recordedPath = candidate.worktreePath
        ? normalizeWorktreePathForComparison(
            candidate.worktreePath,
            project.location.kind === "windows",
          )
        : undefined;
      const registeredAtRecordedPath = recordedPath
        ? worktrees.find(
            (worktree) =>
              normalizeWorktreePathForComparison(
                worktree.path,
                project.location.kind === "windows",
              ) === recordedPath,
          )
        : undefined;
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

export async function removeExperimentCandidateWorktrees(
  project: Project,
  candidates: readonly ExperimentCandidate[],
): Promise<boolean[]> {
  const active = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => candidate.worktreeState !== "removed");
  if (active.length === 0) return candidates.map(() => true);

  const knownWorktrees = await readBridge()
    .gitListWorktrees({ projectLocation: project.location })
    .then(({ worktrees }) => worktrees)
    .catch((error) => {
      console.warn("[experiment] failed to verify candidate worktrees before cleanup", error);
      return undefined;
    });
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
  await Promise.all(
    prepared.map(({ path }) => (path ? prepareWorktreeRemoval(project, path) : Promise.resolve())),
  );
  const removed = candidates.map((candidate) => candidate.worktreeState === "removed");
  if (prepared.length === 0) return removed;
  const result = await readBridge().removeExperimentWorktrees({
    projectLocation: project.location,
    candidates: prepared.map(({ candidate, path }) => ({
      threadId: candidate.threadId,
      branch: candidate.worktreeBranch,
      ownerToken: candidate.worktreeOwnerToken,
      ...(path ? { worktreePath: path } : {}),
    })),
  });
  result.candidates.forEach((candidate, resultIndex) => {
    const originalIndex = prepared[resultIndex]!.index;
    removed[originalIndex] = !candidate.error;
    if (candidate.error) {
      console.warn("[experiment] failed to remove candidate worktree", candidate.error);
    }
  });
  return removed;
}
