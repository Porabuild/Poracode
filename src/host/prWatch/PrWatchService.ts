import {
  areSelectionBindingsEqual,
  isThreadTurnActive,
  prWatchInputSchema,
  type AgentKind,
  type PrDetails,
  type PrData,
  type PrMergeMethod,
  type PrWatch,
  type PrWatchAgentSync,
  type PrWatchBlockedReason,
  type PrWatchInput,
  type PrReviewThread,
  type Project,
  type ScheduledTaskConfig,
} from "@/shared/contracts";
import type { SelectionBinding } from "@/shared/selectionBinding.schemas";
import type { SupervisorEvent } from "@/shared/ipc";
import { msg } from "@/shared/messages";
import {
  captureProjectExecutionScope,
  hasSameProjectExecutionScope,
  type ProjectExecutionScope,
} from "@/host/threads/projectExecutionScope";
import {
  PrWatchExecutionAdmissionError,
  type PrWatchExecutionSnapshot,
} from "@/host/db/prWatchExecutionAdmission";
import type { PrWatchRuntimePatch } from "@/host/db/prWatches";
import {
  buildWatchPrompt,
  collectSignals,
  getPassiveBlockerKey,
  isReadyForAutoMerge,
  type WatchSignals,
} from "./prWatchSignals";

const DEFAULT_POLL_INTERVAL_MS = 60_000;

/** A helper agent confirmed to be runnable for a watch's project right now. */
export interface PrWatchAgent {
  agentKind: string;
  config: ScheduledTaskConfig;
}

/**
 * The complete model selection a launch carries into the new thread: every
 * actual control plus a recognized binding, with presence exact — an empty
 * effort, a false flag, and an absent carrier are all distinct values.
 */
export interface PrWatchLaunchSelection {
  model: string;
  effort?: string;
  fast?: boolean;
  thinking?: boolean;
  contextSize?: string;
  selectionBinding?: SelectionBinding;
}

/**
 * Ephemeral, host-only launch admission options. The callback never travels
 * in a wire payload: the service passes it per call, and the launcher invokes
 * it before effects and after its awaited permission/title/worktree seams.
 * Throwing refuses the launch and applies the launcher's rollback contract.
 */
export interface PrWatchLaunchOptions {
  admitLaunch: () => void;
}

/**
 * The thread-launch seam the watcher consumes. Structurally the app-controls
 * `create_thread` contract, declared host-side so this module carries no
 * `@/main` import; the composition wires the canonical launcher. The request
 * carries the full selection so the spawned thread's durable config preserves
 * every actual control, including empty/false values and a recognized
 * binding, exactly as captured.
 */
export interface PrWatchThreadRequest extends PrWatchLaunchSelection {
  projectId: string;
  prompt: string;
  agentKind: AgentKind;
  title?: string;
  prNumber?: number;
  existingWorktree?: { path: string; branch: string };
}

export interface PrWatchThreadLaunch {
  threadId: string;
}

/**
 * Where a fix thread does its work. A PR fix has to run on the PR's own branch,
 * so the watcher resolves this before launching and refuses to launch without
 * one — a thread with no PR checkout runs against whatever the main checkout
 * happens to have out, which cannot repair the PR.
 */
export type PrWatchWorkContext = { kind: "worktree"; path: string } | { kind: "main-checkout" };

/**
 * Ephemeral before-effect admission gate handed to the work-context
 * dependency. Invoked outside swallowed git-error catches — before the
 * worktree lookup, between the lookup and the fetch, and between the fetch
 * and the add-worktree RPC — so a refusal can never be mistaken for a git
 * failure. Throwing {@link PrWatchExecutionAdmissionError} with a missing or
 * stale reason cancels into the recheck flow; unsupported selection data
 * surfaces as a recorded launch failure.
 */
export type PrWatchAssertCurrent = () => void;

