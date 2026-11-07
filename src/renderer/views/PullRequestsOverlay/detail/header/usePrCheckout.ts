import { useEffect, useRef, useState } from "react";
import { toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { GitStatusResult, GitWorktreeInfo, Project } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { initializeCreatedWorktree } from "@/renderer/actions/worktreeInitialization";
import { openNewThreadInWorktree } from "@/renderer/actions/threadActions";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { isRemoteProjectStatusUnreachable } from "@/renderer/state/remoteServers/reachability";
import { useProject } from "@/renderer/state/useThread";
import { createWorktree } from "@/renderer/actions/worktreeLaunchActions";
import { usePrDetailScope, type PrDetailScope } from "../prDetailScope";
import {
  hasLocalBranch,
  hasUncommittedWork,
  headMismatch,
  refreshProjectRefs,
} from "./checkoutGit";

export { commitMatchesHead, headMismatch } from "./checkoutGit";

const DEFAULT_REMOTE = "origin";

/** Why a checkout action is unavailable; the menu maps each code to a localized hint. */
export type CheckoutBlockReason =
  | "cross-repository"
  | "read-only"
  | "unreachable"
  | "no-head-branch"
  | "worktree-exists"
  | "checked-out-in-worktree"
  | "already-current"
  | "status-unknown"
  | "dirty";

export type CheckoutAvailability =
  | { enabled: true }
  | { enabled: false; reason: CheckoutBlockReason };

export interface CheckoutAvailabilityInput {
  /** Absent for a review whose head branch is unknown (nothing to check out). */
  headBranch: string | undefined;
  isCrossRepository: boolean | undefined;
  readOnly: boolean;
  unreachable: boolean;
  worktrees: readonly GitWorktreeInfo[];
  /** Status of the project's main checkout. */
  status: GitStatusResult | undefined;
}

export interface CheckoutMenuAvailability {
  /** A non-main worktree that already has the head branch checked out. */
  existingWorktree: GitWorktreeInfo | undefined;
  openExisting: CheckoutAvailability;
  newWorktree: CheckoutAvailability;
  inRepository: CheckoutAvailability;
}

const ENABLED: CheckoutAvailability = { enabled: true };

function blocked(reason: CheckoutBlockReason): CheckoutAvailability {
  return { enabled: false, reason };
}

/** Which checkout actions the open review currently allows. Pure so the matrix is testable. */
export function resolveCheckoutAvailability(
  input: CheckoutAvailabilityInput,
): CheckoutMenuAvailability {
  const { headBranch } = input;
  const existingWorktree = headBranch
    ? input.worktrees.find((worktree) => !worktree.isMain && worktree.branch === headBranch)
    : undefined;
  // Order matters: the first reason the user can act on is the one shown.
  const global: CheckoutBlockReason | undefined = input.isCrossRepository
    ? "cross-repository"
    : input.readOnly
      ? "read-only"
      : input.unreachable
        ? "unreachable"
        : !headBranch || headBranch.startsWith("-")
          ? // A name that starts with "-" would be read by git as an option.
            "no-head-branch"
          : undefined;
  if (global) {
    const closed = blocked(global);
    return { existingWorktree, openExisting: closed, newWorktree: closed, inRepository: closed };
  }
  const { status } = input;
  const inRepository = existingWorktree
    ? blocked("checked-out-in-worktree")
    : !status
      ? blocked("status-unknown")
      : status.branch === headBranch
        ? blocked("already-current")
        : hasUncommittedWork(status)
          ? blocked("dirty")
          : ENABLED;
  return {
    existingWorktree,
    openExisting: ENABLED,
    newWorktree: existingWorktree ? blocked("worktree-exists") : ENABLED,
    inRepository,
  };
}

/** Points the overlay at `worktreePath` unless the user moved to another review meanwhile. */
function selectReviewWorktree(scope: PrDetailScope, worktreePath: string): void {
  const panel = usePanelStore.getState();
  const current = panel.prReviewContext;
  // No selection means the overlay was closed meanwhile; reopening it would be a surprise.
  if (!current || current.projectId !== scope.projectId || current.prNumber !== scope.prNumber) {
    return;
  }
  panel.setPrReviewContext({
    ...current,
    projectId: scope.projectId,
    prNumber: scope.prNumber,
    prKey: scope.prKey,
    worktreePath,
    skipLocalSync: true,
  });
}

export type CheckoutBusy = "worktree" | "repository" | null;

export interface PrCheckout {
  project: Project | undefined;
  headBranch: string | undefined;
  availability: CheckoutMenuAvailability;
  /** The operation running for THIS review; another review's operation never shows here. */
  busy: CheckoutBusy;
  /** A worktree for the head branch is known, so a thread can start there. */
  canOpenInApp: boolean;
  openExistingWorktree: () => void;
  checkoutInNewWorktree: () => Promise<void>;
  checkoutInRepository: () => Promise<void>;
  openWorktreeInApp: () => void;
}

/** Names that are safe to show inside a command the user may paste into a shell. */
const SHELL_SAFE_NAME = /^[A-Za-z0-9._/-]+$/;

/**
 * Checkout actions for the open review. Every write goes through the same git bridge
 * procedures for local and mirrored projects; nothing is selected unless the git
 * operations succeed. History is never rewritten and commits are never discarded.
 */
export function usePrCheckout(): PrCheckout {
  const { t } = useLingui();
  const scope = usePrDetailScope();
  const project = useProject(scope.projectId);
  const headBranch = useGitStore((s) => s.prDetails[scope.cacheKey]?.headBranch);
  const isCrossRepository = useGitStore((s) => s.prData[scope.prKey]?.isCrossRepository);
  const worktrees = useGitStore((s) => s.worktrees[scope.projectId]);
  const status = useGitStore((s) => s.statuses[scope.projectId]);
  const serverId = project?.remoteServerId;
  const serverStatus = useRemoteServersStore((s) =>
    serverId ? s.runtime[serverId]?.status : undefined,
  );
  // This hook stays mounted while the user moves between reviews, so a running
  // operation belongs to the review it started on (`cacheKey`), not to the hook.
  const [running, setRunning] = useState<Readonly<Record<string, Exclude<CheckoutBusy, null>>>>({});
  const started = useRef(new Set<string>());
  const busy = running[scope.cacheKey] ?? null;

  const unreachable = project ? isRemoteProjectStatusUnreachable(project, serverStatus) : true;
  // A worktree removed outside the app would stay in the store's list (and in the menu)
  // until the next full git refresh, so read the branches and worktrees once per review.
  const refreshedFor = project && !unreachable ? `${scope.cacheKey}` : null;
  useEffect(() => {
    if (refreshedFor && project) void refreshProjectRefs(project);
    // The project object changes with unrelated store updates; the review is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh once per review
  }, [refreshedFor]);
  const availability = resolveCheckoutAvailability({
    headBranch,
    isCrossRepository,
    readOnly: scope.readOnly,
    unreachable,
    worktrees: worktrees ?? [],
    status,
  });
  const appWorktreePath = scope.worktreePath ?? availability.existingWorktree?.path;
  const remote = scope.source?.remote ?? DEFAULT_REMOTE;

  /** Marks an operation as running for this review; `undefined` when one already is. */
  function begin(mode: Exclude<CheckoutBusy, null>): (() => void) | undefined {
    const key = scope.cacheKey;
    if (started.current.has(key)) return undefined;
    started.current.add(key);
    setRunning((current) => ({ ...current, [key]: mode }));
    return () => {
      started.current.delete(key);
      setRunning((current) => {
        const { [key]: _finished, ...rest } = current;
        return rest;
      });
    };
  }

  function openExistingWorktree(): void {
    const existing = availability.existingWorktree;
    if (!availability.openExisting.enabled || !existing) return;
    selectReviewWorktree(scope, existing.path);
  }

  /** The local branch is not at the head and cannot be advanced here; nothing was changed. */
  function rejectLocalBranch(branch: string): void {
    toast.danger(
      SHELL_SAFE_NAME.test(branch) && SHELL_SAFE_NAME.test(remote)
        ? t`Your local branch ${branch} is not at this pull request's head, so nothing was changed. If it only lags behind, run "git fetch ${remote} && git switch ${branch} && git merge --ff-only ${remote}/${branch}". If it has commits of its own, keep them with "git branch -m ${branch} ${branch}-old", then try again.`
        : t`Your local branch ${branch} is not at this pull request's head, so nothing was changed. Update it with a fast-forward only, or rename it to keep its commits, then try again.`,
    );
  }

  function rejectRemoteBranch(branch: string): void {
    toast.danger(
      t`The ${branch} branch on ${remote} is not this pull request's head (it may belong to a fork or have moved).`,
    );
  }

  async function checkoutInNewWorktree(): Promise<void> {
    if (!project || !headBranch || !availability.newWorktree.enabled) return;
    const finish = begin("worktree");
    if (!finish) return;
    try {
      const bridge = readBridge();
      await bridge.gitFetch({ projectLocation: project.location, remote, prune: false });
      // Re-read after the fetch: the branch list in the store predates it.
      const branches = await bridge
        .gitListBranches({ projectLocation: project.location, includeRemote: true })
        .catch(() => useGitStore.getState().branches[project.id]);
      const localExists = hasLocalBranch(branches, headBranch);
      const mismatch = headMismatch(branches, headBranch, remote, scope.headSha);
      if (mismatch === "remote") {
        rejectRemoteBranch(headBranch);
        return;
      }
      // A stale or diverged local branch is not advanced here. Doing so would mean running
      // git inside the new worktree, and a worktree that belongs to no thread is not an
      // address the host accepts (HTTP 403 project_location_not_registered). Nothing has
      // been created yet, so refusing leaves no worktree behind.
      if (mismatch === "local") {
        rejectLocalBranch(headBranch);
        return;
      }
      const created = await createWorktree(project, {
        branch: headBranch,
        ...(localExists ? {} : { startPoint: `${remote}/${headBranch}` }),
        createBranch: !localExists,
        transferUncommitted: false,
        keepChangesInSource: false,
      });
      // The worktree has no thread, so the host would refuse a status read of it.
      initializeCreatedWorktree(project, created.path, { trackGitState: false });
      await refreshProjectRefs(project);
      selectReviewWorktree(scope, created.path);
      toast.success(t`Checked out ${headBranch} in a new worktree`);
    } catch (error) {
      console.error("[renderer] failed to check out the pull request in a worktree", error);
      toast.danger(friendlyError(error));
    } finally {
      finish();
    }
  }

  async function checkoutInRepository(): Promise<void> {
    if (!project || !headBranch || !availability.inRepository.enabled) return;
    const finish = begin("repository");
    if (!finish) return;
    try {
      const bridge = readBridge();
      await bridge.gitFetch({ projectLocation: project.location, remote, prune: false });
      const branches = await bridge
        .gitListBranches({ projectLocation: project.location, includeRemote: true })
        .catch(() => useGitStore.getState().branches[project.id]);
      const mismatch = headMismatch(branches, headBranch, remote, scope.headSha);
      if (mismatch === "local") {
        rejectLocalBranch(headBranch);
        return;
      }
      if (mismatch === "remote") {
        rejectRemoteBranch(headBranch);
        return;
      }
      // The status cached in the store predates the fetch (and any edit since):
      // switching branches must see the tree as it is right now.
      const live = await bridge.getGitStatus({ projectLocation: project.location });
      useGitStore.getState().setStatus(project.id, live);
      if (hasUncommittedWork(live)) {
        toast.danger(t`Commit or stash your uncommitted changes first`);
        return;
      }
      const result = await bridge.gitSwitchBranch({
        projectLocation: project.location,
        branch: headBranch,
        createNew: false,
      });
      const store = useGitStore.getState();
      const current = store.statuses[project.id];
      if (current) {
        store.setStatus(project.id, {
          ...current,
          branch: result.branch,
          tracking: result.tracking,
          ahead: result.ahead,
          behind: result.behind,
        });
      }
      await refreshProjectRefs(project);
      toast.success(t`Switched to ${headBranch}`);
    } catch (error) {
      console.error("[renderer] failed to switch the repository to the pull request branch", error);
      toast.danger(friendlyError(error));
    } finally {
      finish();
    }
  }

  function openWorktreeInApp(): void {
    if (!headBranch || !appWorktreePath || unreachable) return;
    openNewThreadInWorktree({
      projectId: scope.projectId,
      worktreePath: appWorktreePath,
      worktreeBranch: headBranch,
    });
    scope.onClose();
  }

  return {
    project,
    headBranch,
    availability,
    busy,
    canOpenInApp: !!headBranch && !!appWorktreePath && !unreachable,
    openExistingWorktree,
    checkoutInNewWorktree,
    checkoutInRepository,
    openWorktreeInApp,
  };
}
