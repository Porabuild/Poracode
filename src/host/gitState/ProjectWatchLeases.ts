import type { Project } from "@/shared/contracts";
import type { IpcProcedurePayload } from "@/shared/ipc";

/** The supervisor procedures behind its single, owner-less `ProjectWatcher`. */
export type ProjectWatchProcedure = "gitWatchProject" | "gitWatchWorktrees" | "gitUnwatchProject";

/** The subset of `SupervisorCallOptions` the leases use. */
export interface ProjectWatchCallOptions {
  readonly startIfNeeded?: boolean;
}

export interface ProjectWatchSupervisorCaller {
  <Name extends ProjectWatchProcedure>(
    name: Name,
    payload: IpcProcedurePayload<Name>,
    options?: ProjectWatchCallOptions,
  ): Promise<unknown>;
}

export interface ProjectWatchLeasesOptions {
  readonly call: ProjectWatchSupervisorCaller;
  readonly getProject: (projectId: string) => Project | null | undefined;
}

/** Worktrees the host prepared itself, outside any client's watch set. */
export const HOST_WORKTREE_WATCH_OWNER = "host:worktree-lifecycle";

/** A re-apply must never fork a supervisor itself; that keeps the client's restart backoff. */
const REAPPLY_CALL_OPTIONS: ProjectWatchCallOptions = { startIfNeeded: false };

type ReconcileIntent =
  | { readonly kind: "watch" }
  | { readonly kind: "worktrees" }
  | { readonly kind: "unwatch"; readonly releaseWslDistro?: string | undefined }
  | { readonly kind: "reapply" };

interface ProjectLeases {
  readonly rootOwners: Set<string>;
  readonly worktreeOwners: Map<string, ReadonlySet<string>>;
  rootWatched: boolean;
  tail: Promise<void>;
}

/**
 * Per-owner leases in front of the supervisor's shared `ProjectWatcher`, whose
 * `watch` replaces the root watcher and drops every same-project worktree
 * watcher, whose `watchWorktrees` replaces the project's whole worktree set,
 * and whose `unwatch` removes the project for every client. The applied state
 * of a project is the union of its owners' interests, reconciled one step at
 * a time per project, so one client's unwatch, re-watch, or narrower worktree
 * set can no longer silence the host UI or another client.
 *
 * Owners are opaque here; callers derive them from authenticated identity,
 * never from a payload. The registry belongs to the durable host, so it
 * outlives remote-server replacement and supervisor restarts: a restarted
 * supervisor gets every lease back from {@link reapplyAfterSupervisorStart},
 * because no client re-sends what it already registered. Nothing is released
 * when a socket closes: clients register over HTTP, and the managed window
 * keeps its registrations through every reconnect without re-sending.
 */
export class ProjectWatchLeases {
  private readonly projects = new Map<string, ProjectLeases>();
  private reapplyPending = false;
  private disposed = false;

  constructor(private readonly options: ProjectWatchLeasesOptions) {}

