import type { GitWorktreeInfo } from "@/shared/contracts";
import { resolveRegisteredWorktree } from "@/shared/worktree";
import { getSqlite } from "./connection";
import { dbGetProject } from "./projectsThreads";
import { notifyProjectThreadDataChanged } from "./projectThreadChanges";

export interface DbWorktreeObservation {
  readonly database: ReturnType<typeof getSqlite>;
  readonly projectId: string;
  readonly token: symbol;
}

const observations = new WeakMap<ReturnType<typeof getSqlite>, Map<string, symbol>>();

/** Start before the Git await so a slow older read cannot undo a newer observation. */
export function dbBeginWorktreeObservation(projectId: string): DbWorktreeObservation {
  const database = getSqlite();
  let projects = observations.get(database);
  if (!projects) {
    projects = new Map();
    observations.set(database, projects);
  }
  const token = Symbol(projectId);
  projects.set(projectId, token);
  return { database, projectId, token };
}

/** Refresh only the saved Git links; runtime state, ordering and timestamps stay intact. */
export function dbReconcileProjectWorktrees(
  projectId: string,
  worktrees: readonly GitWorktreeInfo[],
  observation?: DbWorktreeObservation,
): string[] | null {
  const sqlite = getSqlite();
  if (
    observation &&
    (observation.database !== sqlite ||
      observation.projectId !== projectId ||
      observations.get(sqlite)?.get(projectId) !== observation.token)
  )
    return null;
  const project = dbGetProject(projectId);
  if (!project) return [];
  const changedIds = sqlite
    .transaction(() => {
      const rows = sqlite
        .prepare(
          "SELECT id, worktree_path, worktree_branch FROM threads WHERE project_id = ? AND worktree_path IS NOT NULL",
        )
        .all(projectId) as {
        id: string;
        worktree_path: string;
        worktree_branch: string | null;
      }[];
      const update = sqlite.prepare(
        "UPDATE threads SET worktree_path = ?, worktree_branch = ? WHERE id = ?",
      );
      const ids: string[] = [];
      for (const row of rows) {
        const worktree = resolveRegisteredWorktree(
          worktrees,
          row.worktree_path,
          row.worktree_branch ?? undefined,
          project.location.kind === "windows",
        );
        // Missing registrations do not prove that the user's files or history are gone.
        if (!worktree || worktree.isMain) continue;
        if (row.worktree_path === worktree.path && row.worktree_branch === worktree.branch)
          continue;
        update.run(worktree.path, worktree.branch, row.id);
        ids.push(row.id);
      }
      return ids;
    })
    .immediate();
  if (changedIds.length > 0) notifyProjectThreadDataChanged();
  return changedIds;
}