export interface PrWatchStore {
  list(): PrWatch[];
  get(projectId: string, prNumber: number): PrWatch | null;
  upsert(watch: PrWatch): void;
  delete(projectId: string, prNumber: number): void;
  /**
   * Fresh raw execution-identity read against the authoritative row, or null
   * when it is gone. Throws on unsupported raw selection data so a launch
   * identity can never be captured from it.
   */
  readExecutionSnapshot(projectId: string, prNumber: number): PrWatchExecutionSnapshot | null;
  /**
   * Fresh synchronous admission of a captured execution snapshot against the
   * authoritative row; throws {@link PrWatchExecutionAdmissionError} on a
   * missing, changed, or unsupported-data row. One gate in addition to —
   * never a substitute for — the guarded full-save recheck.
   */
  admitExecution(captured: PrWatchExecutionSnapshot): void;
  /**
   * Narrow validated patch of the status-only columns. Never reads or
   * serializes config or agent_kind, never resurrects a deleted row, and
   * never refuses on a protected row.
   */
  patchRuntime(projectId: string, prNumber: number, patch: PrWatchRuntimePatch): void;
}

export interface PrWatchServiceOptions {
  store: PrWatchStore;
  getProject(projectId: string): Project | null;
  getPrForBranch(project: Project, branch: string): Promise<PrData | null>;
  getPrDetails(project: Project, prNumber: number): Promise<PrDetails>;
  getPrReviewThreads(project: Project, prNumber: number): Promise<PrReviewThread[]>;
  getMergeMethod(): PrMergeMethod;
  mergePr(project: Project, prNumber: number, method: PrMergeMethod): Promise<void>;
  onPrMerged?(watch: PrWatch): void;
  /** Live PR state seen on a poll, with details when that poll fetched them. */
  onPrObserved?(watch: PrWatch, pr: PrData, details?: PrDetails): void;
  createThread(
    request: PrWatchThreadRequest,
    options: PrWatchLaunchOptions,
  ): Promise<PrWatchThreadLaunch>;
  isThreadActive(threadId: string): boolean;
  /**
   * Confirm the watch's cached helper agent can still run a GUI thread for this
   * project (installed and authenticated). Returns null when it cannot, so the
   * watcher blocks instead of launching a thread that would fail — or silently
   * substituting a provider the user did not choose.
   */
  resolveWatchAgent(watch: PrWatch, project: Project): Promise<PrWatchAgent | null>;
  /**
   * Reuse or re-create the checkout a fix must run in. Returns null when the PR
   * branch cannot be checked out anywhere. Invokes the ephemeral
   * `assertCurrent` admission gate outside its swallowed git-error catches —
   * before the worktree lookup and before the fetch and add-worktree RPCs —
   * so a refusal never runs git work and a git failure never masks one.
   */
  ensureWorkContext(
    watch: PrWatch,
    project: Project,
    assertCurrent: PrWatchAssertCurrent,
  ): Promise<PrWatchWorkContext | null>;
  /**
   * Confirmed retirement custody seam for a thread whose launch completed but
   * whose watch row disappeared or was taken over by a different live fix —
   * or whose custody bookkeeping failed after the launch. The service never
   * resurrects a deleted row and never overwrites a live thread id, so the
   * host owns stopping the returned thread. Mandatory and confirmation-
   * bearing: resolve `true` only when the thread is positively confirmed
   * stopped or provably absent. `false` or a rejection retains the exact id
   * in the service's in-memory owned-custody set, surfaces the failure,
   * blocks another fix for that watch while custody stays unresolved, and
   * keeps disposal from reporting success. Custody is retried on the watch's
   * next launch attempt and by every dispose pass.
   */
  retireObsoleteLaunchThread(watch: PrWatch, threadId: string): Promise<boolean>;
  /**
   * Host diagnostics channel for an unresolved retirement. The surfaced error
   * carries the localized lifecycle message; without it the failure is still
   * retained and blocking, only unreported.
   */
  reportError?(error: unknown): void;
  pollIntervalMs?: number;
}

