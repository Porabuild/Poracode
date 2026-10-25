// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrCheck } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { makeTestDetails, renderInPrDetail } from "../testing/prDetailTestScope";
import { RailChecks } from "./RailChecks";

const mocks = vi.hoisted(() => ({
  openExternal: vi.fn<(url: string) => void>(),
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => ({}), isRemoteSession: () => false }));
vi.mock("@/renderer/utils/openExternal", () => ({
  openExternalWithFeedback: mocks.openExternal,
}));

const checks: PrCheck[] = [
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
  { name: "Lint", state: "COMPLETED", conclusion: "SUCCESS" },
];

describe("RailChecks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T12:00:00Z"));
    mocks.openExternal.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows friendly statuses and live durations for the first five checks", async () => {
    renderInPrDetail(<RailChecks />, {}, { details: makeTestDetails({ checks }) });

    expect(screen.getByText("Typecheck").closest("li")).toHaveTextContent("46s · Passed");
    expect(screen.getByText("Windows build").closest("li")).toHaveTextContent("2m 05s · Running");
    expect(screen.getByText("E2E").closest("li")).toHaveTextContent("Failed");
    expect(screen.getByText("Deploy").closest("li")).toHaveTextContent("Cancelled");
    expect(screen.getByText("Coverage").closest("li")).toHaveTextContent("Skipped");
    expect(screen.getByText("2 of 7 passed")).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.getByText("Windows build").closest("li")).toHaveTextContent("2m 06s · Running");
  });

  it("collapses the rest behind a Show more toggle", () => {
    renderInPrDetail(<RailChecks />, {}, { details: makeTestDetails({ checks }) });

    expect(screen.queryByText("Preview")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show 2 more" }));
    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.getByText("Lint")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(screen.queryByText("Preview")).not.toBeInTheDocument();
  });

  it("has no toggle for five checks or fewer", () => {
    renderInPrDetail(
      <RailChecks />,
      {},
      { details: makeTestDetails({ checks: checks.slice(0, 5) }) },
    );

    expect(screen.queryByRole("button", { name: /Show/ })).not.toBeInTheDocument();
  });

  it("links a check name to its url", () => {
    renderInPrDetail(
      <RailChecks />,
      {},
      {
        details: makeTestDetails({
          checks: [{ ...checks[0]!, url: "https://ci.example.com/run/1" }],
        }),
      },
    );

    fireEvent.click(screen.getByRole("link", { name: "Open check Typecheck" }));

    expect(mocks.openExternal).toHaveBeenCalledWith("https://ci.example.com/run/1");
  });

  it("opens GitHub Actions checks inside Poracode and leaves the overlay", () => {
    const openGitHubActions = vi.fn<(projectId?: string, runId?: number) => void>();
    useAppStore.setState({ openGitHubActions });
    const { scope } = renderInPrDetail(
      <RailChecks />,
      {},
      {
        details: makeTestDetails({
          checks: [
            {
              ...checks[0]!,
              url: "https://github.com/owner/repo/actions/runs/501/job/9001",
            },
          ],
        }),
      },
    );

    fireEvent.click(screen.getByRole("link", { name: "Open run in GitHub Actions" }));

    expect(openGitHubActions).toHaveBeenCalledWith("project-1", 501);
    expect(scope.onClose).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when no checks were reported", () => {
    const { container } = renderInPrDetail(<RailChecks />, {}, { details: makeTestDetails() });

    expect(container.querySelector("section")).toBeNull();
  });
});
