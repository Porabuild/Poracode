// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubActionsRun, PrCheck, Project } from "@/shared/contracts";
import { clearPrChecksEtaCachesForTests } from "@/renderer/hooks/usePrChecksEta";
import { useAppStore } from "@/renderer/state/appStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import {
  buildPrCheckHistoryKey,
  clearPrCheckDurationHistoryForTests,
  recordCompletedPrChecks,
} from "@/renderer/utils/prCheckEta";
import { PrChecksIndicator } from "./PrChecksIndicator";

const mocks = vi.hoisted(() => ({
  openExternal: vi.fn<(url: string) => void>(),
  ghListWorkflowRuns: vi.fn<() => Promise<{ runs: GitHubActionsRun[] }>>(async () => ({
    runs: [],
  })),
  ghGetWorkflowRun: vi.fn<() => Promise<{ run: GitHubActionsRun }>>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({
    ghListWorkflowRuns: mocks.ghListWorkflowRuns,
    ghGetWorkflowRun: mocks.ghGetWorkflowRun,
  }),
}));

vi.mock("@/renderer/utils/openExternal", () => ({
  openExternalWithFeedback: mocks.openExternal,
}));

vi.mock("@heroui/react", () => {
  function Popover(props: {
    children?: ReactNode;
    isOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) {
    return (
      <div data-testid="popover-root" data-open={props.isOpen ? "true" : "false"}>
        {props.children}
      </div>
    );
  }
  Popover.Trigger = (props: { children?: ReactNode; className?: string }) => (
    <div className={props.className}>{props.children}</div>
  );
  Popover.Content = (props: { children?: ReactNode; className?: string }) => (
    <div data-testid="popover-content" className={props.className}>
      {props.children}
    </div>
  );
  Popover.Dialog = (props: { children?: ReactNode; className?: string }) => (
    <div role="dialog" className={props.className}>
      {props.children}
    </div>
  );

  function Link(props: { children?: ReactNode; className?: string; onPress?: () => void }) {
    return (
      <a
        href="#check"
        className={props.className}
        onClick={(e) => {
          e.preventDefault();
          props.onPress?.();
        }}
      >
        {props.children}
      </a>
    );
  }

  return { Link, Popover };
});

const project: Project = {
  id: "project-1",
  name: "Poracode",
  location: { kind: "posix", path: "/tmp/poracode" },
  createdAt: "2026-07-13T00:00:00Z",
};

describe("PrChecksIndicator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T12:01:00Z"));
    clearPrCheckDurationHistoryForTests();
    clearPrChecksEtaCachesForTests();
    mocks.openExternal.mockReset();
    mocks.ghListWorkflowRuns.mockReset().mockResolvedValue({ runs: [] });
    mocks.ghGetWorkflowRun.mockReset();
    useAppStore.setState({ projects: [project] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders circular progress without inline count and excludes skipped checks from incomplete count", () => {
    const checks: PrCheck[] = [
      { name: "Lint", state: "COMPLETED", conclusion: "SUCCESS" },
      { name: "Typecheck", state: "COMPLETED", conclusion: "SUCCESS" },
      { name: "iOS", state: "COMPLETED", conclusion: "SKIPPED" },
      { name: "Android", state: "COMPLETED", conclusion: "SKIPPED" },
    ];

    render(<PrChecksIndicator checks={checks} projectId="project-1" />);

    const trigger = screen.getByRole("button", { name: "Checks: 2 of 2 passed" });
    expect(trigger).not.toHaveTextContent("2/2");
    expect(trigger.querySelector("svg")).not.toBeNull();

    // Count + skipped summary live inside the popup
    expect(screen.getByText("2/2")).toBeInTheDocument();
    expect(screen.getByText(/2 skipped/)).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("limits popup list height and orders failed, running, pending, passed, and skipped checks", async () => {
    const checks: PrCheck[] = [
      { name: "Passed check", state: "COMPLETED", conclusion: "SUCCESS" },
      { name: "Skipped check", state: "COMPLETED", conclusion: "SKIPPED" },
      { name: "Queued check", state: "QUEUED", conclusion: "" },
      { name: "Running check", state: "IN_PROGRESS", conclusion: "" },
      {
        name: "Failed check",
        state: "COMPLETED",
        conclusion: "FAILURE",
        url: "https://github.com/owner/repo/actions/runs/1/job/2",
      },
    ];

    render(<PrChecksIndicator checks={checks} projectId="project-1" />);

    const list = screen.getByRole("list");
    expect(list.parentElement).toHaveClass("overflow-y-auto");
    expect(list.parentElement?.className).toContain("max-h-");

    const itemNames = screen
      .getAllByRole("listitem")
      .map((item) => item.firstElementChild?.textContent);
    expect(itemNames).toEqual([
      "Failed check",
      "Running check",
      "Queued check",
      "Passed check",
      "Skipped check",
    ]);

    fireEvent.click(screen.getByText("Failed check"));
    expect(mocks.openExternal).toHaveBeenCalledWith(
      "https://github.com/owner/repo/actions/runs/1/job/2",
    );
    await act(async () => {});
  });

  it("opens on hover and stays open when pointer moves into popup content", async () => {
    const checks: PrCheck[] = [{ name: "Lint", state: "COMPLETED", conclusion: "SUCCESS" }];

    render(<PrChecksIndicator checks={checks} projectId="project-1" />);

    const root = screen.getByTestId("popover-root");
    expect(root).toHaveAttribute("data-open", "false");

    const trigger = screen.getByRole("button", { name: "Checks: 1 of 1 passed" });
    fireEvent.mouseEnter(trigger);
    await act(() => vi.advanceTimersByTimeAsync(150));
    expect(root).toHaveAttribute("data-open", "true");

    // Moving from trigger into popup content keeps it open
    const dialog = screen.getByRole("dialog");
    fireEvent.mouseLeave(trigger);
    fireEvent.mouseEnter(dialog.firstElementChild!);
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(root).toHaveAttribute("data-open", "true");

    // Leaving popup content closes after grace delay
    fireEvent.mouseLeave(dialog.firstElementChild!);
    await act(() => vi.advanceTimersByTimeAsync(150));
    expect(root).toHaveAttribute("data-open", "false");
  });

  it("shows estimated completion time from previous check history and updates on tick", async () => {
    const historyKey = buildPrCheckHistoryKey("project-1");
    recordCompletedPrChecks(historyKey, [
      {
        name: "Test",
        state: "COMPLETED",
        conclusion: "SUCCESS",
        startedAt: "2026-07-13T10:00:00Z",
        completedAt: "2026-07-13T10:02:00Z",
      },
    ]);

    const checks: PrCheck[] = [
      { name: "Lint", state: "COMPLETED", conclusion: "SUCCESS" },
      {
        name: "Test",
        state: "IN_PROGRESS",
        conclusion: "",
        startedAt: "2026-07-13T12:00:00Z",
      },
    ];

    render(<PrChecksIndicator checks={checks} projectId="project-1" />);

    // Started 12:00:00, avg 2m -> ends 12:02:00, now is 12:01:00 -> ~1m 00s left
    expect(screen.getByText("~1m 00s")).toBeInTheDocument();
    expect(screen.getByText(/Est\. end .* \(~1m 00s left\)/)).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.getByText("~59s")).toBeInTheDocument();
  });

  it("fetches GitHub workflow runs to estimate end time when local history is empty", async () => {
    mocks.ghListWorkflowRuns.mockResolvedValue({
      runs: [
        {
          id: 90,
          workflowId: 10,
          workflowName: "CI",
          name: "CI",
          number: 90,
          attempt: 1,
          title: "Prev 1",
          event: "pull_request",
          headBranch: "a",
          headSha: "1",
          status: "completed",
          conclusion: "success",
          createdAt: "2026-07-13T10:00:00Z",
          startedAt: "2026-07-13T10:00:00Z",
          updatedAt: "2026-07-13T10:05:00Z",
          url: "https://github.com/owner/repo/actions/runs/90",
          jobs: [],
        },
        {
          id: 91,
          workflowId: 10,
          workflowName: "CI",
          name: "CI",
          number: 91,
          attempt: 1,
          title: "Current",
          event: "pull_request",
          headBranch: "feat",
          headSha: "2",
          status: "in_progress",
          conclusion: "",
          createdAt: "2026-07-13T12:00:00Z",
          startedAt: "2026-07-13T12:00:00Z",
          updatedAt: "2026-07-13T12:01:00Z",
          url: "https://github.com/owner/repo/actions/runs/91",
          jobs: [],
        },
      ],
    });
    mocks.ghGetWorkflowRun.mockResolvedValue({
      run: {
        id: 90,
        workflowId: 10,
        workflowName: "CI",
        name: "CI",
        number: 90,
        attempt: 1,
        title: "Prev 1",
        event: "pull_request",
        headBranch: "a",
        headSha: "1",
        status: "completed",
        conclusion: "success",
        createdAt: "2026-07-13T10:00:00Z",
        startedAt: "2026-07-13T10:00:00Z",
        updatedAt: "2026-07-13T10:05:00Z",
        url: "https://github.com/owner/repo/actions/runs/90",
        jobs: [],
      },
    });

    const checks: PrCheck[] = [
      {
        name: "Test shard (1/8)",
        state: "QUEUED",
        conclusion: "",
        workflowName: "CI",
        url: "https://github.com/owner/repo/actions/runs/91/job/123",
      },
    ];

    render(
      <PrChecksIndicator
        checks={checks}
        projectId="project-1"
        source={{
          forge: "github",
          host: "github.com",
          repository: "owner/repo",
          remote: "origin",
          capabilities: {
            reviewDecisions: ["approve", "request-changes", "comment"],
            mergeMethods: ["merge", "squash", "rebase"],
            draft: true,
            reopen: true,
            updateBranch: true,
            rebaseBranch: true,
            edit: true,
            checks: true,
            reviewThreads: true,
            adminMerge: true,
            autoMerge: true,
            autoFix: true,
            labels: true,
            reviewDrafts: true,
            reactions: ["+1"],
            viewedFiles: "forge",
            expectedHeadMerge: true,
          },
        }}
      />,
    );

    await act(async () => {});

    expect(mocks.ghListWorkflowRuns).toHaveBeenCalledOnce();
    expect(screen.getByText("~4m 00s")).toBeInTheDocument();
    expect(screen.getByText(/Est\. end .* \(~4m 00s left\)/)).toBeInTheDocument();
  });
});