export class PrWatchService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
  private readonly checking = new Map<string, Promise<void>>();
  private readonly recheckRequested = new Set<string>();
  private disposalPass: Promise<void> = Promise.resolve();
  /**
   * Successful launch thread ids whose runtime custody is not yet resolved,
   * each retained with the watch it was launched for. This is owned lifecycle
   * bookkeeping — never a selection registry and never persisted. An entry
   * stays until its retirement is positively confirmed; while an entry exists
   * for a watch, no new fix may launch for that watch.
   */
  private readonly pendingRetirement = new Map<string, PrWatch>();

  constructor(private readonly options: PrWatchServiceOptions) {}

  start(): void {
    if (this.timer || this.disposed) return;
    this.normalizeActiveThreads();
    void this.tick();
    this.timer = setInterval(
      () => void this.tick(),
      this.options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    );
    this.timer.unref?.();
  }

  /**
   * Stop the service and retire every unresolved launch custody. Each call
   * runs one disposal pass, serialized after the previous one, and returns
   * that pass: in-flight checks are joined first (a held retirement keeps it
   * pending), then every unresolved retirement is retried once. The pass
   * rejects while any custody stays unconfirmed — disposal never reports
   * success over an owned thread it could not confirm stopped — and a later
   * dispose retries what remains.
   */
  dispose(): Promise<void> {
    if (!this.disposed) {
      this.disposed = true;
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this.recheckRequested.clear();
    }
    const pass = this.disposalPass.catch(() => undefined).then(() => this.joinChecksAndRetire());
    this.disposalPass = pass;
    return pass;
  }

  /** Join every admitted check, then retry each unresolved retirement once. */
  private async joinChecksAndRetire(): Promise<void> {
    for (;;) {
      await Promise.allSettled([...this.checking.values()]);
      const pending = [...this.pendingRetirement];
      if (pending.length === 0) return;
      let unconfirmedId: string | null = null;
      for (const [threadId, watch] of pending) {
        if (this.pendingRetirement.get(threadId) !== watch) continue;
        if (await this.attemptRetirement(watch, threadId)) {
          this.pendingRetirement.delete(threadId);
        } else {
          unconfirmedId ??= threadId;
        }
      }
      if (unconfirmedId) {
        throw new Error(msg("prWatch.retirementUnconfirmed", { id: unconfirmedId }));
      }
    }
  }

  get(projectId: string, prNumber: number): PrWatch | null {
    this.assertOpen();
    return this.options.store.get(projectId, prNumber);
  }

  upsert(input: PrWatchInput): PrWatch {
    this.assertOpen();
    const parsed = prWatchInputSchema.parse(input);
    const current = this.options.store.get(parsed.projectId, parsed.prNumber);
    const resetSignals =
      !current ||
      current.headBranch !== parsed.headBranch ||
      (!current.watchEnabled && parsed.watchEnabled);
    const watch: PrWatch = {
      ...parsed,
      lastCommentCursor: resetSignals ? null : current.lastCommentCursor,
      lastReviewCommentCursor: resetSignals ? null : current.lastReviewCommentCursor,
      lastReviewCursor: resetSignals ? null : current.lastReviewCursor,
      lastCheckKey: resetSignals ? null : current.lastCheckKey,
      activeThreadId: current?.activeThreadId ?? null,
      lastError: null,
      // Any update re-arms a blocked watch: the user toggling automation, or an
      // agent sync, is exactly the input that can have cleared the blocker.
      blockedReason: null,
    };
    this.options.store.upsert(watch);
    this.requestCheck(watch.projectId, watch.prNumber);
    return watch;
  }

  delete(projectId: string, prNumber: number): void {
    this.assertOpen();
    this.recheckRequested.delete(watchKey({ projectId, prNumber }));
    this.options.store.delete(projectId, prNumber);
  }

  requestCheck(projectId: string, prNumber: number): void {
    if (this.disposed) return;
    const watch = this.options.store.get(projectId, prNumber);
    if (!watch) return;
    const key = watchKey(watch);
    if (this.checking.has(key)) {
      this.recheckRequested.add(key);
      return;
    }
    void this.checkWatch(watch);
  }

  async tick(): Promise<void> {
    if (this.disposed) return;
    await Promise.allSettled(this.options.store.list().map((watch) => this.checkWatch(watch)));
  }

  observeSupervisorEvent(event: SupervisorEvent): void {
    if (this.disposed) return;
    if (event.type !== "thread-state" && event.type !== "thread-exited") return;
    if (event.type === "thread-state" && isThreadTurnActive(event.status)) {
      return;
    }
    for (const watch of this.options.store.list()) {
      if (watch.activeThreadId !== event.threadId) continue;
      const lastError =
        event.type === "thread-state" && event.status === "error"
          ? (event.errorMessage ?? null)
          : null;
      this.options.store.patchRuntime(watch.projectId, watch.prNumber, {
        activeThreadId: null,
        lastError,
      });
      if (!lastError) this.requestCheck(watch.projectId, watch.prNumber);
    }
  }

  private checkWatch(snapshot: PrWatch): Promise<void> {
    const key = watchKey(snapshot);
    if (this.disposed || this.checking.has(key)) return Promise.resolve();
    // Register before invoking an asynchronous adapter so dispose() owns every
    // admitted continuation, including requestCheck()'s fire-and-forget work.
    const result = Promise.withResolvers<void>();
    const pending = result.promise.finally(() => {
      this.checking.delete(key);
      if (this.recheckRequested.delete(key) && !this.disposed) {
        const latest = this.options.store.get(snapshot.projectId, snapshot.prNumber);
        if (latest) void this.checkWatch(latest);
      }
    });
    this.checking.set(key, pending);
    void this.runCheckWatch(snapshot).then(result.resolve, result.reject);
    return pending;
  }

  private async runCheckWatch(snapshot: PrWatch): Promise<void> {
    if (this.disposed) return;
    try {
      const watch = this.options.store.get(snapshot.projectId, snapshot.prNumber);
      if (!watch) return;
      if (watch.blockedReason === "duplicate-project-watches") return;
      if (watch.activeThreadId && this.options.isThreadActive(watch.activeThreadId)) return;
      const project = this.options.getProject(watch.projectId);
      if (!project) {
        this.options.store.delete(watch.projectId, watch.prNumber);
        return;
      }

      const pr = await this.options.getPrForBranch(project, watch.headBranch);
      if (this.disposed) return;
      const summaryCurrent = this.options.store.get(watch.projectId, watch.prNumber);
      if (!summaryCurrent) return;
      if (!pr || pr.state === "merged" || pr.state === "closed") {
        if (pr) this.options.onPrObserved?.(summaryCurrent, pr);
        this.options.store.delete(summaryCurrent.projectId, summaryCurrent.prNumber);
        return;
      }

      const passiveBlockerKey = getPassiveBlockerKey(pr);
      // Once a policy-only blocker has been fully inspected, keep only the
      // compact PR summary poll active until GitHub reports a changed state.
      if (passiveBlockerKey && passiveBlockerKey === summaryCurrent.lastCheckKey) {
        this.options.onPrObserved?.(summaryCurrent, pr);
        return;
      }

      const [detailsResult, reviewThreadsResult] = await Promise.allSettled([
        this.options.getPrDetails(project, watch.prNumber),
        this.options.getPrReviewThreads(project, watch.prNumber),
      ]);
      if (this.disposed) return;
      if (detailsResult.status === "rejected") throw detailsResult.reason;
      if (reviewThreadsResult.status === "rejected") throw reviewThreadsResult.reason;
      const details = detailsResult.value;
      const reviewThreads = reviewThreadsResult.value;

      const current = this.options.store.get(watch.projectId, watch.prNumber);
      if (!current) return;
      this.options.onPrObserved?.(current, pr, details);
      const signals = collectSignals(pr, details, reviewThreads);
      if (current.activeThreadId && this.options.isThreadActive(current.activeThreadId)) return;

      const hasActionableSignal =
        typeof signals.issueKey === "string" && signals.issueKey !== current.lastCheckKey;
      const observedCheckKey = signals.issueKey === null ? passiveBlockerKey : signals.issueKey;
      const observed: PrWatch = {
        ...current,
        lastCheckKey: observedCheckKey === undefined ? current.lastCheckKey : observedCheckKey,
        activeThreadId: null,
        lastError: null,
        blockedReason: null,
      };

      if (current.watchEnabled && hasActionableSignal) {
        await this.launchFix(current, project, details, signals, observed.lastCheckKey);
        return;
      }

      if (current.autoMerge && isReadyForAutoMerge(pr, details.checks)) {
        try {
          await this.options.mergePr(project, current.prNumber, this.options.getMergeMethod());
          if (this.disposed) return;
          // The watch is about to be dropped, so this is the last chance to tell
          // the UI the PR is no longer open. `pr` was fetched moments ago and the
          // merge just succeeded, so patching its state avoids a refetch whose
          // head branch may already be deleted.
          this.options.onPrObserved?.(current, { ...pr, state: "merged" }, details);
          this.options.onPrMerged?.(current);
          this.options.store.delete(current.projectId, current.prNumber);
        } catch (error) {
          this.saveError(observed, error);
        }
        return;
      }

      this.options.store.patchRuntime(current.projectId, current.prNumber, {
        lastCheckKey: observed.lastCheckKey,
        activeThreadId: null,
        lastError: null,
        blockedReason: null,
      });
    } catch (error) {
      this.saveError(snapshot, error);
    }
  }

  /**
   * Launch a fix for the current blocker, or record why it cannot run.
   *
   * `nextCheckKey` is written only on a successful launch. A blocked watch has
   * to retry the same signal once the blocker clears, and advancing the key
   * would mark that blocker as already handled. Both block reasons are
   * re-evaluated on every poll — the block is a status, not a latch — so a
   * transient failure (agent logged out, git lock, offline fetch) self-heals
   * without any user gesture.
   *
   * Every launch runs on a fresh raw execution snapshot captured before the
   * first effect, and re-admits it at each checkpoint: before the agent
   * lookup is confirmed, at the work-context seams (via the ephemeral gate),
   * and immediately before thread creation. A missing or changed snapshot
   * cancels into the existing recheck flow; unsupported raw selection data is
   * refused and recorded before any git work or thread spawn.
   */
  private async launchFix(
    watch: PrWatch,
    project: Project,
    details: PrDetails,
    signals: WatchSignals,
    nextCheckKey: string | null,
  ): Promise<void> {
    // Unresolved custody from an earlier launch blocks any new fix for this
    // watch until its owned thread is confirmed retired.
    if (!(await this.releaseRetiredCustody(watch))) return;

    // The project row can move between the check's first read and this
    // launch; a fix must never run against a scope it was not validated for.
    const freshProject = this.options.getProject(watch.projectId);
    if (!freshProject || !hasSameProjectExecutionScope(freshProject, project)) {
      this.requestCheck(watch.projectId, watch.prNumber);
      return;
    }
    const launchProject = freshProject;

    let captured: PrWatchExecutionSnapshot | null = null;
    try {
      captured = this.options.store.readExecutionSnapshot(watch.projectId, watch.prNumber);
    } catch (error) {
      const current = this.currentLaunchWatch(watch);
      if (current) this.saveError(current, error);
      return;
    }
    if (!captured) return; // Retired while its blocker was being inspected.

    let agent: PrWatchAgent | null;
    try {
      agent = await this.options.resolveWatchAgent(watch, launchProject);
    } catch (error) {
      const current = this.currentLaunchWatch(watch, captured);
      if (current) this.saveError(current, error);
      return;
    }
    if (!agent) {
      const current = this.currentLaunchWatch(watch, captured);
      if (current) this.block(current, "agent-unavailable");
      return;
    }

    const launchWatch = this.currentLaunchWatch(watch, captured);
    if (!launchWatch) return;

    const assertCurrent = this.executionGate(captured, captureProjectExecutionScope(launchProject));
    let context: PrWatchWorkContext | null;
    try {
      context = await this.options.ensureWorkContext(launchWatch, launchProject, assertCurrent);
    } catch (error) {
      if (isExecutionCancel(error)) return; // The gate already requested a recheck.
      const current = this.currentLaunchWatch(launchWatch, captured);
      if (current) this.saveError(current, error);
      return;
    }
    if (!context) {
      const current = this.currentLaunchWatch(launchWatch, captured);
      if (current) this.block(current, "worktree-unavailable");
      return;
    }

    if (!this.currentLaunchWatch(launchWatch, captured)) return;

    try {
      const result = await this.options.createThread(
        {
          projectId: launchWatch.projectId,
          prompt: buildWatchPrompt(launchWatch, details, signals),
          agentKind: agent.agentKind,
          model: agent.config.model,
          ...(agent.config.effort !== undefined ? { effort: agent.config.effort } : {}),
          ...(agent.config.fast !== undefined ? { fast: agent.config.fast } : {}),
          ...(agent.config.thinking !== undefined ? { thinking: agent.config.thinking } : {}),
          ...(agent.config.contextSize !== undefined
            ? { contextSize: agent.config.contextSize }
            : {}),
          ...(agent.config.selectionBinding !== undefined
            ? { selectionBinding: agent.config.selectionBinding }
            : {}),
          title: `PR #${launchWatch.prNumber}: ${details.title}`,
          prNumber: launchWatch.prNumber,
          ...(context.kind === "worktree"
            ? { existingWorktree: { path: context.path, branch: launchWatch.headBranch } }
            : {}),
        },
        { admitLaunch: assertCurrent },
      );
      await this.recordLaunchOutcome(watch, captured, context, nextCheckKey, result.threadId);
    } catch (error) {
      if (this.currentLaunchWatch(launchWatch, captured)) this.saveError(launchWatch, error);
    }
  }

  /**
   * Independent runtime bookkeeping for a finished launch: the returned live
   * thread is recorded as the watch's owned fix even when the raw selection
   * metadata, config, or mode changed while creation was awaited — the old
   * selection checkpoint never discards a live thread. The row is re-read;
   * a deleted watch is never resurrected, a different live fix is never
   * overwritten, and the checkpoint/worktree-reuse fields persist only while
   * they still describe the branch the launch ran on.
   *
   * A successful return is owned custody until a write lands: a missing or
   * conflicting row — or a bookkeeping write that throws — hands the exact
   * thread id to {@link retireLaunchThread}. This includes an outcome that
   * arrives after disposal began; dispose owns the retirement too.
   */
  private async recordLaunchOutcome(
    launchWatch: PrWatch,
    captured: PrWatchExecutionSnapshot,
    context: PrWatchWorkContext,
    nextCheckKey: string | null,
    threadId: string,
  ): Promise<void> {
    try {
      const current = this.options.store.get(launchWatch.projectId, launchWatch.prNumber);
      if (!current) {
        await this.retireLaunchThread(launchWatch, threadId);
        return;
      }
      if (
        current.activeThreadId &&
        current.activeThreadId !== threadId &&
        this.options.isThreadActive(current.activeThreadId)
      ) {
        await this.retireLaunchThread(current, threadId);
        return;
      }
      const sameBranch = current.headBranch === captured.headBranch;
      this.options.store.patchRuntime(current.projectId, current.prNumber, {
        activeThreadId: threadId,
        lastError: null,
        blockedReason: null,
        ...(sameBranch ? { lastCheckKey: nextCheckKey } : {}),
        // Record a re-created checkout so the next fix reuses it instead of
        // paying for another worktree.
        ...(sameBranch && context.kind === "worktree" ? { worktreePath: context.path } : {}),
      });
    } catch {
      // Custody bookkeeping failed after a live launch: never drop or
      // duplicate the returned thread. Retire it — or retain it unresolved —
      // before the attempt is dropped.
      await this.retireLaunchThread(launchWatch, threadId);
    }
  }

  /**
   * Take owned custody of one successful launch thread and retire it. The id
   * is retained in the in-memory owned-custody set BEFORE the attempt and
   * removed only on a positively confirmed retirement; a `false` or a
   * rejection retains it, surfaces the failure, and — through the launch
   * gate — blocks another fix for the same watch while custody stays
   * unresolved.
   */
  private async retireLaunchThread(watch: PrWatch, threadId: string): Promise<void> {
    if (this.pendingRetirement.has(threadId)) return; // Already owned — no duplicate custody.
    this.pendingRetirement.set(threadId, watch);
    if (await this.attemptRetirement(watch, threadId)) {
      this.pendingRetirement.delete(threadId);
      return;
    }
    this.surfaceRetirementFailure(threadId);
  }

  /** One confirmed-retirement attempt; every rejection counts as unconfirmed. */
  private async attemptRetirement(watch: PrWatch, threadId: string): Promise<boolean> {
    try {
      return (await this.options.retireObsoleteLaunchThread(watch, threadId)) === true;
    } catch {
      return false;
    }
  }

  /** Surface an unresolved retirement on the host diagnostics channel. */
  private surfaceRetirementFailure(threadId: string): void {
    this.options.reportError?.(new Error(msg("prWatch.retirementUnconfirmed", { id: threadId })));
  }

  /**
   * Retry every unresolved retirement for this watch. Custody must resolve
   * before the watch may launch again: a confirmed retirement releases the
   * block, a still-unresolved one keeps it.
   */
  private async releaseRetiredCustody(watch: PrWatch): Promise<boolean> {
    for (const [threadId, pendingWatch] of [...this.pendingRetirement]) {
      if (pendingWatch.projectId !== watch.projectId || pendingWatch.prNumber !== watch.prNumber) {
        continue;
      }
      if (await this.attemptRetirement(pendingWatch, threadId)) {
        this.pendingRetirement.delete(threadId);
      } else {
        this.surfaceRetirementFailure(threadId);
        return false;
      }
    }
    return true;
  }

  /**
   * The ephemeral admission gate for one launch: verifies the project still
   * occupies the scope the launch was validated for, then re-admits the
   * captured raw execution snapshot, cancelling missing/changed rows into the
   * recheck flow before rethrowing so callers can distinguish a cancel from a
   * refusal. Never a no-op: once disposal begins the gate throws, so a launch
   * that already passed an earlier seam is rolled back at its next checkpoint
   * instead of taking another effect — dispose owns every in-flight
   * continuation.
   */
  private executionGate(
    captured: PrWatchExecutionSnapshot,
    scope: ProjectExecutionScope,
  ): PrWatchAssertCurrent {
    return () => {
      if (this.disposed) throw new Error("PR watch service is shutting down.");
      const fresh = this.options.getProject(captured.projectId);
      if (!fresh || !hasSameProjectExecutionScope(fresh, scope)) {
        this.requestCheck(captured.projectId, captured.prNumber);
        throw new PrWatchExecutionAdmissionError("stale", msg("thread.projectLaunchStale"));
      }
      try {
        this.options.store.admitExecution(captured);
      } catch (error) {
        if (isExecutionCancel(error)) {
          this.requestCheck(captured.projectId, captured.prNumber);
        }
        throw error;
      }
    };
  }

  /**
   * Abort an in-flight launch when a user or agent sync changed its inputs,
   * and re-admit the captured raw execution snapshot at every checkpoint: a
   * missing or changed row cancels into the recheck flow, and unsupported raw
   * selection data refuses the launch and is recorded before any effect.
   */
  private currentLaunchWatch(
    snapshot: PrWatch,
    captured?: PrWatchExecutionSnapshot,
  ): PrWatch | null {
    if (this.disposed) return null;
    const current = this.options.store.get(snapshot.projectId, snapshot.prNumber);
    if (!current || !current.watchEnabled) return null;
    if (current.activeThreadId && this.options.isThreadActive(current.activeThreadId)) return null;
    if (!hasSameLaunchInputs(snapshot, current)) {
      this.requestCheck(current.projectId, current.prNumber);
      return null;
    }
    if (captured) {
      try {
        this.options.store.admitExecution(captured);
      } catch (error) {
        if (isExecutionCancel(error)) this.requestCheck(current.projectId, current.prNumber);
        else this.saveError(current, error);
        return null;
      }
    }
    return current;
  }

  /** Record that an enabled watch cannot act, instead of acting uselessly. */
  private block(watch: PrWatch, reason: PrWatchBlockedReason): void {
    if (this.disposed) return;
    const current = this.options.store.get(watch.projectId, watch.prNumber);
    if (!current || current.blockedReason === reason) return;
    this.options.store.patchRuntime(current.projectId, current.prNumber, {
      activeThreadId: null,
      // `blockedReason` is the explanation now, and it localizes; a leftover
      // error string from an earlier attempt would only contradict it.
      lastError: null,
      blockedReason: reason,
    });
  }

  /**
   * Point every watch at the app's current helper-agent resolution.
   *
   * The stored agent is a cache, not a per-PR choice: without this a watch keeps
   * launching whichever provider happened to be resolved when the PR was opened,
   * long after the user switched helpers.
   *
   * Only the desktop renderer calls this (provider ranking lives in its provider
   * plugins). A headless host has no renderer, so its watches keep the agent
   * recorded at creation until a paired desktop syncs them.
   */
  syncAgent(agent: PrWatchAgentSync): void {
    if (this.disposed) return;
    for (const watch of this.options.store.list()) {
      if (watch.projectId !== agent.projectId || isSameAgent(watch, agent)) continue;
      const wasBlocked = watch.blockedReason !== null;
      const requiresModeSelection = watch.blockedReason === "duplicate-project-watches";
      try {
        this.options.store.upsert({
          ...watch,
          agentKind: agent.agentKind,
          config: agent.config,
          blockedReason: requiresModeSelection ? watch.blockedReason : null,
          lastError: null,
        });
      } catch (error) {
        // A protected raw selection refuses the replacement; isolate the
        // failure to this watch so healthy siblings still progress, and
        // report it through the watch's own error column.
        this.saveError(watch, error);
        continue;
      }
      // A watch blocked on its old agent can act again immediately.
      if (wasBlocked && !requiresModeSelection) this.requestCheck(watch.projectId, watch.prNumber);
    }
  }

  private normalizeActiveThreads(): void {
    for (const watch of this.options.store.list()) {
      if (!watch.activeThreadId || this.options.isThreadActive(watch.activeThreadId)) continue;
      this.options.store.patchRuntime(watch.projectId, watch.prNumber, {
        activeThreadId: null,
      });
    }
  }

  private saveError(watch: PrWatch, error: unknown): void {
    if (this.disposed) return;
    const current = this.options.store.get(watch.projectId, watch.prNumber);
    if (!current) return;
    const message = error instanceof Error ? error.message : String(error);
    // The error is newer information than any standing block: keeping the
    // block would make the UI explain the failure with a stale diagnosis.
    // A repeat of the already-recorded diagnosis is a no-op, so a refused
    // launch retried by every poll cannot churn the store.
    if (current.lastError === message && current.blockedReason === null) return;
    try {
      this.options.store.patchRuntime(current.projectId, current.prNumber, {
        lastError: message,
        blockedReason: null,
      });
    } catch {
      // This runs inside a failure path; a status write that cannot land must
      // not turn the recorded failure into a new unhandled one.
    }
  }

  private assertOpen(): void {
    if (this.disposed) throw new Error("PR watch service is shutting down.");
  }
}

