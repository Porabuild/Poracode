import { useState } from "react";
import { toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import type { ProjectLocation } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { i18n } from "@/renderer/i18n/i18n";
import { useGitStore } from "@/renderer/state/gitStore";

const ADMIN_BYPASS_RX = /--admin|base branch policy|not mergeable/i;

export interface UsePrWriteActionsArgs {
  projectLocation: ProjectLocation;
  localSyncLocation?: ProjectLocation | undefined;
  prKey: string | undefined;
  onRefresh: () => void;
}

/** Which PR write action is currently in flight, so only its button shows a spinner. */
export type PrWriteAction = "merge" | "close" | "ready" | "update";

export interface UsePrWriteActionsResult {
  prLoading: boolean;
  pendingAction: PrWriteAction | null;
  handleMergePr: (method: "merge" | "squash" | "rebase", admin?: boolean) => Promise<void>;
  handleClosePr: () => Promise<void>;
  handleMarkPrReady: () => Promise<void>;
  handleUpdatePrBranch: (rebase?: boolean) => Promise<void>;
}

/**
 * Shared hook for the four PR write actions (merge / close / mark-ready /
 * update-branch). Used by both the GitReview overlay and the PR Review overlay
 * so the merge admin-bypass retry, optimistic store flips, and error surfacing
 * stay in lockstep across surfaces.
 */
export function usePrWriteActions(args: UsePrWriteActionsArgs): UsePrWriteActionsResult {
  const { projectLocation, localSyncLocation, prKey, onRefresh } = args;
  const [pendingAction, setPendingAction] = useState<PrWriteAction | null>(null);
  const prLoading = pendingAction !== null;

  function getCurrentPrData() {
    if (!prKey) return null;
    return useGitStore.getState().prData[prKey] ?? null;
  }

  async function handleMergePr(
    method: "merge" | "squash" | "rebase",
    admin = false,
  ): Promise<void> {
    const prData = getCurrentPrData();
    if (!prData) return;
    setPendingAction("merge");
    try {
      await readBridge().ghMergePr({
        projectLocation,
        prNumber: prData.number,
        method,
        admin,
      });
      if (prKey) {
        useGitStore.getState().setPrData(prKey, { ...prData, state: "merged" });
      }
      onRefresh();
    } catch (err) {
      console.error("[git] merge PR failed", err);
      const message = friendlyError(err);
      const canBypass = !admin && ADMIN_BYPASS_RX.test(message);
      if (canBypass) {
        toast.danger(message, {
          description: i18n._(msg`Branch protection rules blocked this merge.`),
          actionProps: {
            children: i18n._(msg`Retry with admin`),
            onPress: () => void handleMergePr(method, true),
          },
          timeout: 0,
        });
      } else {
        toast.danger(message);
      }
    } finally {
      setPendingAction(null);
    }
  }

  async function handleClosePr(): Promise<void> {
    const prData = getCurrentPrData();
    if (!prData) return;
    setPendingAction("close");
    try {
      await readBridge().ghClosePr({ projectLocation, prNumber: prData.number });
      if (prKey) {
        useGitStore.getState().setPrData(prKey, { ...prData, state: "closed" });
      }
    } catch (err) {
      console.error("[git] close PR failed", err);
      toast.danger(friendlyError(err));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleMarkPrReady(): Promise<void> {
    const prData = getCurrentPrData();
    if (!prData) return;
    setPendingAction("ready");
    try {
      await readBridge().ghMarkPrReady({ projectLocation, prNumber: prData.number });
      if (prKey) {
        useGitStore.getState().setPrData(prKey, { ...prData, state: "open", isDraft: false });
      }
      onRefresh();
    } catch (err) {
      console.error("[git] mark PR ready failed", err);
      toast.danger(friendlyError(err));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleUpdatePrBranch(rebase = false): Promise<void> {
    const prData = getCurrentPrData();
    if (!prData) return;
    setPendingAction("update");
    try {
      await readBridge().ghUpdatePrBranch({
        projectLocation,
        prNumber: prData.number,
        rebase,
      });
      const syncPayload = {
        projectLocation: localSyncLocation ?? projectLocation,
        remote: "origin",
      };
      if (rebase) await readBridge().gitPullRebase(syncPayload);
      else await readBridge().gitPull(syncPayload);
      onRefresh();
    } catch (err) {
      console.error("[git] update PR branch failed", err);
      toast.danger(friendlyError(err));
    } finally {
      setPendingAction(null);
    }
  }

  return {
    prLoading,
    pendingAction,
    handleMergePr,
    handleClosePr,
    handleMarkPrReady,
    handleUpdatePrBranch,
  };
}
