import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { useLingui } from "@lingui/react/macro";
import type { PrMergeMethod } from "@/shared/contracts";
import { usePrCombinedChecksStatus } from "@/renderer/hooks/usePrCombinedChecksStatus";
import {
  usePrMergeStateStatus,
  usePrMergeable,
  usePrReviewDecision,
  usePrState,
} from "@/renderer/state/gitSelectors";
import { useGitStore } from "@/renderer/state/gitStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  describePrStatus,
  getPrStatusTone,
  isPrBlockedOnlyByPendingChecks,
  isPrBlockedOnlyByPendingReview,
  PR_STATUS_LABEL,
} from "@/renderer/utils/prStatus";

const BLOCK_REASON: Record<string, MessageDescriptor> = {
  BLOCKED: msg`Required reviews, conversations, or status checks not met.`,
  BEHIND: msg`Base branch is ahead — branch must be updated first.`,
  DIRTY: msg`Merge conflicts must be resolved.`,
  UNSTABLE: msg`Some checks are failing or pending.`,
  HAS_HOOKS: msg`Repository pre-receive hook is blocking the merge.`,
};

/**
 * Whether a review can merge now, why not, and which merge methods its host
 * offers. Shared by the branch review section and the pull-request overlay so
 * both agree on blocking, soft blocking and admin bypass.
 */
export function usePrMergeReadiness(prKey: string, cacheKey: string | undefined) {
  const { t } = useLingui();
  const state = usePrState(prKey);
  const detailsSource = useGitStore((s) => (cacheKey ? s.prDetails[cacheKey]?.source : undefined));
  const rowSource = useGitStore((s) => s.prData[prKey]?.source);
  const capabilities = detailsSource?.capabilities ?? rowSource?.capabilities;
  const mergeMethods: PrMergeMethod[] = capabilities?.mergeMethods ?? ["merge", "squash", "rebase"];
  const combinedChecksStatus = usePrCombinedChecksStatus(prKey, cacheKey);
  const reviewDecision = usePrReviewDecision(prKey);
  const mergeStateStatus = usePrMergeStateStatus(prKey);
  const mergeable = usePrMergeable(prKey);
  const preferredMergeMethod = useSharedSettings((s) => s.prMergeMethod);
  const preferredMethod = mergeMethods.includes(preferredMergeMethod)
    ? preferredMergeMethod
    : (mergeMethods[0] ?? preferredMergeMethod);

  const reasonKey = mergeable === "CONFLICTING" ? "DIRTY" : mergeStateStatus;
  const mergeStatus = { reviewDecision, mergeable, mergeStateStatus };
  const isPendingChecksBlock = isPrBlockedOnlyByPendingChecks(combinedChecksStatus, mergeStatus);
  const isAwaitingReview = isPrBlockedOnlyByPendingReview(combinedChecksStatus, mergeStatus);
  const isSoftBlock = isPendingChecksBlock || isAwaitingReview;
  const isBlocked =
    isAwaitingReview ||
    (reasonKey !== undefined &&
      reasonKey !== "CLEAN" &&
      reasonKey !== "DRAFT" &&
      reasonKey !== "UNKNOWN");
  const blockReasonMessage = reasonKey ? BLOCK_REASON[reasonKey] : undefined;
  return {
    state,
    capabilities,
    mergeMethods,
    preferredMethod,
    combinedChecksStatus,
    mergeStateStatus,
    mergeable,
    reviewDecision,
    tone: getPrStatusTone(state, combinedChecksStatus, mergeStatus),
    statusLabel: state
      ? t(PR_STATUS_LABEL[describePrStatus(state, combinedChecksStatus, mergeStatus)])
      : undefined,
    isPendingChecksBlock,
    isAwaitingReview,
    isSoftBlock,
    isBlocked,
    blockReason: blockReasonMessage ? t(blockReasonMessage) : undefined,
    // Conflicts and pre-receive hooks cannot be bypassed by an admin merge.
    canBypass:
      (capabilities?.adminMerge ?? true) &&
      isBlocked &&
      reasonKey !== "DIRTY" &&
      reasonKey !== "HAS_HOOKS",
    isBehind: mergeStateStatus === "BEHIND",
  };
}
