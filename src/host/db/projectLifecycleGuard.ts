/**
 * In-process project-removal lifecycle guard for the single backend-host
 * process (experiment authority, P-D7).
 *
 * A project removal (HTTP project command or app-controls ingress) holds the
 * guard across its ENTIRE span — the experiment worktree await, the thread
 * close awaits, and the final project cascade — so:
 *
 * - every experiment intent refuses a project that is being removed
 *   (`project_removing`, zero effect) instead of writing state a cascade will
 *   orphan;
 * - experiment worktree preparation is refused while the guard is held, and a
 *   removal drains in-flight preparations before it issues its own worktree
 *   teardown, so a delayed `createExperimentWorktrees` can never produce a
 *   worktree after the removal's cleanup passed.
 *
 * The removal's own exact-id experiment cleanup is exempt by construction: it
 * runs while the guard is held. In-process state is sufficient today because
 * the HTTP handlers, the app-controls ingress, the intents, and the
 * supervisor-call boundary all run in the backend host; a second process
 * writing the same database is an explicit non-goal.
 */

/** Thrown by {@link beginProjectExperimentWorktreePreparation} while a removal holds the guard. */
export class ProjectRemovingError extends Error {
  readonly code = "project_removing";

  constructor(projectId: string) {
    super(`Project "${projectId}" is being removed.`);
    this.name = "ProjectRemovingError";
  }
}

interface ProjectGuardState {
  removals: number;
  preparations: number;
  waiters: Array<() => void>;
}

const states = new Map<string, ProjectGuardState>();

function stateFor(projectId: string): ProjectGuardState {
  let state = states.get(projectId);
  if (!state) {
    state = { removals: 0, preparations: 0, waiters: [] };
    states.set(projectId, state);
  }
  return state;
}

function collectIfIdle(projectId: string, state: ProjectGuardState): void {
  if (state.removals > 0 || state.preparations > 0 || state.waiters.length > 0) return;
  if (states.get(projectId) === state) states.delete(projectId);
}

/**
 * Acquire the removal guard for one project. The returned release function is
 * idempotent and must run after the final cascade (use `finally`).
 */
export function beginProjectRemoval(projectId: string): () => void {
  const state = stateFor(projectId);
  state.removals += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    state.removals -= 1;
    collectIfIdle(projectId, state);
  };
}

/** True while a removal of this project holds the guard. */
export function isProjectRemoving(projectId: string): boolean {
  return (states.get(projectId)?.removals ?? 0) > 0;
}

/**
 * Register one in-flight experiment worktree preparation for a project. Throws
 * {@link ProjectRemovingError} when the project is already being removed, so a
 * delayed preparation is refused before it can queue a repository mutation
 * behind the removal. The returned release function is idempotent.
 */
export function beginProjectExperimentWorktreePreparation(projectId: string): () => void {
  if (isProjectRemoving(projectId)) throw new ProjectRemovingError(projectId);
  const state = stateFor(projectId);
  state.preparations += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    state.preparations -= 1;
    if (state.preparations === 0) {
      const waiters = state.waiters.splice(0);
      for (const resolve of waiters) resolve();
    }
    collectIfIdle(projectId, state);
  };
}

/**
 * Resolve when no experiment worktree preparation is in flight for the
 * project. Called by the removal while it holds the guard: registrations are
 * refused from that point on, so once this resolves the set stays empty.
 */
export function awaitProjectExperimentWorktreePreparations(projectId: string): Promise<void> {
  const state = states.get(projectId);
  if (!state || state.preparations === 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    state.waiters.push(resolve);
  });
}

/** Test/diagnostic reset. Production never calls this. */
export function resetProjectLifecycleGuardForTests(): void {
  states.clear();
}