  /** Every call re-applies, which preserves the re-watch recovery clients rely on. */
  watchProject(owner: string, projectId: string): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.leases(projectId).rootOwners.add(owner);
    return this.enqueue(projectId, { kind: "watch" });
  }

  /** Replaces only this owner's set; the supervisor receives the union. */
  setWorktrees(owner: string, projectId: string, worktreePaths: readonly string[]): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const leases = this.leases(projectId);
    if (worktreePaths.length === 0) leases.worktreeOwners.delete(owner);
    else leases.worktreeOwners.set(owner, new Set(worktreePaths));
    return this.enqueue(projectId, { kind: "worktrees" });
  }

  /**
   * Drops this owner's root and worktree interest. A project that is gone or
   * disabled on this host loses every owner's lease, including owners that
   * disappeared without releasing.
   */
  unwatchProject(owner: string, projectId: string, releaseWslDistro?: string): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const leases = this.leases(projectId);
    leases.rootOwners.delete(owner);
    leases.worktreeOwners.delete(owner);
    const project = this.options.getProject(projectId);
    if (!project || project.disabled) {
      leases.rootOwners.clear();
      leases.worktreeOwners.clear();
    }
    return this.enqueue(projectId, { kind: "unwatch", releaseWslDistro });
  }

  pinWorktree(projectId: string, worktreePath: string): Promise<void> {
    const pins = this.projects.get(projectId)?.worktreeOwners.get(HOST_WORKTREE_WATCH_OWNER);
    return this.setWorktrees(HOST_WORKTREE_WATCH_OWNER, projectId, [
      ...new Set([...(pins ?? []), worktreePath]),
    ]);
  }

  unpinWorktree(projectId: string, worktreePath: string): Promise<void> {
    const pins = this.projects.get(projectId)?.worktreeOwners.get(HOST_WORKTREE_WATCH_OWNER);
    if (!pins) return Promise.resolve();
    const key = worktreePathKey(worktreePath);
    const remaining = [...pins].filter((path) => worktreePathKey(path) !== key);
    if (remaining.length === pins.size) return Promise.resolve();
    return this.setWorktrees(HOST_WORKTREE_WATCH_OWNER, projectId, remaining);
  }

  /** Releases everything one owner holds, e.g. when its session is revoked. */
  releaseOwner(owner: string): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const steps: Promise<void>[] = [];
    for (const [projectId, leases] of this.projects) {
      const heldRoot = leases.rootOwners.delete(owner);
      const heldWorktrees = leases.worktreeOwners.delete(owner);
      if (heldRoot) steps.push(this.enqueue(projectId, { kind: "unwatch" }));
      else if (heldWorktrees) steps.push(this.enqueue(projectId, { kind: "worktrees" }));
    }
    return Promise.all(steps).then(() => undefined);
  }

  /** The supervisor went away with every watcher; its successor needs them back. */
  handleSupervisorReset(): void {
    if (this.disposed) return;
    this.reapplyPending = true;
    for (const leases of this.projects.values()) leases.rootWatched = false;
  }

  /**
   * Restores every lease after a reset, root before worktree union per
   * project. Call it once the replacement supervisor accepts requests. The
   * calls never start a supervisor; a failure leaves the re-apply pending
   * for the next start instead of retrying on a timer.
   */
  reapplyAfterSupervisorStart(): Promise<void> {
    if (this.disposed || !this.reapplyPending) return Promise.resolve();
    this.reapplyPending = false;
    const steps = [...this.projects.keys()].map((projectId) =>
      this.enqueue(projectId, { kind: "reapply" }),
    );
    return Promise.allSettled(steps).then((results) => {
      const failure = results.find((result) => result.status === "rejected");
      if (!failure) return;
      if (!this.disposed) this.reapplyPending = true;
      throw failure.reason;
    });
  }

  dispose(): Promise<void> {
    this.disposed = true;
    return Promise.all([...this.projects.values()].map((leases) => leases.tail)).then(
      () => undefined,
    );
  }

  private leases(projectId: string): ProjectLeases {
    let leases = this.projects.get(projectId);
    if (!leases) {
      leases = {
        rootOwners: new Set(),
        worktreeOwners: new Map(),
        rootWatched: false,
        tail: Promise.resolve(),
      };
      this.projects.set(projectId, leases);
    }
    return leases;
  }

  private enqueue(projectId: string, intent: ReconcileIntent): Promise<void> {
    const leases = this.leases(projectId);
    const run = leases.tail.then(() => this.reconcile(projectId, intent));
    const tail = run.catch(() => undefined);
    leases.tail = tail;
    void tail.then(() => {
      if (
        leases.tail === tail &&
        leases.rootOwners.size === 0 &&
        leases.worktreeOwners.size === 0 &&
        this.projects.get(projectId) === leases
      ) {
        this.projects.delete(projectId);
      }
    });
    return run;
  }

  /** Applies the current union, read when the step runs rather than when queued. */
  private async reconcile(projectId: string, intent: ReconcileIntent): Promise<void> {
    if (this.disposed) return;
    const leases = this.projects.get(projectId);
    const project = this.options.getProject(projectId);
    if ((!project || project.disabled) && leases) {
      leases.rootOwners.clear();
      leases.worktreeOwners.clear();
    }
    const worktreePaths = unionWorktrees(leases);
    const callOptions = intent.kind === "reapply" ? REAPPLY_CALL_OPTIONS : undefined;
    if (
      project &&
      !project.disabled &&
      leases &&
      (leases.rootOwners.size > 0 || worktreePaths.length > 0)
    ) {
      if (intent.kind === "watch" || intent.kind === "reapply" || !leases.rootWatched) {
        await this.options.call(
          "gitWatchProject",
          { projectId, projectLocation: project.location },
          callOptions,
        );
        leases.rootWatched = true;
        // `watch` dropped the project's worktree watchers; restore the union.
        if (worktreePaths.length > 0) {
          await this.options.call("gitWatchWorktrees", { projectId, worktreePaths }, callOptions);
        }
        return;
      }
    } else if (intent.kind === "unwatch" || leases?.rootWatched) {
      const releaseWslDistro =
        intent.kind === "unwatch" &&
        intent.releaseWslDistro &&
        !this.isWslDistroLeased(intent.releaseWslDistro)
          ? intent.releaseWslDistro
          : undefined;
      await this.options.call(
        "gitUnwatchProject",
        { projectId, ...(releaseWslDistro ? { releaseWslDistro } : {}) },
        callOptions,
      );
      if (leases) leases.rootWatched = false;
      return;
    }
    if (intent.kind === "reapply" && worktreePaths.length === 0) return;
    await this.options.call("gitWatchWorktrees", { projectId, worktreePaths }, callOptions);
  }

  private isWslDistroLeased(distro: string): boolean {
    for (const [projectId, leases] of this.projects) {
      if (leases.rootOwners.size === 0 && leases.worktreeOwners.size === 0) continue;
      const location = this.options.getProject(projectId)?.location;
      if (location?.kind === "wsl" && location.distro === distro) return true;
    }
    return false;
  }
}

function unionWorktrees(leases: ProjectLeases | undefined): string[] {
  const paths = new Set<string>();
  for (const owned of leases?.worktreeOwners.values() ?? []) {
    for (const path of owned) paths.add(path);
  }
  return [...paths].sort();
}

/** Matches `ProjectWatcher.unwatchWorktree`, which removes worktrees by this key. */
function worktreePathKey(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}
