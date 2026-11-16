import type { ReactNode } from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GhPollPullRequestsResult, Project } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useGitStore, resetGitStoreCache } from "@/renderer/state/gitStore";
import { pollBranchPr, pollPullRequests } from "@/renderer/state/githubPolling";
import { GithubPollingNotice } from "./GithubPollingNotice";
import { useAppStore } from "@/renderer/state/appStore";
import { RemoteClientError } from "@/shared/remote/clientErrors";

// Tooltip content mounts only on hover; render it inline so the guidance text is assertable.
vi.mock("@heroui/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@heroui/react")>();
  const Tooltip = (props: { children: ReactNode }) => <>{props.children}</>;
  Tooltip.Trigger = (props: { children: ReactNode }) => <>{props.children}</>;
  Tooltip.Content = (props: { children: ReactNode }) => <>{props.children}</>;
  return { ...actual, Tooltip };
});

const poll = vi.hoisted(() => vi.fn<() => Promise<GhPollPullRequestsResult>>());
const legacy = vi.hoisted(() => vi.fn<() => Promise<null>>());
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ ghPollPullRequests: poll, ghGetPrForBranch: legacy }),
}));

const project: Project = {
  id: "project",
  name: "Project",
  createdAt: "now",
  location: { kind: "windows", path: "C:\\repo" },
};
const problem = {
  kind: "authentication" as const,
  executionHost: "remote-server / WSL Ubuntu",
  retryAt: "later",
};

describe("GitHub polling feedback", () => {
  beforeEach(() => {
    resetGitStoreCache();
    poll.mockReset();
    legacy.mockReset();
    useAppStore.setState({ projects: [] });
  });

  it("associates worktree polling with its owning project and canonical execution location", async () => {
    useAppStore.setState({ projects: [project] });
    poll.mockResolvedValue({ status: "blocked", problem });
    await expect(
      pollBranchPr(
        { projectLocation: { kind: "windows", path: "C:\\repo-wt" }, branch: "feature" },
        project.id,
      ),
    ).rejects.toThrow("polling is paused");
    expect(poll).toHaveBeenCalledWith({ projectLocation: project.location, branch: "feature" });
    expect(useGitStore.getState().githubPollingProblems.project).toEqual(problem);
  });

  it("preserves legacy remote-14 reads only after a typed unsupported-procedure refusal", async () => {
    const input = { projectLocation: project.location, branch: "feature" };
    poll.mockRejectedValue(new RemoteClientError("unsupported", 403, "git_procedure_not_allowed"));
    legacy.mockResolvedValue(null);
    await expect(pollBranchPr(input, project.id)).resolves.toBeNull();
    expect(legacy).toHaveBeenCalledWith(input);
    legacy.mockClear();
    poll.mockRejectedValue(new RemoteClientError("denied", 403, "scope_required"));
    await expect(pollBranchPr(input, project.id)).rejects.toThrow("denied");
    expect(legacy).not.toHaveBeenCalled();
  });

  it("deduplicates repeated background problems and directs Retry to the actual project host", async () => {
    poll.mockResolvedValue({ status: "blocked", problem });
    const recovered = vi.fn<() => void>();
    render(<GithubPollingNotice project={project} onRecovered={recovered} />);
    await act(async () => {
      await pollPullRequests({ projectLocation: project.location }, project.id);
      await pollPullRequests({ projectLocation: project.location }, project.id);
    });
    expect(screen.getAllByRole("status")).toHaveLength(1);
    const details = screen.getByText(/Run gh auth login/);
    expect(details.textContent).toContain(problem.executionHost);
    expect(details.textContent).toContain("GH_TOKEN");
    poll.mockResolvedValue({ status: "ready", prs: {}, pullRequests: [] });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(recovered).toHaveBeenCalledOnce());
    expect(poll).toHaveBeenLastCalledWith({ projectLocation: project.location, retry: true });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("leaves unknown and cached branch values untouched on a blocked read", async () => {
    poll.mockResolvedValue({ status: "blocked", problem });
    const input = { projectLocation: project.location, branch: "feature" };
    await expect(pollBranchPr(input, project.id)).rejects.toThrow("polling is paused");
    expect(useGitStore.getState().prData).toEqual({});
    expect(useGitStore.getState().githubPollingProblems.project).toEqual(problem);
    poll.mockResolvedValue({ status: "ready", prs: {}, pullRequests: [] });
    await expect(pollBranchPr(input, project.id)).resolves.toBeNull();
    expect(useGitStore.getState().githubPollingProblems.project).toBeNull();
  });
});
