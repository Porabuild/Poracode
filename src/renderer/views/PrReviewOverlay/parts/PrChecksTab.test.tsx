import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrDetails } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useGitStore } from "@/renderer/state/gitStore";
import { useAppStore } from "@/renderer/state/appStore";
import { PrChecksTab } from "./PrChecksTab";

const cacheKey = "project-1#42";
const details: PrDetails = {
  number: 42,
  title: "Improve check labels",
  body: "",
  baseBranch: "main",
  headBranch: "feature/check-labels",
  additions: 12,
  deletions: 3,
  changedFiles: 2,
  mergedAt: null,
  mergedBy: null,
  closedAt: null,
  commits: [],
  comments: [],
  reviews: [],
  checks: [
    {
      name: "Typecheck",
      state: "COMPLETED",
      conclusion: "SUCCESS",
      startedAt: "2026-07-13T11:25:03Z",
      completedAt: "2026-07-13T11:25:49Z",
      workflowName: "CI",
    },
    {
      name: "Windows build",
      state: "IN_PROGRESS",
      conclusion: "",
      startedAt: "2026-07-13T11:57:55Z",
      workflowName: "Build",
    },
    { name: "E2E", state: "COMPLETED", conclusion: "FAILURE" },
    { name: "Deploy", state: "COMPLETED", conclusion: "CANCELLED" },
    { name: "Coverage", state: "COMPLETED", conclusion: "SKIPPED" },
    { name: "Preview", state: "QUEUED", conclusion: "" },
  ],
};

describe("PrChecksTab", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T12:00:00Z"));
    useGitStore.setState({ prDetails: { [cacheKey]: details } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows friendly statuses and check durations", async () => {
    render(<PrChecksTab cacheKey={cacheKey} loading={false} projectId="project-1" />);

    expect(screen.getByText("Typecheck").closest("li")).toHaveTextContent("46s · Passed");
    expect(screen.getByText("Windows build").closest("li")).toHaveTextContent("2m 05s · Running");
    expect(screen.getByText("E2E").closest("li")).toHaveTextContent("Failed");
    expect(screen.getByText("Deploy").closest("li")).toHaveTextContent("Cancelled");
    expect(screen.getByText("Coverage").closest("li")).toHaveTextContent("Skipped");
    expect(screen.getByText("Preview").closest("li")).toHaveTextContent("Pending");

    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.getByText("Windows build").closest("li")).toHaveTextContent("2m 06s · Running");
  });

  it("opens GitHub Actions checks inside Poracode", () => {
    useGitStore.setState({
      prDetails: {
        [cacheKey]: {
          ...details,
          checks: [
            {
              ...details.checks[0]!,
              url: "https://github.com/owner/repo/actions/runs/501/job/9001",
            },
          ],
        },
      },
    });
    useAppStore.setState({ view: { kind: "home" } });
    render(<PrChecksTab cacheKey={cacheKey} loading={false} projectId="project-1" />);

    fireEvent.click(screen.getByRole("link", { name: "Open run in GitHub Actions" }));

    expect(useAppStore.getState().view).toEqual({
      kind: "githubActions",
      projectId: "project-1",
      runId: 501,
    });
  });
});
