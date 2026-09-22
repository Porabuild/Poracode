import { realpathSync } from "node:fs";
import { posix, win32 } from "node:path";
import type {
  CreateExperimentWorktreesPayload,
  Experiment,
  GitDeleteBranchPayload,
  GitMergeToSourcePayload,
  GitRemoveWorktreePayload,
  GitSwitchBranchPayload,
  Project,
  ProjectLocation,
  RemoveExperimentWorktreesPayload,
  RemoveExperimentWorktreesResult,
  RemoteThreadCommand,
} from "@/shared/contracts";
import {
  EXPERIMENT_STORE_KEY,
  EXPERIMENT_STORE_VERSION,
  experimentSchema,
} from "@/shared/contracts";
import { toWslUncPath } from "@/shared/wsl";
import { buildWorktreeLocation } from "@/shared/worktree";
import {
  awaitProjectExperimentWorktreePreparations,
  beginProjectExperimentWorktreePreparation,
  dbGetProjects,
  dbGetState,
  dbGetThreads,
  dbProjectExists,
  dbRemoveProjectExperiments,
  isProjectRemoving,
  ProjectRemovingError,
} from "@/host/db";
import { RemoteHttpError } from "./auth";

function unavailable(): never {
  throw new RemoteHttpError(
    "experiment_state_unavailable",
    "Experiment ownership could not be verified.",
    503,
  );
}

