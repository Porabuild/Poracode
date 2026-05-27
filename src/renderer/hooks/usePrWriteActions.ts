import { useState } from "react";
import { toast } from "@heroui/react";
import type { ProjectLocation } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { useGitStore } from "@/renderer/state/gitStore";

const ADMIN_BYPASS_RX = /--admin|base branch policy|not mergeable/i;

export interface UsePrWriteActionsArgs {
  projectLocation: ProjectLocation;
  localSyncLocation?: ProjectLocation | undefined;
  prKey: string | undefined;
  onRefresh: () => void;
}

export interface UsePrWriteActionsResult {
  prLoading: boolean;
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
  const [prLoading, setPrLoading] = useState(false);

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
    setPrLoading(true);
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
          description: "Branch protection rules blocked this merge.",
          actionProps: {
            children: "Retry with admin",
            onPress: () => void handleMergePr(method, true),
          },
          timeout: 0,
        });
      } else {
        toast.danger(message);
      }
    } finally {
      setPrLoading(false);
    }
  }

  async function handleClosePr(): Promise<void> {
    const prData = getCurrentPrData();
    if (!prData) return;
    setPrLoading(true);
    try {
      await readBridge().ghClosePr({ projectLocation, prNumber: prData.number });
      if (prKey) {
        useGitStore.getState().setPrData(prKey, { ...prData, state: "closed" });
      }
    } catch (err) {
      console.error("[git] close PR failed", err);
      toast.danger(friendlyError(err));
    } finally {
      setPrLoading(false);
    }
  }

  async function handleMarkPrReady(): Promise<void> {
    const prData = getCurrentPrData();
    if (!prData) return;
    setPrLoading(true);
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
      setPrLoading(false);
    }
  }

  async function handleUpdatePrBranch(rebase = false): Promise<void> {
    const prData = getCurrentPrData();
    if (!prData) return;
    setPrLoading(true);
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
      setPrLoading(false);
    }
  }

  return { prLoading, handleMergePr, handleClosePr, handleMarkPrReady, handleUpdatePrBranch };
}
