import { useRef, useState } from "react";
import { toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import type { PrData, PrMergeMethod, ProjectLocation } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { i18n } from "@/renderer/i18n/i18n";
import { useGitStore } from "@/renderer/state/gitStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { refreshSinglePr } from "@/renderer/state/gitRefresh";
import { syncMergedPrBase } from "@/renderer/state/prMergeBaseSync";
import { reviewClient, reviewSourceIdentity } from "@/renderer/utils/forgeReviews";

const ADMIN_BYPASS_RX = /--admin|base branch policy|not mergeable/i;

export interface UsePrWriteActionsArgs {
  projectLocation: ProjectLocation;
  localSyncLocation?: ProjectLocation | undefined;
  skipLocalSync?: boolean | undefined;
  prKey: string | undefined;
  /** PR head branch — required for the on-demand `handleRefreshPr` refetch. */
  branch?: string | undefined;
  /** Project id used for PR-details caching and post-merge base synchronization. */
  projectId?: string | undefined;
  onRefresh: () => void;
}

/** Which PR write action is currently in flight, so only its button shows a spinner. */
export type PrWriteAction = "merge" | "close" | "ready" | "update" | "edit";

export interface UsePrWriteActionsResult {
  prLoading: boolean;
  pendingAction: PrWriteAction | null;
  /** True while an on-demand PR refresh is in flight (independent of `prLoading`). */
  isRefreshing: boolean;
  handleMergePr: (method: PrMergeMethod, admin?: boolean) => Promise<void>;
  handleClosePr: () => Promise<void>;
  handleMarkPrReady: () => Promise<void>;
  handleUpdatePrBranch: (rebase?: boolean) => Promise<void>;
  /** Persist a title and description when the source host allows editing. */
  handleEditPr: (input: { title: string; body: string }) => Promise<boolean>;
  /** Refetch this PR's data + details on demand (e.g. the PR block refresh icon). */
  handleRefreshPr: () => Promise<void>;
}

/**
 * Shared hook for PR write actions (merge / close / mark-ready / update-branch /
 * edit). Used by both the GitReview overlay and the PR Review overlay so the
 * merge admin-bypass retry, optimistic store flips, and error surfacing stay in
 * lockstep across surfaces.
 */
export function usePrWriteActions(args: UsePrWriteActionsArgs): UsePrWriteActionsResult {
  const { projectLocation, localSyncLocation, skipLocalSync, prKey, branch, projectId, onRefresh } =
    args;
  const [pendingAction, setPendingAction] = useState<PrWriteAction | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const actionGeneration = useRef(0);
  const refreshGeneration = useRef(0);
  const prLoading = pendingAction !== null;

  function beginAction(action: PrWriteAction): number {
    const generation = actionGeneration.current + 1;
    actionGeneration.current = generation;
    setPendingAction(action);
    return generation;
  }

  function finishAction(generation: number) {
    if (actionGeneration.current === generation) setPendingAction(null);
  }

  function getCurrentPrData() {
    if (!prKey) return null;
    return useGitStore.getState().prData[prKey] ?? null;
  }

  // On-demand refetch of the live PR snapshot (state, mergeability, checks) plus
  // its details. Kept separate from `pendingAction` so the refresh spinner never
  // disables the merge/close/update buttons. No-ops without a key + head branch.
  async function handleRefreshPr(): Promise<void> {
    if (!prKey || !branch || isRefreshing) return;
    const prNumber = getCurrentPrData()?.number;
    const detailsCacheKey = projectId && prNumber ? `${projectId}#${prNumber}` : undefined;
    const generation = refreshGeneration.current + 1;
    refreshGeneration.current = generation;
    setIsRefreshing(true);
    try {
      await refreshSinglePr({
        projectLocation,
        ...(projectId ? { projectId } : {}),
        prKey,
        branch,
        ...(detailsCacheKey ? { detailsCacheKey } : {}),
        ...(prNumber ? { prNumber } : {}),
      });
    } finally {
      if (refreshGeneration.current === generation) setIsRefreshing(false);
    }
  }

  async function handleMergePr(method: PrMergeMethod, admin = false): Promise<void> {
    const prData = getCurrentPrData();
    if (!prData) return;
    useSharedSettings.getState().setPrMergeMethod(method);
    const generation = beginAction("merge");
    let expectedPr: PrData | null = prData;
    let mergeRequested = false;
    try {
      const client = reviewClient(prData.source);
      await client.merge(
        {
          projectLocation,
          prNumber: prData.number,
          method,
          admin,
        },
        prData.headSha,
      );
      mergeRequested = true;
      if (getCurrentPrData() !== prData) return;
      const observed = prData.source
        ? await client.details({ projectLocation, prNumber: prData.number }).catch(() => undefined)
        : undefined;
      if (getCurrentPrData() !== prData) return;
      const mergedPr =
        observed?.pr ?? (prData.source ? prData : { ...prData, state: "merged" as const });
      if (prKey) {
        useGitStore.getState().setPrData(prKey, mergedPr);
      }
      if (projectId && observed)
        useGitStore.getState().setPrDetails(`${projectId}#${prData.number}`, observed.details);
      expectedPr = getCurrentPrData();
      if (mergedPr.state === "merged" && projectId) await syncMergedPrBase(projectId, mergedPr);
      if (getCurrentPrData() !== expectedPr) return;
      if (mergedPr.state !== "merged")
        toast.info(i18n._(msg`Merge requested. Refresh to check its progress.`));
      onRefresh();
    } catch (err) {
      if (getCurrentPrData() !== expectedPr) return;
      console.error("[git] merge PR failed", err);
      const message = friendlyError(err);
      const canBypass =
        !mergeRequested &&
        !admin &&
        (prData.source?.capabilities.adminMerge ?? true) &&
        ADMIN_BYPASS_RX.test(message);
      if (canBypass) {
        toast.danger(message, {
          description: i18n._(msg`Branch protection rules blocked this merge.`),
          actionProps: {
            children: i18n._(msg`Retry with admin`),
            onPress: () => {
              if (getCurrentPrData() === expectedPr) void handleMergePr(method, true);
            },
          },
          timeout: 0,
        });
      } else {
        toast.danger(message);
      }
    } finally {
      finishAction(generation);
    }
  }

  async function handleClosePr(): Promise<void> {
    const prData = getCurrentPrData();
    if (!prData) return;
    const generation = beginAction("close");
    try {
      await reviewClient(prData.source).close({ projectLocation, prNumber: prData.number });
      if (getCurrentPrData() !== prData) return;
      if (prKey) {
        useGitStore.getState().setPrData(prKey, { ...prData, state: "closed" });
      }
    } catch (err) {
      if (getCurrentPrData() !== prData) return;
      console.error("[git] close PR failed", err);
      toast.danger(friendlyError(err));
    } finally {
      finishAction(generation);
    }
  }

  async function handleMarkPrReady(): Promise<void> {
    const prData = getCurrentPrData();
    if (!prData) return;
    const generation = beginAction("ready");
    try {
      await reviewClient(prData.source).ready({ projectLocation, prNumber: prData.number });
      if (getCurrentPrData() !== prData) return;
      if (prKey) {
        useGitStore.getState().setPrData(prKey, { ...prData, state: "open", isDraft: false });
      }
      onRefresh();
    } catch (err) {
      if (getCurrentPrData() !== prData) return;
      console.error("[git] mark PR ready failed", err);
      toast.danger(friendlyError(err));
    } finally {
      finishAction(generation);
    }
  }

  async function handleEditPr(input: { title: string; body: string }): Promise<boolean> {
    const prData = getCurrentPrData();
    const title = input.title.trim();
    if (!prData || !title || prData.source?.capabilities.edit === false) return false;
    const identity = reviewSourceIdentity(prData.source);
    const generation = beginAction("edit");
    try {
      await reviewClient(prData.source).edit({
        projectLocation,
        prNumber: prData.number,
        title,
        body: input.body,
      });
      const current = getCurrentPrData();
      if (
        !current ||
        current.number !== prData.number ||
        reviewSourceIdentity(current.source) !== identity
      ) {
        return false;
      }
      if (prKey) useGitStore.getState().setPrData(prKey, { ...current, title });
      if (projectId) {
        const detailsKey = `${projectId}#${prData.number}`;
        const details = useGitStore.getState().prDetails[detailsKey];
        if (details && reviewSourceIdentity(details.source) === identity) {
          useGitStore.getState().setPrDetails(detailsKey, { ...details, title, body: input.body });
        }
      }
      onRefresh();
      return true;
    } catch (err) {
      if (reviewSourceIdentity(getCurrentPrData()?.source) !== identity) return false;
      console.error("[git] edit PR failed", err);
      toast.danger(friendlyError(err));
      return false;
    } finally {
      finishAction(generation);
    }
  }

  async function handleUpdatePrBranch(rebase = false): Promise<void> {
    const prData = getCurrentPrData();
    if (!prData) return;
    const generation = beginAction("update");
    try {
      await reviewClient(prData.source).updateBranch({
        projectLocation,
        prNumber: prData.number,
        rebase,
      });
      if (getCurrentPrData() !== prData) return;
      if (!skipLocalSync) {
        const syncPayload = {
          projectLocation: localSyncLocation ?? projectLocation,
          remote: "origin",
        };
        if (rebase) await readBridge().gitPullRebase(syncPayload);
        else await readBridge().gitPull(syncPayload);
      }
      if (getCurrentPrData() !== prData) return;
      onRefresh();
    } catch (err) {
      if (getCurrentPrData() !== prData) return;
      console.error("[git] update PR branch failed", err);
      toast.danger(friendlyError(err));
    } finally {
      finishAction(generation);
    }
  }

  return {
    prLoading,
    pendingAction,
    isRefreshing,
    handleMergePr,
    handleClosePr,
    handleMarkPrReady,
    handleUpdatePrBranch,
    handleEditPr,
    handleRefreshPr,
  };
}
