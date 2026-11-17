import { describe, expect, it } from "vitest";
import type { PrCheck } from "@/shared/contracts";
import {
  describePrStatus,
  getPrStatusTone,
  isPrBlockedOnlyByPendingChecks,
  isPrBlockedOnlyByPendingReview,
  isPrMergeBlocked,
  sortPrChecksForDisplay,
  summarizePrChecks,
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

  it("names a behind branch instead of calling it pending checks", () => {
    expect(describePrStatus("open", "SUCCESS", { mergeStateStatus: "BEHIND" })).toBe("behind");
    expect(describePrStatus("open", "SUCCESS", pendingReview)).toBe("awaiting-review");
    expect(describePrStatus("open", "FAILURE", { mergeStateStatus: "UNSTABLE" })).toBe(
      "checks-failed",
    );
    expect(describePrStatus("open", "SUCCESS")).toBe("checks-passed");
  });
});

describe("PR checks summary and sorting", () => {
  it("excludes skipped checks from relevantTotal so skipped checks are not shown as incomplete", () => {
    const checks: PrCheck[] = [
      { name: "Lint", state: "COMPLETED", conclusion: "SUCCESS" },
      { name: "Typecheck", state: "COMPLETED", conclusion: "SUCCESS" },
      { name: "iOS", state: "COMPLETED", conclusion: "SKIPPED" },
      { name: "Android", state: "COMPLETED", conclusion: "SKIPPED" },
    ];

    expect(summarizePrChecks(checks)).toEqual({
      total: 4,
      relevantTotal: 2,
      passed: 2,
      failed: 0,
      active: 0,
      skipped: 2,
      completed: 2,
      progress: 1,
      tone: "success",
    });
  });

  it("tracks running, failed, and skipped checks accurately", () => {
    const checks: PrCheck[] = [
      { name: "Lint", state: "COMPLETED", conclusion: "SUCCESS" },
      { name: "E2E", state: "COMPLETED", conclusion: "FAILURE" },
      { name: "Build", state: "IN_PROGRESS", conclusion: "" },
      { name: "Deploy", state: "QUEUED", conclusion: "" },
      { name: "Docs", state: "COMPLETED", conclusion: "SKIPPED" },
    ];

    expect(summarizePrChecks(checks)).toEqual({
      total: 5,
      relevantTotal: 4,
      passed: 1,
      failed: 1,
      active: 2,
      skipped: 1,
      completed: 2,
      progress: 0.5,
      tone: "danger",
    });
  });

  it("handles empty and all-skipped check lists cleanly", () => {
    expect(summarizePrChecks([])).toEqual({
      total: 0,
      relevantTotal: 0,
      passed: 0,
      failed: 0,
      active: 0,
      skipped: 0,
      completed: 0,
      progress: null,
      tone: "neutral",
    });

    expect(summarizePrChecks([{ name: "iOS", state: "COMPLETED", conclusion: "SKIPPED" }])).toEqual(
      {
        total: 1,
        relevantTotal: 0,
        passed: 0,
        failed: 0,
        active: 0,
        skipped: 1,
        completed: 0,
        progress: 1,
        tone: "success",
      },
    );
  });

  it("sorts failed, then running, then pending, then passed, then skipped checks", () => {
    const checks: PrCheck[] = [
      { name: "Passed 1", state: "COMPLETED", conclusion: "SUCCESS" },
      { name: "Skipped 1", state: "COMPLETED", conclusion: "SKIPPED" },
      { name: "Pending 1", state: "QUEUED", conclusion: "" },
      { name: "Running 1", state: "IN_PROGRESS", conclusion: "" },
      { name: "Failed 1", state: "COMPLETED", conclusion: "FAILURE" },
      { name: "Passed 2", state: "COMPLETED", conclusion: "SUCCESS" },
    ];

    expect(sortPrChecksForDisplay(checks).map((c) => c.name)).toEqual([
      "Failed 1",
      "Running 1",
      "Pending 1",
      "Passed 1",
      "Passed 2",
      "Skipped 1",
    ]);
  });
});
