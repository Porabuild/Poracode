import { describe, expect, it } from "vitest";
import {
  getPrStatusTone,
  isPrBlockedOnlyByPendingChecks,
  isPrBlockedOnlyByPendingReview,
  isPrMergeBlocked,
  type PrMergeStatus,
} from "./prStatus";

const pendingReview: PrMergeStatus = {
  reviewDecision: "REVIEW_REQUIRED",
  mergeable: "MERGEABLE",
  mergeStateStatus: "BLOCKED",
};

describe("PR merge status tone", () => {
  it("treats required reviews as a pending wait, not a failure", () => {
    expect(isPrBlockedOnlyByPendingReview("SUCCESS", pendingReview)).toBe(true);
    expect(isPrBlockedOnlyByPendingChecks("SUCCESS", pendingReview)).toBe(false);
    expect(isPrMergeBlocked(pendingReview)).toBe(true);
    expect(getPrStatusTone("open", "SUCCESS", pendingReview)).toBe("warning");
  });

  it("still treats required reviews as pending when GitHub omits merge-state fields", () => {
    expect(getPrStatusTone("open", "SUCCESS", { reviewDecision: "REVIEW_REQUIRED" })).toBe(
      "warning",
    );
  });

  it.each(["BEHIND", "UNSTABLE"] as const)(
    "does not hide a %s merge blocker behind an awaiting-review status",
    (mergeStateStatus) => {
      const status = { ...pendingReview, mergeStateStatus };

      expect(isPrBlockedOnlyByPendingReview("SUCCESS", status)).toBe(false);
      expect(isPrMergeBlocked(status)).toBe(true);
    },
  );

  it("keeps running checks as pending even when a review is also required", () => {
    expect(isPrBlockedOnlyByPendingChecks("PENDING", pendingReview)).toBe(true);
    expect(getPrStatusTone("open", "PENDING", pendingReview)).toBe("warning");
  });

  it("keeps requested changes, conflicts, and failed checks as danger", () => {
    expect(
      getPrStatusTone("open", "SUCCESS", {
        reviewDecision: "CHANGES_REQUESTED",
        mergeStateStatus: "BLOCKED",
      }),
    ).toBe("danger");
    expect(
      getPrStatusTone("open", "SUCCESS", {
        mergeable: "CONFLICTING",
        mergeStateStatus: "DIRTY",
      }),
    ).toBe("danger");
    expect(getPrStatusTone("open", "FAILURE", pendingReview)).toBe("danger");
  });
});
