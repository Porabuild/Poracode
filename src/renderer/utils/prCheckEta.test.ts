// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { GitHubActionsRun, PrCheck } from "@/shared/contracts";
import {
  buildPrCheckHistoryKey,
  clearPrCheckDurationHistoryForTests,
  estimatePrChecksCompletion,
  formatEstimatedRemaining,
  isWorkflowRunRecorded,
  recordCompletedPrChecks,
  recordCompletedWorkflowRun,
  trimmedAverageDurationMs,
} from "./prCheckEta";

function makeRun(overrides: Partial<GitHubActionsRun>): GitHubActionsRun {
  return {
    id: 1,
    workflowId: 10,
    workflowName: "CI",
    name: "CI",
    number: 1,
    attempt: 1,
    title: "Run",
    event: "pull_request",
    headBranch: "feat/x",
    headSha: "abc",
    status: "completed",
    conclusion: "success",
    createdAt: "2026-07-13T10:00:00Z",
    startedAt: "2026-07-13T10:00:00Z",
    updatedAt: "2026-07-13T10:05:00Z",
    url: "https://github.com/owner/repo/actions/runs/1",
    jobs: [],
    ...overrides,
  };
}

describe("prCheckEta", () => {
  beforeEach(() => {
    clearPrCheckDurationHistoryForTests();
  });

  it("computes trimmed average resistant to extreme outliers", () => {
    expect(trimmedAverageDurationMs([])).toBeUndefined();
    expect(trimmedAverageDurationMs([60_000])).toBe(60_000);
    expect(trimmedAverageDurationMs([60_000, 80_000])).toBe(70_000);
    // 10x outlier should be excluded relative to the median (60s)
    expect(trimmedAverageDurationMs([55_000, 60_000, 65_000, 600_000])).toBe(60_000);
  });

  it("estimates remaining time from observed previous PR check runs", () => {
    const historyKey = buildPrCheckHistoryKey("p1");
    recordCompletedPrChecks(historyKey, [
      {
        name: "Lint",
        state: "COMPLETED",
        conclusion: "SUCCESS",
        startedAt: "2026-07-13T10:00:00Z",
        completedAt: "2026-07-13T10:01:00Z",
      },
      {
        name: "Test",
        state: "COMPLETED",
        conclusion: "SUCCESS",
        startedAt: "2026-07-13T10:00:00Z",
        completedAt: "2026-07-13T10:03:00Z",
      },
      {
        name: "iOS",
        state: "COMPLETED",
        conclusion: "SKIPPED",
        startedAt: "2026-07-13T10:00:00Z",
        completedAt: "2026-07-13T10:00:01Z",
      },
    ]);

    const now = Date.parse("2026-07-13T12:01:00Z");
    const activeChecks: PrCheck[] = [
      {
        name: "Lint",
        state: "COMPLETED",
        conclusion: "SUCCESS",
        startedAt: "2026-07-13T12:00:00Z",
        completedAt: "2026-07-13T12:00:55Z",
      },
      {
        name: "Test",
        state: "IN_PROGRESS",
        conclusion: "",
        startedAt: "2026-07-13T12:00:20Z",
      },
    ];

    const estimate = estimatePrChecksCompletion({ historyKey, checks: activeChecks, now });
    expect(estimate).not.toBeNull();
    // Test started at 12:00:20 and averages 3m -> estimated end 12:03:20 -> 2m 20s left from 12:01:00
    expect(estimate?.estimatedEndMs).toBe(Date.parse("2026-07-13T12:03:20Z"));
    expect(estimate?.remainingMs).toBe(140_000);
    expect(estimate?.overdue).toBe(false);
    expect(estimate?.checkAvgDurationsMs["Test"]).toBe(180_000);
  });

  it("uses GitHub workflow run averages when checks are still queued without startedAt", () => {
    const historyKey = buildPrCheckHistoryKey("p1", {
      forge: "github",
      host: "github.com",
      repository: "owner/repo",
    });
    const runs: GitHubActionsRun[] = [
      makeRun({
        id: 100,
        workflowId: 10,
        workflowName: "CI",
        startedAt: "2026-07-13T10:00:00Z",
        updatedAt: "2026-07-13T10:06:00Z",
      }),
      makeRun({
        id: 101,
        workflowId: 10,
        workflowName: "CI",
        startedAt: "2026-07-13T11:00:00Z",
        updatedAt: "2026-07-13T11:04:00Z",
      }),
      makeRun({
        id: 102,
        workflowId: 10,
        workflowName: "CI",
        status: "in_progress",
        conclusion: "",
        startedAt: "2026-07-13T12:00:00Z",
        updatedAt: "2026-07-13T12:01:30Z",
      }),
    ];

    const now = Date.parse("2026-07-13T12:01:30Z");
    const checks: PrCheck[] = [
      {
        name: "Test shard (1/8)",
        state: "QUEUED",
        conclusion: "",
        workflowName: "CI",
        url: "https://github.com/owner/repo/actions/runs/102/job/501",
      },
    ];

    const estimate = estimatePrChecksCompletion({
      historyKey,
      checks,
      workflowRuns: runs,
      now,
    });
    expect(estimate).not.toBeNull();
    // Avg of 6m and 4m is 5m -> 12:00:00 + 5m = 12:05:00 -> 3m 30s remaining at 12:01:30
    expect(estimate?.estimatedEndMs).toBe(Date.parse("2026-07-13T12:05:00Z"));
    expect(estimate?.remainingMs).toBe(210_000);
    expect(estimate?.overdue).toBe(false);
  });

  it("does not borrow another PR's in-progress run start time when runId is known", () => {
    const historyKey = buildPrCheckHistoryKey("p1", {
      forge: "github",
      host: "github.com",
      repository: "owner/repo",
    });
    const runs: GitHubActionsRun[] = [
      makeRun({
        id: 100,
        workflowId: 10,
        workflowName: "CI",
        startedAt: "2026-07-13T10:00:00Z",
        updatedAt: "2026-07-13T10:05:00Z",
      }),
      makeRun({
        id: 101,
        workflowId: 10,
        workflowName: "CI",
        status: "in_progress",
        conclusion: "",
        startedAt: "2026-07-13T11:50:00Z",
        updatedAt: "2026-07-13T11:55:00Z",
      }),
    ];

    const now = Date.parse("2026-07-13T12:01:00Z");
    const checks: PrCheck[] = [
      {
        name: "Lint",
        state: "IN_PROGRESS",
        conclusion: "",
        workflowName: "CI",
        startedAt: "2026-07-13T12:00:30Z",
        url: "https://github.com/owner/repo/actions/runs/999/job/1",
      },
    ];

    const estimate = estimatePrChecksCompletion({
      historyKey,
      checks,
      workflowRuns: runs,
      now,
    });
    // Must anchor to check's own startedAt (12:00:30 + 5m = 12:05:30), NOT run 101 (11:50:00)
    expect(estimate?.estimatedEndMs).toBe(Date.parse("2026-07-13T12:05:30Z"));
  });

  it("marks estimate overdue without negative remaining time when past average", () => {
    const historyKey = buildPrCheckHistoryKey("p1");
    recordCompletedPrChecks(historyKey, [
      {
        name: "Lint",
        state: "COMPLETED",
        conclusion: "SUCCESS",
        startedAt: "2026-07-13T10:00:00Z",
        completedAt: "2026-07-13T10:01:00Z",
      },
    ]);

    const now = Date.parse("2026-07-13T12:02:00Z");
    const estimate = estimatePrChecksCompletion({
      historyKey,
      checks: [
        {
          name: "Lint",
          state: "IN_PROGRESS",
          conclusion: "",
          startedAt: "2026-07-13T12:00:00Z",
        },
      ],
      now,
    });
    expect(estimate?.overdue).toBe(true);
    expect(estimate?.remainingMs).toBe(0);
  });

  it("records completed workflow run job durations once by run id", () => {
    const historyKey = buildPrCheckHistoryKey("p1");
    const run = makeRun({
      id: 777,
      jobs: [
        {
          id: 1,
          name: "Build",
          status: "completed",
          conclusion: "success",
          startedAt: "2026-07-13T10:00:00Z",
          completedAt: "2026-07-13T10:02:00Z",
          steps: [],
        },
        {
          id: 2,
          name: "Skipped job",
          status: "completed",
          conclusion: "skipped",
          startedAt: "2026-07-13T10:00:00Z",
          completedAt: "2026-07-13T10:00:01Z",
          steps: [],
        },
      ],
    });

    expect(isWorkflowRunRecorded(777)).toBe(false);
    expect(recordCompletedWorkflowRun(historyKey, run)).toBe(true);
    expect(isWorkflowRunRecorded(777)).toBe(true);
    expect(recordCompletedWorkflowRun(historyKey, run)).toBe(false);

    const estimate = estimatePrChecksCompletion({
      historyKey,
      checks: [
        {
          name: "Build",
          state: "IN_PROGRESS",
          conclusion: "",
          startedAt: "2026-07-13T12:00:00Z",
        },
      ],
      now: Date.parse("2026-07-13T12:00:30Z"),
    });
    expect(estimate?.remainingMs).toBe(90_000);
  });

  it("returns null when no historical data exists", () => {
    const estimate = estimatePrChecksCompletion({
      historyKey: "project:empty",
      checks: [
        {
          name: "Build",
          state: "IN_PROGRESS",
          conclusion: "",
          startedAt: "2026-07-13T12:00:00Z",
        },
      ],
    });
    expect(estimate).toBeNull();
  });

  it("preserves unknown future cache versions without overwriting", () => {
    const futurePayload = JSON.stringify({ version: 99, future: true });
    localStorage.setItem("poracode-pr-check-durations-v1", futurePayload);
    recordCompletedPrChecks("project:p1", [
      {
        name: "Lint",
        state: "COMPLETED",
        conclusion: "SUCCESS",
        startedAt: "2026-07-13T10:00:00Z",
        completedAt: "2026-07-13T10:01:00Z",
      },
    ]);
    expect(localStorage.getItem("poracode-pr-check-durations-v1")).toBe(futurePayload);
  });

  it("formats estimated remaining duration cleanly", () => {
    expect(formatEstimatedRemaining(500)).toBe("<1s");
    expect(formatEstimatedRemaining(45_000)).toBe("45s");
    expect(formatEstimatedRemaining(95_000)).toBe("1m 35s");
  });
});
