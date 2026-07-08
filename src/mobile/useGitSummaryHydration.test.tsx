import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useGitStore } from "@/renderer/state/gitStore";
import type { GitStatusResult, Project, Thread } from "@/shared/contracts";
import type { RemoteThreadGitSummary } from "@/shared/remote";
import { useGitSummariesStore } from "./gitSummaries";
import { useGitSummaryHydration } from "./useGitSummaryHydration";

const bridge = vi.hoisted(() => ({
  getGitStatus: vi.fn<(payload: unknown) => Promise<GitStatusResult>>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));

function makeProject(): Project {
  return {
    id: "project-1",
    name: "lightcode",
    location: { kind: "posix", path: "/repo/lightcode" },
    createdAt: "2024-01-01T00:00:00.000Z",
  };
}

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1",
    projectId: "project-1",
    title: "Hi",
    agentKind: "claude",
    config: {},
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  } as Thread;
}

function makeStatus(branch: string): GitStatusResult {
  return {
    isRepo: true,
    branch,
    tracking: `origin/${branch}`,
    hasRemote: true,
    remoteInfo: null,
    ahead: 1,
    behind: 2,
    staged: [],
    unstaged: [],
    totalInsertions: 3,
    totalDeletions: 4,
  };
}

function makeSummary(branch: string): RemoteThreadGitSummary {
  return {
    isRepo: true,
    branch,
    totalInsertions: 0,
    totalDeletions: 0,
    ahead: 0,
    behind: 0,
    pr: null,
  };
}

describe("useGitSummaryHydration", () => {
  beforeEach(() => {
    bridge.getGitStatus.mockReset();
    useGitSummariesStore.getState().reset();
    useGitStore.setState({ statuses: {}, worktreeStatuses: {}, prData: {} });
  });

  it("hydrates a missing thread git summary from the remote bridge", async () => {
    const project = makeProject();
    const thread = makeThread();
    bridge.getGitStatus.mockResolvedValue(makeStatus("feature/mobile"));

    renderHook(() => useGitSummaryHydration(thread, project));

    await waitFor(() => {
      expect(useGitSummariesStore.getState().byThread[thread.id]?.branch).toBe("feature/mobile");
    });
    expect(bridge.getGitStatus).toHaveBeenCalledWith({ projectLocation: project.location });
    expect(useGitStore.getState().statuses[project.id]?.branch).toBe("feature/mobile");
  });

  it("keeps local fallbacks when desktop summaries omit the thread", () => {
    useGitSummariesStore.getState().setThread("thread-1", makeSummary("local"));

    useGitSummariesStore.getState().setAll({});

    expect(useGitSummariesStore.getState().byThread["thread-1"]?.branch).toBe("local");
  });

  it("prefers desktop summaries over local fallbacks when both exist", () => {
    useGitSummariesStore.getState().setThread("thread-1", makeSummary("local"));

    useGitSummariesStore.getState().setAll({ "thread-1": makeSummary("desktop") });

    expect(useGitSummariesStore.getState().byThread["thread-1"]?.branch).toBe("desktop");
  });
});