/** Whether a missing/stale execution row cancelled the launch (already rechecked). */
function isExecutionCancel(error: unknown): boolean {
  return (
    error instanceof PrWatchExecutionAdmissionError &&
    (error.reason === "missing" || error.reason === "stale")
  );
}

/**
 * Whether two complete selections are the same launch inputs: the model and
 * every optional carrier compared own-present and exact. An empty-string
 * effort and a false flag are real values, not equivalent absences, and a
 * recognized binding on only one side is a difference.
 */
function isSameSelection(
  before: ScheduledTaskConfig | undefined,
  after: ScheduledTaskConfig | undefined,
): boolean {
  if (before === undefined || after === undefined) return before === after;
  if (before.model !== after.model) return false;
  if (before.effort !== after.effort) return false;
  if (before.fast !== after.fast) return false;
  if (before.thinking !== after.thinking) return false;
  if (before.contextSize !== after.contextSize) return false;
  return areSelectionBindingsEqual(before.selectionBinding, after.selectionBinding);
}

function isSameAgent(watch: PrWatch, agent: PrWatchAgentSync): boolean {
  return watch.agentKind === agent.agentKind && isSameSelection(watch.config, agent.config);
}

function hasSameLaunchInputs(before: PrWatch, after: PrWatch): boolean {
  return (
    before.headBranch === after.headBranch &&
    before.worktreePath === after.worktreePath &&
    before.agentKind === after.agentKind &&
    isSameSelection(before.config, after.config)
  );
}

export { isReadyForAutoMerge } from "./prWatchSignals";

function watchKey(watch: Pick<PrWatch, "projectId" | "prNumber">): string {
  return `${watch.projectId}:${watch.prNumber}`;
}
