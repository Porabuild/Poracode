// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GhListPullRequestsPayload,
  GhListPullRequestsResult,
  Project,
  PullRequestSummary,
} from "@/shared/contracts";
import { buildBranchNamePrKey } from "@/renderer/state/gitSelectors";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteServerRuntime } from "@/renderer/state/remoteServers/types";

const bridge = vi.hoisted(() => ({
  ghListPullRequests:
    vi.fn<(payload: GhListPullRequestsPayload) => Promise<GhListPullRequestsResult>>(),
  forgeListPullRequestsInState: vi.fn<(payload: unknown) => Promise<GhListPullRequestsResult>>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));

import { usePullRequestListData } from "./usePullRequestListData";

function project(id: string, remoteServerId?: string): Project {
  return {
    id,
    name: id,
    location: { kind: "windows", path: `E:\\work\\${id}` },
    createdAt: "2026-07-13T10:00:00.000Z",
    ...(remoteServerId ? { remoteServerId } : {}),
  };
}

function summary(number: number): PullRequestSummary {
  return {
    pr: {
      number,
      state: "open",
      title: `Change ${number}`,
      url: `https://github.com/owner/repo/pull/${number}`,
      baseBranch: "main",
      isDraft: false,
      updatedAt: "2026-07-13T10:00:00.000Z",
      source: {
        forge: "github",
        host: "https://github.com",
        repository: "owner/repo",
        remote: "origin",
        account: { forge: "github", host: "https://github.com", login: "viewer" },
        capabilities: {
          mergeMethods: ["merge"],
          reviewDecisions: ["comment"],
          draft: true,
          reopen: true,
          updateBranch: true,
          rebaseBranch: true,
          edit: true,
          checks: true,
          reviewThreads: true,
          expectedHeadMerge: true,
          autoMerge: true,
          autoFix: true,
          adminMerge: true,
        },
      },
    },
    headBranch: `change-${number}`,
    additions: 1,
    deletions: 0,
    repository: "owner/repo",
    reviewRequested: false,
  };
}

function runtime(status: RemoteServerRuntime["status"]): RemoteServerRuntime {
  return { status, projects: [], threads: [] };
}

describe("usePullRequestListData", () => {
  beforeEach(() => {
    bridge.ghListPullRequests.mockReset().mockResolvedValue({ pullRequests: [] });
    bridge.forgeListPullRequestsInState.mockReset().mockResolvedValue({ pullRequests: [] });
    useGitStore.setState({ statuses: {}, worktrees: {}, prData: {} });
    useAppStore.setState({
      projects: [project("local"), project("online", "mac-online"), project("offline", "mac-off")],
    });
  });

  it("skips projects mirrored from a device that is not connected", async () => {
    useRemoteServersStore.setState({
      runtime: { "mac-online": runtime("online"), "mac-off": runtime("offline") },
    });
    const { result } = renderHook(() => usePullRequestListData({ state: "open" }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.projects.map((item) => item.id).toSorted()).toEqual(["local", "online"]);
    expect(bridge.ghListPullRequests).toHaveBeenCalledTimes(2);
    expect(result.current.failures).toEqual([]);
  });

  it("projects a successful local state change into the stale open-list snapshot", async () => {
    useAppStore.setState({ projects: [project("local")] });
    bridge.ghListPullRequests.mockResolvedValue({
      pullRequests: [summary(42)],
      viewerLogin: "viewer",
    });
    const { result } = renderHook(() => usePullRequestListData({ state: "open" }));
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    const key = buildBranchNamePrKey("local", "change-42");
    useGitStore.setState({
      prData: { [key]: { ...summary(42).pr, state: "merged" } },
    });

    await waitFor(() => expect(result.current.entries).toEqual([]));
  });

  it("keeps a draft PR in the open list but excludes it from closed and merged lists", async () => {
    useAppStore.setState({ projects: [project("local")] });
    const draft = summary(322);
    const draftPrData = { ...draft.pr, state: "draft" as const, isDraft: true };
    const draftEntry = { ...draft, pr: { ...draft.pr, isDraft: true } };
    bridge.ghListPullRequests.mockResolvedValue({
      pullRequests: [draftEntry],
      viewerLogin: "viewer",
    });
    bridge.forgeListPullRequestsInState.mockResolvedValue({
      pullRequests: [draftEntry],
      viewerLogin: "viewer",
    });
    useGitStore.setState({
      prData: { [buildBranchNamePrKey("local", draft.headBranch)]: draftPrData },
    });

    const { result, rerender } = renderHook(
      ({ state }: { state: "open" | "closed" | "merged" }) => usePullRequestListData({ state }),
      { initialProps: { state: "open" } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries.map((entry) => entry.summary.pr.number)).toEqual([322]);

    rerender({ state: "closed" });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(bridge.forgeListPullRequestsInState).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: "closed" }),
    );
    expect(result.current.entries).toEqual([]);

    rerender({ state: "merged" });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(bridge.forgeListPullRequestsInState).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: "merged" }),
    );
    expect(result.current.entries).toEqual([]);
  });

  it("skips a device that has no runtime entry yet, and returns when it connects", async () => {
    useRemoteServersStore.setState({ runtime: {} });
    const { result } = renderHook(() => usePullRequestListData({ state: "open" }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.projects.map((item) => item.id)).toEqual(["local"]);

    useRemoteServersStore.setState({ runtime: { "mac-off": runtime("online") } });
    await waitFor(() =>
      expect(result.current.projects.map((item) => item.id).toSorted()).toEqual([
        "local",
        "offline",
      ]),
    );
  });

  describe("two checkouts of one repository whose origin is not cached", () => {
    beforeEach(() => {
      useRemoteServersStore.setState({ runtime: { "mac-online": runtime("online") } });
      bridge.ghListPullRequests.mockResolvedValue({
        pullRequests: [summary(1), summary(2)],
        viewerLogin: "viewer",
      });
    });

    it("lists each review once", async () => {
      useAppStore.setState({ projects: [project("checkout-a"), project("checkout-b")] });
      const { result } = renderHook(() => usePullRequestListData({ state: "open" }));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(bridge.ghListPullRequests).toHaveBeenCalledTimes(2);
      expect(result.current.entries.map((entry) => entry.summary.pr.number)).toEqual([1, 2]);
      expect(result.current.entries.map((entry) => entry.project.id)).toEqual([
        "checkout-a",
        "checkout-a",
      ]);
      expect(result.current.failures).toEqual([]);
    });

    it("prefers the local project over a mirrored one, whichever answers first", async () => {
      useAppStore.setState({ projects: [project("mirror", "mac-online"), project("local")] });
      bridge.ghListPullRequests.mockImplementation(async ({ projectLocation }) => {
        if (JSON.stringify(projectLocation).includes("local"))
          await new Promise((r) => setTimeout(r, 20));
        return { pullRequests: [summary(1)], viewerLogin: "viewer" };
      });
      const { result } = renderHook(() => usePullRequestListData({ state: "open" }));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.entries.map((entry) => entry.project.id)).toEqual(["local"]);
    });

    it("keeps another checkout's failure and only shows rows from the one that answered", async () => {
      useAppStore.setState({ projects: [project("checkout-a"), project("checkout-b")] });
      bridge.ghListPullRequests.mockImplementation(({ projectLocation }) =>
        JSON.stringify(projectLocation).includes("checkout-a")
          ? Promise.reject(new Error("offline"))
          : Promise.resolve({ pullRequests: [summary(1)], viewerLogin: "viewer" }),
      );
      const { result } = renderHook(() => usePullRequestListData({ state: "open" }));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.entries.map((entry) => entry.project.id)).toEqual(["checkout-b"]);
      expect(result.current.failures.map((failure) => failure.project.id)).toEqual(["checkout-a"]);
    });
  });
});
