import { useEffect } from "react";
import type { ProjectLocation } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePrChecksStatus, usePrNumber, usePrState } from "@/renderer/state/gitSelectors";
import { getPrStatusTone } from "@/renderer/utils/prStatus";

export const PR_PENDING_REFRESH_INTERVAL_MS = 30_000;

export function usePendingPrRefresh(params: {
  prKey: string | undefined;
  projectLocation: ProjectLocation;
  branch: string | undefined;
  cacheKey?: string | undefined;
}) {
  const { prKey, projectLocation, branch, cacheKey } = params;
  const state = usePrState(prKey);
  const number = usePrNumber(prKey);
  const checksStatus = usePrChecksStatus(prKey);

  useEffect(() => {
    if (!prKey || getPrStatusTone(state, checksStatus) !== "warning") return;

    const targetPrKey = prKey;
    const targetBranch = branch;
    const detailsCacheKey = cacheKey;
    const detailsPrNumber = number;
    let cancelled = false;
    let inFlight = false;

    async function refreshPendingPr() {
      if (inFlight) return;
      inFlight = true;
      try {
        const bridge = readBridge();
        const prPromise = targetBranch
          ? bridge
              .ghGetPrForBranch({ projectLocation, branch: targetBranch })
              .catch(() => undefined)
          : Promise.resolve(undefined);
        const detailsPromise =
          detailsCacheKey && detailsPrNumber
            ? bridge
                .ghGetPrDetails({ projectLocation, prNumber: detailsPrNumber })
                .catch(() => undefined)
            : Promise.resolve(undefined);
        const [pr, details] = await Promise.all([prPromise, detailsPromise]);
        if (cancelled) return;
        if (pr !== undefined) useGitStore.getState().setPrData(targetPrKey, pr);
        if (detailsCacheKey && details) {
          useGitStore.getState().setPrDetails(detailsCacheKey, details.details);
        }
      } finally {
        inFlight = false;
      }
    }

    void refreshPendingPr();
    const intervalId = window.setInterval(
      () => void refreshPendingPr(),
      PR_PENDING_REFRESH_INTERVAL_MS,
    );
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [branch, cacheKey, checksStatus, number, prKey, projectLocation, state]);
}