function conflict(): never {
  throw new RemoteHttpError(
    "experiment_owned",
    "Experiment candidates can only be changed from the desktop experiment controls.",
    409,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads the renderer's durable Zustand store and fails closed if it is unreadable. */
export function readPersistedExperiments(): Experiment[] {
  let raw: string | null;
  try {
    raw = dbGetState(EXPERIMENT_STORE_KEY);
  } catch {
    return unavailable();
  }
  if (!raw) return [];

  try {
    const persisted: unknown = JSON.parse(raw);
    if (!isRecord(persisted) || persisted.version !== EXPERIMENT_STORE_VERSION) unavailable();
    const state = persisted.state;
    if (!isRecord(state) || !isRecord(state.experiments)) unavailable();

    return Object.entries(state.experiments).map(([id, value]) => {
      const parsed = experimentSchema.safeParse(value);
      if (!parsed.success || parsed.data.id !== id) return unavailable();
      return parsed.data;
    });
  } catch (error) {
    if (error instanceof RemoteHttpError) throw error;
    return unavailable();
  }
}

/**
 * Project-removal experiment cleanup, run while the shared project-removal
 * guard is held.
 *
 * The record ids are captured BEFORE the worktree await (exact-id removal, not
 * "all records with this projectId"): a concurrent same-project commit is
 * impossible because the guard refuses new experiment intents and the worktree
 * preparation boundary for the whole span, and the removal helper re-reads and
 * matches each parsed record's projectId inside its own transaction.
 *
 * In-flight experiment worktree preparation is drained before the teardown
 * call: the removal guard refuses new preparations from this point, and a
 * preparation that was already running is awaited so the teardown sees every
 * worktree it may still be creating (a delayed create queued behind the
 * serialized repository queue can otherwise produce an orphan after cleanup).
 * A failed teardown still propagates and leaves the records in place for a
 * retry.
 */
export async function discardPersistedProjectExperiments(
  project: Project,
  removeWorktrees: (
    payload: RemoveExperimentWorktreesPayload,
  ) => Promise<RemoveExperimentWorktreesResult>,
): Promise<void> {
  const projectExperiments = readPersistedExperiments().filter(
    (experiment) => experiment.projectId === project.id,
  );
  const recordIds = projectExperiments.map((experiment) => experiment.id);

  await awaitProjectExperimentWorktreePreparations(project.id);

  for (const experiment of projectExperiments) {
    const candidates = experiment.candidates.filter(
      (candidate) => candidate.worktreeState !== "removed",
    );
    if (candidates.length === 0) continue;
    const result = await removeWorktrees({
      projectLocation: project.location,
      candidates: candidates.map((candidate) => ({
        threadId: candidate.threadId,
        branch: candidate.worktreeBranch,
        ownerToken: candidate.worktreeOwnerToken,
        ...(candidate.worktreePath ? { worktreePath: candidate.worktreePath } : {}),
      })),
    });
    const failure = result.candidates.find((candidate) => candidate.error);
    if (failure?.error) throw new Error(failure.error);
  }

  const removed = dbRemoveProjectExperiments(project.id, recordIds);
  if (removed.status === "unavailable") unavailable();
}

/**
 * Stale experiment worktree preparation refusal. A `createExperimentWorktrees`
 * request is only legitimate while every named candidate is an ACTIVE
 * (not-removed) candidate of a persisted experiment whose project still exists
 * and is not being removed. The renderer persists the experiment before it
 * invokes the worktree preparation, so a missing/retired ownership here is a
 * delayed request whose record was removed — creating its worktrees would
 * orphan them. Returns the owning project so the boundary can register the
 * in-flight preparation with the project-removal guard.
 */
export function claimExperimentWorktreePreparation(payload: CreateExperimentWorktreesPayload): {
  readonly experimentId: string;
  readonly projectId: string;
} {
  const matches = readPersistedExperiments().flatMap((experiment) => {
    const byOwnerToken = new Map(
      experiment.candidates
        .filter((candidate) => candidate.worktreeState !== "removed")
        .map((candidate) => [candidate.worktreeOwnerToken, candidate]),
    );
    const covers = payload.candidates.every((requested) => {
      const candidate = byOwnerToken.get(requested.ownerToken);
      return (
        candidate !== undefined &&
        candidate.threadId === requested.threadId &&
        candidate.worktreeBranch === requested.branch
      );
    });
    return covers ? [{ experimentId: experiment.id, projectId: experiment.projectId }] : [];
  });

  const claim = matches[0];
  if (!claim || matches.length !== 1) {
    throw new Error(
      "Experiment worktree preparation was refused: the requested candidates are not owned by a current experiment.",
    );
  }
  if (isProjectRemoving(claim.projectId)) throw new ProjectRemovingError(claim.projectId);
  if (!dbProjectExists(claim.projectId)) {
    throw new Error(
      `Experiment worktree preparation was refused: project "${claim.projectId}" no longer exists.`,
    );
  }
  return claim;
}

/** Runs one experiment worktree preparation under the project-removal guard. */
export async function runOwnedExperimentWorktreePreparation<Result>(
  payload: CreateExperimentWorktreesPayload,
  preparation: () => Promise<Result>,
): Promise<Result> {
  const claim = claimExperimentWorktreePreparation(payload);
  const release = beginProjectExperimentWorktreePreparation(claim.projectId);
  try {
    return await preparation();
  } finally {
    release();
  }
}

export function assertRemoteThreadCommandExperimentSafe(command: RemoteThreadCommand): void {
  let threadIds: readonly string[];
  switch (command.kind) {
    case "start":
    case "set-worktree":
    case "archive":
    case "delete":
      threadIds = [command.threadId];
      break;
    case "set-done":
      if (!command.done) return;
      threadIds = [command.threadId];
      break;
    case "delete-worktree-group":
      threadIds = command.threadIds;
      break;
    default:
      return;
  }

  const protectedThreadIds = new Set(threadIds);
  if (
    readPersistedExperiments().some((experiment) =>
      experiment.candidates.some((candidate) => protectedThreadIds.has(candidate.threadId)),
    )
  ) {
    conflict();
  }
}

export function assertRemoteThreadStartExperimentSafe(threadId: string): void {
  if (
    readPersistedExperiments().some((experiment) =>
      experiment.candidates.some((candidate) => candidate.threadId === threadId),
    )
  ) {
    conflict();
  }
}

function normalizedPath(path: string, caseInsensitive: boolean): string {
  let canonical = path;
  try {
    canonical = realpathSync.native(path);
  } catch {
    // Lexical normalization still closes equivalent `.` and `..` aliases.
  }
  const normalized = (
    caseInsensitive
      ? win32.normalize(canonical).replace(/\\/g, "/")
      : posix.normalize(canonical.replace(/\\/g, "/"))
  ).replace(/\/+$/, "");
  return caseInsensitive ? normalized.toLowerCase() : normalized;
}

function sameLocation(left: ProjectLocation, right: ProjectLocation): boolean {
  const leftKeys = locationIdentityKeys(left);
  return [...locationIdentityKeys(right)].some((key) => leftKeys.has(key));
}

function nativePathIdentityKeys(path: string): string[] {
  return [`exact:${normalizedPath(path, false)}`, `folded:${normalizedPath(path, true)}`];
}

function locationIdentityKeys(location: ProjectLocation): Set<string> {
  if (location.kind === "wsl") {
    return new Set([
      `wsl:${location.distro.toLowerCase()}:${normalizedPath(location.linuxPath, false)}`,
      ...nativePathIdentityKeys(location.uncPath),
    ]);
  }
  return new Set(nativePathIdentityKeys(location.path));
}

function locationMatchesWorktree(location: ProjectLocation, worktreePath: string): boolean {
  if (location.kind === "windows") {
    return normalizedPath(location.path, true) === normalizedPath(worktreePath, true);
  }
  if (location.kind === "wsl") {
    return (
      normalizedPath(location.linuxPath, false) === normalizedPath(worktreePath, false) ||
      normalizedPath(location.uncPath, true) ===
        normalizedPath(toWslUncPath(location.distro, worktreePath), true)
    );
  }
  const locationPath = location.path;
  return normalizedPath(locationPath, false) === normalizedPath(worktreePath, false);
}

interface CandidateOwnership {
  readonly threadId: string;
  readonly project: Project | undefined;
  readonly worktreePath: string | undefined;
  readonly worktreeBranch: string;
}

function readCandidateOwnership(): CandidateOwnership[] {
  const experiments = readPersistedExperiments();
  const activeCandidates = experiments.flatMap((experiment) =>
    experiment.candidates
      .filter((candidate) => candidate.worktreeState !== "removed")
      .map((candidate) => ({ projectId: experiment.projectId, candidate })),
  );
  if (activeCandidates.length === 0) return [];
  let projects: Project[];
  let threads: ReturnType<typeof dbGetThreads>;
  try {
    projects = dbGetProjects();
    threads = dbGetThreads();
  } catch {
    return unavailable();
  }
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const threadById = new Map(threads.map((thread) => [thread.id, thread]));
  return activeCandidates.map(({ projectId, candidate }) => ({
    threadId: candidate.threadId,
    project: projectById.get(projectId),
    worktreePath: candidate.worktreePath ?? threadById.get(candidate.threadId)?.worktreePath,
    worktreeBranch: candidate.worktreeBranch,
  }));
}

function isSameProject(ownership: CandidateOwnership, location: ProjectLocation): boolean {
  return ownership.project
    ? sameLocation(ownership.project.location, location)
    : ownership.worktreePath !== undefined &&
        locationMatchesWorktree(location, ownership.worktreePath);
}

function ownsWorktreeLocation(ownership: CandidateOwnership, location: ProjectLocation): boolean {
  if (!ownership.worktreePath) return false;
  return ownership.project
    ? sameLocation(
        buildWorktreeLocation(ownership.project.location, ownership.worktreePath),
        location,
      )
    : locationMatchesWorktree(location, ownership.worktreePath);
}

type GuardedGitMutation =
  | { procedure: "gitSwitchBranch"; payload: GitSwitchBranchPayload }
  | { procedure: "gitDeleteBranch"; payload: GitDeleteBranchPayload }
  | { procedure: "gitRemoveWorktree"; payload: GitRemoveWorktreePayload }
  | { procedure: "gitMergeToSource"; payload: GitMergeToSourcePayload };

const CANDIDATE_WORKTREE_MUTATIONS = new Set([
  "writeProjectFile",
  "createProjectEntry",
  "renameProjectEntry",
  "moveProjectEntry",
  "deleteProjectEntry",
  "gitStage",
  "gitUnstage",
  "gitRevert",
  "gitStageAll",
  "gitUnstageAll",
  "gitRevertAll",
  "gitCommit",
  "gitPull",
  "gitPullRebase",
  "gitPush",
  "gitSync",
  "gitSyncRebase",
  "gitPullFromSource",
  "gitAbortMerge",
  "gitFinishMerge",
  "restoreFileCheckpoint",
]);

function payloadLocation(payload: unknown): ProjectLocation | undefined {
  if (!isRecord(payload)) return undefined;
  const location = payload.worktreeLocation ?? payload.projectLocation;
  return isRecord(location) ? (location as ProjectLocation) : undefined;
}

function payloadThreadId(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;
  return typeof payload.threadId === "string" ? payload.threadId : undefined;
}

/** Blocks remote Git lifecycle calls that can detach an owned candidate. */
export function assertRemoteGitMutationExperimentSafe(procedure: string, payload: unknown): void {
  const isThreadMutation =
    procedure === "rollbackThreadConversation" || procedure === "restoreFileCheckpoint";
  const isLifecycleMutation =
    procedure === "gitSwitchBranch" ||
    procedure === "gitDeleteBranch" ||
    procedure === "gitRemoveWorktree" ||
    procedure === "gitMergeToSource";
  if (
    !isThreadMutation &&
    !isLifecycleMutation &&
    procedure !== "gitPruneWorktrees" &&
    !CANDIDATE_WORKTREE_MUTATIONS.has(procedure)
  ) {
    return;
  }

  const ownership = readCandidateOwnership();
  if (ownership.some((candidate) => candidate.project === undefined)) conflict();
  const threadId = payloadThreadId(payload);
  if (
    isThreadMutation &&
    threadId !== undefined &&
    ownership.some((candidate) => candidate.threadId === threadId)
  ) {
    conflict();
  }

  if (CANDIDATE_WORKTREE_MUTATIONS.has(procedure)) {
    if (ownership.some((candidate) => candidate.worktreePath === undefined)) conflict();
    const location = payloadLocation(payload);
    if (location && ownership.some((candidate) => ownsWorktreeLocation(candidate, location))) {
      conflict();
    }
  }

  if (procedure === "gitPruneWorktrees") {
    const location = payloadLocation(payload);
    if (location && ownership.some((candidate) => isSameProject(candidate, location))) {
      conflict();
    }
  }

  if (!isLifecycleMutation) return;

  const mutation = { procedure, payload } as GuardedGitMutation;
  if (
    ownership.some(
      (candidate) =>
        candidate.worktreePath === undefined &&
        (mutation.procedure === "gitSwitchBranch" ||
          (mutation.procedure === "gitRemoveWorktree" &&
            isSameProject(candidate, mutation.payload.projectLocation))),
    )
  ) {
    conflict();
  }
  const blocked = ownership.some((candidate) => {
    switch (mutation.procedure) {
      case "gitSwitchBranch":
        return (
          ownsWorktreeLocation(candidate, mutation.payload.projectLocation) ||
          (mutation.payload.branch === candidate.worktreeBranch &&
            isSameProject(candidate, mutation.payload.projectLocation))
        );
      case "gitDeleteBranch":
        return (
          mutation.payload.branch === candidate.worktreeBranch &&
          isSameProject(candidate, mutation.payload.projectLocation)
        );
      case "gitRemoveWorktree":
        return (
          ownsWorktreeLocation(
            candidate,
            buildWorktreeLocation(mutation.payload.projectLocation, mutation.payload.path),
          ) && isSameProject(candidate, mutation.payload.projectLocation)
        );
      case "gitMergeToSource":
        return (
          isSameProject(candidate, mutation.payload.projectLocation) &&
          (mutation.payload.worktreeBranch === candidate.worktreeBranch ||
            ownsWorktreeLocation(candidate, mutation.payload.worktreeLocation))
        );
    }
  });
  if (blocked) conflict();
}
